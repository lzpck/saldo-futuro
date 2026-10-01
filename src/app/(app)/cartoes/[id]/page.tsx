import Link from "next/link";
import { notFound } from "next/navigation";
import { Amount } from "@/components/amount";
import { TransactionRow } from "@/components/transaction-list";
import { cycleStart } from "@/lib/cards";
import { daysBetween, formatDateBR, todayISO } from "@/lib/dates";
import { getDb } from "@/lib/db/connection";
import { centsToInput } from "@/lib/money";
import { addDays } from "@/lib/projection";
import { getAccount, isCard, listAccounts, type Account } from "@/lib/repos/accounts";
import { cardInvoices, type CardInvoice } from "@/lib/repos/cards";
import { listWithOccurrences } from "@/lib/repos/recurrences";
import { PayInvoiceForm } from "./pay-form";


function InvoiceBlock({
  inv,
  open,
  card,
  payers,
  today,
}: {
  inv: CardInvoice;
  open: boolean;
  card: Account & { closingDay: number };
  payers: Account[];
  today: string;
}) {
  const overdue = inv.remainingCents > 0 && inv.dueDate < today;
  const lateDays = daysBetween(inv.dueDate, today);
  const label = overdue
    ? `Em atraso · ${lateDays} ${lateDays === 1 ? "dia" : "dias"}`
    : { aberta: "Aberta", fechada: "Fechada", paga: "Paga" }[inv.status];
  const tone = overdue
    ? "bg-expense/15 text-expense"
    : inv.status === "paga"
      ? "bg-income/15 text-income"
      : "bg-surface-2 text-muted";

  return (
    <details id={`fatura-${inv.closingDate}`} open={open} className="card scroll-mt-24 py-3">
      <summary className="flex cursor-pointer list-none items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-medium">
            Fatura {inv.dueDate.slice(5, 7)}/{inv.dueDate.slice(2, 4)}
            <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${tone}`}>{label}</span>
          </p>
          <p className="text-xs text-muted">
            Compras de {formatDateBR(cycleStart(inv.closingDate, card.closingDay)).slice(0, 5)} a{" "}
            {formatDateBR(inv.closingDate).slice(0, 5)} · vence {formatDateBR(inv.dueDate)}
          </p>
        </div>
        <div className="text-right">
          <Amount cents={inv.totalCents} className="font-semibold" />
          {inv.remainingCents > 0 && inv.paidCents > 0 && (
            <p className="text-xs text-muted">
              falta <Amount cents={inv.remainingCents} />
            </p>
          )}
        </div>
      </summary>

      <ul className="mt-2 divide-y divide-line border-t border-line">
        {inv.items.map((t) => (
          <TransactionRow key={t.id} t={t} actions />
        ))}
      </ul>

      {inv.remainingCents > 0 && (
        <PayInvoiceForm
          cardId={card.id}
          closingDate={inv.closingDate}
          remainingLabel={centsToInput(inv.remainingCents)}
          defaultDate={inv.dueDate > today ? today : inv.dueDate}
          defaultFromId={card.payAccountId ?? payers[0]?.id ?? 0}
          payers={payers}
        />
      )}
    </details>
  );
}

export default async function CardPage({ params }: PageProps<"/cartoes/[id]">) {
  const { id } = await params;
  const db = getDb();
  const today = todayISO();
  const found = getAccount(db, Number(id));
  if (!found || !isCard(found) || found.closingDay === null || found.dueDay === null) notFound();
  const card = { ...found, closingDay: found.closingDay, dueDay: found.dueDay };

  const payers = listAccounts(db).filter((a) => !isCard(a));
  const payer = payers.find((a) => a.id === card.payAccountId);
  const invoices = cardInvoices(db, card, listWithOccurrences(db, addDays(today, 400)), today);
  const unpaid = invoices.filter((i) => i.remainingCents > 0);
  const paid = invoices.filter((i) => i.remainingCents === 0).reverse();
  const owed = unpaid.reduce((s, i) => s + i.remainingCents, 0);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{card.name}</h1>
          <p className="mt-1 text-sm text-muted">
            Fecha dia {card.closingDay} · vence dia {card.dueDay} · paga com {payer?.name ?? "—"}
          </p>
        </div>
        <Link href={`/contas/${card.id}`} className="btn px-3 py-1.5 text-xs">
          Editar
        </Link>
      </div>

      <div className="card flex items-center justify-between">
        <div>
          <p className="text-sm text-muted">Em aberto nas faturas</p>
          <Amount cents={owed} className="text-2xl font-semibold" />
          <p className="mt-0.5 text-xs text-muted">Inclui compras previstas e parcelas futuras.</p>
        </div>
        <Link href={`/lancamentos/novo?conta=${card.id}`} className="btn btn-primary">
          + Compra
        </Link>
      </div>

      {unpaid.length === 0 ? (
        <p className="card text-sm text-muted">
          Nenhuma fatura em aberto. Lance compras escolhendo este cartão como conta, e elas aparecem aqui.
        </p>
      ) : (
        <div className="space-y-3">
          {unpaid.map((inv, i) => (
            <InvoiceBlock key={inv.closingDate} inv={inv} open={i === 0} card={card} payers={payers} today={today} />
          ))}
        </div>
      )}

      {paid.length > 0 && (
        <details className="text-sm text-muted">
          <summary className="cursor-pointer">Faturas pagas ({paid.length})</summary>
          <div className="mt-3 space-y-3">
            {paid.map((inv) => (
              <InvoiceBlock key={inv.closingDate} inv={inv} open={false} card={card} payers={payers} today={today} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
