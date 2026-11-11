import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../db/connection";
import { createAccount } from "./accounts";
import { createInstallmentPurchase } from "./installments";
import { listLevels, reviewGroups, setLevel } from "./expense-review";
import { createTransaction } from "./transactions";

let db: Db;
let bank: number;
let card: number;
// Fecha dia 25: fechadas 25/08, 25/09 e 25/10 (e antes); aberta 25/11.
const TODAY = "2026-11-08";

const buy = (description: string, date: string, amountCents: number, over: Record<string, unknown> = {}) =>
  createTransaction(db, { kind: "despesa", date, amountCents, description, accountId: card, ...over });

beforeEach(() => {
  db = openDb(":memory:");
  bank = createAccount(db, { name: "Corrente", kind: "corrente", initialBalanceCents: 1_000_000 });
  card = createAccount(db, { name: "Nubank", kind: "cartao", initialBalanceCents: 0, closingDay: 25, dueDay: 5, payAccountId: bank });
});

describe("reviewGroups", () => {
  it("soma as 3 últimas faturas fechadas e deixa de fora a aberta e as mais antigas", () => {
    buy("Padaria", "2026-07-10", 7_000); // fatura de 25/07: fora da janela
    buy("Padaria", "2026-08-10", 1_000);
    buy("PADARIA", "2026-09-10", 2_000);
    buy("padaria", "2026-10-10", 3_000);
    buy("Padaria", "2026-11-02", 9_999); // fatura aberta
    const { groups, months } = reviewGroups(db, TODAY);
    expect(months).toBe(3);
    expect(groups).toEqual([{ key: "desc:padaria", label: "padaria", totalCents: 6_000, count: 3, level: null }]);
  });

  it("ignora estorno, pagamento de fatura e despesa fora de cartão", () => {
    buy("Loja", "2026-10-10", 5_000);
    createTransaction(db, { kind: "receita", date: "2026-10-11", amountCents: 1_000, description: "Estorno Loja", accountId: card });
    createTransaction(db, { kind: "transferencia", date: "2026-10-12", amountCents: 5_000, description: "Fatura", accountId: bank, toAccountId: card });
    createTransaction(db, { kind: "despesa", date: "2026-10-10", amountCents: 8_000, description: "Aluguel", accountId: bank });
    expect(reviewGroups(db, TODAY).groups.map((g) => [g.key, g.totalCents])).toEqual([["desc:loja", 5_000]]);
  });

  it("parcelas da mesma compra viram um grupo, só as das faturas fechadas", () => {
    const id = createInstallmentPurchase(db, {
      description: "Notebook",
      installments: 4,
      firstDate: "2026-09-10",
      accountId: card,
      categoryId: null,
      mode: "parcela",
      valueCents: 5_000,
      firstPaid: true,
      today: "2026-09-10",
    });
    // Parcelas de 10/09 e 10/10 caem em faturas fechadas; as de 10/11 e 10/12, não.
    expect(reviewGroups(db, TODAY).groups).toEqual([{ key: `compra:${id}`, label: "Notebook", totalCents: 10_000, count: 2, level: null }]);
  });
});

describe("setLevel", () => {
  it("grava, troca, e null volta a sem classificar; os grupos vêm com o nível", () => {
    buy("Padaria", "2026-10-10", 3_000);
    setLevel(db, "desc:padaria", "reduzivel");
    setLevel(db, "desc:padaria", "dispensavel");
    expect(listLevels(db)).toEqual(new Map([["desc:padaria", "dispensavel"]]));
    expect(reviewGroups(db, TODAY).groups[0].level).toBe("dispensavel");
    setLevel(db, "desc:padaria", null);
    expect(listLevels(db).size).toBe(0);
  });

  it("rejeita nível inválido", () => {
    expect(() => setLevel(db, "desc:x", "vermelho" as never)).toThrow(/nível/i);
  });
});
