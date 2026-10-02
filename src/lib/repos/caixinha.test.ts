import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../db/connection";
import { createAccount, getAccount, listAccounts, savedBalanceCents, totalBalanceCents, updateAccount } from "./accounts";
import { createTransaction } from "./transactions";

let db: Db;
let corrente: number;
let caixinha: number;

beforeEach(() => {
  db = openDb(":memory:");
  corrente = createAccount(db, { name: "Corrente", kind: "corrente", initialBalanceCents: 300_000 });
  caixinha = createAccount(db, { name: "Viagem", kind: "caixinha", initialBalanceCents: 1_000_000 });
});

describe("Caixinha: Saldo total e Guardado", () => {
  it("fica fora do Saldo total e entra no Guardado", () => {
    const accounts = listAccounts(db);
    expect(totalBalanceCents(accounts)).toBe(300_000);
    expect(savedBalanceCents(accounts)).toBe(1_000_000);
  });

  it("aplicar na Caixinha reduz o Saldo total e aumenta o Guardado", () => {
    createTransaction(db, { kind: "transferencia", date: "2026-10-05", amountCents: 50_000, description: "Guardar", accountId: corrente, toAccountId: caixinha });
    const accounts = listAccounts(db);
    expect(totalBalanceCents(accounts)).toBe(250_000);
    expect(savedBalanceCents(accounts)).toBe(1_050_000);
  });

  it("rendimento (Receita) e tarifa (Despesa) mexem no saldo da Caixinha", () => {
    createTransaction(db, { kind: "receita", date: "2026-10-06", amountCents: 8_000, description: "Rendimento", accountId: caixinha });
    createTransaction(db, { kind: "despesa", date: "2026-10-06", amountCents: 500, description: "Tarifa", accountId: caixinha });
    expect(getAccount(db, caixinha)!.balanceCents).toBe(1_007_500);
  });
});

describe("Caixinha: pagamento de fatura", () => {
  it("não pode ser a Conta que paga a fatura de um cartão", () => {
    expect(() =>
      createAccount(db, { name: "Visa", kind: "cartao", initialBalanceCents: 0, closingDay: 5, dueDay: 12, payAccountId: caixinha }),
    ).toThrow(/Caixinha/);
  });
});

describe("Caixinha: Conta que paga fatura não vira Caixinha", () => {
  it("bloqueia a troca enquanto algum cartão for pago por ela", () => {
    createAccount(db, { name: "Visa", kind: "cartao", initialBalanceCents: 0, closingDay: 5, dueDay: 12, payAccountId: corrente });
    expect(() =>
      updateAccount(db, corrente, { name: "Corrente", kind: "caixinha", initialBalanceCents: 300_000 }),
    ).toThrow(/fatura/);
    expect(getAccount(db, corrente)!.kind).toBe("corrente");
  });
});

describe("Caixinha: trocar o tipo da Conta", () => {
  it("uma corrente vira Caixinha e o dinheiro passa do Saldo total para o Guardado", () => {
    updateAccount(db, corrente, { name: "Corrente", kind: "caixinha", initialBalanceCents: 300_000 });
    const accounts = listAccounts(db);
    expect(totalBalanceCents(accounts)).toBe(0);
    expect(savedBalanceCents(accounts)).toBe(1_300_000);
  });

  it("uma Caixinha volta a ser Conta comum", () => {
    updateAccount(db, caixinha, { name: "Viagem", kind: "carteira", initialBalanceCents: 1_000_000 });
    expect(totalBalanceCents(listAccounts(db))).toBe(1_300_000);
  });

  it("continua proibido transformar em cartão", () => {
    expect(() =>
      updateAccount(db, caixinha, { name: "Viagem", kind: "cartao", initialBalanceCents: 0, closingDay: 5, dueDay: 12, payAccountId: corrente }),
    ).toThrow(/cartão/);
  });
});
