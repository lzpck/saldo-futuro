import type { Db } from "../db/connection";
import { listAccounts, isCard } from "./accounts";
import { cardInvoices, listInvoicePayments, payInvoice, type PayInvoiceInput } from "./cards";
import { listWithOccurrences } from "./recurrences";
import type { Transaction } from "./transactions";

/**
 * Tudo que existe ou vai existir até `to`: lançamentos gravados, ocorrências de recorrência e
 * pagamentos de fatura previstos. É a base da lista, do painel de contas em aberto e da projeção.
 */
export function listSchedule(db: Db, to: string, today: string): Transaction[] {
  const base = listWithOccurrences(db, to);
  return [...markCardOverdue(db, base, today), ...listInvoicePayments(db, base, to, today)];
}

/**
 * Compra em cartão está Em atraso quando a Fatura dela venceu e ainda tem saldo, não pela data da compra.
 * Com pagamento parcial não dá para saber quais compras foram cobertas, então todas da Fatura atrasam.
 */
function markCardOverdue(db: Db, base: Transaction[], today: string): Transaction[] {
  const since = new Map<number, string | null>();
  for (const card of listAccounts(db).filter(isCard)) {
    for (const inv of cardInvoices(db, card, base, today)) {
      const late = inv.remainingCents > 0 && inv.dueDate < today ? inv.dueDate : null;
      for (const item of inv.items) since.set(item.id, late);
    }
  }
  return base.map((t) => (since.has(t.id) ? { ...t, overdueSince: since.get(t.id)! } : t));
}

/** Paga uma fatura usando a agenda (compras e ocorrências) até o fechamento dela. */
export function payInvoiceFromSchedule(db: Db, input: PayInvoiceInput): number {
  return payInvoice(db, listWithOccurrences(db, input.closingDate), input);
}
