import type { Db } from "../db/connection";
import { allocatePayments, closingDateFor, computeInvoices, type InvoiceWithPayment } from "../cards";
import { getAccount, isCard, listAccounts, type AccountWithBalance } from "./accounts";
import { createTransaction, type Transaction } from "./transactions";

/** "Fatura Nubank 11/26" — o mês é o do vencimento, que é como se costuma falar da fatura. */
export function invoiceLabel(cardName: string, dueDate: string): string {
  return `Fatura ${cardName} ${dueDate.slice(5, 7)}/${dueDate.slice(2, 4)}`;
}

export type CardInvoice = InvoiceWithPayment & {
  cardId: number;
  /** Compras e estornos do ciclo, mais antigos primeiro. */
  items: Transaction[];
};

type CardWithTerms = AccountWithBalance & { closingDay: number; dueDay: number; payAccountId: number };

function asCard(a: AccountWithBalance | undefined): CardWithTerms {
  if (!a || !isCard(a) || a.closingDay === null || a.dueDay === null || a.payAccountId === null) {
    throw new Error("Cartão não encontrado.");
  }
  return a as CardWithTerms;
}

/**
 * Soma dos pagamentos efetivados até `today` ao cartão (transferências que entram, menos as que saem).
 * Um pagamento efetivado com data futura só abate as faturas quando a data chegar.
 */
function paymentsTotal(db: Db, cardId: number, today: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN to_account_id = ? THEN amount_cents ELSE -amount_cents END), 0) AS total
       FROM transactions
       WHERE kind = 'transferencia' AND status = 'efetivado' AND date <= ? AND (to_account_id = ? OR account_id = ?)`,
    )
    .get(cardId, today, cardId, cardId) as { total: number };
  return row.total;
}

/**
 * Faturas de um cartão a partir de `base` (lançamentos gravados + ocorrências virtuais),
 * da mais antiga para a mais nova, já com o que foi pago.
 */
export function cardInvoices(db: Db, card: AccountWithBalance, base: Transaction[], today: string): CardInvoice[] {
  const c = asCard(card);
  const items = base.filter((t) => t.accountId === c.id && t.kind !== "transferencia");
  const terms = { closingDay: c.closingDay, dueDay: c.dueDay };
  const invoices = allocatePayments(computeInvoices(items, terms), paymentsTotal(db, c.id, today), today);

  return invoices.map((inv) => ({
    ...inv,
    cardId: c.id,
    items: items
      .filter((t) => closingDateFor(t.date, c.closingDay) === inv.closingDate)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id),
  }));
}

/**
 * Pagamentos de fatura previstos até `to`: um por fatura com valor em aberto, no vencimento.
 * São calculados, como as ocorrências de recorrência, e se ajustam sozinhos a novas compras.
 */
export function listInvoicePayments(db: Db, base: Transaction[], to: string, today: string): Transaction[] {
  const result: Transaction[] = [];
  let nextId = 1_000_000;

  for (const card of listAccounts(db).filter(isCard)) {
    const c = asCard(card);
    const payer = getAccount(db, c.payAccountId);
    if (!payer) continue;
    for (const inv of cardInvoices(db, card, base, today)) {
      // Faturas que vencem depois de `to` ainda podem estar incompletas: ficam de fora.
      if (inv.remainingCents <= 0 || inv.dueDate > to) continue;
      result.push({
        id: -(nextId++),
        kind: "transferencia",
        status: "previsto",
        date: inv.dueDate,
        amountCents: inv.remainingCents,
        description: invoiceLabel(c.name, inv.dueDate),
        accountId: payer.id,
        accountName: payer.name,
        toAccountId: c.id,
        toAccountName: c.name,
        categoryId: null,
        categoryName: null,
        categoryIcon: "💳",
        categoryColor: "#6366f1",
        recurrenceId: null,
        occurrenceDate: null,
        purchaseId: null,
        installmentNo: null,
        installmentTotal: null,
        invoiceCardId: c.id,
        invoiceClosing: inv.closingDate,
        isVirtual: true,
        isEstimate: false,
        estimateNote: null,
      });
    }
  }
  return result;
}

export type PayInvoiceInput = {
  cardId: number;
  closingDate: string;
  today: string;
  /** Padrão: tudo que falta na fatura. */
  amountCents?: number;
  /** Padrão: hoje se o vencimento ainda não chegou; senão o próprio vencimento (fatura vencida). */
  date?: string;
  /** Padrão: a conta de pagamento do cartão. */
  fromAccountId?: number;
};

/**
 * Registra o pagamento de uma fatura como Transferência efetivada da conta para o cartão.
 * `base` deve conter as compras do cartão até o fechamento da fatura.
 */
export function payInvoice(db: Db, base: Transaction[], input: PayInvoiceInput): number {
  const card = asCard(getAccount(db, input.cardId));
  const invoice = cardInvoices(db, card, base, input.today).find((i) => i.closingDate === input.closingDate);
  if (!invoice) throw new Error("Fatura não encontrada.");

  const fromId = input.fromAccountId ?? card.payAccountId;
  const from = getAccount(db, fromId);
  if (!from) throw new Error("Conta de origem não encontrada.");
  if (isCard(from)) throw new Error("A fatura não pode ser paga com outro cartão.");

  const amountCents = input.amountCents ?? invoice.remainingCents;
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error("Não há valor em aberto nesta fatura.");

  return createTransaction(db, {
    kind: "transferencia",
    status: "efetivado",
    date: input.date ?? (invoice.dueDate > input.today ? input.today : invoice.dueDate),
    amountCents,
    description: invoiceLabel(card.name, invoice.dueDate),
    accountId: fromId,
    toAccountId: card.id,
  });
}
