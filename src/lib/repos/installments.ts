import type { Db } from "../db/connection";
import { addMonthsClamped, splitInstallments } from "../recurrence";
import { getAccount } from "./accounts";
import { getCategory } from "./categories";
import { createTransaction, markEffectuated } from "./transactions";

export const MAX_INSTALLMENTS = 120;

export type InstallmentInput = {
  description: string;
  installments: number;
  /** Vencimento da primeira parcela; as demais caem nos meses seguintes, no mesmo dia. */
  firstDate: string;
  accountId: number;
  categoryId: number | null;
  /** "parcela": `valueCents` é o valor de cada parcela. "total": é o total, dividido entre elas. */
  mode: "parcela" | "total";
  valueCents: number;
  /** A primeira parcela já foi paga. */
  firstPaid: boolean;
  today: string;
};

export function createInstallmentPurchase(db: Db, input: InstallmentInput): number {
  const { installments: n } = input;
  if (!Number.isInteger(n) || n < 2 || n > MAX_INSTALLMENTS) {
    throw new Error(`O número de parcelas deve ficar entre 2 e ${MAX_INSTALLMENTS}.`);
  }
  if (!Number.isSafeInteger(input.valueCents) || input.valueCents <= 0) throw new Error("O valor deve ser maior que zero.");
  if (!getAccount(db, input.accountId)) throw new Error("Conta não encontrada.");
  if (input.categoryId != null) {
    const category = getCategory(db, input.categoryId);
    if (!category) throw new Error("Categoria não encontrada.");
    if (category.kind !== "despesa") throw new Error(`A categoria "${category.name}" não é de despesa.`);
  }
  if (input.mode === "total" && input.valueCents < n) throw new Error("O total é menor que o número de parcelas.");

  const amounts = input.mode === "total" ? splitInstallments(input.valueCents, n) : Array<number>(n).fill(input.valueCents);

  return db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        "INSERT INTO installment_purchases (description, total_installments, account_id, category_id) VALUES (?, ?, ?, ?)",
      )
      .run(input.description, n, input.accountId, input.categoryId);
    const purchaseId = Number(lastInsertRowid);

    amounts.forEach((amountCents, i) => {
      const due = addMonthsClamped(input.firstDate, i);
      const paid = i === 0 && input.firstPaid;
      createTransaction(db, {
        kind: "despesa",
        status: paid ? "efetivado" : "previsto",
        date: paid && due > input.today ? input.today : due,
        amountCents,
        description: input.description,
        accountId: input.accountId,
        categoryId: input.categoryId,
        purchaseId,
        installmentNo: i + 1,
      });
    });
    return purchaseId;
  })();
}

export type PurchaseSummary = {
  id: number;
  description: string;
  totalInstallments: number;
  accountName: string;
  categoryName: string | null;
  paidCount: number;
  remainingCount: number;
  remainingCents: number;
  nextDate: string | null;
};

type SummaryRow = {
  id: number;
  description: string;
  total_installments: number;
  account_name: string;
  category_name: string | null;
  paid_count: number;
  remaining_count: number;
  remaining_cents: number;
  next_date: string | null;
};

const SUMMARY_SQL = `
  SELECT p.id, p.description, p.total_installments, a.name AS account_name, c.name AS category_name,
    (SELECT COUNT(*) FROM transactions t WHERE t.purchase_id = p.id AND t.status = 'efetivado') AS paid_count,
    (SELECT COUNT(*) FROM transactions t WHERE t.purchase_id = p.id AND t.status = 'previsto') AS remaining_count,
    COALESCE((SELECT SUM(t.amount_cents) FROM transactions t WHERE t.purchase_id = p.id AND t.status = 'previsto'), 0) AS remaining_cents,
    (SELECT MIN(t.date) FROM transactions t WHERE t.purchase_id = p.id AND t.status = 'previsto') AS next_date
  FROM installment_purchases p
  JOIN accounts a ON a.id = p.account_id
  LEFT JOIN categories c ON c.id = p.category_id
`;

const toSummary = (r: SummaryRow): PurchaseSummary => ({
  id: r.id,
  description: r.description,
  totalInstallments: r.total_installments,
  accountName: r.account_name,
  categoryName: r.category_name,
  paidCount: r.paid_count,
  remainingCount: r.remaining_count,
  remainingCents: r.remaining_cents,
  nextDate: r.next_date,
});

export function getPurchase(db: Db, id: number): PurchaseSummary | undefined {
  const row = db.prepare(`${SUMMARY_SQL} WHERE p.id = ?`).get(id) as SummaryRow | undefined;
  return row && toSummary(row);
}

/** Compras com parcelas em aberto primeiro (pela próxima data), depois as quitadas. */
export function listPurchases(db: Db): PurchaseSummary[] {
  const rows = db.prepare(`${SUMMARY_SQL} ORDER BY p.id DESC`).all() as SummaryRow[];
  return rows.map(toSummary).sort((a, b) => {
    if ((a.nextDate === null) !== (b.nextDate === null)) return a.nextDate === null ? 1 : -1;
    return (a.nextDate ?? "").localeCompare(b.nextDate ?? "") || b.id - a.id;
  });
}

/** Cancela as parcelas ainda previstas; as já efetivadas continuam. */
export function cancelRemaining(db: Db, purchaseId: number): number {
  return db.prepare("DELETE FROM transactions WHERE purchase_id = ? AND status = 'previsto'").run(purchaseId).changes;
}

/** Quita agora as parcelas ainda previstas (as de data futura passam a hoje). */
export function settleRemaining(db: Db, purchaseId: number, today: string): void {
  db.transaction(() => {
    const ids = db.prepare("SELECT id FROM transactions WHERE purchase_id = ? AND status = 'previsto'").all(purchaseId) as {
      id: number;
    }[];
    for (const { id } of ids) markEffectuated(db, id, today);
  })();
}
