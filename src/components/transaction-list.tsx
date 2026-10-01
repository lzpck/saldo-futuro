import Link from "next/link";
import { effectuateTransaction, removeTransaction } from "@/app/actions/transactions";
import type { Transaction } from "@/lib/repos/transactions";
import { daysBetween, formatDateBR, todayISO } from "@/lib/dates";
import { isOverdue } from "@/lib/projection";
import { Amount } from "./amount";

function signedCents(t: Transaction): number {
  if (t.kind === "receita") return t.amountCents;
  if (t.kind === "despesa") return -t.amountCents;
  return 0;
}

function StatusBadge({ t, today }: { t: Transaction; today: string }) {
  if (t.status === "efetivado") return null;
  const estimate = t.isEstimate && (
    <span
      className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted"
      title={t.estimateNote ?? undefined}
    >
      Estimado
    </span>
  );
  if (isOverdue(t, today)) {
    const days = daysBetween(t.overdueSince ?? t.date, today);
    return (
      <>
        <span className="shrink-0 whitespace-nowrap rounded-md bg-expense/15 px-1.5 py-0.5 text-[11px] font-medium text-expense">
          Em atraso · {days} {days === 1 ? "dia" : "dias"}
        </span>
        {estimate}
      </>
    );
  }
  return estimate || <span className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted">Previsto</span>;
}

/** Identifica a linha para as Server Actions: lançamento gravado (id) ou ocorrência virtual. */
function RowIdentity({ t }: { t: Transaction }) {
  if (t.invoiceCardId !== null) {
    return (
      <>
        <input type="hidden" name="cardId" value={t.invoiceCardId} />
        <input type="hidden" name="closingDate" value={t.invoiceClosing ?? ""} />
      </>
    );
  }
  return t.isVirtual ? (
    <>
      <input type="hidden" name="recurrenceId" value={t.recurrenceId ?? ""} />
      <input type="hidden" name="occurrenceDate" value={t.occurrenceDate ?? ""} />
    </>
  ) : (
    <input type="hidden" name="id" value={t.id} />
  );
}

export function TransactionRow({ t, actions = false }: { t: Transaction; actions?: boolean }) {
  const today = todayISO();
  const subtitle =
    t.kind === "transferencia" ? `${t.accountName} → ${t.toAccountName}` : `${t.categoryName ?? "Sem categoria"} · ${t.accountName}`;
  const planned = t.status === "previsto";
  const isInvoice = t.invoiceCardId !== null;
  const href = isInvoice
    ? `/cartoes/${t.invoiceCardId}#fatura-${t.invoiceClosing}`
    : t.isVirtual
      ? `/agenda/ocorrencia/${t.recurrenceId}/${t.occurrenceDate}`
      : `/lancamentos/${t.id}`;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 sm:flex-nowrap">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${planned ? "opacity-60" : ""}`}
        style={{ backgroundColor: `${t.categoryColor ?? "#64748b"}26` }}
        aria-hidden
      >
        {isInvoice ? "💳" : t.kind === "transferencia" ? "⇄" : (t.categoryIcon ?? "•")}
      </div>
      <Link href={href} className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{t.description}</span>
          {t.installmentNo !== null && t.installmentTotal !== null && (
            <span className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted">
              {t.installmentNo}/{t.installmentTotal}
            </span>
          )}
          {t.recurrenceId !== null && (
            <span className="shrink-0 text-xs text-muted" title="Recorrente" aria-label="Recorrente">
              ↻
            </span>
          )}
        </p>
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted">
          <StatusBadge t={t} today={today} />
          <span className="max-w-full truncate">
            {formatDateBR(t.date)} · {subtitle}
          </span>
        </p>
      </Link>
      <div className={`text-right text-sm font-medium ${planned ? "opacity-70" : ""}`}>
        {isInvoice ? (
          <Amount cents={-t.amountCents} signed />
        ) : t.kind === "transferencia" ? (
          <Amount cents={t.amountCents} className="text-muted" />
        ) : (
          <Amount cents={signedCents(t)} signed />
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 max-sm:w-full max-sm:justify-end">
          {planned && t.isEstimate && t.recurrenceId !== null && t.occurrenceDate !== null ? (
            // Valor variável: o real é informado na página da ocorrência, nunca pago em silêncio pela estimativa.
            <Link
              href={`/agenda/ocorrencia/${t.recurrenceId}/${t.occurrenceDate}?pago=1`}
              className="btn px-2.5 py-1 text-xs"
              aria-label={`Efetivar ${t.description}`}
            >
              {t.kind === "receita" ? "Recebi" : "Paguei"}
            </Link>
          ) : (
            planned && (
            <form action={effectuateTransaction}>
              <RowIdentity t={t} />
              <button className="btn px-2.5 py-1 text-xs" aria-label={`Efetivar ${t.description}`}>
                {t.kind === "receita" ? "Recebi" : t.kind === "despesa" || isInvoice ? "Paguei" : "Feita"}
              </button>
            </form>
            )
          )}
          {!isInvoice && (
            <form action={removeTransaction}>
              <RowIdentity t={t} />
              <button
                className="btn btn-ghost px-2 py-1 text-xs"
                aria-label={`${t.isVirtual ? "Pular" : "Excluir"} ${t.description}`}
                title={t.isVirtual ? "Pular só esta ocorrência" : "Excluir"}
              >
                ✕
              </button>
            </form>
          )}
        </div>
      )}
    </li>
  );
}

export function TransactionList({ items, actions = false }: { items: Transaction[]; actions?: boolean }) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-muted">Nenhum lançamento.</p>;
  return (
    <ul className="divide-y divide-line">
      {items.map((t) => (
        <TransactionRow key={t.id} t={t} actions={actions} />
      ))}
    </ul>
  );
}
