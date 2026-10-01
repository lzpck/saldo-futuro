import { describe, expect, it } from "vitest";
import {
  addDays,
  dailyBalances,
  deltaForAccount,
  effectiveDate,
  groupByDay,
  isOverdue,
  lowestBalance,
  openItems,
  type ProjectionTx,
} from "./projection";

let nextId = 1;
const tx = (o: Partial<ProjectionTx> & Pick<ProjectionTx, "date" | "amountCents">): ProjectionTx => ({
  id: nextId++,
  kind: "despesa",
  status: "efetivado",
  accountId: 1,
  toAccountId: null,
  ...o,
});

const accounts = [{ id: 1, initialBalanceCents: 100_000 }];
const TODAY = "2026-10-15";

const run = (transactions: ProjectionTx[], from = "2026-10-10", to = "2026-10-20", accs = accounts) =>
  dailyBalances({ accounts: accs, transactions, today: TODAY, from, to });
const at = (days: ReturnType<typeof run>, date: string) => days.find((d) => d.date === date)!;

describe("addDays", () => {
  it("atravessa mês, ano e fevereiro bissexto", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("saldo de fim de dia", () => {
  it("sem lançamentos, é o saldo inicial em todos os dias", () => {
    const days = run([]);
    expect(days).toHaveLength(11);
    expect(days.every((d) => d.endBalanceCents === 100_000)).toBe(true);
  });

  it("aplica efetivados no dia deles e acumula nos dias seguintes", () => {
    const days = run([
      tx({ date: "2026-10-12", amountCents: 20_000 }),
      tx({ date: "2026-10-12", amountCents: 5_000, kind: "receita" }),
      tx({ date: "2026-10-14", amountCents: 1_000 }),
    ]);
    expect(at(days, "2026-10-11").endBalanceCents).toBe(100_000);
    expect(at(days, "2026-10-12").endBalanceCents).toBe(85_000);
    expect(at(days, "2026-10-13").endBalanceCents).toBe(85_000);
    expect(at(days, "2026-10-14").endBalanceCents).toBe(84_000);
    expect(at(days, "2026-10-20").endBalanceCents).toBe(84_000);
  });

  it("lançamentos antes do período entram como saldo de abertura", () => {
    const days = run([tx({ date: "2026-09-01", amountCents: 30_000 })]);
    expect(days[0].endBalanceCents).toBe(70_000);
  });

  it("ignora lançamentos depois do período", () => {
    const days = run([tx({ date: "2026-11-01", amountCents: 30_000, status: "previsto" })]);
    expect(days.at(-1)!.endBalanceCents).toBe(100_000);
  });

  it("marca a fase de cada dia em relação a hoje", () => {
    const days = run([]);
    expect(at(days, "2026-10-14").phase).toBe("real");
    expect(at(days, "2026-10-15").phase).toBe("hoje");
    expect(at(days, "2026-10-16").phase).toBe("futuro");
  });
});

describe("previstos e atrasados", () => {
  it("previsto futuro só pesa a partir do seu dia", () => {
    const days = run([tx({ date: "2026-10-18", amountCents: 9_000, status: "previsto" })]);
    expect(at(days, "2026-10-17").endBalanceCents).toBe(100_000);
    expect(at(days, "2026-10-18").endBalanceCents).toBe(91_000);
    expect(at(days, "2026-10-20").endBalanceCents).toBe(91_000);
  });

  it("atrasado pesa a partir de hoje, não na data original", () => {
    const days = run([tx({ date: "2026-10-10", amountCents: 9_000, status: "previsto" })]);
    expect(at(days, "2026-10-10").endBalanceCents).toBe(100_000);
    expect(at(days, "2026-10-14").endBalanceCents).toBe(100_000);
    expect(at(days, "2026-10-15").endBalanceCents).toBe(91_000);
    expect(at(days, "2026-10-16").endBalanceCents).toBe(91_000);
  });

  it("previsto de hoje pesa hoje e não é atraso", () => {
    const p = tx({ date: TODAY, amountCents: 500, status: "previsto" });
    expect(isOverdue(p, TODAY)).toBe(false);
    expect(at(run([p]), TODAY).endBalanceCents).toBe(99_500);
  });

  it("depois de efetivado, o lançamento volta a pesar na data original", () => {
    const days = run([tx({ date: "2026-10-10", amountCents: 9_000, status: "efetivado" })]);
    expect(at(days, "2026-10-10").endBalanceCents).toBe(91_000);
    expect(at(days, "2026-10-14").endBalanceCents).toBe(91_000);
  });

  it("effectiveDate respeita o estado", () => {
    expect(effectiveDate({ status: "previsto", date: "2026-10-01" }, TODAY)).toBe(TODAY);
    expect(effectiveDate({ status: "previsto", date: "2026-10-20" }, TODAY)).toBe("2026-10-20");
    expect(effectiveDate({ status: "efetivado", date: "2026-10-01" }, TODAY)).toBe("2026-10-01");
  });
});

describe("contas e transferências", () => {
  const two = [
    { id: 1, initialBalanceCents: 100_000 },
    { id: 2, initialBalanceCents: 5_000 },
  ];
  const transfer = tx({ kind: "transferencia", date: "2026-10-12", amountCents: 20_000, accountId: 1, toAccountId: 2 });

  it("transferência não muda o total, mas muda cada conta", () => {
    const day = at(run([transfer], "2026-10-10", "2026-10-20", two), "2026-10-12");
    expect(day.endBalanceCents).toBe(105_000);
    expect(day.byAccount).toEqual({ 1: 80_000, 2: 25_000 });
  });

  it("com uma conta só, transferência para fora da seleção é uma saída", () => {
    const day = at(run([transfer]), "2026-10-12");
    expect(day.endBalanceCents).toBe(80_000);
  });

  it("deltaForAccount cobre todos os tipos", () => {
    expect(deltaForAccount(tx({ date: "d", amountCents: 7, kind: "receita" }), 1)).toBe(7);
    expect(deltaForAccount(tx({ date: "d", amountCents: 7 }), 1)).toBe(-7);
    expect(deltaForAccount(tx({ date: "d", amountCents: 7 }), 2)).toBe(0);
    expect(deltaForAccount(transfer, 1)).toBe(-20_000);
    expect(deltaForAccount(transfer, 2)).toBe(20_000);
  });

  it("projeção não perde centavos com muitos lançamentos", () => {
    const many = Array.from({ length: 1000 }, () => tx({ date: "2026-10-18", amountCents: 7, status: "previsto" }));
    expect(at(run(many), "2026-10-20").endBalanceCents).toBe(100_000 - 7_000);
  });
});

describe("virada de mês e ano", () => {
  it("calcula corretamente atravessando o ano", () => {
    const days = dailyBalances({
      accounts,
      transactions: [tx({ date: "2027-01-01", amountCents: 1_000, status: "previsto" })],
      today: "2026-12-30",
      from: "2026-12-29",
      to: "2027-01-02",
    });
    expect(days.map((d) => d.date)).toEqual(["2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
    expect(days[2].endBalanceCents).toBe(100_000);
    expect(days[3].endBalanceCents).toBe(99_000);
  });
});

describe("groupByDay", () => {
  const opts = { today: TODAY, from: "2026-10-01", to: "2026-10-31" };

  it("agrupa em ordem cronológica", () => {
    const g = groupByDay(
      [tx({ date: "2026-10-20", amountCents: 1 }), tx({ date: "2026-10-03", amountCents: 1 }), tx({ date: "2026-10-20", amountCents: 2 })],
      opts,
    );
    expect(g.map((x) => x.date)).toEqual(["2026-10-03", "2026-10-20"]);
    expect(g[1].items).toHaveLength(2);
  });

  it("atrasados vão para hoje, antes dos demais, quando hoje está no período", () => {
    const late = tx({ date: "2026-10-05", amountCents: 1, status: "previsto" });
    const todays = tx({ date: TODAY, amountCents: 2 });
    const g = groupByDay([todays, late], opts);
    expect(g).toHaveLength(1);
    expect(g[0].date).toBe(TODAY);
    expect(g[0].items.map((i) => i.id)).toEqual([late.id, todays.id]);
  });

  it("fora do mês de hoje, atrasados ficam na data original", () => {
    const late = tx({ date: "2026-09-05", amountCents: 1, status: "previsto" });
    const g = groupByDay([late], { today: TODAY, from: "2026-09-01", to: "2026-09-30" });
    expect(g.map((x) => x.date)).toEqual(["2026-09-05"]);
  });

  it("descarta o que está fora do período", () => {
    expect(groupByDay([tx({ date: "2026-11-02", amountCents: 1 })], opts)).toEqual([]);
  });
});

describe("lowestBalance", () => {
  it("encontra o dia de menor saldo", () => {
    const days = run([tx({ date: "2026-10-17", amountCents: 150_000, status: "previsto" }), tx({ date: "2026-10-19", amountCents: 200_000, kind: "receita", status: "previsto" })]);
    const low = lowestBalance(days)!;
    expect(low.date).toBe("2026-10-17");
    expect(low.endBalanceCents).toBe(-50_000);
    expect(lowestBalance([])).toBeUndefined();
  });
});

describe("openItems", () => {
  it("separa atrasados dos que vencem no horizonte e ignora efetivados e o que está longe", () => {
    const late2 = tx({ date: "2026-10-02", amountCents: 1, status: "previsto" });
    const late1 = tx({ date: "2026-09-20", amountCents: 1, status: "previsto" });
    const hoje = tx({ date: TODAY, amountCents: 1, status: "previsto" });
    const limite = tx({ date: "2026-10-22", amountCents: 1, status: "previsto" });
    const longe = tx({ date: "2026-10-23", amountCents: 1, status: "previsto" });
    const pago = tx({ date: "2026-10-16", amountCents: 1, status: "efetivado" });
    const r = openItems([longe, limite, pago, hoje, late2, late1], TODAY, 7);
    expect(r.overdue.map((t) => t.id)).toEqual([late1.id, late2.id]);
    expect(r.upcoming.map((t) => t.id)).toEqual([hoje.id, limite.id]);
  });

  it("sem nada em aberto devolve listas vazias", () => {
    expect(openItems([], TODAY, 7)).toEqual({ overdue: [], upcoming: [] });
  });
});

describe("effectiveDate com compra em cartão", () => {
  it("Previsto com data passada pesa hoje mesmo quando a fatura ainda não venceu", () => {
    expect(effectiveDate({ status: "previsto", date: "2026-10-01", overdueSince: null } as never, TODAY)).toBe(TODAY);
  });
});
