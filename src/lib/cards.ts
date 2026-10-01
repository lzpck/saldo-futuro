// Cartão de crédito: ciclos de fatura, vencimentos e abatimento de pagamentos.
// Módulo puro (sem banco, sem UI). Regras em CONTEXT.md:
//  - A compra entra na fatura que fecha no dia da compra ou depois (no dia do fechamento ainda entra).
//  - O impacto no saldo é o pagamento da fatura, no vencimento; a categoria vale na data da compra.

import { clampedDate } from "./recurrence";

export type CardTerms = { closingDay: number; dueDay: number };

const pad = (n: number) => String(n).padStart(2, "0");

function nextMonth(year: number, month: number): [number, number] {
  return month === 12 ? [year + 1, 1] : [year, month + 1];
}

/** Primeiro fechamento em ou depois da data da compra (a fatura em que ela cai). */
export function closingDateFor(purchaseDate: string, closingDay: number): string {
  const [y, m] = purchaseDate.split("-").map(Number);
  const thisMonth = clampedDate(y, m, closingDay);
  if (purchaseDate <= thisMonth) return thisMonth;
  const [ny, nm] = nextMonth(y, m);
  return clampedDate(ny, nm, closingDay);
}

/**
 * Vencimento da fatura que fecha em `closingDate`: no mesmo mês se o dia de vencimento vem
 * depois do de fechamento (fecha 5, vence 15); senão, no mês seguinte (fecha 25, vence 5).
 */
export function dueDateFor(closingDate: string, terms: CardTerms): string {
  const [y, m] = closingDate.split("-").map(Number);
  if (terms.dueDay > terms.closingDay) return clampedDate(y, m, terms.dueDay);
  const [ny, nm] = nextMonth(y, m);
  return clampedDate(ny, nm, terms.dueDay);
}

/** Dia seguinte ao fechamento anterior = primeiro dia coberto pela fatura. */
export function cycleStart(closingDate: string, closingDay: number): string {
  const [y, m] = closingDate.split("-").map(Number);
  const prev = m === 1 ? clampedDate(y - 1, 12, closingDay) : clampedDate(y, m - 1, closingDay);
  const [py, pm, pd] = prev.split("-").map(Number);
  const next = new Date(Date.UTC(py, pm - 1, pd + 1));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

export type CardTx = {
  kind: "receita" | "despesa" | "transferencia";
  date: string;
  amountCents: number;
};

export type Invoice = {
  closingDate: string;
  dueDate: string;
  /** Compras menos estornos do ciclo (previstas e efetivadas). Pode ser ≤ 0 se só houver estornos. */
  totalCents: number;
  itemCount: number;
};

/** Agrupa as compras e estornos do cartão em faturas, da mais antiga para a mais nova. */
export function computeInvoices(txs: CardTx[], terms: CardTerms): Invoice[] {
  const byClosing = new Map<string, { total: number; count: number }>();
  for (const tx of txs) {
    if (tx.kind === "transferencia") continue; // pagamentos não são compras
    const closing = closingDateFor(tx.date, terms.closingDay);
    const entry = byClosing.get(closing) ?? { total: 0, count: 0 };
    entry.total += tx.kind === "despesa" ? tx.amountCents : -tx.amountCents;
    entry.count += 1;
    byClosing.set(closing, entry);
  }
  return [...byClosing.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([closingDate, { total, count }]) => ({
      closingDate,
      dueDate: dueDateFor(closingDate, terms),
      totalCents: total,
      itemCount: count,
    }));
}

export type InvoiceStatus = "aberta" | "fechada" | "paga";

export type InvoiceWithPayment = Invoice & {
  paidCents: number;
  remainingCents: number;
  status: InvoiceStatus;
};

/**
 * Abate `paymentsCents` das faturas, da mais antiga para a mais nova. Fatura de valor negativo
 * (só estornos) vira crédito para as seguintes. Pagamento que sobra fica de crédito no fim.
 */
export function allocatePayments(invoices: Invoice[], paymentsCents: number, today: string): InvoiceWithPayment[] {
  let pool = paymentsCents;
  return invoices.map((inv) => {
    let paid = 0;
    if (inv.totalCents <= 0) {
      pool += -inv.totalCents;
    } else {
      paid = Math.min(pool, inv.totalCents);
      pool -= paid;
    }
    const remaining = Math.max(inv.totalCents - paid, 0);
    const status: InvoiceStatus = remaining === 0 ? "paga" : inv.closingDate < today ? "fechada" : "aberta";
    return { ...inv, paidCents: paid, remainingCents: remaining, status };
  });
}
