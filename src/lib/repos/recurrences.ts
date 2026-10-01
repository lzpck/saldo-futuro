import type { Db } from "../db/connection";
import { predictAmount, type HistoryPoint, type Prediction } from "../prediction";
import { addDays } from "../projection";
import {
  occurrenceKey,
  occurrencesBetween,
  virtualOccurrences,
  type Frequency,
  type RecurrenceRule,
} from "../recurrence";
import { getAccount } from "./accounts";
import { getCategory } from "./categories";
import {
  createTransaction,
  listTransactions,
  markEffectuated,
  updateTransaction,
  type Transaction,
  type TransactionInput,
} from "./transactions";

export type Recurrence = RecurrenceRule & {
  id: number;
  kind: "receita" | "despesa";
  description: string;
  /** Valor fixo; numa Recorrência variável é só a estimativa inicial (sem histórico). */
  amountCents: number;
  accountId: number;
  accountName: string;
  categoryId: number | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  isVariable: boolean;
  /** Identifica a conta ao longo das divisões da regra ("editar a partir de"); o histórico segue a série. */
  seriesId: number;
};

export type RecurrenceValues = {
  description: string;
  amountCents: number;
  accountId: number;
  categoryId: number | null;
  endDate: string | null;
  /** Omitido ao editar = mantém o que a regra já era. */
  isVariable?: boolean;
};

/** Valor real de um mês anterior, informado à mão para a previsão funcionar desde o primeiro dia. */
export type HistorySeedEntry = { month: string; amountCents: number };

export type RecurrenceInput = RecurrenceValues & {
  kind: "receita" | "despesa";
  frequency: Frequency;
  startDate: string;
  /** Só vale para Recorrência variável. */
  historySeed?: HistorySeedEntry[];
};

type Row = {
  id: number;
  kind: "receita" | "despesa";
  description: string;
  amount_cents: number;
  account_id: number;
  account_name: string;
  category_id: number | null;
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
  frequency: Frequency;
  start_date: string;
  anchor_day: number;
  end_date: string | null;
  is_variable: number;
  series_id: number;
};

const SELECT = `
  SELECT r.*, a.name AS account_name,
         c.name AS category_name, c.icon AS category_icon, c.color AS category_color
  FROM recurrences r
  JOIN accounts a ON a.id = r.account_id
  LEFT JOIN categories c ON c.id = r.category_id
`;

const toRecurrence = (r: Row): Recurrence => ({
  id: r.id,
  kind: r.kind,
  description: r.description,
  amountCents: r.amount_cents,
  accountId: r.account_id,
  accountName: r.account_name,
  categoryId: r.category_id,
  categoryName: r.category_name,
  categoryIcon: r.category_icon,
  categoryColor: r.category_color,
  frequency: r.frequency,
  startDate: r.start_date,
  anchorDay: r.anchor_day,
  endDate: r.end_date,
  isVariable: r.is_variable === 1,
  seriesId: r.series_id,
});

function validateValues(db: Db, kind: "receita" | "despesa", v: RecurrenceValues, startDate: string): void {
  if (!Number.isSafeInteger(v.amountCents) || v.amountCents <= 0) throw new Error("O valor deve ser maior que zero.");
  if (!getAccount(db, v.accountId)) throw new Error("Conta não encontrada.");
  if (v.categoryId != null) {
    const category = getCategory(db, v.categoryId);
    if (!category) throw new Error("Categoria não encontrada.");
    if (category.kind !== kind) throw new Error(`A categoria "${category.name}" não é de ${kind}.`);
  }
  if (v.endDate !== null && v.endDate < startDate) throw new Error("O término não pode ser antes do início.");
}

function validateSeed(entries: HistorySeedEntry[]): void {
  const months = new Set<string>();
  for (const e of entries) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(e.month)) throw new Error("Mês inválido no histórico (use AAAA-MM).");
    if (!Number.isSafeInteger(e.amountCents) || e.amountCents <= 0) throw new Error("O valor deve ser maior que zero.");
    if (months.has(e.month)) throw new Error("Mês repetido no histórico.");
    months.add(e.month);
  }
}

export function createRecurrence(db: Db, input: RecurrenceInput): number {
  validateValues(db, input.kind, input, input.startDate);
  const seed = input.isVariable ? (input.historySeed ?? []) : [];
  validateSeed(seed);
  return db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO recurrences
           (kind, description, amount_cents, account_id, category_id, frequency, start_date, anchor_day, end_date, is_variable)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.kind,
        input.description,
        input.amountCents,
        input.accountId,
        input.categoryId,
        input.frequency,
        input.startDate,
        Number(input.startDate.slice(8, 10)),
        input.endDate,
        input.isVariable ? 1 : 0,
      );
    const id = Number(lastInsertRowid);
    db.prepare("UPDATE recurrences SET series_id = ? WHERE id = ?").run(id, id);
    if (seed.length > 0) setHistorySeed(db, id, seed);
    return id;
  })();
}

export function getRecurrence(db: Db, id: number): Recurrence | undefined {
  const row = db.prepare(`${SELECT} WHERE r.id = ?`).get(id) as Row | undefined;
  return row && toRecurrence(row);
}

export function listRecurrences(db: Db): Recurrence[] {
  return (db.prepare(`${SELECT} ORDER BY r.description`).all() as Row[]).map(toRecurrence);
}

/**
 * Altera a regra a partir de uma ocorrência (`from`). Ocorrências anteriores continuam como eram:
 * a regra antiga termina na véspera e uma nova começa em `from`. Retorna o id da regra vigente.
 */
export function updateRecurrenceFrom(db: Db, id: number, from: string, v: RecurrenceValues): number {
  const rule = getRecurrence(db, id);
  if (!rule) throw new Error("Recorrência não encontrada.");
  validateValues(db, rule.kind, v, from < rule.startDate ? rule.startDate : from);
  const isVariable = v.isVariable ?? rule.isVariable;

  if (from <= rule.startDate) {
    db.prepare(
      `UPDATE recurrences SET description = ?, amount_cents = ?, account_id = ?, category_id = ?, end_date = ?,
         is_variable = ? WHERE id = ?`,
    ).run(v.description, v.amountCents, v.accountId, v.categoryId, v.endDate, isVariable ? 1 : 0, id);
    return id;
  }

  if (occurrencesBetween(rule, from, from).length !== 1) {
    throw new Error("Escolha a data de uma ocorrência da recorrência.");
  }

  return db.transaction(() => {
    db.prepare("UPDATE recurrences SET end_date = ? WHERE id = ?").run(addDays(from, -1), id);
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO recurrences
           (kind, description, amount_cents, account_id, category_id, frequency, start_date, anchor_day, end_date,
            is_variable, series_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        rule.kind,
        v.description,
        v.amountCents,
        v.accountId,
        v.categoryId,
        rule.frequency,
        from,
        rule.anchorDay,
        v.endDate,
        isVariable ? 1 : 0,
        rule.seriesId,
      );
    const newId = Number(lastInsertRowid);
    // O que já foi gravado ou pulado de `from` em diante passa a pertencer à regra nova.
    db.prepare("UPDATE transactions SET recurrence_id = ? WHERE recurrence_id = ? AND occurrence_date >= ?").run(newId, id, from);
    db.prepare("UPDATE recurrence_skips SET recurrence_id = ? WHERE recurrence_id = ? AND occurrence_date >= ?").run(newId, id, from);
    return newId;
  })();
}

/** Encerra a recorrência: nenhuma ocorrência depois de `endDate` (inclusive ela). */
export function endRecurrence(db: Db, id: number, endDate: string): void {
  db.prepare("UPDATE recurrences SET end_date = ? WHERE id = ? AND (end_date IS NULL OR end_date > ?)").run(
    endDate,
    id,
    endDate,
  );
}

// --- histórico e previsão de valor -----------------------------------------------------------

const monthOf = (isoDate: string) => isoDate.slice(0, 7);

/** Meses informados à mão para a previsão (não são lançamentos e não mexem no saldo). */
export function getHistorySeed(db: Db, seriesId: number): HistorySeedEntry[] {
  return (
    db
      .prepare("SELECT month, amount_cents FROM recurrence_history_seed WHERE series_id = ? ORDER BY month")
      .all(seriesId) as { month: string; amount_cents: number }[]
  ).map((r) => ({ month: r.month, amountCents: r.amount_cents }));
}

/** Substitui o histórico inicial da série. */
export function setHistorySeed(db: Db, seriesId: number, entries: HistorySeedEntry[]): void {
  validateSeed(entries);
  db.transaction(() => {
    db.prepare("DELETE FROM recurrence_history_seed WHERE series_id = ?").run(seriesId);
    const insert = db.prepare("INSERT INTO recurrence_history_seed (series_id, month, amount_cents) VALUES (?, ?, ?)");
    for (const e of entries) insert.run(seriesId, e.month, e.amountCents);
  })();
}

/** Histórico de várias séries de uma vez: efetivados (mês da ocorrência) + seed dos meses sem efetivado. */
function loadHistories(db: Db, seriesIds: number[]): Map<number, HistoryPoint[]> {
  const result = new Map<number, HistoryPoint[]>(seriesIds.map((id) => [id, []]));
  if (seriesIds.length === 0) return result;
  const marks = seriesIds.map(() => "?").join(", ");

  const real = new Map<number, Set<string>>(seriesIds.map((id) => [id, new Set()]));
  for (const r of db
    .prepare(
      `SELECT r.series_id AS series_id, t.occurrence_date AS occurrence_date, t.amount_cents AS amount_cents
       FROM transactions t JOIN recurrences r ON r.id = t.recurrence_id
       WHERE t.status = 'efetivado' AND t.occurrence_date IS NOT NULL AND r.series_id IN (${marks})`,
    )
    .all(...seriesIds) as { series_id: number; occurrence_date: string; amount_cents: number }[]) {
    const month = monthOf(r.occurrence_date);
    result.get(r.series_id)!.push({ month, amountCents: r.amount_cents });
    real.get(r.series_id)!.add(month);
  }
  for (const r of db
    .prepare(`SELECT series_id, month, amount_cents FROM recurrence_history_seed WHERE series_id IN (${marks})`)
    .all(...seriesIds) as { series_id: number; month: string; amount_cents: number }[]) {
    // O valor real do mês manda sobre o que foi digitado à mão.
    if (!real.get(r.series_id)!.has(r.month)) result.get(r.series_id)!.push({ month: r.month, amountCents: r.amount_cents });
  }
  for (const points of result.values()) points.sort((a, b) => a.month.localeCompare(b.month));
  return result;
}

export function getSeriesHistory(db: Db, seriesId: number): HistoryPoint[] {
  return loadHistories(db, [seriesId]).get(seriesId)!;
}

const predictFor = (rule: Recurrence, history: HistoryPoint[], occurrenceDate: string): Prediction =>
  predictAmount(history, monthOf(occurrenceDate), rule.amountCents);

/** Previsão de uma ocorrência de Recorrência variável; null para regra de valor fixo. */
export function predictOccurrence(db: Db, rule: Recurrence, occurrenceDate: string): Prediction | null {
  if (!rule.isVariable) return null;
  return predictFor(rule, getSeriesHistory(db, rule.seriesId), occurrenceDate);
}

// --- ocorrências -----------------------------------------------------------------------------

function requireOccurrence(db: Db, recurrenceId: number, occurrenceDate: string): Recurrence {
  const rule = getRecurrence(db, recurrenceId);
  if (!rule || occurrencesBetween(rule, occurrenceDate, occurrenceDate).length !== 1) {
    throw new Error("Ocorrência não encontrada.");
  }
  return rule;
}

function overrideId(db: Db, recurrenceId: number, occurrenceDate: string): number | undefined {
  const row = db
    .prepare("SELECT id FROM transactions WHERE recurrence_id = ? AND occurrence_date = ?")
    .get(recurrenceId, occurrenceDate) as { id: number } | undefined;
  return row?.id;
}

/** Todas as ocorrências até `to` que ainda não viraram lançamento nem foram puladas. */
export function listVirtualOccurrences(db: Db, to: string): Transaction[] {
  const rules = listRecurrences(db).filter((r) => r.startDate <= to);
  if (rules.length === 0) return [];

  const handled = new Set<string>();
  for (const r of db
    .prepare("SELECT recurrence_id, occurrence_date FROM transactions WHERE recurrence_id IS NOT NULL")
    .all() as { recurrence_id: number; occurrence_date: string }[]) {
    handled.add(occurrenceKey(r.recurrence_id, r.occurrence_date));
  }
  for (const r of db.prepare("SELECT recurrence_id, occurrence_date FROM recurrence_skips").all() as {
    recurrence_id: number;
    occurrence_date: string;
  }[]) {
    handled.add(occurrenceKey(r.recurrence_id, r.occurrence_date));
  }

  // Histórico carregado uma vez por chamada. Só dados reais: uma previsão nunca alimenta outra.
  const histories = loadHistories(db, [...new Set(rules.filter((r) => r.isVariable).map((r) => r.seriesId))]);

  let nextId = 0;
  return virtualOccurrences(rules, handled, to).map(({ rule, occurrenceDate }) => {
    const prediction = rule.isVariable ? predictFor(rule, histories.get(rule.seriesId)!, occurrenceDate) : null;
    return {
      id: --nextId, // negativo e único só nesta chamada: nunca existe no banco
      kind: rule.kind,
      status: "previsto" as const,
      date: occurrenceDate,
      amountCents: prediction?.amountCents ?? rule.amountCents,
      description: rule.description,
      accountId: rule.accountId,
      accountName: rule.accountName,
      toAccountId: null,
      toAccountName: null,
      categoryId: rule.categoryId,
      categoryName: rule.categoryName,
      categoryIcon: rule.categoryIcon,
      categoryColor: rule.categoryColor,
      recurrenceId: rule.id,
      occurrenceDate,
      purchaseId: null,
      installmentNo: null,
      installmentTotal: null,
      invoiceCardId: null,
      invoiceClosing: null,
      isVirtual: true,
      isEstimate: prediction !== null,
      estimateNote: prediction?.explanation ?? null,
    };
  });
}

/** Lançamentos gravados mais as ocorrências virtuais, até `to`. Base da lista e da projeção. */
export function listWithOccurrences(db: Db, to: string): Transaction[] {
  return [...listTransactions(db, { to }), ...listVirtualOccurrences(db, to)];
}

/**
 * Efetiva uma ocorrência. `amountCents` é o valor real (Recorrência variável); sem ele vale o valor
 * previsto da ocorrência, o mesmo que a lista mostrava.
 */
export function effectuateOccurrence(
  db: Db,
  recurrenceId: number,
  occurrenceDate: string,
  today: string,
  amountCents?: number,
): void {
  const rule = requireOccurrence(db, recurrenceId, occurrenceDate);
  const amount = amountCents ?? predictOccurrence(db, rule, occurrenceDate)?.amountCents ?? rule.amountCents;
  db.transaction(() => {
    const existing = overrideId(db, recurrenceId, occurrenceDate);
    if (existing !== undefined) {
      markEffectuated(db, existing, today);
      return;
    }
    createTransaction(db, {
      kind: rule.kind,
      status: "efetivado",
      date: occurrenceDate > today ? today : occurrenceDate,
      amountCents: amount,
      description: rule.description,
      accountId: rule.accountId,
      categoryId: rule.categoryId,
      recurrenceId,
      occurrenceDate,
    });
  })();
}

/** Pula só esta ocorrência (ela não volta a aparecer). */
export function skipOccurrence(db: Db, recurrenceId: number, occurrenceDate: string): void {
  requireOccurrence(db, recurrenceId, occurrenceDate);
  db.transaction(() => {
    const existing = overrideId(db, recurrenceId, occurrenceDate);
    if (existing !== undefined) db.prepare("DELETE FROM transactions WHERE id = ?").run(existing);
    db.prepare("INSERT OR IGNORE INTO recurrence_skips (recurrence_id, occurrence_date) VALUES (?, ?)").run(
      recurrenceId,
      occurrenceDate,
    );
  })();
}

/** Grava (ou atualiza) a exceção de uma ocorrência com os valores informados. */
export function saveOccurrence(db: Db, recurrenceId: number, occurrenceDate: string, input: TransactionInput): number {
  const rule = requireOccurrence(db, recurrenceId, occurrenceDate);
  if (input.kind !== rule.kind) throw new Error("O tipo de uma ocorrência não pode mudar.");
  const existing = overrideId(db, recurrenceId, occurrenceDate);
  if (existing !== undefined) {
    updateTransaction(db, existing, input);
    return existing;
  }
  return createTransaction(db, { ...input, recurrenceId, occurrenceDate });
}

/**
 * Exclui um lançamento gravado. Se ele veio de uma recorrência, a ocorrência é pulada,
 * senão a versão virtual reapareceria no lugar dele.
 */
export function deleteTransactionKeepingSchedule(db: Db, id: number): void {
  db.transaction(() => {
    const row = db.prepare("SELECT recurrence_id, occurrence_date FROM transactions WHERE id = ?").get(id) as
      | { recurrence_id: number | null; occurrence_date: string | null }
      | undefined;
    if (row?.recurrence_id != null && row.occurrence_date !== null) {
      db.prepare("INSERT OR IGNORE INTO recurrence_skips (recurrence_id, occurrence_date) VALUES (?, ?)").run(
        row.recurrence_id,
        row.occurrence_date,
      );
    }
    db.prepare("DELETE FROM transactions WHERE id = ?").run(id);
  })();
}
