import type { Db } from "../db/connection";
import { allocatePayments, closingDateFor, computeInvoices, type InvoiceWithPayment } from "../cards";
import { addDays } from "../projection";
import { getAccount, isCard, listAccounts, type AccountWithBalance } from "./accounts";
import { effectuateOccurrence, listWithOccurrences } from "./recurrences";
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
        accountKind: payer.kind,
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
 * Para cada fatura do cartão que estiver quitada (status 'paga' com saldo restante zerado),
 * efetiva todas as compras/estornos do ciclo que ainda estiverem como 'previsto', preservando suas datas originais.
 * Ocorrências virtuais de recorrências no ciclo quitado são materializadas no banco como efetivadas.
 */
export function settlePaidInvoices(db: Db, cardId: number, today: string): void {
  const account = getAccount(db, cardId);
  if (!account || !isCard(account) || account.closingDay === null || account.dueDay === null || account.payAccountId === null) return;
  const base = listWithOccurrences(db, addDays(today, 400));
  const invoices = cardInvoices(db, account, base, today);
  for (const inv of invoices) {
    if (inv.remainingCents === 0 && inv.status === "paga") {
      for (const item of inv.items) {
        if (item.status === "previsto") {
          if (item.isVirtual && item.recurrenceId !== null && item.occurrenceDate !== null) {
            effectuateOccurrence(db, item.recurrenceId, item.occurrenceDate, today, item.amountCents, true);
          } else if (item.id > 0) {
            db.prepare(
              "UPDATE transactions SET status = 'efetivado' WHERE id = ? AND status = 'previsto'",
            ).run(item.id);
          }
        }
      }
    }
  }
}

/**
 * Ocorrências de Recorrência no cartão ainda não são compra: ficam Previstas e, quando a data chega,
 * viram Efetivadas sozinhas (ADR 0004). Chame antes de ler as listas.
 */
export function settleDueCardOccurrences(db: Db, today: string): void {
  const cardIds = new Set(listAccounts(db).filter(isCard).map((a) => a.id));
  if (cardIds.size === 0) return;
  for (const t of listWithOccurrences(db, today)) {
    if (t.status !== "previsto" || t.recurrenceId === null || t.kind === "transferencia" || !cardIds.has(t.accountId)) continue;
    if (t.isVirtual && t.occurrenceDate !== null) {
      effectuateOccurrence(db, t.recurrenceId, t.occurrenceDate, today, t.amountCents, true);
    } else if (t.id > 0) {
      db.prepare("UPDATE transactions SET status = 'efetivado' WHERE id = ? AND status = 'previsto'").run(t.id);
    }
  }
}

/**
 * Parcelas de uma Compra parcelada no cartão que ainda dependem de pagamento: as de Faturas não quitadas.
 * Devolve null se a compra não é de cartão (aí vale o estado Previsto da própria parcela).
 */
export function unpaidInstallmentIds(db: Db, purchaseId: number, today: string): Set<number> | null {
  const purchase = db.prepare("SELECT account_id FROM installment_purchases WHERE id = ?").get(purchaseId) as
    | { account_id: number }
    | undefined;
  const card = purchase && getAccount(db, purchase.account_id);
  if (!card || !isCard(card) || card.closingDay === null || card.dueDay === null || card.payAccountId === null) return null;

  const last = db.prepare("SELECT MAX(date) AS d FROM transactions WHERE purchase_id = ?").get(purchaseId) as { d: string | null };
  const unpaid = new Set<number>();
  if (last.d === null) return unpaid;

  const base = listWithOccurrences(db, last.d > today ? last.d : today);
  for (const inv of cardInvoices(db, card, base, today)) {
    if (inv.remainingCents === 0 && inv.status === "paga") continue;
    for (const item of inv.items) if (item.purchaseId === purchaseId) unpaid.add(item.id);
  }
  return unpaid;
}

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

  const txId = createTransaction(db, {
    kind: "transferencia",
    status: "efetivado",
    date: input.date ?? (invoice.dueDate > input.today ? input.today : invoice.dueDate),
    amountCents,
    description: invoiceLabel(card.name, invoice.dueDate),
    accountId: fromId,
    toAccountId: card.id,
  });

  settlePaidInvoices(db, card.id, input.today);

  return txId;
}
