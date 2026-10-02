import Link from "next/link";
import { effectuateTransaction } from "@/app/actions/transactions";
import { cycleStart } from "@/lib/cards";
import { daysBetween, formatDateBR } from "@/lib/dates";
import { invoiceLabel, type CardInvoice } from "@/lib/repos/cards";
import { Amount } from "./amount";
import { TransactionRow } from "./transaction-list";

/**
 * Fatura no painel de contas em aberto: uma linha com o que falta pagar que expande
 * para as compras do ciclo, para conferir com a fatura do banco.
 */
export function OpenInvoice({
  inv,
  cardName,
  closingDay,
  today,
  canPay,
}: {
  inv: CardInvoice;
  cardName: string;
  closingDay: number;
  today: string;
  /** Há um pagamento previsto para esta fatura na agenda (vencida ou dentro do horizonte). */
  canPay: boolean;
}) {
  const overdue = inv.remainingCents > 0 && inv.dueDate < today;
  const lateDays = daysBetween(inv.dueDate, today);
  const label = invoiceLabel(cardName, inv.dueDate);
  const sum = inv.items.reduce((s, t) => s + (t.kind === "receita" ? -t.amountCents : t.amountCents), 0);

  return (
    <li className="py-1">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 py-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-lg"
            aria-hidden
          >
            💳
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{label}</p>
            <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
              {overdue && (
                <span className="whitespace-nowrap rounded-md bg-expense/15 px-1.5 py-0.5 text-[11px] font-medium text-expense">
                  Em atraso · {lateDays} {lateDays === 1 ? "dia" : "dias"}
                </span>
              )}
              <span>
                vence {formatDateBR(inv.dueDate)} · {inv.items.length} {inv.items.length === 1 ? "lançamento" : "lançamentos"}
              </span>
            </p>
          </div>
          <Amount cents={-inv.remainingCents} signed className="text-sm font-medium" />
          <span className="text-xs text-muted transition group-open:rotate-90" aria-hidden>
            ›
          </span>
        </summary>

        <div className="rounded-lg bg-surface-2/50 px-3 py-2 text-xs text-muted">
          <p>
            Compras de {formatDateBR(cycleStart(inv.closingDate, closingDay)).slice(0, 5)} a{" "}
            {formatDateBR(inv.closingDate).slice(0, 5)}
          </p>
          <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-4">
            <dt>Total da fatura</dt>
            <dd className="text-right">
              <Amount cents={inv.totalCents} />
            </dd>
            <dt>Pago</dt>
            <dd className="text-right">
              <Amount cents={inv.paidCents} />
            </dd>
            <dt className="font-medium text-fg">Falta</dt>
            <dd className="text-right font-medium text-fg">
              <Amount cents={inv.remainingCents} />
            </dd>
            <dt>Soma das compras listadas</dt>
            <dd className="text-right">
              <Amount cents={sum} />
            </dd>
          </dl>
        </div>

        <ul className="divide-y divide-line">
          {inv.items.map((t) => (
            // Compra em cartão só está em atraso quando a fatura venceu sem pagamento.
            <TransactionRow key={t.id} t={{ ...t, overdueSince: overdue ? inv.dueDate : null }} actions />
          ))}
        </ul>

        <div className="flex items-center justify-end gap-2 pb-2 pt-1">
          <Link href={`/cartoes/${inv.cardId}#fatura-${inv.closingDate}`} className="btn btn-ghost px-2.5 py-1 text-xs">
            Abrir no cartão
          </Link>
          {canPay && (
            <form action={effectuateTransaction}>
              <input type="hidden" name="cardId" value={inv.cardId} />
              <input type="hidden" name="closingDate" value={inv.closingDate} />
              <button className="btn px-2.5 py-1 text-xs" aria-label={`Efetivar ${label}`}>
                Paguei
              </button>
            </form>
          )}
        </div>
      </details>
    </li>
  );
}
