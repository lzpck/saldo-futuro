import type { Db } from "../db/connection";
import { getAccount } from "./accounts";
import { getCategory } from "./categories";

export type TransactionKind = "receita" | "despesa" | "transferencia";
export type TransactionStatus = "previsto" | "efetivado";

export type Transaction = {
  id: number;
  kind: TransactionKind;
  status: TransactionStatus;
  date: string;
  amountCents: number;
  description: string;
  accountId: number;
  accountName: string;
  toAccountId: number | null;
  toAccountName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  /** Lançamento gravado que veio de uma Recorrência (exceção/efetivação de uma ocorrência). */
  recurrenceId: number | null;
  occurrenceDate: string | null;
  /** Parcela de uma Compra parcelada. */
  purchaseId: number | null;
  installmentNo: number | null;
  installmentTotal: number | null;
  /** Pagamento de fatura previsto (calculado das compras do cartão; não existe no banco). */
  invoiceCardId: number | null;
  invoiceClosing: string | null;
  /** Ocorrência ou fatura ainda não gravada, calculada (não existe no banco). */
  isVirtual: boolean;
  /** Ocorrência virtual de uma Recorrência variável: o valor é uma Previsão de valor, não um dado. */
  isEstimate: boolean;
  /** Explicação da Previsão de valor (só quando `isEstimate`). */
  estimateNote: string | null;
};

export type TransactionInput = {
  kind: TransactionKind;
  status?: TransactionStatus;
  date: string;
  amountCents: number;
  description: string;
  accountId: number;
  toAccountId?: number | null;
  categoryId?: number | null;
  recurrenceId?: number | null;
  occurrenceDate?: string | null;
  purchaseId?: number | null;
  installmentNo?: number | null;
};

type Row = {
  id: number;
  kind: TransactionKind;
  status: TransactionStatus;
  date: string;
  amount_cents: number;
  description: string;
  account_id: number;
  account_name: string;
  to_account_id: number | null;
  to_account_name: string | null;
  category_id: number | null;
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
  recurrence_id: number | null;
  occurrence_date: string | null;
  purchase_id: number | null;
  installment_no: number | null;
  installment_total: number | null;
};

const SELECT = `
  SELECT t.*, a.name AS account_name, ta.name AS to_account_name,
         c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
         ip.total_installments AS installment_total
  FROM transactions t
  JOIN accounts a ON a.id = t.account_id
  LEFT JOIN accounts ta ON ta.id = t.to_account_id
  LEFT JOIN categories c ON c.id = t.category_id
  LEFT JOIN installment_purchases ip ON ip.id = t.purchase_id
`;

const toTransaction = (r: Row): Transaction => ({
  id: r.id,
  kind: r.kind,
  status: r.status,
  date: r.date,
  amountCents: r.amount_cents,
  description: r.description,
  accountId: r.account_id,
  accountName: r.account_name,
  toAccountId: r.to_account_id,
  toAccountName: r.to_account_name,
  categoryId: r.category_id,
  categoryName: r.category_name,
  categoryIcon: r.category_icon,
  categoryColor: r.category_color,
  recurrenceId: r.recurrence_id,
  occurrenceDate: r.occurrence_date,
  purchaseId: r.purchase_id,
  installmentNo: r.installment_no,
  installmentTotal: r.installment_total,
  invoiceCardId: null,
  invoiceClosing: null,
  isVirtual: false,
  isEstimate: false,
  estimateNote: null,
});

function validate(db: Db, input: TransactionInput): void {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("O valor deve ser maior que zero.");
  }
  if (!getAccount(db, input.accountId)) throw new Error("Conta não encontrada.");

  if (input.kind === "transferencia") {
    if (input.toAccountId == null) throw new Error("Informe a conta de destino.");
    if (input.toAccountId === input.accountId) {
      throw new Error("Origem e destino devem ser contas diferentes.");
    }
    if (!getAccount(db, input.toAccountId)) throw new Error("Conta de destino não encontrada.");
    if (input.categoryId != null) throw new Error("Transferência não tem categoria.");
    return;
  }

  if (input.toAccountId != null) throw new Error("Só transferências têm conta de destino.");
  if (input.categoryId != null) {
    const category = getCategory(db, input.categoryId);
    if (!category) throw new Error("Categoria não encontrada.");
    if (category.kind !== input.kind) {
      throw new Error(`A categoria "${category.name}" não é de ${input.kind}.`);
    }
  }
}

export function createTransaction(db: Db, input: TransactionInput): number {
  validate(db, input);
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO transactions
         (kind, status, date, amount_cents, description, account_id, to_account_id, category_id,
          recurrence_id, occurrence_date, purchase_id, installment_no)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.kind,
      input.status ?? "efetivado",
      input.date,
      input.amountCents,
      input.description,
      input.accountId,
      input.toAccountId ?? null,
      input.categoryId ?? null,
      input.recurrenceId ?? null,
      input.occurrenceDate ?? null,
      input.purchaseId ?? null,
      input.installmentNo ?? null,
    );
  return Number(lastInsertRowid);
}

export function updateTransaction(db: Db, id: number, input: TransactionInput): void {
  validate(db, input);
  const current = db.prepare("SELECT kind, recurrence_id FROM transactions WHERE id = ?").get(id) as
    | { kind: string; recurrence_id: number | null }
    | undefined;
  if (current?.recurrence_id != null && current.kind !== input.kind) {
    throw new Error("O tipo de uma ocorrência não pode mudar.");
  }
  db.prepare(
    `UPDATE transactions SET kind = ?, status = ?, date = ?, amount_cents = ?, description = ?,
       account_id = ?, to_account_id = ?, category_id = ? WHERE id = ?`,
  ).run(
    input.kind,
    input.status ?? "efetivado",
    input.date,
    input.amountCents,
    input.description,
    input.accountId,
    input.toAccountId ?? null,
    input.categoryId ?? null,
    id,
  );
}

/**
 * Marca um Previsto como Efetivado. Se a data ainda não chegou, passa a ser hoje (aconteceu agora);
 * se já passou (Em atraso), mantém a data original. Edite o lançamento para outra data.
 */
export function markEffectuated(db: Db, id: number, today: string): void {
  db.prepare(
    `UPDATE transactions SET status = 'efetivado', date = CASE WHEN date > ? THEN ? ELSE date END
     WHERE id = ? AND status = 'previsto'`,
  ).run(today, today, id);
}

export function deleteTransaction(db: Db, id: number): void {
  db.prepare("DELETE FROM transactions WHERE id = ?").run(id);
}

export function getTransaction(db: Db, id: number): Transaction | undefined {
  const row = db.prepare(`${SELECT} WHERE t.id = ?`).get(id) as Row | undefined;
  return row && toTransaction(row);
}

export type TransactionFilter = {
  from?: string;
  to?: string;
  accountId?: number;
  categoryId?: number;
  purchaseId?: number;
  status?: TransactionStatus;
  limit?: number;
};

/** Mais recentes primeiro. */
export function listTransactions(db: Db, filter: TransactionFilter = {}): Transaction[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filter.from) {
    where.push("t.date >= ?");
    params.push(filter.from);
  }
  if (filter.to) {
    where.push("t.date <= ?");
    params.push(filter.to);
  }
  if (filter.accountId) {
    where.push("(t.account_id = ? OR t.to_account_id = ?)");
    params.push(filter.accountId, filter.accountId);
  }
  if (filter.categoryId) {
    where.push("t.category_id = ?");
    params.push(filter.categoryId);
  }
  if (filter.status) {
    where.push("t.status = ?");
    params.push(filter.status);
  }
  if (filter.purchaseId) {
    where.push("t.purchase_id = ?");
    params.push(filter.purchaseId);
  }
  const limit = filter.limit ? `LIMIT ${Math.floor(filter.limit)}` : "";
  const sql = `${SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY t.date DESC, t.id DESC ${limit}`;
  return (db.prepare(sql).all(...params) as Row[]).map(toTransaction);
}
