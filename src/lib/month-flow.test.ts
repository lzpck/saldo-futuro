import { describe, expect, it } from "vitest";
import { classifyFlow, listedFlowCents, monthFlow } from "./month-flow";
import { dailyBalances, openingBalance, type ProjectionTx } from "./projection";

let nextId = 1;
const tx = (o: Partial<ProjectionTx> & Pick<ProjectionTx, "date" | "amountCents">): ProjectionTx => ({
  id: nextId++,
  kind: "despesa",
  status: "previsto",
  accountId: PAYER,
  toAccountId: null,
  ...o,
});

// Contas: 1 corrente (paga as faturas), 2 Benefício, 3 e 5 cartões, 4 Caixinha.
const PAYER = 1;
const BENEFIT = 2;
const CARD_A = 3;
const SAVINGS = 4;
const CARD_B = 5;
const TODAY = "2026-10-12";
const NOV = { from: "2026-11-01", to: "2026-11-30" };
const ctx = { scope: new Set([PAYER]), cardIds: new Set([CARD_A, CARD_B]) };

// Novembro como aparecia na tela: saldo 664,32, salário previsto, Carga do Benefício, contas fixas,
// compras no cartão (previstas e parcelas efetivadas) e três faturas a pagar.
const november: ProjectionTx[] = [
  tx({ kind: "receita", status: "efetivado", date: "2026-10-01", amountCents: 66_432 }),
  tx({ kind: "receita", date: "2026-11-05", amountCents: 426_814 }),
  tx({ kind: "receita", date: "2026-11-30", amountCents: 110_200, accountId: BENEFIT }),
  tx({ date: "2026-11-10", amountCents: 9_480 }),
  tx({ date: "2026-11-10", amountCents: 9_990 }),
  tx({ date: "2026-11-02", amountCents: 1_071, accountId: CARD_A }),
  tx({ status: "efetivado", date: "2026-11-07", amountCents: 19_333, accountId: CARD_A }),
  tx({ kind: "transferencia", date: "2026-11-07", amountCents: 24_990, toAccountId: CARD_A }),
  tx({ kind: "transferencia", date: "2026-11-10", amountCents: 4_800, toAccountId: CARD_B }),
  tx({ kind: "transferencia", date: "2026-11-10", amountCents: 141_251, toAccountId: CARD_A }),
];

const flow = (transactions: ProjectionTx[], period = NOV, c = ctx) =>
  monthFlow({ transactions, today: TODAY, ...period, ...c });

/** Saldo de abertura + resultado + movimento fora do saldo = saldo no fim do período. */
const closesWithBalance = (transactions: ProjectionTx[], period = NOV, c = ctx) => {
  const accounts = [...c.scope].map((id) => ({ id, initialBalanceCents: 0 }));
  const opening = openingBalance({ accounts, transactions, today: TODAY, from: period.from });
  const last = dailyBalances({ accounts, transactions, today: TODAY, ...period }).at(-1)!;
  const f = flow(transactions, period, c);
  return {
    expected: last.endBalanceCents,
    actual: opening + f.resultado.done + f.resultado.planned + f.foraDoSaldo.done + f.foraDoSaldo.planned,
  };
};

describe("fluxo de caixa do mês", () => {
  it("novembro: entradas e saídas fecham com o saldo previsto ao fim do mês", () => {
    const f = flow(november);
    expect(f.entradas).toEqual({ done: 0, planned: 426_814 });
    // internet 94,80 + 99,90 + faturas 249,90 + 48,00 + 1.412,51 = 1.905,11
    expect(f.saidas).toEqual({ done: 0, planned: 190_511 });
    expect(f.resultado).toEqual({ done: 0, planned: 236_303 });
    expect(f.foraDoSaldo).toEqual({ done: 0, planned: 0 });
    // 664,32 + 2.363,03 = 3.027,35
    expect(closesWithBalance(november)).toEqual({ expected: 302_735, actual: 302_735 });
  });

  it("compra no cartão, efetivada ou prevista, não é saída: só a fatura sai do caixa", () => {
    const f = flow([
      tx({ date: "2026-11-02", amountCents: 1_071, accountId: CARD_A }),
      tx({ status: "efetivado", date: "2026-11-07", amountCents: 19_333, accountId: CARD_A }),
    ]);
    expect(f.saidas).toEqual({ done: 0, planned: 0 });
  });

  it("a fatura já paga conta como saída efetivada no mês do pagamento", () => {
    const f = flow(
      [tx({ kind: "transferencia", status: "efetivado", date: "2026-10-06", amountCents: 161_262, toAccountId: CARD_A })],
      { from: "2026-10-01", to: "2026-10-31" },
    );
    expect(f.saidas).toEqual({ done: 161_262, planned: 0 });
  });

  it("transferência entre contas do escopo não é entrada nem saída", () => {
    const both = { scope: new Set([PAYER, 6]), cardIds: ctx.cardIds };
    const t = tx({ kind: "transferencia", date: "2026-11-03", amountCents: 3_252, accountId: 6, toAccountId: PAYER });
    const f = flow([t], NOV, both);
    expect(f.entradas).toEqual({ done: 0, planned: 0 });
    expect(f.saidas).toEqual({ done: 0, planned: 0 });
    expect(f.foraDoSaldo).toEqual({ done: 0, planned: 0 });
  });

  it("aplicar numa Caixinha e resgatar ficam à parte, e o saldo ainda fecha", () => {
    const txs = [
      tx({ kind: "receita", status: "efetivado", date: "2026-10-01", amountCents: 100_000 }),
      tx({ kind: "transferencia", status: "efetivado", date: "2026-11-02", amountCents: 93_170, toAccountId: SAVINGS }),
      tx({ kind: "transferencia", date: "2026-11-20", amountCents: 20_000, accountId: SAVINGS, toAccountId: PAYER }),
    ];
    const f = flow(txs);
    expect(f.saidas).toEqual({ done: 0, planned: 0 });
    expect(f.entradas).toEqual({ done: 0, planned: 0 });
    expect(f.foraDoSaldo).toEqual({ done: -93_170, planned: 20_000 });
    expect(closesWithBalance(txs)).toEqual({ expected: 26_830, actual: 26_830 });
  });

  it("Benefício só entra quando a lista é filtrada por ele", () => {
    const onlyBenefit = { scope: new Set([BENEFIT]), cardIds: ctx.cardIds };
    const f = flow(november, NOV, onlyBenefit);
    expect(f.entradas).toEqual({ done: 0, planned: 110_200 });
    expect(f.saidas).toEqual({ done: 0, planned: 0 });
  });

  it("separa o efetivado do previsto", () => {
    const f = flow([
      tx({ kind: "receita", status: "efetivado", date: "2026-11-03", amountCents: 10_000 }),
      tx({ kind: "receita", date: "2026-11-25", amountCents: 5_000 }),
      tx({ status: "efetivado", date: "2026-11-04", amountCents: 700 }),
      tx({ date: "2026-11-26", amountCents: 300 }),
    ]);
    expect(f.entradas).toEqual({ done: 10_000, planned: 5_000 });
    expect(f.saidas).toEqual({ done: 700, planned: 300 });
    expect(f.resultado).toEqual({ done: 9_300, planned: 4_700 });
  });

  it("previsto em atraso conta no mês de hoje, como no saldo", () => {
    const overdue = tx({ date: "2026-09-20", amountCents: 4_000 });
    const oct = { from: "2026-10-01", to: "2026-10-31" };
    expect(flow([overdue], oct).saidas).toEqual({ done: 0, planned: 4_000 });
    expect(flow([overdue], { from: "2026-09-01", to: "2026-09-30" }).saidas).toEqual({ done: 0, planned: 0 });
    expect(closesWithBalance([overdue], oct)).toEqual({ expected: -4_000, actual: -4_000 });
  });
});

describe("classifyFlow", () => {
  it("transferência para cartão fora do escopo é saída; para outra conta de fora, movimento fora do saldo", () => {
    const toCard = tx({ kind: "transferencia", date: "2026-11-07", amountCents: 100, toAccountId: CARD_A });
    const toSavings = tx({ kind: "transferencia", date: "2026-11-07", amountCents: 100, toAccountId: SAVINGS });
    expect(classifyFlow(toCard, ctx)).toEqual({ bucket: "saida", cents: 100 });
    expect(classifyFlow(toSavings, ctx)).toEqual({ bucket: "fora", cents: -100 });
  });

  it("lançamento fora do escopo não tem efeito no caixa", () => {
    expect(classifyFlow(tx({ date: "2026-11-02", amountCents: 1, accountId: CARD_A }), ctx)).toBeNull();
  });
});

describe("fluxo da lista filtrada", () => {
  it("fatura entra, compra no cartão não", () => {
    const cards = ctx.cardIds;
    expect(listedFlowCents(tx({ kind: "transferencia", date: "2026-11-07", amountCents: 500, toAccountId: CARD_A }), cards)).toBe(-500);
    expect(listedFlowCents(tx({ date: "2026-11-02", amountCents: 300, accountId: CARD_A }), cards)).toBe(0);
    expect(listedFlowCents(tx({ date: "2026-11-02", amountCents: 300 }), cards)).toBe(-300);
    expect(listedFlowCents(tx({ kind: "receita", date: "2026-11-02", amountCents: 900 }), cards)).toBe(900);
    expect(listedFlowCents(tx({ kind: "transferencia", date: "2026-11-02", amountCents: 900, toAccountId: 6 }), cards)).toBe(0);
  });
});
