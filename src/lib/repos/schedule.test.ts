import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../db/connection";
import { dailyBalances } from "../projection";
import { createAccount, getAccount, listAccounts } from "./accounts";
import { listCategories } from "./categories";
import {
  cancelRemaining,
  createInstallmentPurchase,
  getPurchase,
  listPurchases,
  settleRemaining,
} from "./installments";
import {
  createRecurrence,
  deleteTransactionKeepingSchedule,
  effectuateOccurrence,
  endRecurrence,
  getRecurrence,
  listVirtualOccurrences,
  listWithOccurrences,
  saveOccurrence,
  skipOccurrence,
  updateRecurrenceFrom,
} from "./recurrences";
import { createTransaction, listTransactions } from "./transactions";

let db: Db;
let acc: number;
const TODAY = "2026-10-15";
const catId = (name: string) => listCategories(db).find((c) => c.name === name)!.id;

const rent = (over: Partial<Parameters<typeof createRecurrence>[1]> = {}) =>
  createRecurrence(db, {
    kind: "despesa",
    description: "Aluguel",
    amountCents: 150_000,
    accountId: acc,
    categoryId: catId("Aluguel"),
    frequency: "mensal",
    startDate: "2026-10-05",
    endDate: null,
    ...over,
  });

const virtualDates = (to: string, rid?: number) =>
  listVirtualOccurrences(db, to)
    .filter((t) => rid === undefined || t.recurrenceId === rid)
    .map((t) => t.date)
    .sort();

beforeEach(() => {
  db = openDb(":memory:");
  acc = createAccount(db, { name: "Corrente", kind: "corrente", initialBalanceCents: 1_000_000 });
});

describe("recorrência virtual", () => {
  it("não grava lançamentos: as ocorrências são calculadas", () => {
    rent();
    expect(listTransactions(db)).toHaveLength(0);
    expect(virtualDates("2027-01-31")).toEqual(["2026-10-05", "2026-11-05", "2026-12-05", "2027-01-05"]);
  });

  it("as virtuais vêm como previstas, com ids negativos e únicos", () => {
    rent();
    const v = listVirtualOccurrences(db, "2026-12-31");
    expect(v.every((t) => t.status === "previsto" && t.isVirtual && t.id < 0)).toBe(true);
    expect(new Set(v.map((t) => t.id)).size).toBe(v.length);
  });

  it("não alteram o saldo atual", () => {
    rent();
    expect(getAccount(db, acc)!.balanceCents).toBe(1_000_000);
  });

  it("validações: valor, conta, categoria do tipo errado e término antes do início", () => {
    expect(() => rent({ amountCents: 0 })).toThrow(/maior que zero/);
    expect(() => rent({ accountId: 999 })).toThrow(/Conta/);
    expect(() => rent({ categoryId: catId("Salário") })).toThrow(/não é de despesa/);
    expect(() => rent({ endDate: "2026-09-01" })).toThrow(/término/);
  });
});

describe("efetivar, pular e editar uma ocorrência", () => {
  it("efetivar grava um lançamento e a virtual some (sem duplicar)", () => {
    const id = rent();
    effectuateOccurrence(db, id, "2026-10-05", TODAY);
    expect(virtualDates("2026-11-30")).toEqual(["2026-11-05"]);
    const [t] = listTransactions(db);
    expect(t).toMatchObject({ status: "efetivado", date: "2026-10-05", amountCents: 150_000, recurrenceId: id, occurrenceDate: "2026-10-05" });
    expect(getAccount(db, acc)!.balanceCents).toBe(850_000);
  });

  it("efetivar uma ocorrência futura registra na data de hoje, mas continua ocupando o lugar dela", () => {
    const id = rent();
    effectuateOccurrence(db, id, "2026-11-05", TODAY);
    expect(listTransactions(db)[0]).toMatchObject({ date: TODAY, occurrenceDate: "2026-11-05" });
    expect(virtualDates("2026-11-30")).toEqual(["2026-10-05"]);
  });

  it("efetivar duas vezes não duplica", () => {
    const id = rent();
    effectuateOccurrence(db, id, "2026-10-05", TODAY);
    effectuateOccurrence(db, id, "2026-10-05", TODAY);
    expect(listTransactions(db)).toHaveLength(1);
  });

  it("pular remove só aquela ocorrência", () => {
    const id = rent();
    skipOccurrence(db, id, "2026-11-05");
    expect(virtualDates("2026-12-31")).toEqual(["2026-10-05", "2026-12-05"]);
    expect(listTransactions(db)).toHaveLength(0);
  });

  it("excluir um lançamento que veio da recorrência pula a ocorrência em vez de recriá-la", () => {
    const id = rent();
    effectuateOccurrence(db, id, "2026-10-05", TODAY);
    deleteTransactionKeepingSchedule(db, listTransactions(db)[0].id);
    expect(listTransactions(db)).toHaveLength(0);
    expect(virtualDates("2026-10-31")).toEqual([]);
    expect(getAccount(db, acc)!.balanceCents).toBe(1_000_000);
  });

  it("excluir um lançamento comum só o apaga, sem registrar pulo", () => {
    const id = rent();
    const lone = createTransaction(db, { kind: "despesa", date: TODAY, amountCents: 500, description: "Café", accountId: acc });
    deleteTransactionKeepingSchedule(db, lone);
    expect(listTransactions(db)).toHaveLength(0);
    expect(db.prepare("SELECT COUNT(*) AS n FROM recurrence_skips").get()).toEqual({ n: 0 });
    expect(virtualDates("2026-10-31", id)).toEqual(["2026-10-05"]); // a recorrência segue intacta
  });

  it("editar uma ocorrência (valor e data) substitui a virtual e não afeta as outras", () => {
    const id = rent();
    saveOccurrence(db, id, "2026-11-05", {
      kind: "despesa",
      status: "previsto",
      date: "2026-11-08",
      amountCents: 160_000,
      description: "Aluguel (reajuste)",
      accountId: acc,
      categoryId: catId("Aluguel"),
    });
    const all = listWithOccurrences(db, "2026-12-31").sort((a, b) => a.date.localeCompare(b.date));
    expect(all.map((t) => [t.date, t.amountCents])).toEqual([
      ["2026-10-05", 150_000],
      ["2026-11-08", 160_000],
      ["2026-12-05", 150_000],
    ]);
  });

  it("editar de novo atualiza a mesma exceção", () => {
    const id = rent();
    const base = { kind: "despesa" as const, status: "previsto" as const, date: "2026-11-05", description: "x", accountId: acc };
    saveOccurrence(db, id, "2026-11-05", { ...base, amountCents: 100 });
    saveOccurrence(db, id, "2026-11-05", { ...base, amountCents: 200 });
    expect(listTransactions(db)).toHaveLength(1);
    expect(listTransactions(db)[0].amountCents).toBe(200);
  });

  it("não aceita data fora do ciclo nem mudar o tipo", () => {
    const id = rent();
    expect(() => effectuateOccurrence(db, id, "2026-10-06", TODAY)).toThrow(/Ocorrência/);
    expect(() => skipOccurrence(db, id, "2026-10-06")).toThrow(/Ocorrência/);
    expect(() =>
      saveOccurrence(db, id, "2026-10-05", { kind: "receita", date: "2026-10-05", amountCents: 1, description: "x", accountId: acc }),
    ).toThrow(/tipo/);
  });
});

describe("editar a partir de uma data", () => {
  const values = { description: "Aluguel", amountCents: 180_000, accountId: 0, categoryId: null as number | null, endDate: null as string | null };

  it("antes da data, nada muda; depois, vale o valor novo", () => {
    const id = rent();
    const newId = updateRecurrenceFrom(db, id, "2026-12-05", { ...values, accountId: acc });
    expect(newId).not.toBe(id);
    const all = listWithOccurrences(db, "2027-02-28").sort((a, b) => a.date.localeCompare(b.date));
    expect(all.map((t) => [t.date, t.amountCents])).toEqual([
      ["2026-10-05", 150_000],
      ["2026-11-05", 150_000],
      ["2026-12-05", 180_000],
      ["2027-01-05", 180_000],
      ["2027-02-05", 180_000],
    ]);
    expect(getRecurrence(db, id)!.endDate).toBe("2026-12-04");
  });

  it("o que já estava gravado depois da data passa para a regra nova (sem duplicar)", () => {
    const id = rent();
    effectuateOccurrence(db, id, "2026-12-05", "2026-12-05");
    skipOccurrence(db, id, "2027-01-05");
    const newId = updateRecurrenceFrom(db, id, "2026-12-05", { ...values, accountId: acc });
    const all = listWithOccurrences(db, "2027-02-28").sort((a, b) => a.date.localeCompare(b.date));
    expect(all.map((t) => t.date)).toEqual(["2026-10-05", "2026-11-05", "2026-12-05", "2027-02-05"]);
    expect(listTransactions(db)[0].recurrenceId).toBe(newId);
  });

  it("preserva o dia âncora quando a divisão cai num mês curto", () => {
    const id = rent({ startDate: "2026-01-31" });
    const newId = updateRecurrenceFrom(db, id, "2026-02-28", { ...values, accountId: acc });
    expect(getRecurrence(db, newId)!.anchorDay).toBe(31);
    expect(virtualDates("2026-04-30", newId)).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("a partir do início, altera a própria regra", () => {
    const id = rent();
    expect(updateRecurrenceFrom(db, id, "2026-10-05", { ...values, accountId: acc })).toBe(id);
    expect(getRecurrence(db, id)!.amountCents).toBe(180_000);
  });

  it("exige que a data seja uma ocorrência", () => {
    const id = rent();
    expect(() => updateRecurrenceFrom(db, id, "2026-12-06", { ...values, accountId: acc })).toThrow(/ocorrência/);
  });

  it("encerrar para as ocorrências seguintes e mantém as anteriores", () => {
    const id = rent();
    endRecurrence(db, id, "2026-11-30");
    expect(virtualDates("2027-03-31")).toEqual(["2026-10-05", "2026-11-05"]);
  });
});

describe("projeção com recorrências", () => {
  it("o saldo cai no dia de cada ocorrência virtual", () => {
    rent({ startDate: "2026-10-20" });
    const days = dailyBalances({
      accounts: listAccounts(db),
      transactions: listWithOccurrences(db, "2026-12-31"),
      today: TODAY,
      from: "2026-10-15",
      to: "2026-12-31",
    });
    const at = (d: string) => days.find((x) => x.date === d)!.endBalanceCents;
    expect(at("2026-10-19")).toBe(1_000_000);
    expect(at("2026-10-20")).toBe(850_000);
    expect(at("2026-11-20")).toBe(700_000);
    expect(at("2026-12-20")).toBe(550_000);
  });

  it("ocorrência não efetivada e vencida vira atraso e pesa hoje", () => {
    rent({ startDate: "2026-10-05" });
    const days = dailyBalances({
      accounts: listAccounts(db),
      transactions: listWithOccurrences(db, "2026-10-31"),
      today: TODAY,
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(days.find((d) => d.date === "2026-10-14")!.endBalanceCents).toBe(1_000_000);
    expect(days.find((d) => d.date === TODAY)!.endBalanceCents).toBe(850_000);
  });
});

describe("compra parcelada", () => {
  const base = () => ({
    description: "Geladeira",
    installments: 6,
    firstDate: "2026-11-10",
    accountId: acc,
    categoryId: null as number | null,
    mode: "parcela" as const,
    valueCents: 30_000,
    firstPaid: false,
    today: TODAY,
  });

  it("cria uma parcela por mês, todas previstas, sem mexer no saldo atual", () => {
    const pid = createInstallmentPurchase(db, base());
    const parcelas = listTransactions(db, { purchaseId: pid }).sort((a, b) => a.installmentNo! - b.installmentNo!);
    expect(parcelas.map((p) => [p.installmentNo, p.date, p.amountCents, p.status])).toEqual([
      [1, "2026-11-10", 30_000, "previsto"],
      [2, "2026-12-10", 30_000, "previsto"],
      [3, "2027-01-10", 30_000, "previsto"],
      [4, "2027-02-10", 30_000, "previsto"],
      [5, "2027-03-10", 30_000, "previsto"],
      [6, "2027-04-10", 30_000, "previsto"],
    ]);
    expect(parcelas.every((p) => p.installmentTotal === 6)).toBe(true);
    expect(getAccount(db, acc)!.balanceCents).toBe(1_000_000);
  });

  it("dividindo um total, a sobra de centavos vai para as primeiras parcelas", () => {
    const pid = createInstallmentPurchase(db, { ...base(), installments: 3, mode: "total", valueCents: 10_000 });
    const amounts = listTransactions(db, { purchaseId: pid }).sort((a, b) => a.installmentNo! - b.installmentNo!).map((p) => p.amountCents);
    expect(amounts).toEqual([3_334, 3_333, 3_333]);
  });

  it("dia 31 recua em meses curtos sem arrastar as parcelas seguintes", () => {
    const pid = createInstallmentPurchase(db, { ...base(), installments: 4, firstDate: "2026-12-31" });
    const dates = listTransactions(db, { purchaseId: pid }).map((p) => p.date).sort();
    expect(dates).toEqual(["2026-12-31", "2027-01-31", "2027-02-28", "2027-03-31"]);
  });

  it("primeira parcela já paga é efetivada e muda o saldo", () => {
    const pid = createInstallmentPurchase(db, { ...base(), firstPaid: true });
    expect(getAccount(db, acc)!.balanceCents).toBe(970_000);
    const first = listTransactions(db, { purchaseId: pid }).find((p) => p.installmentNo === 1)!;
    expect(first).toMatchObject({ status: "efetivado", date: TODAY }); // vencimento futuro: pago hoje
    expect(getPurchase(db, pid)).toMatchObject({ paidCount: 1, remainingCount: 5, remainingCents: 150_000 });
  });

  it("cancelar o restante apaga só as previstas", () => {
    const pid = createInstallmentPurchase(db, { ...base(), firstPaid: true });
    expect(cancelRemaining(db, pid)).toBe(5);
    expect(listTransactions(db, { purchaseId: pid })).toHaveLength(1);
    expect(getPurchase(db, pid)).toMatchObject({ remainingCount: 0, nextDate: null });
  });

  it("quitar o restante efetiva tudo hoje", () => {
    const pid = createInstallmentPurchase(db, base());
    settleRemaining(db, pid, TODAY);
    expect(getAccount(db, acc)!.balanceCents).toBe(1_000_000 - 180_000);
    expect(getPurchase(db, pid)).toMatchObject({ paidCount: 6, remainingCount: 0 });
  });

  it("lista compras em aberto antes das quitadas", () => {
    const quitada = createInstallmentPurchase(db, { ...base(), description: "Quitada" });
    settleRemaining(db, quitada, TODAY);
    const aberta = createInstallmentPurchase(db, { ...base(), description: "Aberta" });
    expect(listPurchases(db).map((p) => p.id)).toEqual([aberta, quitada]);
  });

  it("editar uma parcela específica não mexe nas outras", () => {
    const pid = createInstallmentPurchase(db, base());
    const third = listTransactions(db, { purchaseId: pid }).find((p) => p.installmentNo === 3)!;
    db.prepare("UPDATE transactions SET amount_cents = 25000 WHERE id = ?").run(third.id);
    const amounts = listTransactions(db, { purchaseId: pid }).sort((a, b) => a.installmentNo! - b.installmentNo!).map((p) => p.amountCents);
    expect(amounts).toEqual([30_000, 30_000, 25_000, 30_000, 30_000, 30_000]);
  });

  it("validações", () => {
    expect(() => createInstallmentPurchase(db, { ...base(), installments: 1 })).toThrow(/parcelas/);
    expect(() => createInstallmentPurchase(db, { ...base(), installments: 121 })).toThrow(/parcelas/);
    expect(() => createInstallmentPurchase(db, { ...base(), valueCents: 0 })).toThrow(/maior que zero/);
    expect(() => createInstallmentPurchase(db, { ...base(), categoryId: catId("Salário") })).toThrow(/não é de despesa/);
    expect(() => createInstallmentPurchase(db, { ...base(), mode: "total", installments: 5, valueCents: 3 })).toThrow(/total/);
    expect(listTransactions(db)).toHaveLength(0); // nada pela metade
  });
});
