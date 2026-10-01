import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../db/connection";
import { createAccount } from "./accounts";
import { budgetWarnings, listBudgets, monthBudgets, setBudget } from "./budgets";
import { listCategories, setCategoryArchived } from "./categories";
import { createRecurrence } from "./recurrences";
import { createTransaction } from "./transactions";

let db: Db;
let acc: number;
let card: number;
const TODAY = "2026-10-15";
const catId = (name: string) => listCategories(db).find((c) => c.name === name)!.id;
const spend = (name: string, date: string, amountCents: number, over: Record<string, unknown> = {}) =>
  createTransaction(db, {
    kind: "despesa",
    date,
    amountCents,
    description: name,
    accountId: acc,
    categoryId: catId(name),
    ...over,
  });
const item = (month: string, name: string) => monthBudgets(db, month, TODAY).find((i) => i.category.name === name)!;

beforeEach(() => {
  db = openDb(":memory:");
  acc = createAccount(db, { name: "Corrente", kind: "corrente", initialBalanceCents: 1_000_000 });
});

describe("setBudget", () => {
  it("grava e atualiza o limite do mês (upsert), sem duplicar", () => {
    const id = catId("Mercado");
    setBudget(db, id, "2026-10", 60_000);
    setBudget(db, id, "2026-10", 70_000);
    expect(listBudgets(db)).toEqual([{ categoryId: id, month: "2026-10", amountCents: 70_000 }]);
  });

  it("rejeita categoria de receita, inexistente, mês inválido e valor negativo", () => {
    expect(() => setBudget(db, catId("Salário"), "2026-10", 100)).toThrow(/despesa/i);
    expect(() => setBudget(db, 9999, "2026-10", 100)).toThrow(/categoria/i);
    expect(() => setBudget(db, catId("Mercado"), "2026-13", 100)).toThrow(/mês/i);
    expect(() => setBudget(db, catId("Mercado"), "2026-10", -1)).toThrow();
  });
});

describe("monthBudgets", () => {
  it("o limite vale nos meses seguintes e mudar um mês não altera os anteriores", () => {
    const id = catId("Mercado");
    setBudget(db, id, "2026-08", 60_000);
    setBudget(db, id, "2026-10", 80_000);
    expect(item("2026-08", "Mercado").limitCents).toBe(60_000);
    expect(item("2026-09", "Mercado").limitCents).toBe(60_000);
    expect(item("2026-12", "Mercado").limitCents).toBe(80_000);
    expect(item("2026-07", "Mercado").limitCents).toBeNull();
  });

  it("limite 0 interrompe a herança", () => {
    const id = catId("Mercado");
    setBudget(db, id, "2026-08", 60_000);
    setBudget(db, id, "2026-11", 0);
    expect(item("2026-10", "Mercado").limitCents).toBe(60_000);
    expect(item("2026-11", "Mercado").limitCents).toBeNull();
    expect(item("2026-11", "Mercado").status).toBeNull();
  });

  it("lista só categorias de despesa não arquivadas", () => {
    setCategoryArchived(db, catId("Lazer"), true);
    const names = monthBudgets(db, "2026-10", TODAY).map((i) => i.category.name);
    expect(names).toContain("Mercado");
    expect(names).not.toContain("Lazer");
    expect(names).not.toContain("Salário");
  });

  it("o pai soma as subcategorias; a subcategoria tem limite independente", () => {
    const casa = catId("Moradia");
    setBudget(db, casa, "2026-10", 100_000);
    setBudget(db, catId("Luz"), "2026-10", 10_000);
    spend("Luz", "2026-10-05", 12_000);
    spend("Moradia", "2026-10-06", 30_000);
    expect(item("2026-10", "Moradia").spentCents).toBe(42_000);
    expect(item("2026-10", "Moradia").status?.level).toBe("ok");
    expect(item("2026-10", "Luz").status?.level).toBe("estourou");
  });

  it("compra no cartão conta no mês da compra, e transferência não conta", () => {
    card = createAccount(db, {
      name: "Cartão",
      kind: "cartao",
      initialBalanceCents: 0,
      closingDay: 5,
      dueDay: 15,
      payAccountId: acc,
    });
    setBudget(db, catId("Mercado"), "2026-10", 50_000);
    spend("Mercado", "2026-10-28", 20_000, { accountId: card });
    createTransaction(db, { kind: "transferencia", date: "2026-10-10", amountCents: 99_000, description: "Pix", accountId: acc, toAccountId: card });
    expect(item("2026-10", "Mercado").spentCents).toBe(20_000);
    expect(item("2026-11", "Mercado").spentCents).toBe(0);
  });

  it("previstos aparecem como projeção separada no mês atual e futuros", () => {
    setBudget(db, catId("Mercado"), "2026-10", 100_000);
    spend("Mercado", "2026-10-05", 60_000);
    spend("Mercado", "2026-10-25", 50_000, { status: "previsto" });
    const i = item("2026-10", "Mercado");
    expect(i.spentCents).toBe(60_000);
    expect(i.plannedCents).toBe(50_000);
    expect(i.status?.level).toBe("ok");
    expect(i.status?.projectedLevel).toBe("estourou");
  });

  it("recorrências (ocorrências virtuais) entram como previsto", () => {
    setBudget(db, catId("Aluguel"), "2026-10", 100_000);
    createRecurrence(db, {
      kind: "despesa",
      description: "Aluguel",
      amountCents: 150_000,
      accountId: acc,
      categoryId: catId("Aluguel"),
      frequency: "mensal",
      startDate: "2026-10-20",
      endDate: null,
    });
    expect(item("2026-10", "Aluguel").plannedCents).toBe(150_000);
    expect(item("2026-10", "Aluguel").status?.projectedLevel).toBe("estourou");
  });

  it("em mês passado não há projeção (previstos vencidos ficam de fora)", () => {
    setBudget(db, catId("Mercado"), "2026-09", 100_000);
    spend("Mercado", "2026-09-10", 30_000, { status: "previsto" });
    const i = item("2026-09", "Mercado");
    expect(i.plannedCents).toBe(0);
    expect(i.status?.projectedLevel).toBe(i.status?.level);
  });
});

describe("budgetWarnings", () => {
  it("avisa a categoria e o pai que estouraram no mês, considerando os previstos", () => {
    setBudget(db, catId("Moradia"), "2026-10", 10_000);
    setBudget(db, catId("Mercado"), "2026-10", 10_000);
    spend("Luz", "2026-10-05", 12_000);
    const w = budgetWarnings(db, catId("Luz"), "2026-10", TODAY);
    expect(w.map((x) => x.category.name)).toEqual(["Moradia"]);
    expect(budgetWarnings(db, catId("Mercado"), "2026-10", TODAY)).toEqual([]);
  });
});
