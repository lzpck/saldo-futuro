import Link from "next/link";
import { effectuateTransaction, removeTransaction } from "@/app/actions/transactions";
import type { Transaction } from "@/lib/repos/transactions";
import { daysBetween, formatDateBR, todayISO } from "@/lib/dates";
import { isOverdue } from "@/lib/projection";
import { Amount } from "./amount";
import { FormLink } from "./form-link";
import { RowMenu } from "./row-menu";
import { RowIdentity, RowLink, signedCents } from "./transaction-list";

const icon = "material-symbols-outlined";

/** Linha da lista de Lançamentos, no desenho do template: ícone em bloco, etiquetas, valor em destaque e menu ⋯. */
export function FeedRow({ t }: { t: Transaction }) {
  const today = todayISO();
  const overdue = isOverdue(t, today);
  const planned = t.status === "previsto";
  const isInvoice = t.invoiceCardId !== null;
  const isCardPurchase = t.accountKind === "cartao" && !isInvoice;
  const isTransfer = t.kind === "transferencia";
  const href = isInvoice
    ? `/cartoes/${t.invoiceCardId}#fatura-${t.invoiceClosing}`
    : t.isVirtual
      ? `/agenda/ocorrencia/${t.recurrenceId}/${t.occurrenceDate}`
      : `/lancamentos/${t.id}`;
  const overdueDays = overdue ? daysBetween(t.overdueSince ?? t.date, today) : 0;
  const cents = isInvoice ? -t.amountCents : isTransfer ? t.amountCents : signedCents(t);
  const amountTone = isTransfer ? "font-semibold text-secondary" : cents > 0 ? "font-bold text-primary" : isInvoice && overdue ? "font-bold text-error" : "font-semibold text-tertiary";

  const rowTone = overdue ? "bg-surface-container/30" : planned ? "bg-surface-container/20" : "";
  const tile = overdue
    ? "bg-error-container/20 text-error"
    : t.kind === "receita"
      ? "bg-primary/10 text-primary"
      : isTransfer
        ? "bg-surface-container-highest text-secondary"
        : "bg-surface-container-highest text-tertiary";
  const pill = "rounded-full px-2 py-0.5 font-label-sm text-label-sm";
  const payLabel = t.kind === "receita" ? "Receber" : "Pagar";
  const confirmClass = overdue
    ? "bg-primary-container text-on-primary shadow-sm hover:opacity-95"
    : "bg-surface-container text-primary hover:bg-primary-container hover:text-on-primary";
  const confirmBase = `flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-label-sm text-label-sm font-semibold transition-all ${confirmClass}`;
  const confirmText = overdue ? "Confirmar" : payLabel;
  const confirmIcon = overdue ? "check" : t.kind === "receita" ? "input" : "payments";

  return (
    <li className={`group flex flex-wrap items-center justify-between gap-y-2 rounded-lg p-3 transition-all hover:bg-surface-container sm:flex-nowrap ${rowTone}`}>
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${tile} ${planned && !overdue ? "opacity-70" : ""}`} aria-hidden>
          {isInvoice ? <span className={`${icon} text-headline-md`}>credit_score</span> : isTransfer ? <span className={`${icon} text-headline-md`}>sync_alt</span> : (t.categoryIcon ?? "•")}
        </div>
        <RowLink href={href} isInvoice={isInvoice} className="flex min-w-0 flex-col">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate font-headline-md text-body-md font-semibold text-on-surface">{t.description}</span>
            {isTransfer ? (
              <span className={`${pill} bg-secondary-container font-semibold text-secondary-fixed`}>Transferência Interna</span>
            ) : t.categoryName ? (
              <span className={`${pill} bg-surface-container-high text-on-surface-variant`}>{t.categoryName}</span>
            ) : (
              !isInvoice && (
                <span className={`${pill} flex items-center gap-1 bg-tertiary-fixed-dim/20 font-bold text-tertiary`}>
                  <span className={`${icon} text-[13px]`}>new_label</span> Sem Categoria · Categorizar agora
                </span>
              )
            )}
            {t.installmentNo !== null && t.installmentTotal !== null && (
              <span className={`${pill} bg-surface-container-high text-on-surface-variant`}>
                {t.installmentNo}/{t.installmentTotal}
              </span>
            )}
            {t.recurrenceId !== null && (
              <span className="text-xs text-on-surface-variant" title="Recorrente" aria-label="Recorrente">
                ↻
              </span>
            )}
            {t.isEstimate && planned && (
              <span className={`${pill} bg-surface-container-high text-on-surface-variant`} title={t.estimateNote ?? undefined}>
                Estimado
              </span>
            )}
            {overdue && (
              <span className={`flex items-center gap-1 rounded-full bg-error-container/50 px-2.5 py-0.5 font-label-sm text-label-sm font-bold text-error`}>
                <span className={`${icon} text-[13px]`}>schedule</span> Pendente de confirmação
              </span>
            )}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 font-label-sm text-label-sm text-on-surface-variant">
            <span className={overdue ? "font-medium text-error" : ""}>
              {formatDateBR(t.date).slice(0, 5)}
              {overdue && ` (Vencido há ${overdueDays} ${overdueDays === 1 ? "dia" : "dias"})`}
            </span>
            <span>•</span>
            {isTransfer ? (
              <span className="flex items-center gap-1 font-medium text-secondary">
                {t.accountName}
                <span className={`${icon} text-[13px]`}>arrow_forward</span>
                {t.toAccountName}
              </span>
            ) : (
              <span>{t.accountName}</span>
            )}
            {!planned && (
              <>
                <span>•</span>
                <span className="flex items-center gap-0.5 text-primary">
                  <span className={`${icon} text-[13px]`}>check_circle</span> Efetivado
                </span>
              </>
            )}
          </span>
        </RowLink>
      </div>

      <div className="flex shrink-0 items-center gap-3 pl-3 max-sm:w-full max-sm:justify-end">
        <div className="text-right">
          <div className={`font-headline-md text-body-lg tracking-tight ${amountTone}`}>
            {cents > 0 && "+"}
            <Amount cents={cents} />
          </div>
          <div className={`font-label-sm text-label-sm ${planned ? "text-outline" : "text-on-surface-variant"}`}>
            {planned ? "Previsto" : isTransfer ? "Compensação interna" : t.kind === "receita" ? "Receita" : "Despesa"}
          </div>
        </div>

        {!isCardPurchase &&
          planned &&
          (t.isEstimate && t.recurrenceId !== null && t.occurrenceDate !== null ? (
            // Valor variável: o real é informado na página da ocorrência, nunca pago em silêncio pela estimativa.
            <FormLink href={`/agenda/ocorrencia/${t.recurrenceId}/${t.occurrenceDate}?pago=1`} className={confirmBase} aria-label={`Efetivar ${t.description}`}>
              <span className={`${icon} text-[15px]`}>{confirmIcon}</span>
              <span>{confirmText}</span>
            </FormLink>
          ) : (
            <form action={effectuateTransaction}>
              <RowIdentity t={t} />
              <button className={confirmBase} aria-label={`Efetivar ${t.description}`}>
                <span className={`${icon} text-[15px]`}>{confirmIcon}</span>
                <span>{confirmText}</span>
              </button>
            </form>
          ))}

        {!isInvoice ? (
          <RowMenu label={t.description} editHref={href} skipping={t.isVirtual}>
            <form action={removeTransaction}>
              <RowIdentity t={t} />
              <button
                className="rounded-lg bg-error-container px-4 py-2 font-label-md text-label-md font-semibold text-on-error-container shadow-sm transition-colors hover:opacity-90"
                aria-label={`${t.isVirtual ? "Pular" : "Excluir"} ${t.description}`}
              >
                {t.isVirtual ? "Sim, pular ocorrência" : "Sim, excluir registro"}
              </button>
            </form>
          </RowMenu>
        ) : (
          <Link href={href} aria-label={`Abrir fatura ${t.description}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface">
            <span className={icon}>chevron_right</span>
          </Link>
        )}
      </div>
    </li>
  );
}
