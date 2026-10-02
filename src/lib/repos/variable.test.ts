import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../db/connection";
import { migrate } from "../db/migrations";
import { dailyBalances } from "../projection";
import { createAccount, getAccount, listAccounts } from "./accounts";
import {
  createRecurrence,
  deleteTransactionKeepingSchedule,
  effectuateOccurrence,
  getHistorySeed,
  getRecurrence,
  getSeriesHistory,
  listVirtualOccurrences,
  listWithOccurrences,
  predictOccurrence,
  saveOccurrence,
  setHistorySeed,
  skipOccurrence,
  updateRecurrenceFrom,
} from "./recurrences";
import { listTransactions } from "./transactions";

let db: Db;
let acc: number;
const TODAY = "2026-10-15";

const luz = (over: Partial<Parameters<typeof createRecurrence>[1]> = {}) =>
  createRecurrence(db, {
    kind: "despesa",
    description: "Luz",
    amountCents: 15_000,
    accountId: acc,
    categoryId: null,
    frequency: "mensal",
    startDate: "2026-10-10",
    endDate: null,
    isVariable: true,
    ...over,
  });

const virtual = (to: string, rid?: number) =>
  listVirtualOccurrences(db, to)
    .filter((t) => rid === undefined || t.recurrenceId === rid)
    .sort((a, b) => a.date.localeCompare(b.date));

const seed3 = [
  { month: "2026-07", amountCents: 10_000 },
  { month: "2026-08", amountCents: 20_000 },
  { month: "2026-09", amountCents: 30_000 },
];

beforeEach(() => {
  db = openDb(":memory:");
  acc = createAccount(db, { name: "Corrente", kind: "corrente", initialBalanceCents: 1_000_000 });
});

describe("recorrência variável: criação e previsão", () => {
  it("sem histórico, a ocorrência usa a estimativa inicial e é marcada como estimada", () => {
    const id = luz();
    const [o] = virtual("2026-10-31", id);
    expect(o).toMatchObject({ amountCents: 15_000, isEstimate: true });
    expect(o.estimateNote).toMatch(/inicial/i);
  });

  it("com histórico inicial (seed), prevê pela média ponderada e explica", () => {
    const id = luz({ historySeed: seed3 });
    const [o] = virtual("2026-10-31", id);
    // (10000*1 + 20000*2 + 30000*3) / 6
    expect(o.amountCents).toBe(23_333);
    expect(o.estimateNote).toMatch(/3 meses/);
    expect(getHistorySeed(db, getRecurrence(db, id)!.seriesId)).toEqual(seed3);
  });

  it("o seed não cria lançamentos nem mexe no saldo", () => {
    luz({ historySeed: seed3 });
    expect(listTransactions(db)).toHaveLength(0);
    expect(getAccount(db, acc)!.balanceCents).toBe(1_000_000);
  });

  it("o seed só vale para recorrência variável", () => {
    const id = createRecurrence(db, {
      kind: "despesa",
      description: "Aluguel",
      amountCents: 100_000,
      accountId: acc,
      categoryId: null,
      frequency: "mensal",
      startDate: "2026-10-10",
      endDate: null,
      historySeed: seed3,
    });
    expect(getHistorySeed(db, getRecurrence(db, id)!.seriesId)).toEqual([]);
  });

  it("valida o seed: mês no formato AAAA-MM e valor positivo", () => {
    expect(() => luz({ historySeed: [{ month: "2026-13", amountCents: 100 }] })).toThrow(/mês/i);
    expect(() => luz({ historySeed: [{ month: "2026-07", amountCents: 0 }] })).toThrow(/maior que zero/);
    expect(() =>
      luz({ historySeed: [{ month: "2026-07", amountCents: 100 }, { month: "2026-07", amountCents: 200 }] }),
    ).toThrow(/repetido/i);
  });

  it("cada ocorrência futura usa só o histórico anterior ao mês dela, sem encadear previsões", () => {
    const id = luz({ historySeed: seed3 });
    const [oct, nov, dec] = virtual("2026-12-31", id);
    // Nenhuma previsão vira dado de entrada de outra: as três usam o mesmo histórico real.
    expect(oct.amountCents).toBe(23_333);
    expect(nov.amountCents).toBe(23_333);
    expect(dec.amountCents).toBe(23_333);
  });

  it("ocorrências futuras entram na projeção do saldo", () => {
    luz({ historySeed: seed3, startDate: "2026-10-20" });
    const days = dailyBalances({
      accounts: listAccounts(db),
      transactions: listWithOccurrences(db, "2026-11-30"),
      today: TODAY,
      from: "2026-10-15",
      to: "2026-11-30",
    });
    expect(days.find((d) => d.date === "2026-10-20")!.endBalanceCents).toBe(1_000_000 - 23_333);
  });
});

describe("recorrência variável: efetivar com o valor real", () => {
  it("grava o lançamento com o valor informado e o saldo atual muda por ele", () => {
    const id = luz({ historySeed: seed3 });
    effectuateOccurrence(db, id, "2026-10-10", TODAY, 25_000);
    expect(listTransactions(db)[0]).toMatchObject({ amountCents: 25_000, status: "efetivado" });
    expect(getAccount(db, acc)!.balanceCents).toBe(975_000);
  });

  it("sem valor informado, efetiva pelo valor previsto (não pela estimativa inicial)", () => {
    const id = luz({ historySeed: seed3 });
    effectuateOccurrence(db, id, "2026-10-10", TODAY);
    expect(listTransactions(db)[0].amountCents).toBe(23_333);
  });

  it("a previsão do mês seguinte considera o valor efetivado", () => {
    const id = luz({ historySeed: seed3 });
    const antes = virtual("2026-11-30", id).find((t) => t.date === "2026-11-10")!.amountCents;
    effectuateOccurrence(db, id, "2026-10-10", TODAY, 90_000);
    const depois = virtual("2026-11-30", id).find((t) => t.date === "2026-11-10")!;
    expect(depois.amountCents).not.toBe(antes);
    // histórico: 07=10000, 08=20000, 09=30000, 10=90000 (limitado a 2,5× a mediana 25000 = 62500)
    // (10000*1 + 20000*2 + 30000*3 + 62500*4) / 10
    expect(depois.amountCents).toBe(39_000);
    expect(depois.estimateNote).toMatch(/4 meses/);
  });

  it("usa o mês de occurrence_date, não o da data do pagamento", () => {
    const id = luz({ historySeed: [], startDate: "2026-09-28" });
    // paga em 02/10 a conta que venceu em 28/09
    saveOccurrence(db, id, "2026-09-28", {
      kind: "despesa",
      status: "efetivado",
      date: "2026-10-02",
      amountCents: 11_100,
      description: "Luz",
      accountId: acc,
    });
    expect(getSeriesHistory(db, getRecurrence(db, id)!.seriesId)).toEqual([{ month: "2026-09", amountCents: 11_100 }]);
  });

  it("ocorrência editada mas ainda prevista não entra no histórico", () => {
    const id = luz();
    saveOccurrence(db, id, "2026-10-10", {
      kind: "despesa",
      status: "previsto",
      date: "2026-10-10",
      amountCents: 99_999,
      description: "Luz",
      accountId: acc,
    });
    expect(getSeriesHistory(db, getRecurrence(db, id)!.seriesId)).toEqual([]);
  });

  it("ocorrência pulada ou excluída fica fora do histórico", () => {
    const id = luz({ startDate: "2026-07-10" });
    effectuateOccurrence(db, id, "2026-07-10", TODAY, 10_000);
    effectuateOccurrence(db, id, "2026-08-10", TODAY, 20_000);
    skipOccurrence(db, id, "2026-09-10");
    deleteTransactionKeepingSchedule(db, listTransactions(db).find((t) => t.occurrenceDate === "2026-08-10")!.id);
    expect(getSeriesHistory(db, getRecurrence(db, id)!.seriesId)).toEqual([{ month: "2026-07", amountCents: 10_000 }]);
  });
});

describe("séries: editar a partir de uma data preserva o histórico", () => {
  const values = (over = {}) => ({
    description: "Luz",
    amountCents: 18_000,
    accountId: 0,
    categoryId: null as number | null,
    endDate: null as string | null,
    ...over,
  });

  it("a regra nova herda o series_id e continua variável", () => {
    const id = luz({ startDate: "2026-07-10" });
    effectuateOccurrence(db, id, "2026-07-10", TODAY, 10_000);
    const newId = updateRecurrenceFrom(db, id, "2026-10-10", values({ accountId: acc }));
    expect(newId).not.toBe(id);
    expect(getRecurrence(db, newId)).toMatchObject({
      seriesId: getRecurrence(db, id)!.seriesId,
      isVariable: true,
    });
  });

  it("o histórico atravessa a divisão da regra", () => {
    const id = luz({ startDate: "2026-07-10" });
    effectuateOccurrence(db, id, "2026-07-10", TODAY, 10_000);
    effectuateOccurrence(db, id, "2026-08-10", TODAY, 20_000);
    effectuateOccurrence(db, id, "2026-09-10", TODAY, 30_000);
    const newId = updateRecurrenceFrom(db, id, "2026-10-10", values({ accountId: acc }));
    const [o] = virtual("2026-10-31", newId);
    expect(o.amountCents).toBe(23_333);
    expect(getSeriesHistory(db, getRecurrence(db, newId)!.seriesId)).toHaveLength(3);
  });

  it("lançamentos que migram para a regra nova continuam na mesma série", () => {
    const id = luz({ startDate: "2026-09-10" });
    effectuateOccurrence(db, id, "2026-09-10", TODAY, 30_000);
    effectuateOccurrence(db, id, "2026-10-10", TODAY, 31_000);
    updateRecurrenceFrom(db, id, "2026-10-10", values({ accountId: acc }));
    const seriesId = getRecurrence(db, id)!.seriesId;
    expect(getSeriesHistory(db, seriesId).map((p) => p.amountCents)).toEqual([30_000, 31_000]);
  });

  it("a regra nova usa o mesmo seed", () => {
    const id = luz({ historySeed: seed3 });
    const newId = updateRecurrenceFrom(db, id, "2026-11-10", values({ accountId: acc }));
    const [nov] = virtual("2026-11-30", newId);
    expect(nov.amountCents).toBe(23_333);
  });

  it("dá para trocar o histórico inicial depois", () => {
    const id = luz({ historySeed: seed3 });
    const seriesId = getRecurrence(db, id)!.seriesId;
    setHistorySeed(db, seriesId, [{ month: "2026-09", amountCents: 50_000 }]);
    expect(getHistorySeed(db, seriesId)).toEqual([{ month: "2026-09", amountCents: 50_000 }]);
    expect(virtual("2026-10-31", id)[0].amountCents).toBe(50_000);
  });
});

describe("recorrência fixa continua igual", () => {
  const rent = () =>
    createRecurrence(db, {
      kind: "despesa",
      description: "Aluguel",
      amountCents: 150_000,
      accountId: acc,
      categoryId: null,
      frequency: "mensal",
      startDate: "2026-10-05",
      endDate: null,
    });

  it("valor fixo, sem selo de estimativa", () => {
    const id = rent();
    const all = virtual("2026-12-31", id);
    expect(all.map((t) => t.amountCents)).toEqual([150_000, 150_000, 150_000]);
    expect(all.every((t) => !t.isEstimate && t.estimateNote === null)).toBe(true);
    expect(getRecurrence(db, id)).toMatchObject({ isVariable: false });
  });

  it("efetivar não muda a previsão das próximas", () => {
    const id = rent();
    effectuateOccurrence(db, id, "2026-10-05", TODAY);
    expect(virtual("2026-12-31", id).map((t) => t.amountCents)).toEqual([150_000, 150_000]);
  });

  it("a série de uma regra fixa tem o próprio id", () => {
    const id = rent();
    expect(getRecurrence(db, id)!.seriesId).toBe(id);
  });
});

describe("predictOccurrence", () => {
  it("prevê uma ocorrência específica de uma regra variável; regra fixa devolve null", () => {
    const id = luz({ historySeed: seed3 });
    expect(predictOccurrence(db, getRecurrence(db, id)!, "2026-10-10")).toMatchObject({ amountCents: 23_333 });
    const fixed = createRecurrence(db, {
      kind: "despesa",
      description: "Aluguel",
      amountCents: 1,
      accountId: acc,
      categoryId: null,
      frequency: "mensal",
      startDate: "2026-10-05",
      endDate: null,
    });
    expect(predictOccurrence(db, getRecurrence(db, fixed)!, "2026-10-05")).toBeNull();
  });
});

describe("migração", () => {
  it("roda sobre um banco da fatia 4 com dados, sem perdê-los", () => {
    const id = luz();
    const tx = createRecurrence(db, {
      kind: "despesa",
      description: "Aluguel",
      amountCents: 150_000,
      accountId: acc,
      categoryId: null,
      frequency: "mensal",
      startDate: "2026-10-05",
      endDate: null,
    });
    effectuateOccurrence(db, tx, "2026-10-05", TODAY);

    // volta o esquema ao estado anterior à fatia 5 e migra de novo
    db.exec(`
      DROP TABLE account_categories;
      DROP TABLE budgets;
      DROP TABLE recurrence_history_seed;
      ALTER TABLE recurrences DROP COLUMN is_variable;
      ALTER TABLE recurrences DROP COLUMN series_id;
      ALTER TABLE accounts DROP COLUMN favorite;
    `);
    db.pragma("user_version = 3");
    migrate(db);

    expect(db.pragma("user_version", { simple: true })).toBe(7);
    expect(getRecurrence(db, id)).toMatchObject({ seriesId: id, isVariable: false, description: "Luz" });
    expect(getRecurrence(db, tx)).toMatchObject({ seriesId: tx, isVariable: false, amountCents: 150_000 });
    expect(listTransactions(db)).toHaveLength(1);
  });
});
