import type { Db } from "../db/connection";
import { listAccounts, isCard } from "./accounts";
import { cardInvoices, listInvoicePayments, payInvoice, settleDueCardOccurrences, type CardInvoice, type PayInvoiceInput } from "./cards";
import { listWithOccurrences } from "./recurrences";
import type { Transaction } from "./transactions";

/**
 * Tudo que existe ou vai existir até `to`: lançamentos gravados, ocorrências de recorrência e
 * pagamentos de fatura previstos. É a base da lista, do painel de contas em aberto e da projeção.
 */
export function listSchedule(db: Db, to: string, today: string): Transaction[] {
  return loadSchedule(db, to, today).transactions;
}

/**
 * `listSchedule` mais as Faturas de cada cartão, calculadas uma vez só. Com `invoicesTo` depois de `to`,
 * as Faturas olham a agenda até lá (as telas de cartão olham ~400 dias) sem uma segunda leitura;
 * `transactions` continua indo só até `to`.
 */
export function loadSchedule(db: Db, to: string, today: string, invoicesTo = to) {
  settleDueCardOccurrences(db, today);
  const wide = listWithOccurrences(db, invoicesTo > to ? invoicesTo : to);
  // Fatura que vence até `to` só tem compras até `to` (a compra é anterior ao fechamento), então o recorte não muda nenhuma.
  const base = invoicesTo > to ? wide.filter((t) => t.date <= to) : wide;
  const invoicesByCard = new Map(
    listAccounts(db)
      .filter(isCard)
      .map((card) => [card.id, cardInvoices(db, card, wide, today)] as const),
  );
  return {
    transactions: [...markCardOverdue(base, today, invoicesByCard), ...listInvoicePayments(db, base, to, today, invoicesByCard)],
    invoicesByCard,
  };
}

/**
 * Compra em cartão está Em atraso quando a Fatura dela venceu e ainda tem saldo, não pela data da compra.
 * Com pagamento parcial não dá para saber quais compras foram cobertas, então todas da Fatura atrasam.
 */
function markCardOverdue(base: Transaction[], today: string, invoicesByCard: Map<number, CardInvoice[]>): Transaction[] {
  const since = new Map<number, string | null>();
  for (const invoices of invoicesByCard.values()) {
    for (const inv of invoices) {
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
