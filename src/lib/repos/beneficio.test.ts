import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../db/connection";
import { benefitBalanceCents, createAccount, listAccounts, totalBalanceCents, updateAccount } from "./accounts";
import { createTransaction } from "./transactions";

let db: Db;
let corrente: number;
let beneficio: number;

beforeEach(() => {
  db = openDb(":memory:");
  corrente = createAccount(db, { name: "Corrente", kind: "corrente", initialBalanceCents: 20_000 });
  beneficio = createAccount(db, { name: "Vale", kind: "beneficio", initialBalanceCents: 90_200 });
});

describe("Benefício: Saldo total e total Benefício", () => {
  it("fica fora do Saldo total e entra no total Benefício", () => {
    const accounts = listAccounts(db);
    expect(totalBalanceCents(accounts)).toBe(20_000);
    expect(benefitBalanceCents(accounts)).toBe(90_200);
  });

  it("Despesa paga com o Benefício abate só o saldo dele", () => {
    createTransaction(db, { kind: "despesa", date: "2026-10-05", amountCents: 3_000, description: "Almoço", accountId: beneficio });
    const accounts = listAccounts(db);
    expect(totalBalanceCents(accounts)).toBe(20_000);
    expect(benefitBalanceCents(accounts)).toBe(87_200);
  });

  it("a Receita do depósito da empresa soma ao Benefício e à Conta livre separadamente", () => {
    createTransaction(db, { kind: "receita", date: "2026-10-06", amountCents: 20_000, description: "Livre", accountId: corrente });
    createTransaction(db, { kind: "receita", date: "2026-10-06", amountCents: 90_200, description: "Alimentação", accountId: beneficio });
    const accounts = listAccounts(db);
    expect(totalBalanceCents(accounts)).toBe(40_000);
    expect(benefitBalanceCents(accounts)).toBe(180_400);
  });
});

describe("Benefício: pagamento de fatura", () => {
  it("não pode ser a Conta que paga a fatura de um cartão", () => {
    expect(() =>
      createAccount(db, { name: "Visa", kind: "cartao", initialBalanceCents: 0, closingDay: 5, dueDay: 12, payAccountId: beneficio }),
    ).toThrow(/Benefício/);
  });

  it("a Conta que paga fatura não vira Benefício", () => {
    createAccount(db, { name: "Visa", kind: "cartao", initialBalanceCents: 0, closingDay: 5, dueDay: 12, payAccountId: corrente });
    expect(() =>
      updateAccount(db, corrente, { name: "Corrente", kind: "beneficio", initialBalanceCents: 20_000 }),
    ).toThrow(/fatura/);
  });
});
