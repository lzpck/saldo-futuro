import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../db/connection";
import { averageMonthlyExpenseCents, createAccount, getAccount, monthIncomeByAccount, reconcileBalance, updateAccount } from "./accounts";
import { createTransaction } from "./transactions";

let db: Db;
let conta: number;

beforeEach(() => {
  db = openDb(":memory:");
  conta = createAccount(db, { name: "Caixa", kind: "carteira", initialBalanceCents: 10_000 });
});

describe("reconcileBalance (ajustar saldo)", () => {
  it("saldo real menor lança uma despesa de ajuste e marca a conferência", () => {
    const diff = reconcileBalance(db, conta, 7_500, "2026-10-11");
    expect(diff).toBe(-2_500);
    const a = getAccount(db, conta)!;
    expect(a.balanceCents).toBe(7_500);
    expect(a.reconciledAt).toBe("2026-10-11");
    const tx = db.prepare("SELECT kind, status, description, amount_cents, date, category_id FROM transactions").get();
    expect(tx).toEqual({ kind: "despesa", status: "efetivado", description: "Ajuste de saldo", amount_cents: 2_500, date: "2026-10-11", category_id: null });
  });

  it("saldo real maior lança uma receita de ajuste", () => {
    expect(reconcileBalance(db, conta, 12_000, "2026-10-11")).toBe(2_000);
    expect(getAccount(db, conta)!.balanceCents).toBe(12_000);
  });

  it("saldo igual só marca a conferência, sem lançamento", () => {
    expect(reconcileBalance(db, conta, 10_000, "2026-10-11")).toBe(0);
    expect(db.prepare("SELECT COUNT(*) AS n FROM transactions").get()).toEqual({ n: 0 });
    expect(getAccount(db, conta)!.reconciledAt).toBe("2026-10-11");
  });

  it("conta arquivada não se ajusta", () => {
    db.prepare("UPDATE accounts SET archived = 1 WHERE id = ?").run(conta);
    expect(() => reconcileBalance(db, conta, 0, "2026-10-11")).toThrow(/arquivada/);
  });

  it("cartão não se ajusta", () => {
    const cartao = createAccount(db, { name: "Visa", kind: "cartao", initialBalanceCents: 0, closingDay: 5, dueDay: 12, payAccountId: conta });
    expect(() => reconcileBalance(db, cartao, 0, "2026-10-11")).toThrow();
  });
});

describe("limite do cartão e conferência", () => {
  it("grava e devolve o limite; editar a conta preserva a conferência", () => {
    const cartao = createAccount(db, { name: "Visa", kind: "cartao", initialBalanceCents: 0, closingDay: 5, dueDay: 12, payAccountId: conta, creditLimitCents: 500_000 });
    expect(getAccount(db, cartao)!.creditLimitCents).toBe(500_000);
    updateAccount(db, cartao, { name: "Visa", kind: "cartao", initialBalanceCents: 0, closingDay: 5, dueDay: 12, payAccountId: conta });
    expect(getAccount(db, cartao)!.creditLimitCents).toBeNull();

    reconcileBalance(db, conta, 10_000, "2026-10-01");
    updateAccount(db, conta, { name: "Caixa", kind: "carteira", initialBalanceCents: 10_000 });
    expect(getAccount(db, conta)!.reconciledAt).toBe("2026-10-01");
  });

  it("limite zerado ou negativo é recusado", () => {
    expect(() =>
      createAccount(db, { name: "Visa", kind: "cartao", initialBalanceCents: 0, closingDay: 5, dueDay: 12, payAccountId: conta, creditLimitCents: 0 }),
    ).toThrow();
  });
});

describe("números de apoio da tela de Contas", () => {
  it("despesa mensal média dos últimos 90 dias, fora de caixinhas", () => {
    const caixinha = createAccount(db, { name: "Reserva", kind: "caixinha", initialBalanceCents: 0 });
    createTransaction(db, { kind: "despesa", date: "2026-09-10", amountCents: 30_000, description: "a", accountId: conta });
    createTransaction(db, { kind: "despesa", date: "2026-07-01", amountCents: 99_900, description: "antiga", accountId: conta });
    createTransaction(db, { kind: "despesa", date: "2026-10-12", amountCents: 6_000, description: "b", accountId: conta, status: "previsto" });
    createTransaction(db, { kind: "despesa", date: "2026-10-05", amountCents: 999, description: "tarifa", accountId: caixinha });
    expect(averageMonthlyExpenseCents(db, "2026-10-11")).toBe(10_000);
  });

  it("rendimento do mês por conta (receitas efetivadas)", () => {
    const caixinha = createAccount(db, { name: "Reserva", kind: "caixinha", initialBalanceCents: 0 });
    createTransaction(db, { kind: "receita", date: "2026-10-06", amountCents: 848, description: "Rendimento", accountId: caixinha });
    createTransaction(db, { kind: "receita", date: "2026-09-06", amountCents: 700, description: "Rendimento", accountId: caixinha });
    reconcileBalance(db, caixinha, 5_000, "2026-10-07"); // ajuste não é rendimento
    expect(monthIncomeByAccount(db, "2026-10").get(caixinha)).toBe(848);
    expect(monthIncomeByAccount(db, "2026-10").get(conta)).toBeUndefined();
  });
});
