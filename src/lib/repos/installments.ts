import type { Db } from "../db/connection";
import { daysBetween, todayISO } from "../dates";
import { addMonthsClamped, splitInstallments } from "../recurrence";
import { closingDateFor, dueDateFor } from "../cards";
import { getAccount, isCard } from "./accounts";
import { unpaidInstallmentIds } from "./cards";
import { getCategory } from "./categories";
import { createTransaction } from "./transactions";

export const MAX_INSTALLMENTS = 120;

export type InstallmentInput = {
  description: string;
  installments: number;
  /** Parcela inicial: nº da primeira parcela lançada (padrão 1). As anteriores foram pagas antes do app e não são criadas. */
  firstNo?: number;
  /** Vencimento da primeira parcela lançada; as demais caem nos meses seguintes, no mesmo dia. */
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
  const firstNo = input.firstNo ?? 1;
  if (!Number.isInteger(firstNo) || firstNo < 1 || firstNo > n) throw new Error(`A parcela inicial deve ficar entre 1 e ${n}.`);
  if (firstNo > 1 && input.mode === "total") throw new Error("Com parcela inicial maior que 1, informe o valor de cada parcela, não o total.");
  const count = n - firstNo + 1;
  if (input.mode === "total" && input.valueCents < count) throw new Error("O total é menor que o número de parcelas.");

  const amounts = input.mode === "total" ? splitInstallments(input.valueCents, count) : Array<number>(count).fill(input.valueCents);

  return db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        "INSERT INTO installment_purchases (description, total_installments, first_no, account_id, category_id) VALUES (?, ?, ?, ?, ?)",
      )
      .run(input.description, n, firstNo, input.accountId, input.categoryId);
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
        installmentNo: firstNo + i,
      });
    });
    return purchaseId;
  })();
}

export type PurchaseSummary = {
  id: number;
  description: string;
  totalInstallments: number;
  /** Nº da primeira parcela lançada (maior que 1 quando a compra foi registrada já em andamento). */
  firstNo: number;
  accountId: number;
  categoryId: number | null;
  accountName: string;
  categoryName: string | null;
  categoryIcon: string | null;
  paidCount: number;
  remainingCount: number;
  remainingCents: number;
  nextDate: string | null;
  /** Parcelas já lançadas (Efetivadas). No cartão é a compra na fatura; "paga" só quando a fatura é quitada. */
  postedCount: number;
  onCard: boolean;
  /** Valor da próxima parcela em aberto (ou da última, se não resta nenhuma). */
  installmentCents: number;
  totalCents: number;
  /** Data da última parcela (mês em que a compra termina). */
  lastDate: string | null;
  /** Dias de atraso da próxima parcela (fora do cartão: data passada; no cartão: fatura vencida e não paga). */
  overdueDays: number | null;
};

type SummaryRow = {
  id: number;
  description: string;
  total_installments: number;
  first_no: number;
  account_id: number;
  category_id: number | null;
  account_name: string;
  category_name: string | null;
  category_icon: string | null;
  paid_count: number;
  remaining_count: number;
  remaining_cents: number;
  next_date: string | null;
  posted_count: number;
  total_cents: number;
  last_date: string | null;
  last_amount: number | null;
};

const SUMMARY_SQL = `
  SELECT p.id, p.description, p.total_installments, p.first_no, p.account_id, p.category_id, a.name AS account_name, c.name AS category_name, c.icon AS category_icon,
    (SELECT COUNT(*) FROM transactions t WHERE t.purchase_id = p.id AND t.status = 'efetivado') AS paid_count,
    (SELECT COUNT(*) FROM transactions t WHERE t.purchase_id = p.id AND t.status = 'previsto') AS remaining_count,
    COALESCE((SELECT SUM(t.amount_cents) FROM transactions t WHERE t.purchase_id = p.id AND t.status = 'previsto'), 0) AS remaining_cents,
    (SELECT MIN(t.date) FROM transactions t WHERE t.purchase_id = p.id AND t.status = 'previsto') AS next_date,
    (SELECT COUNT(*) FROM transactions t WHERE t.purchase_id = p.id AND t.status = 'efetivado') AS posted_count,
    COALESCE((SELECT SUM(t.amount_cents) FROM transactions t WHERE t.purchase_id = p.id), 0) AS total_cents,
    (SELECT MAX(t.date) FROM transactions t WHERE t.purchase_id = p.id) AS last_date,
    (SELECT t.amount_cents FROM transactions t WHERE t.purchase_id = p.id ORDER BY t.installment_no DESC LIMIT 1) AS last_amount
  FROM installment_purchases p
  JOIN accounts a ON a.id = p.account_id
  LEFT JOIN categories c ON c.id = p.category_id
`;

const toSummary = (db: Db, r: SummaryRow, today: string): PurchaseSummary => {
  const summary: PurchaseSummary = {
    id: r.id,
    description: r.description,
    totalInstallments: r.total_installments,
    firstNo: r.first_no,
    accountId: r.account_id,
    categoryId: r.category_id,
    accountName: r.account_name,
    categoryName: r.category_name,
    categoryIcon: r.category_icon,
    paidCount: r.paid_count,
    remainingCount: r.remaining_count,
    remainingCents: r.remaining_cents,
    nextDate: r.next_date,
    postedCount: r.posted_count,
    onCard: false,
    installmentCents: r.last_amount ?? 0,
    totalCents: r.total_cents,
    lastDate: r.last_date,
    overdueDays: null,
  };
  // No cartão toda parcela é Efetivada: o que "falta" são as parcelas de Faturas ainda não quitadas.
  if (unpaidInstallmentIds(db, r.id, today) === null) {
    const next = db
      .prepare("SELECT amount_cents FROM transactions WHERE purchase_id = ? AND status = 'previsto' ORDER BY date LIMIT 1")
      .get(r.id) as { amount_cents: number } | undefined;
    return {
      ...summary,
      installmentCents: next?.amount_cents ?? summary.installmentCents,
      overdueDays: r.next_date !== null && r.next_date < today ? daysBetween(r.next_date, today) : null,
    };
  }
  const all = installmentRows(db, r.id, today);
  const rows = all.filter((t) => t.remaining);
  const first = rows.reduce<InstallmentRow | null>((min, t) => (min === null || t.date < min.date ? t : min), null);
  const card = getAccount(db, r.account_id);
  let overdueDays: number | null = null;
  if (first && card && isCard(card) && card.closingDay !== null && card.dueDay !== null) {
    const due = dueDateFor(closingDateFor(first.date, card.closingDay), { closingDay: card.closingDay, dueDay: card.dueDay });
    if (due < today) overdueDays = daysBetween(due, today);
  }
  return {
    ...summary,
    paidCount: r.paid_count + r.remaining_count - rows.length,
    remainingCount: rows.length,
    remainingCents: rows.reduce((s, t) => s + t.amount_cents, 0),
    nextDate: first?.date ?? null,
    onCard: true,
    installmentCents: first?.amount_cents ?? summary.installmentCents,
    overdueDays,
  };
};

export function getPurchase(db: Db, id: number, today = todayISO()): PurchaseSummary | undefined {
  const row = db.prepare(`${SUMMARY_SQL} WHERE p.id = ?`).get(id) as SummaryRow | undefined;
  return row && toSummary(db, row, today);
}

/** Compras com parcelas em aberto primeiro (pela próxima data), depois as quitadas. */
export function listPurchases(db: Db, today = todayISO()): PurchaseSummary[] {
  const rows = db.prepare(`${SUMMARY_SQL} ORDER BY p.id DESC`).all() as SummaryRow[];
  return rows.map((r) => toSummary(db, r, today)).sort((a, b) => {
    if ((a.nextDate === null) !== (b.nextDate === null)) return a.nextDate === null ? 1 : -1;
    return (a.nextDate ?? "").localeCompare(b.nextDate ?? "") || b.id - a.id;
  });
}

/**
 * Cancela as parcelas restantes (fora do cartão, as ainda previstas; no cartão, as de Faturas ainda não
 * pagas); as demais continuam. Se não sobrar nenhuma parcela, o registro da compra também some (senão
 * ela ficaria existindo, vazia).
 */
export function cancelRemaining(db: Db, purchaseId: number, today = todayISO()): number {
  return db.transaction(() => {
    let changes = 0;
    for (const r of installmentRows(db, purchaseId, today)) {
      if (r.remaining) changes += db.prepare("DELETE FROM transactions WHERE id = ?").run(r.id).changes;
    }
    const left = db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE purchase_id = ?").get(purchaseId) as { n: number };
    if (left.n === 0) db.prepare("DELETE FROM installment_purchases WHERE id = ?").run(purchaseId);
    return changes;
  })();
}

/** Exclui a compra inteira: todas as parcelas (previstas e efetivadas) e o registro da compra. */
export function deletePurchase(db: Db, purchaseId: number): void {
  db.transaction(() => {
    db.prepare("DELETE FROM transactions WHERE purchase_id = ?").run(purchaseId);
    db.prepare("DELETE FROM installment_purchases WHERE id = ?").run(purchaseId);
  })();
}

type InstallmentRow = {
  id: number;
  installment_no: number;
  status: "previsto" | "efetivado";
  date: string;
  amount_cents: number;
  /** Ainda falta pagar: Prevista fora do cartão; no cartão, de uma Fatura ainda não quitada. */
  remaining: boolean;
};

function installmentRows(db: Db, purchaseId: number, today: string): InstallmentRow[] {
  const rows = db
    .prepare("SELECT id, installment_no, status, date, amount_cents FROM transactions WHERE purchase_id = ? ORDER BY installment_no")
    .all(purchaseId) as Omit<InstallmentRow, "remaining">[];
  const unpaid = unpaidInstallmentIds(db, purchaseId, today);
  return rows.map((r) => ({ ...r, remaining: unpaid ? unpaid.has(r.id) : r.status === "previsto" }));
}

/** Vencimento da 1ª parcela, deduzido de uma parcela existente (a 1ª restante, ou a última). */
function deriveFirstDate(rows: InstallmentRow[]): string | null {
  const anchor = rows.find((r) => r.remaining) ?? rows.at(-1);
  return anchor ? addMonthsClamped(anchor.date, -(anchor.installment_no - 1)) : null;
}

export type PurchaseEditDefaults = {
  /** Vencimento da 1ª parcela; null só se a compra ficou sem nenhuma parcela. */
  firstDate: string | null;
  /** Valor da próxima parcela prevista (ou da última, se tudo foi pago). */
  amountCents: number | null;
  paidCount: number;
  paidCents: number;
};

/** Valores iniciais do formulário de edição da compra. */
export function purchaseEditDefaults(db: Db, purchaseId: number, today = todayISO()): PurchaseEditDefaults {
  const rows = installmentRows(db, purchaseId, today);
  const paid = rows.filter((r) => !r.remaining);
  const ref = rows.find((r) => r.remaining) ?? rows.at(-1);
  return {
    firstDate: deriveFirstDate(rows),
    amountCents: ref?.amount_cents ?? null,
    paidCount: paid.length,
    paidCents: paid.reduce((s, r) => s + r.amount_cents, 0),
  };
}

export type PurchaseEdit = {
  description: string;
  installments: number;
  accountId: number;
  categoryId: number | null;
  /** Só informe se a pessoa mudou: reaplica o vencimento (mês a mês) nas parcelas previstas. */
  firstDate?: string;
  /**
   * Só informe se a pessoa mudou: reaplica o valor nas parcelas previstas, sobrescrevendo ajustes
   * manuais. "parcela": valor de cada uma. "total": total da compra; o que falta depois das pagas
   * é dividido entre as previstas.
   */
  valueCents?: number;
  mode?: "parcela" | "total";
};

/**
 * Edita a compra inteira. Descrição e categoria valem para todas as parcelas; a conta só muda se nada
 * foi pago. Mudar o nº de parcelas só acrescenta/remove no final (as do meio ficam como estão).
 * Valor e data só mexem nas parcelas previstas.
 */
export function updatePurchase(db: Db, purchaseId: number, input: PurchaseEdit, today = todayISO()): void {
  const n = input.installments;
  if (!Number.isInteger(n) || n < 2 || n > MAX_INSTALLMENTS) {
    throw new Error(`O número de parcelas deve ficar entre 2 e ${MAX_INSTALLMENTS}.`);
  }
  if (input.valueCents !== undefined && (!Number.isSafeInteger(input.valueCents) || input.valueCents <= 0)) {
    throw new Error("O valor deve ser maior que zero.");
  }
  if (!getAccount(db, input.accountId)) throw new Error("Conta não encontrada.");
  if (input.categoryId != null) {
    const category = getCategory(db, input.categoryId);
    if (!category) throw new Error("Categoria não encontrada.");
    if (category.kind !== "despesa") throw new Error(`A categoria "${category.name}" não é de despesa.`);
  }

  db.transaction(() => {
    const purchase = db.prepare("SELECT account_id, total_installments, first_no FROM installment_purchases WHERE id = ?").get(purchaseId) as
      | { account_id: number; total_installments: number; first_no: number }
      | undefined;
    if (!purchase) throw new Error("Compra não encontrada.");
    if (n < purchase.first_no) throw new Error(`O número de parcelas não pode ser menor que a parcela inicial (${purchase.first_no}ª).`);
    if (purchase.first_no > 1 && input.mode === "total") {
      throw new Error("Compra em andamento: informe o valor de cada parcela, não o total.");
    }

    const rows = installmentRows(db, purchaseId, today);
    const paid = rows.filter((r) => !r.remaining);
    const lastPaid = Math.max(0, ...paid.map((r) => r.installment_no));
    if (lastPaid > n) throw new Error(`Já há parcelas pagas até a ${lastPaid}ª: o número de parcelas não pode ser menor que isso.`);
    if (input.accountId !== purchase.account_id && paid.length > 0) {
      throw new Error("A conta não pode mudar depois de haver parcela paga.");
    }

    const firstDate = input.firstDate ?? deriveFirstDate(rows);
    if (firstDate === null) throw new Error("Informe o vencimento da 1ª parcela.");

    for (const r of rows) {
      if (r.remaining && r.installment_no > n) db.prepare("DELETE FROM transactions WHERE id = ?").run(r.id);
    }
    db.prepare("UPDATE installment_purchases SET description = ?, total_installments = ?, account_id = ?, category_id = ? WHERE id = ?").run(
      input.description,
      n,
      input.accountId,
      input.categoryId,
      purchaseId,
    );
    db.prepare("UPDATE transactions SET description = ?, category_id = ? WHERE purchase_id = ?").run(input.description, input.categoryId, purchaseId);
    if (input.accountId !== purchase.account_id) {
      db.prepare("UPDATE transactions SET account_id = ? WHERE purchase_id = ?").run(input.accountId, purchaseId);
    }

    // Parcelas novas: valor da última existente (ou o informado), até o valor ser reaplicado abaixo.
    const fallbackAmount = input.valueCents ?? rows.at(-1)?.amount_cents;
    for (let no = purchase.total_installments + 1; no <= n; no++) {
      if (fallbackAmount === undefined) throw new Error("Informe o valor das parcelas.");
      createTransaction(db, {
        kind: "despesa",
        status: "previsto",
        date: addMonthsClamped(firstDate, no - 1),
        amountCents: fallbackAmount,
        description: input.description,
        accountId: input.accountId,
        categoryId: input.categoryId,
        purchaseId,
        installmentNo: no,
      });
    }

    const planned = installmentRows(db, purchaseId, today).filter((r) => r.remaining);
    if (input.firstDate !== undefined) {
      for (const r of planned) {
        db.prepare("UPDATE transactions SET date = ? WHERE id = ?").run(addMonthsClamped(input.firstDate, r.installment_no - 1), r.id);
      }
    }
    if (input.valueCents !== undefined && planned.length > 0) {
      let amounts: number[];
      if (input.mode === "total") {
        const paidCents = paid.reduce((s, r) => s + r.amount_cents, 0);
        const remaining = input.valueCents - paidCents;
        if (remaining < planned.length) throw new Error("O total é menor que o já pago somado às parcelas que faltam.");
        amounts = splitInstallments(remaining, planned.length);
      } else {
        amounts = Array<number>(planned.length).fill(input.valueCents);
      }
      planned.forEach((r, i) => db.prepare("UPDATE transactions SET amount_cents = ? WHERE id = ?").run(amounts[i], r.id));
    }
  })();
}

/**
 * Parcelas que dá para antecipar: fora do cartão, todas as ainda previstas; no cartão, as restantes
 * com data depois de hoje (as de Faturas já fechadas só falta pagar a Fatura).
 */
function anticipable(db: Db, purchaseId: number, today: string): InstallmentRow[] {
  const card = unpaidInstallmentIds(db, purchaseId, today) !== null;
  return installmentRows(db, purchaseId, today).filter((r) => r.remaining && (!card || r.date > today));
}

/** Valores das parcelas que dá para antecipar hoje, da primeira para a última. */
export function anticipableAmounts(db: Db, purchaseId: number, today = todayISO()): number[] {
  return anticipable(db, purchaseId, today).map((r) => r.amount_cents);
}

/**
 * Antecipa as últimas `count` parcelas restantes: cada uma mantém o número, mas passa a ter a data de
 * hoje e o valor ajustado, e fica Efetivada. `chargedCents` é o total cobrado pelas parcelas antecipadas
 * (já com o desconto do banco), dividido em partes iguais entre elas.
 */
export function anticipateInstallments(db: Db, purchaseId: number, input: { count: number; chargedCents: number; today: string }): void {
  const { count, chargedCents, today } = input;
  if (!Number.isInteger(count) || count < 1) throw new Error("Informe quantas parcelas antecipar.");
  if (!Number.isSafeInteger(chargedCents) || chargedCents < count) throw new Error("O valor cobrado deve ser maior que zero em cada parcela.");

  db.transaction(() => {
    const candidates = anticipable(db, purchaseId, today);
    if (count > candidates.length) {
      throw new Error(`Só há ${candidates.length} parcela(s) para antecipar.`);
    }
    const chosen = candidates.slice(-count);
    const amounts = splitInstallments(chargedCents, count);
    chosen.forEach((r, i) => {
      db.prepare("UPDATE transactions SET status = 'efetivado', date = ?, amount_cents = ? WHERE id = ?").run(today, amounts[i], r.id);
    });
  })();
}
