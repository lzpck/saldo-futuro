import type { Db } from "../db/connection";
import { listInvoicePayments, payInvoice, type PayInvoiceInput } from "./cards";
import { listWithOccurrences } from "./recurrences";
import type { Transaction } from "./transactions";

/**
 * Tudo que existe ou vai existir até `to`: lançamentos gravados, ocorrências de recorrência e
 * pagamentos de fatura previstos. É a base da lista, do painel de contas em aberto e da projeção.
 */
export function listSchedule(db: Db, to: string, today: string): Transaction[] {
  const base = listWithOccurrences(db, to);
  return [...base, ...listInvoicePayments(db, base, to, today)];
}

/** Paga uma fatura usando a agenda (compras e ocorrências) até o fechamento dela. */
export function payInvoiceFromSchedule(db: Db, input: PayInvoiceInput): number {
  return payInvoice(db, listWithOccurrences(db, input.closingDate), input);
}
