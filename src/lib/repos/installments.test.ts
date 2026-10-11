import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../db/connection";
import { createAccount, getAccount } from "./accounts";
import { listCategories } from "./categories";
import {
  anticipableAmounts,
  anticipateInstallments,
  cancelRemaining,
  createInstallmentPurchase,
  deletePurchase,
  getPurchase,
  listPurchases,
  purchaseEditDefaults,
  updatePurchase,
  type PurchaseEdit,
} from "./installments";
import { createTransaction, listTransactions, markEffectuated } from "./transactions";

let db: Db;
let bank: number;
let other: number;
const TODAY = "2026-10-15";

beforeEach(() => {
  db = openDb(":memory:");
  bank = createAccount(db, { name: "Corrente", kind: "corrente", initialBalanceCents: 500_000 });
  other = createAccount(db, { name: "Poupança", kind: "corrente", initialBalanceCents: 0 });
});

const catId = (name: string) => listCategories(db).find((c) => c.name === name)!.id;
const buy = (installments = 6, firstPaid = false) =>
  createInstallmentPurchase(db, {
    description: "Notebook",
    installments,
    firstDate: "2026-10-20",
    accountId: bank,
    categoryId: null,
    mode: "parcela",
    valueCents: 10_000,
    firstPaid,
    today: TODAY,
  });
const rows = (id: number) => listTransactions(db, { purchaseId: id }).sort((a, b) => a.installmentNo! - b.installmentNo!);
const edit = (over: Partial<PurchaseEdit> = {}): PurchaseEdit => ({ description: "Notebook", installments: 6, accountId: bank, categoryId: null, ...over });

describe("resumo da compra parcelada", () => {
  it("traz valor da parcela, total, mês final e atraso da próxima parcela", () => {
    const id = buy(3);
    const s = getPurchase(db, id, "2026-10-25")!;
    expect(s).toMatchObject({ installmentCents: 10_000, totalCents: 30_000, lastDate: "2026-12-20", onCard: false, postedCount: 0 });
    expect(s.overdueDays).toBe(5); // 1ª parcela venceu em 20/10
    expect(getPurchase(db, id, "2026-10-10")!.overdueDays).toBeNull();
  });
});

describe("excluir compra parcelada", () => {
  it("apaga todas as parcelas, inclusive as efetivadas, e o registro da compra", () => {
    const id = buy(4, true);
    expect(rows(id).filter((t) => t.status === "efetivado")).toHaveLength(1);
    deletePurchase(db, id);
    expect(rows(id)).toHaveLength(0);
    expect(getPurchase(db, id)).toBeUndefined();
    expect(listPurchases(db)).toHaveLength(0);
  });

  it("não mexe em outras compras", () => {
    const keep = buy(3);
    deletePurchase(db, buy(5));
    expect(rows(keep)).toHaveLength(3);
    expect(getPurchase(db, keep)).toBeDefined();
  });
});

describe("cancelar o restante", () => {
  it("mantém a compra enquanto sobra parcela efetivada", () => {
    const id = buy(4, true);
    expect(cancelRemaining(db, id)).toBe(3);
    expect(rows(id)).toHaveLength(1);
    expect(getPurchase(db, id)).toBeDefined();
  });

  it("remove o registro da compra quando não sobra nenhuma parcela", () => {
    const id = buy(4);
    expect(cancelRemaining(db, id)).toBe(4);
    expect(getPurchase(db, id)).toBeUndefined();
    expect(listPurchases(db)).toHaveLength(0);
  });
});

describe("editar compra parcelada", () => {
  it("corrige o nº de parcelas para menos, removendo do final", () => {
    const id = buy(6);
    updatePurchase(db, id, edit({ installments: 4 }));
    expect(rows(id).map((t) => t.installmentNo)).toEqual([1, 2, 3, 4]);
    expect(getPurchase(db, id)!.totalInstallments).toBe(4);
    expect(rows(id)[0].installmentTotal).toBe(4);
  });

  it("corrige o nº de parcelas para mais, no mesmo valor e nos meses seguintes", () => {
    const id = buy(3);
    updatePurchase(db, id, edit({ installments: 5 }));
    const all = rows(id);
    expect(all.map((t) => t.date)).toEqual(["2026-10-20", "2026-11-20", "2026-12-20", "2027-01-20", "2027-02-20"]);
    expect(all.every((t) => t.amountCents === 10_000 && t.status === "previsto")).toBe(true);
  });

  it("preserva as parcelas efetivadas e os ajustes manuais do meio", () => {
    const id = buy(6, true);
    const third = rows(id)[2];
    db.prepare("UPDATE transactions SET amount_cents = 7777 WHERE id = ?").run(third.id);
    updatePurchase(db, id, edit({ installments: 8 }));
    const all = rows(id);
    expect(all[0].status).toBe("efetivado");
    expect(all[2].amountCents).toBe(7_777);
    expect(all).toHaveLength(8);
  });

  it("não deixa o nº de parcelas ficar abaixo da última paga", () => {
    const id = buy(6);
    markEffectuated(db, rows(id)[3].id, TODAY);
    expect(() => updatePurchase(db, id, edit({ installments: 3 }))).toThrow(/pagas até a 4ª/);
    expect(rows(id)).toHaveLength(6);
  });

  it("valida o nº de parcelas", () => {
    const id = buy(6);
    expect(() => updatePurchase(db, id, edit({ installments: 1 }))).toThrow(/entre 2 e/);
    expect(() => updatePurchase(db, id, edit({ installments: 121 }))).toThrow(/entre 2 e/);
  });

  it("descrição e categoria valem para todas as parcelas, inclusive pagas", () => {
    const id = buy(3, true);
    updatePurchase(db, id, edit({ installments: 3, description: "Notebook Dell", categoryId: catId("Mercado") }));
    expect(rows(id).every((t) => t.description === "Notebook Dell" && t.categoryId === catId("Mercado"))).toBe(true);
    expect(getPurchase(db, id)).toMatchObject({ description: "Notebook Dell", categoryName: "Mercado" });
  });

  it("só muda a conta se nenhuma parcela foi paga", () => {
    const paid = buy(3, true);
    expect(() => updatePurchase(db, paid, edit({ installments: 3, accountId: other }))).toThrow(/conta não pode mudar/);
    const open = buy(3);
    updatePurchase(db, open, edit({ installments: 3, accountId: other }));
    expect(rows(open).every((t) => t.accountId === other)).toBe(true);
    expect(getPurchase(db, open)!.accountId).toBe(other);
  });

  it("valor por parcela só reaplica nas previstas", () => {
    const id = buy(4, true);
    updatePurchase(db, id, edit({ installments: 4, valueCents: 12_345, mode: "parcela" }));
    expect(rows(id).map((t) => t.amountCents)).toEqual([10_000, 12_345, 12_345, 12_345]);
  });

  it("valor total divide o que falta depois das pagas entre as previstas", () => {
    const id = buy(4, true);
    updatePurchase(db, id, edit({ installments: 4, valueCents: 40_001, mode: "total" }));
    // pago: 10.000 -> sobram 30.001 para 3 parcelas (a sobra de centavos vai para as primeiras)
    expect(rows(id).map((t) => t.amountCents)).toEqual([10_000, 10_001, 10_000, 10_000]);
    expect(rows(id).reduce((s, t) => s + t.amountCents, 0)).toBe(40_001);
  });

  it("recusa um total menor que o já pago mais as parcelas que faltam", () => {
    const id = buy(4, true);
    expect(() => updatePurchase(db, id, edit({ installments: 4, valueCents: 10_001, mode: "total" }))).toThrow(/total é menor/);
  });

  it("nova data da 1ª parcela reaplica mês a mês nas previstas", () => {
    const id = buy(3);
    updatePurchase(db, id, edit({ installments: 3, firstDate: "2026-11-05" }));
    expect(rows(id).map((t) => t.date)).toEqual(["2026-11-05", "2026-12-05", "2027-01-05"]);
  });

  it("sem mexer em valor e data, os ajustes manuais das previstas ficam", () => {
    const id = buy(3);
    const second = rows(id)[1];
    db.prepare("UPDATE transactions SET amount_cents = 5_000, date = '2026-11-25' WHERE id = ?").run(second.id);
    updatePurchase(db, id, edit({ installments: 4 }));
    expect(rows(id)[1]).toMatchObject({ amountCents: 5_000, date: "2026-11-25" });
  });

  it("aumentar parcelas depois de tudo pago cria previstas um mês após a última paga", () => {
    const id = buy(2);
    for (const t of rows(id)) markEffectuated(db, t.id, TODAY); // parcelas futuras pagas viram "hoje"
    updatePurchase(db, id, edit({ installments: 3 }));
    const all = rows(id);
    expect(all[2]).toMatchObject({ status: "previsto", amountCents: 10_000, date: "2026-11-15" });
  });

  it("recusa categoria de receita, conta ou compra inexistentes", () => {
    const id = buy(3);
    expect(() => updatePurchase(db, id, edit({ categoryId: catId("Salário") }))).toThrow(/não é de despesa/);
    expect(() => updatePurchase(db, id, edit({ accountId: 999 }))).toThrow(/Conta não encontrada/);
    expect(() => updatePurchase(db, 999, edit())).toThrow(/Compra não encontrada/);
  });

  it("uma falha não deixa a compra pela metade", () => {
    const id = buy(6);
    expect(() => updatePurchase(db, id, edit({ installments: 8, description: "Novo", valueCents: 1, mode: "total" }))).toThrow();
    expect(getPurchase(db, id)).toMatchObject({ description: "Notebook", totalInstallments: 6 });
    expect(rows(id)).toHaveLength(6);
  });

  it("valores iniciais do formulário vêm da próxima parcela prevista", () => {
    const id = buy(4, true);
    expect(purchaseEditDefaults(db, id)).toEqual({ firstDate: "2026-10-20", amountCents: 10_000, paidCount: 1, paidCents: 10_000 });
  });
});

describe("compra parcelada no cartão (ADR 0004)", () => {
  // Cartão fecha dia 25 e vence dia 5 do mês seguinte; hoje é 15/10. Parcelas: 20/10, 20/11, 20/12, 20/01.
  let card: number;
  beforeEach(() => {
    card = createAccount(db, { name: "Nubank", kind: "cartao", initialBalanceCents: 0, closingDay: 25, dueDay: 5, payAccountId: bank });
  });
  const buyOnCard = (installments = 4) =>
    createInstallmentPurchase(db, {
      description: "Notebook", installments, firstDate: "2026-10-20", accountId: card, categoryId: null,
      mode: "parcela", valueCents: 10_000, firstPaid: false, today: TODAY,
    });
  const payCard = (amountCents: number) =>
    createTransaction(db, { kind: "transferencia", status: "efetivado", date: TODAY, amountCents, description: "Fatura", accountId: bank, toAccountId: card });

  it("todas as parcelas nascem efetivadas e o saldo do cartão é a dívida inteira", () => {
    const id = buyOnCard();
    expect(rows(id).map((t) => t.status)).toEqual(["efetivado", "efetivado", "efetivado", "efetivado"]);
    expect(getAccount(db, card)!.balanceCents).toBe(-40_000);
  });

  it("o que falta são as parcelas de faturas ainda não pagas", () => {
    const id = buyOnCard();
    expect(getPurchase(db, id, TODAY)).toMatchObject({ paidCount: 0, remainingCount: 4, remainingCents: 40_000, nextDate: "2026-10-20" });
    payCard(10_000); // quita a fatura de 25/10
    expect(getPurchase(db, id, TODAY)).toMatchObject({ paidCount: 1, remainingCount: 3, remainingCents: 30_000, nextDate: "2026-11-20" });
  });

  it("cancelar o restante apaga só as parcelas de faturas não pagas", () => {
    const id = buyOnCard();
    payCard(10_000);
    expect(cancelRemaining(db, id, TODAY)).toBe(3);
    expect(rows(id)).toHaveLength(1);
  });

  it("só dá para antecipar parcelas com data depois de hoje, as últimas primeiro", () => {
    const id = buyOnCard();
    expect(anticipableAmounts(db, id, TODAY)).toEqual([10_000, 10_000, 10_000, 10_000]);
    anticipateInstallments(db, id, { count: 2, chargedCents: 18_000, today: TODAY });
    expect(rows(id).map((t) => [t.installmentNo, t.date, t.amountCents])).toEqual([
      [1, "2026-10-20", 10_000],
      [2, "2026-11-20", 10_000],
      [3, TODAY, 9_000],
      [4, TODAY, 9_000],
    ]);
    expect(getAccount(db, card)!.balanceCents).toBe(-38_000);
  });
});
