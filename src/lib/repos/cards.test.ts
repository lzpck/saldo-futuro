import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../db/connection";
import { dailyBalances } from "../projection";
import { createAccount, getAccount, isCard, listAccounts, totalBalanceCents, updateAccount } from "./accounts";
import { cardInvoices, invoiceLabel, listInvoicePayments, payInvoice } from "./cards";
import { listCategories } from "./categories";
import { createInstallmentPurchase } from "./installments";
import { createRecurrence, listWithOccurrences } from "./recurrences";
import { listSchedule } from "./schedule";
import { createTransaction, listTransactions } from "./transactions";

let db: Db;
let bank: number;
let card: number;
const TODAY = "2026-10-15";

// Cartão: fecha dia 25, vence dia 5 do mês seguinte.
beforeEach(() => {
  db = openDb(":memory:");
  bank = createAccount(db, { name: "Corrente", kind: "corrente", initialBalanceCents: 500_000 });
  card = createAccount(db, { name: "Nubank", kind: "cartao", initialBalanceCents: 0, closingDay: 25, dueDay: 5, payAccountId: bank });
});

const catId = (name: string) => listCategories(db).find((c) => c.name === name)!.id;
const buy = (date: string, amountCents: number, over: Partial<Parameters<typeof createTransaction>[1]> = {}) =>
  createTransaction(db, { kind: "despesa", date, amountCents, description: "Compra", accountId: card, ...over });
const base = (to = "2027-06-30") => listWithOccurrences(db, to);
const invoices = (to?: string) => cardInvoices(db, getAccount(db, card)!, base(to), TODAY);

describe("conta de cartão", () => {
  it("exige fechamento, vencimento e uma conta (não-cartão) que pague", () => {
    const mk = (over: object) => createAccount(db, { name: "X", kind: "cartao", initialBalanceCents: 0, closingDay: 10, dueDay: 20, payAccountId: bank, ...over });
    expect(() => mk({ closingDay: null })).toThrow(/fechamento/);
    expect(() => mk({ dueDay: 32 })).toThrow(/vencimento/);
    expect(() => mk({ payAccountId: null })).toThrow(/paga a fatura/);
    expect(() => mk({ payAccountId: 999 })).toThrow(/não encontrada/);
    expect(() => mk({ payAccountId: card })).toThrow(/não por outro cartão/);
  });

  it("saldo inicial de cartão é ignorado (a dívida vem dos lançamentos)", () => {
    const id = createAccount(db, { name: "Outro", kind: "cartao", initialBalanceCents: 99_999, closingDay: 1, dueDay: 10, payAccountId: bank });
    expect(getAccount(db, id)!.initialBalanceCents).toBe(0);
  });

  it("não se transforma conta em cartão nem o contrário", () => {
    expect(() => updateAccount(db, bank, { name: "Corrente", kind: "cartao", initialBalanceCents: 0, closingDay: 1, dueDay: 2, payAccountId: card })).toThrow(/transformar/);
    expect(() => updateAccount(db, card, { name: "Nubank", kind: "corrente", initialBalanceCents: 0 })).toThrow(/transformar/);
  });

  it("o cartão fica fora do saldo total; a compra só aumenta a dívida", () => {
    buy("2026-10-10", 20_000);
    const accounts = listAccounts(db);
    expect(getAccount(db, card)!.balanceCents).toBe(-20_000);
    expect(accounts.filter(isCard)).toHaveLength(1);
    expect(totalBalanceCents(accounts)).toBe(500_000);
  });
});

describe("faturas", () => {
  it("agrupa as compras por ciclo com vencimento e total", () => {
    buy("2026-10-10", 20_000);
    buy("2026-10-25", 5_000); // no dia do fechamento ainda entra
    buy("2026-10-26", 7_000); // dia seguinte: próxima fatura
    expect(invoices().map((i) => [i.closingDate, i.dueDate, i.totalCents, i.remainingCents, i.items.length])).toEqual([
      ["2026-10-25", "2026-11-05", 25_000, 25_000, 2],
      ["2026-11-25", "2026-12-05", 7_000, 7_000, 1],
    ]);
  });

  it("compras previstas (parcelas) e recorrentes no cartão entram nas faturas futuras", () => {
    createInstallmentPurchase(db, { description: "TV", installments: 3, firstDate: "2026-10-20", accountId: card, categoryId: null, mode: "parcela", valueCents: 40_000, firstPaid: true, today: TODAY });
    createRecurrence(db, { kind: "despesa", description: "Streaming", amountCents: 4_000, accountId: card, categoryId: catId("Assinaturas"), frequency: "mensal", startDate: "2026-10-12", endDate: "2026-12-31" });
    const got = invoices("2027-03-31").map((i) => [i.closingDate, i.totalCents]);
    expect(got).toEqual([
      ["2026-10-25", 44_000], // TV 1/3 (20/10) + streaming (12/10)
      ["2026-11-25", 44_000], // TV 2/3 (20/11) + streaming (12/11)
      ["2026-12-25", 44_000], // TV 3/3 (20/12) + streaming (12/12)
    ]);
  });

  it("estorno abate a fatura", () => {
    buy("2026-10-10", 20_000);
    buy("2026-10-12", 5_000, { kind: "receita", description: "Estorno" });
    expect(invoices()[0].totalCents).toBe(15_000);
  });

  it("o rótulo usa o mês do vencimento", () => {
    expect(invoiceLabel("Nubank", "2026-11-05")).toBe("Fatura Nubank 11/26");
  });
});

describe("pagamento previsto da fatura", () => {
  it("aparece no vencimento, debitando a conta de pagamento, com o valor do ciclo", () => {
    buy("2026-10-10", 20_000);
    const [p] = listInvoicePayments(db, base(), "2026-12-31", TODAY);
    expect(p).toMatchObject({
      kind: "transferencia",
      status: "previsto",
      date: "2026-11-05",
      amountCents: 20_000,
      accountId: bank,
      toAccountId: card,
      invoiceCardId: card,
      invoiceClosing: "2026-10-25",
      isVirtual: true,
      description: "Fatura Nubank 11/26",
    });
    expect(p.id).toBeLessThan(0);
  });

  it("recalcula sozinho quando entram novas compras no ciclo", () => {
    buy("2026-10-10", 20_000);
    expect(listInvoicePayments(db, base(), "2026-12-31", TODAY)[0].amountCents).toBe(20_000);
    buy("2026-10-20", 3_000);
    expect(listInvoicePayments(db, base(), "2026-12-31", TODAY)[0].amountCents).toBe(23_000);
  });

  it("fatura que vence depois do horizonte não aparece (poderia estar incompleta)", () => {
    buy("2026-10-10", 20_000);
    expect(listInvoicePayments(db, base(), "2026-11-04", TODAY)).toHaveLength(0);
    expect(listInvoicePayments(db, base(), "2026-11-05", TODAY)).toHaveLength(1);
  });

  it("não altera o saldo atual: o dinheiro só sai ao pagar", () => {
    buy("2026-10-10", 20_000);
    expect(getAccount(db, bank)!.balanceCents).toBe(500_000);
  });
});

describe("projeção com cartão", () => {
  const accountsInScope = () => listAccounts(db).filter((a) => !isCard(a)).map((a) => ({ id: a.id, initialBalanceCents: a.initialBalanceCents }));
  const balanceOn = (date: string) =>
    dailyBalances({ accounts: accountsInScope(), transactions: listSchedule(db, "2027-03-31", TODAY), today: TODAY, from: "2026-10-15", to: "2027-03-31" }).find((d) => d.date === date)!.endBalanceCents;

  it("a compra não mexe no saldo no dia; a fatura tira o dinheiro no vencimento", () => {
    buy("2026-10-20", 30_000, { status: "efetivado" });
    expect(balanceOn("2026-10-20")).toBe(500_000);
    expect(balanceOn("2026-11-04")).toBe(500_000);
    expect(balanceOn("2026-11-05")).toBe(470_000);
    expect(balanceOn("2026-12-20")).toBe(470_000);
  });

  it("parcelas no cartão saem uma por fatura", () => {
    createInstallmentPurchase(db, { description: "Sofá", installments: 3, firstDate: "2026-10-20", accountId: card, categoryId: null, mode: "parcela", valueCents: 10_000, firstPaid: false, today: TODAY });
    expect(balanceOn("2026-11-05")).toBe(490_000);
    expect(balanceOn("2026-12-05")).toBe(480_000);
    expect(balanceOn("2027-01-05")).toBe(470_000);
  });

  it("o fluxo do próprio cartão mostra a dívida crescendo e caindo no pagamento", () => {
    buy("2026-10-20", 30_000);
    const days = dailyBalances({
      accounts: [{ id: card, initialBalanceCents: 0 }],
      transactions: listSchedule(db, "2027-03-31", TODAY),
      today: TODAY,
      from: "2026-10-15",
      to: "2026-11-10",
    });
    const at = (d: string) => days.find((x) => x.date === d)!.endBalanceCents;
    expect(at("2026-10-19")).toBe(0);
    expect(at("2026-10-20")).toBe(-30_000);
    expect(at("2026-11-05")).toBe(0);
  });

  it("fatura vencida e não paga pesa hoje (Em atraso)", () => {
    buy("2026-09-10", 10_000); // fecha 25/09, venceu 05/10
    expect(balanceOn(TODAY)).toBe(490_000);
  });
});

describe("pagar a fatura", () => {
  const pay = (over: object = {}) => payInvoice(db, base(), { cardId: card, closingDate: "2026-10-25", today: TODAY, ...over });

  it("cria uma transferência efetivada da conta para o cartão, na data de hoje se ainda não venceu", () => {
    buy("2026-10-10", 20_000);
    pay();
    const t = listTransactions(db, { status: "efetivado" }).find((x) => x.kind === "transferencia")!;
    expect(t).toMatchObject({ date: TODAY, amountCents: 20_000, accountId: bank, toAccountId: card, description: "Fatura Nubank 11/26" });
    expect(getAccount(db, bank)!.balanceCents).toBe(480_000);
    expect(getAccount(db, card)!.balanceCents).toBe(0);
  });

  it("depois de paga, o pagamento previsto some e a fatura fica paga", () => {
    buy("2026-10-10", 20_000);
    pay();
    expect(listInvoicePayments(db, base(), "2026-12-31", TODAY)).toHaveLength(0);
    expect(invoices()[0]).toMatchObject({ status: "paga", paidCents: 20_000, remainingCents: 0 });
  });

  it("pagamento parcial deixa o restante previsto no mesmo vencimento", () => {
    buy("2026-10-10", 20_000);
    pay({ amountCents: 8_000 });
    const [rest] = listInvoicePayments(db, base(), "2026-12-31", TODAY);
    expect(rest).toMatchObject({ amountCents: 12_000, date: "2026-11-05" });
  });

  it("compra retroativa em fatura já paga gera um novo pagamento só da diferença", () => {
    buy("2026-10-10", 20_000);
    pay();
    buy("2026-10-12", 1_500);
    expect(listInvoicePayments(db, base(), "2026-12-31", TODAY)[0]).toMatchObject({ amountCents: 1_500, date: "2026-11-05" });
  });

  it("um pagamento manual (transferência para o cartão) também abate a fatura, sem pagar duas vezes", () => {
    buy("2026-10-10", 20_000);
    createTransaction(db, { kind: "transferencia", date: TODAY, amountCents: 20_000, description: "Pix fatura", accountId: bank, toAccountId: card });
    expect(listInvoicePayments(db, base(), "2026-12-31", TODAY)).toHaveLength(0);
  });

  it("fatura vencida é paga na data do vencimento; data e conta de origem podem ser escolhidas", () => {
    buy("2026-09-10", 10_000);
    const other = createAccount(db, { name: "Poupança", kind: "corrente", initialBalanceCents: 50_000 });
    payInvoice(db, base(), { cardId: card, closingDate: "2026-09-25", today: TODAY, fromAccountId: other });
    expect(listTransactions(db, { status: "efetivado" })[0]).toMatchObject({ date: "2026-10-05", accountId: other });
  });

  it("aceita escolher a data do pagamento", () => {
    buy("2026-10-10", 20_000);
    pay({ date: "2026-10-14", amountCents: 5_000 });
    expect(listTransactions(db, { status: "efetivado" }).find((t) => t.kind === "transferencia")).toMatchObject({ date: "2026-10-14", amountCents: 5_000 });
  });

  it("não aceita outro cartão como origem do pagamento", () => {
    buy("2026-10-10", 20_000);
    const other = createAccount(db, { name: "Itaú", kind: "cartao", initialBalanceCents: 0, closingDay: 10, dueDay: 20, payAccountId: bank });
    expect(() => pay({ fromAccountId: other })).toThrow(/outro cartão/);
    expect(() => pay({ fromAccountId: card })).toThrow(/outro cartão/);
    expect(() => pay({ fromAccountId: 999 })).toThrow(/origem não encontrada/);
  });

  it("pagamento efetivado com data futura só abate a fatura quando a data chegar", () => {
    buy("2026-10-10", 20_000);
    pay({ date: "2026-10-30" });
    expect(invoices()[0]).toMatchObject({ paidCents: 0, remainingCents: 20_000 });
    expect(cardInvoices(db, getAccount(db, card)!, base(), "2026-10-30")[0]).toMatchObject({ paidCents: 20_000, remainingCents: 0 });
  });

  it("não paga fatura inexistente, sem valor, nem conta que não é cartão", () => {
    buy("2026-10-10", 20_000);
    expect(() => pay({ closingDate: "2026-11-25" })).toThrow(/Fatura não encontrada/);
    pay();
    expect(() => pay()).toThrow(/Não há valor/);
    expect(() => payInvoice(db, base(), { cardId: bank, closingDate: "2026-10-25", today: TODAY })).toThrow(/Cartão não encontrado/);
  });
});
