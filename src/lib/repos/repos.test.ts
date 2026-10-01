import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../db/connection";
import { createAccount, getAccount, listAccounts, totalBalanceCents, setAccountArchived } from "./accounts";
import { createCategory, listCategories, setCategoryArchived } from "./categories";
import { createRecurrence, effectuateOccurrence } from "./recurrences";
import { createTransaction, deleteTransaction, listTransactions, markEffectuated, updateTransaction } from "./transactions";

let db: Db;
let corrente: number;
let carteira: number;

const catId = (name: string) => listCategories(db).find((c) => c.name === name)!.id;

beforeEach(() => {
  db = openDb(":memory:");
  corrente = createAccount(db, { name: "Corrente", kind: "corrente", initialBalanceCents: 100_000 });
  carteira = createAccount(db, { name: "Carteira", kind: "carteira", initialBalanceCents: 5_000 });
});

describe("saldo atual", () => {
  it("começa igual ao saldo inicial", () => {
    expect(getAccount(db, corrente)!.balanceCents).toBe(100_000);
  });

  it("soma receitas e subtrai despesas efetivadas", () => {
    createTransaction(db, { kind: "receita", date: "2026-10-01", amountCents: 300_000, description: "Salário", accountId: corrente });
    createTransaction(db, { kind: "despesa", date: "2026-10-02", amountCents: 12_345, description: "Mercado", accountId: corrente });
    expect(getAccount(db, corrente)!.balanceCents).toBe(100_000 + 300_000 - 12_345);
  });

  it("transferência tira da origem e entra no destino, sem mudar o total", () => {
    const before = totalBalanceCents(listAccounts(db));
    createTransaction(db, { kind: "transferencia", date: "2026-10-03", amountCents: 20_000, description: "Saque", accountId: corrente, toAccountId: carteira });
    expect(getAccount(db, corrente)!.balanceCents).toBe(80_000);
    expect(getAccount(db, carteira)!.balanceCents).toBe(25_000);
    expect(totalBalanceCents(listAccounts(db))).toBe(before);
  });

  it("ignora lançamentos previstos", () => {
    createTransaction(db, { kind: "despesa", status: "previsto", date: "2026-12-10", amountCents: 9_000, description: "Luz", accountId: corrente });
    expect(getAccount(db, corrente)!.balanceCents).toBe(100_000);
  });

  it("não perde centavos ao somar muitos lançamentos", () => {
    for (let i = 0; i < 1000; i++) {
      createTransaction(db, { kind: "despesa", date: "2026-10-01", amountCents: 10, description: "x", accountId: corrente });
    }
    expect(getAccount(db, corrente)!.balanceCents).toBe(100_000 - 10_000);
  });
});

describe("contas", () => {
  it("contas arquivadas saem da listagem padrão mas mantêm lançamentos", () => {
    createTransaction(db, { kind: "despesa", date: "2026-10-01", amountCents: 100, description: "x", accountId: carteira });
    setAccountArchived(db, carteira, true);
    expect(listAccounts(db).map((a) => a.name)).toEqual(["Corrente"]);
    expect(listAccounts(db, { includeArchived: true })).toHaveLength(2);
    expect(listTransactions(db)).toHaveLength(1);
  });
});

describe("validação de lançamentos", () => {
  const base = { date: "2026-10-01", description: "x", accountId: 0 };

  it("rejeita valor zero ou negativo", () => {
    expect(() => createTransaction(db, { ...base, accountId: corrente, kind: "despesa", amountCents: 0 })).toThrow(/maior que zero/);
    expect(() => createTransaction(db, { ...base, accountId: corrente, kind: "despesa", amountCents: -5 })).toThrow(/maior que zero/);
  });

  it("transferência exige destino diferente da origem", () => {
    expect(() => createTransaction(db, { ...base, accountId: corrente, kind: "transferencia", amountCents: 100 })).toThrow(/destino/);
    expect(() => createTransaction(db, { ...base, accountId: corrente, kind: "transferencia", amountCents: 100, toAccountId: corrente })).toThrow(/diferentes/);
  });

  it("transferência não tem categoria e despesa não tem destino", () => {
    expect(() => createTransaction(db, { ...base, accountId: corrente, kind: "transferencia", amountCents: 100, toAccountId: carteira, categoryId: catId("Mercado") })).toThrow(/categoria/);
    expect(() => createTransaction(db, { ...base, accountId: corrente, kind: "despesa", amountCents: 100, toAccountId: carteira })).toThrow(/destino/);
  });

  it("categoria deve ser do mesmo tipo do lançamento", () => {
    expect(() => createTransaction(db, { ...base, accountId: corrente, kind: "despesa", amountCents: 100, categoryId: catId("Salário") })).toThrow(/não é de despesa/);
    expect(() => createTransaction(db, { ...base, accountId: corrente, kind: "receita", amountCents: 100, categoryId: catId("Salário") })).not.toThrow();
  });

  it("conta inexistente é rejeitada", () => {
    expect(() => createTransaction(db, { ...base, accountId: 999, kind: "despesa", amountCents: 100 })).toThrow(/Conta não encontrada/);
  });
});

describe("listagem, edição e exclusão", () => {
  it("lista mais recentes primeiro e filtra por período, conta e categoria", () => {
    const mercado = catId("Mercado");
    createTransaction(db, { kind: "despesa", date: "2026-09-30", amountCents: 100, description: "a", accountId: corrente, categoryId: mercado });
    createTransaction(db, { kind: "despesa", date: "2026-10-05", amountCents: 200, description: "b", accountId: corrente });
    createTransaction(db, { kind: "despesa", date: "2026-10-10", amountCents: 300, description: "c", accountId: carteira, categoryId: mercado });

    expect(listTransactions(db).map((t) => t.description)).toEqual(["c", "b", "a"]);
    expect(listTransactions(db, { from: "2026-10-01", to: "2026-10-31" }).map((t) => t.description)).toEqual(["c", "b"]);
    expect(listTransactions(db, { accountId: carteira }).map((t) => t.description)).toEqual(["c"]);
    expect(listTransactions(db, { categoryId: mercado }).map((t) => t.description)).toEqual(["c", "a"]);
    expect(listTransactions(db, { limit: 1 })).toHaveLength(1);
  });

  it("filtra por situação", () => {
    createTransaction(db, { kind: "despesa", date: "2026-10-01", amountCents: 100, description: "feito", accountId: corrente });
    createTransaction(db, { kind: "despesa", status: "previsto", date: "2026-12-01", amountCents: 200, description: "futuro", accountId: corrente });
    expect(listTransactions(db, { status: "efetivado" }).map((t) => t.description)).toEqual(["feito"]);
    expect(listTransactions(db, { status: "previsto" }).map((t) => t.description)).toEqual(["futuro"]);
  });

  it("editar muda o saldo e excluir o desfaz", () => {
    const id = createTransaction(db, { kind: "despesa", date: "2026-10-01", amountCents: 1_000, description: "x", accountId: corrente });
    updateTransaction(db, id, { kind: "despesa", date: "2026-10-01", amountCents: 2_500, description: "x", accountId: corrente });
    expect(getAccount(db, corrente)!.balanceCents).toBe(97_500);
    deleteTransaction(db, id);
    expect(getAccount(db, corrente)!.balanceCents).toBe(100_000);
  });

  it("transferência mostra o nome da conta de destino", () => {
    createTransaction(db, { kind: "transferencia", date: "2026-10-01", amountCents: 100, description: "t", accountId: corrente, toAccountId: carteira });
    const [t] = listTransactions(db);
    expect(t.accountName).toBe("Corrente");
    expect(t.toAccountName).toBe("Carteira");
  });
});

describe("efetivar previstos", () => {
  const prev = (date: string) =>
    createTransaction(db, { kind: "despesa", status: "previsto", date, amountCents: 1_000, description: "Luz", accountId: corrente });

  it("previsto futuro vira efetivado hoje", () => {
    const id = prev("2026-10-20");
    markEffectuated(db, id, "2026-10-15");
    const [t] = listTransactions(db);
    expect(t.status).toBe("efetivado");
    expect(t.date).toBe("2026-10-15");
    expect(getAccount(db, corrente)!.balanceCents).toBe(99_000);
  });

  it("atrasado mantém a data original", () => {
    const id = prev("2026-10-10");
    markEffectuated(db, id, "2026-10-15");
    expect(listTransactions(db)[0].date).toBe("2026-10-10");
  });

  it("não altera lançamento que já estava efetivado", () => {
    const id = createTransaction(db, { kind: "despesa", date: "2026-10-20", amountCents: 1_000, description: "x", accountId: corrente });
    markEffectuated(db, id, "2026-10-15");
    expect(listTransactions(db)[0].date).toBe("2026-10-20");
  });
});

describe("categorias", () => {
  it("vêm pré-cadastradas, com subcategorias de Moradia", () => {
    const names = listCategories(db).map((c) => c.name);
    expect(names).toContain("Moradia");
    expect(names).toContain("Luz");
    const moradia = listCategories(db).find((c) => c.name === "Moradia")!;
    expect(listCategories(db).find((c) => c.name === "Luz")!.parentId).toBe(moradia.id);
  });

  it("permite só um nível de subcategoria", () => {
    const luz = catId("Luz");
    expect(() => createCategory(db, { name: "Bandeira", kind: "despesa", parentId: luz, color: "#fff", icon: "x" })).toThrow(/um nível/);
  });

  it("subcategoria deve ter o mesmo tipo do pai", () => {
    expect(() => createCategory(db, { name: "Extra", kind: "receita", parentId: catId("Moradia"), color: "#fff", icon: "x" })).toThrow(/mesmo tipo/);
  });

  it("arquivar o pai arquiva as subcategorias", () => {
    setCategoryArchived(db, catId("Moradia"), true);
    const names = listCategories(db).map((c) => c.name);
    expect(names).not.toContain("Moradia");
    expect(names).not.toContain("Luz");
  });
});

describe("edição de ocorrência gravada de recorrência", () => {
  it("não permite trocar o tipo do lançamento", () => {
    const rid = createRecurrence(db, { kind: "despesa", description: "Aluguel", amountCents: 100_000, accountId: corrente, categoryId: null, endDate: null, frequency: "mensal", startDate: "2026-10-05" });
    effectuateOccurrence(db, rid, "2026-10-05", "2026-10-05");
    const t = listTransactions(db).find((x) => x.recurrenceId === rid)!;
    const id = t.id;
    expect(() => updateTransaction(db, id, { ...t, kind: "receita" })).toThrow(/tipo de uma ocorrência/);
    expect(() => updateTransaction(db, id, { ...t, description: "Aluguel 2" })).not.toThrow();
  });
});
