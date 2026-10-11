import Link from "next/link";
import { PageHeader, PageShell, PRIMARY_ACTION } from "@/components/page-shell";
import { FormLink } from "@/components/form-link";
import { daysBetween, formatDateBR, todayISO } from "@/lib/dates";
import { getDb } from "@/lib/db/connection";
import { formatBRL } from "@/lib/money";
import { addDays } from "@/lib/projection";
import { FREQUENCY_LABEL, monthlyEquivalentCents } from "@/lib/recurrence";
import { listPurchases, type PurchaseSummary } from "@/lib/repos/installments";
import { listRecurrences, listWithOccurrences, type Recurrence } from "@/lib/repos/recurrences";
import { listSchedule } from "@/lib/repos/schedule";
import type { Transaction } from "@/lib/repos/transactions";
import { RecurrenceTable, type RecurrenceRowData } from "./recurrence-table";

const iconCls = "material-symbols-outlined";
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS_LONG = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const monthYear = (iso: string) => {
  const m = MONTHS[Number(iso.slice(5, 7)) - 1];
  return `${m[0].toUpperCase()}${m.slice(1)}/${iso.slice(0, 4)}`;
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const inDays = (n: number) => (n === 0 ? "hoje" : `em ${plural(n, "dia", "dias")}`);

type RecurrenceItem = { r: Recurrence; next: string | null; nextAmount: number };

const byNextDate = (a: RecurrenceItem, b: RecurrenceItem) =>
  (a.next ?? "9999").localeCompare(b.next ?? "9999") || a.r.description.localeCompare(b.r.description);

const cadence = (r: Recurrence) => (r.frequency === "mensal" ? `Dia ${r.anchorDay}` : FREQUENCY_LABEL[r.frequency]);
const frequencyLabel = (r: Recurrence) => ({ semanal: "Semanal", quinzenal: "Quinzenal", mensal: "Mensal", anual: "Anual" })[r.frequency];

const timelineHref = (t: Transaction) =>
  t.invoiceCardId !== null
    ? `/cartoes/${t.invoiceCardId}`
    : t.purchaseId !== null
      ? `/agenda/parcelamentos/${t.purchaseId}`
      : `/agenda/ocorrencia/${t.recurrenceId}/${t.occurrenceDate}`;

function Kpi({ title, icon, iconTone, value, valueTone, children, highlight = false }: {
  title: string;
  icon: string;
  iconTone: string;
  value: string;
  valueTone: string;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={`relative flex flex-col justify-between overflow-hidden rounded-xl p-5 shadow-md ${highlight ? "bg-surface-container-high" : "bg-surface-container"}`}>
      <div className="flex items-start justify-between gap-2">
        <span className={`font-label-md text-label-md uppercase tracking-wider ${highlight ? "text-on-surface-variant" : "text-secondary"}`}>{title}</span>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconTone}`}>
          <span aria-hidden className={`${iconCls} text-[20px]`}>{icon}</span>
        </div>
      </div>
      <div className="mt-4">
        <div className={`font-headline-lg text-headline-lg tracking-tight ${valueTone}`}>{value}</div>
        <div className={`mt-1 flex flex-wrap items-center gap-1.5 font-label-sm text-label-sm ${highlight ? "text-on-surface-variant" : "text-secondary"}`}>{children}</div>
      </div>
    </div>
  );
}

function PurchaseCard({ p }: { p: PurchaseSummary }) {
  const done = p.remainingCount === 0;
  const settled = p.totalInstallments - p.remainingCount;
  const pct = Math.round((p.paidCount / p.totalInstallments) * 100);
  const current = Math.min(p.paidCount + 1, p.totalInstallments);
  const segment = (i: number) => (i < p.paidCount ? "bg-primary" : p.onCard && i < p.postedCount ? "bg-primary/40" : "bg-surface-container-highest");
  return (
    <Link href={`/agenda/parcelamentos/${p.id}`} className={`block space-y-4 rounded-xl bg-surface-container p-5 shadow-md transition-colors hover:bg-surface-container-high ${done ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary-container text-lg text-on-surface">
            {p.categoryIcon ?? "🛍️"}
          </div>
          <div className="min-w-0">
            <h3 className="truncate font-headline-md text-headline-md font-semibold text-on-surface">{p.description}</h3>
            <p className="truncate font-label-sm text-label-sm text-secondary">
              {p.categoryName ?? <span className="text-tertiary">Sem categoria</span>} · {p.onCard ? `Fatura ${p.accountName}` : p.accountName}
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded bg-primary-container/20 px-2 py-0.5 text-[11px] font-semibold text-primary">
          {done ? "Quitada" : `Parcela ${current} de ${p.totalInstallments}`}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-xl bg-surface-container-low px-4 py-2">
        <div>
          <span className="block font-label-sm text-label-sm text-secondary">Valor Parcela</span>
          <span className="font-headline-md text-headline-md font-bold text-on-surface">{formatBRL(p.installmentCents)}</span>
        </div>
        <div>
          <span className="block font-label-sm text-label-sm text-secondary">Total Compra</span>
          <span className="font-body-md text-body-md font-semibold text-secondary">{formatBRL(p.totalCents)}</span>
        </div>
        <div className="text-right">
          <span className="block font-label-sm text-label-sm text-secondary">Restante</span>
          <span className="font-headline-md text-headline-md font-bold text-tertiary">{formatBRL(p.remainingCents)}</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between font-label-sm text-label-sm text-secondary">
          <span className="font-medium text-on-surface">Progresso de Quitação ({pct}%)</span>
          <span>
            {p.onCard && p.postedCount > p.paidCount ? `${p.postedCount} na fatura · ` : ""}
            {plural(p.paidCount, "paga", "pagas")} · {plural(p.remainingCount, "restante", "restantes")}
          </span>
        </div>
        <div
          className="flex h-2 w-full gap-1 overflow-hidden rounded-full bg-surface-container-lowest"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={p.totalInstallments}
          aria-valuenow={p.paidCount}
          aria-label={`${p.paidCount} de ${p.totalInstallments} parcelas pagas`}
        >
          {Array.from({ length: Math.max(settled, 0) + p.remainingCount }, (_, i) => (
            <div key={i} className={`h-full flex-1 rounded-full ${segment(i)}`} />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-2 font-label-sm text-label-sm text-secondary">
        <div className="flex items-center gap-1.5">
          <span aria-hidden className={`${iconCls} text-[16px] ${p.overdueDays !== null ? "text-tertiary" : "text-primary"}`}>event</span>
          <span>
            Próxima: <strong className="text-on-surface">{p.nextDate ? formatDateBR(p.nextDate) : "—"}</strong>
          </span>
          {p.overdueDays !== null && (
            <span className="rounded bg-tertiary-container/20 px-1.5 py-0.5 text-[10px] font-semibold text-tertiary">
              {p.onCard ? "Fatura vencida" : "Vencida"} há {plural(p.overdueDays, "dia", "dias")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span aria-hidden className={`${iconCls} text-[16px] text-outline`}>flag</span>
          <span>
            Finaliza em <strong className="text-on-surface">{p.lastDate ? monthYear(p.lastDate) : "—"}</strong>
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function AgendaPage() {
  const db = getDb();
  const today = todayISO();
  const horizon = addDays(today, 30);

  // Próxima ocorrência ainda em aberto: pula as efetivadas e as puladas, mas conta as já gravadas e
  // previstas (editadas à mão), as mesmas que a linha do tempo mostra.
  const open = listWithOccurrences(db, addDays(today, 400)).filter(
    (t) => t.recurrenceId !== null && t.status === "previsto" && (t.date >= today || !t.isVirtual),
  );
  const recurrences: RecurrenceItem[] = listRecurrences(db).map((r) => {
    const nextOccurrence = open.filter((t) => t.recurrenceId === r.id).sort((a, b) => a.date.localeCompare(b.date))[0];
    return { r, next: nextOccurrence?.date ?? null, nextAmount: nextOccurrence?.amountCents ?? r.amountCents };
  });
  const ended = recurrences.filter((x) => x.next === null && x.r.endDate !== null && x.r.endDate < today);
  const active = recurrences.filter((x) => !ended.includes(x)).sort(byNextDate);
  const expenses = active.filter((x) => x.r.kind === "despesa");
  const incomes = active.filter((x) => x.r.kind === "receita");
  const purchases = listPurchases(db);
  const running = purchases.filter((p) => p.remainingCount > 0);

  const monthly = (list: RecurrenceItem[]) => list.reduce((s, x) => s + monthlyEquivalentCents(x.r.frequency, x.nextAmount), 0);
  const expenseMonthly = monthly(expenses);
  const incomeMonthly = monthly(incomes);
  const installmentsMonthly = running.reduce((s, p) => s + p.installmentCents, 0);
  const installmentsToPay = running.reduce((s, p) => s + p.remainingCents, 0);
  const net = incomeMonthly - expenseMonthly - installmentsMonthly;

  const accountsOf = (list: RecurrenceItem[]) => {
    const names = [...new Set(list.map((x) => x.r.accountName))];
    return names.length > 3 ? `${names.slice(0, 3).join(", ")} +${names.length - 3}` : names.join(", ");
  };

  const rows: RecurrenceRowData[] = active.map(({ r, next, nextAmount }) => ({
    id: r.id,
    description: r.description,
    kind: r.kind,
    category: r.categoryName,
    icon: r.categoryIcon,
    cadence: cadence(r),
    frequencyLabel: frequencyLabel(r),
    accountName: r.accountName,
    nextLabel: next ? formatDateBR(next) : null,
    inDays: next ? daysBetween(today, next) : null,
    amountCents: nextAmount,
    isVariable: r.isVariable,
  }));

  // Linha do tempo: tudo que vence nos próximos 30 dias (e o que já devia ter vencido).
  const timeline = listSchedule(db, horizon, today)
    .filter((t) => t.status === "previsto" && (t.recurrenceId !== null || t.purchaseId !== null || t.invoiceCardId !== null))
    .sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description));

  // Compras com o mesmo nome: o template avisa que são operações distintas.
  const byName = new Map<string, PurchaseSummary[]>();
  for (const p of running) byName.set(p.description, [...(byName.get(p.description) ?? []), p]);
  const repeated = [...byName].filter(([, list]) => list.length > 1);

  const [ty, tm] = today.split("-").map(Number);

  return (
    <PageShell>
      <PageHeader
        title={<>Agenda &amp; Vencimentos</>}
        subtitle={`${MONTHS_LONG[tm - 1]} / ${ty} · Controle de assinaturas recorrentes, receitas contratuais e parcelamentos ativos com projeção de impacto.`}
        actions={
          <FormLink href="/lancamentos/novo" className={PRIMARY_ACTION}>
            <span aria-hidden className={`${iconCls} text-[18px]`}>add_circle</span>
            <span>Nova Operação</span>
          </FormLink>
        }
      />

      {/* Impacto fixo no fluxo de caixa */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi title="Entradas Fixas / Mês" icon="trending_up" iconTone="bg-primary/10 text-primary" value={`+${formatBRL(incomeMonthly)}`} valueTone="text-primary">
          <span>{plural(incomes.length, "contrato ativo", "contratos ativos")}</span>
          {incomes[0] && (
            <>
              <span className="text-outline">·</span>
              <span className="font-medium text-primary">{incomes[0].r.description}{incomes[0].r.frequency === "mensal" ? ` (dia ${incomes[0].r.anchorDay})` : ""}</span>
            </>
          )}
        </Kpi>
        <Kpi title="Despesas Fixas / Mês" icon="autorenew" iconTone="bg-tertiary-container/15 text-tertiary" value={`-${formatBRL(expenseMonthly)}`} valueTone="text-tertiary">
          <span>{plural(expenses.length, "serviço recorrente", "serviços recorrentes")}</span>
          {expenses.length > 0 && (
            <>
              <span className="text-outline">·</span>
              <span className="font-medium text-on-surface">{accountsOf(expenses)}</span>
            </>
          )}
        </Kpi>
        <Kpi title="Parcelas Ativas (Mês)" icon="credit_card" iconTone="bg-secondary-container text-on-surface" value={formatBRL(installmentsMonthly)} valueTone="text-on-surface">
          <span>{plural(running.length, "parcelamento vigente", "parcelamentos vigentes")}</span>
          <span className="text-outline">·</span>
          <span className="font-medium text-tertiary">A pagar: {formatBRL(installmentsToPay)}</span>
        </Kpi>
        <Kpi
          highlight
          title="Balanço Recorrente Líquido"
          icon="account_balance_wallet"
          iconTone="bg-primary-container/20 text-primary"
          value={`${net >= 0 ? "+" : "-"}${formatBRL(Math.abs(net))}`}
          valueTone={net >= 0 ? "text-primary" : "text-tertiary"}
        >
          <span aria-hidden className={`${iconCls} text-[14px] ${net >= 0 ? "text-primary" : "text-tertiary"}`}>{net >= 0 ? "verified" : "warning"}</span>
          <span>{net >= 0 ? "Entradas cobrem os compromissos fixos" : "Compromissos fixos acima das entradas"}</span>
        </Kpi>
      </div>

      {/* Linha do tempo dos próximos 30 dias */}
      <div className="rounded-xl bg-surface-container p-5 shadow-md lg:p-6">
        <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h2 className="flex items-center gap-2 font-headline-md text-headline-md text-on-surface">
              <span aria-hidden className={`${iconCls} text-[22px] text-primary`}>timeline</span>
              Linha do Tempo dos Próximos 30 Dias
            </h2>
            <p className="font-body-sm text-body-sm text-secondary">Cronograma de débitos e créditos com impacto direto na liquidez projetada.</p>
          </div>
          <span className="self-start rounded-md bg-surface-container-low px-2.5 py-1 font-label-sm text-label-sm text-secondary md:self-auto">
            {plural(timeline.length, "compromisso programado", "compromissos programados")}
          </span>
        </div>
        {timeline.length === 0 ? (
          <p className="font-body-sm text-body-sm text-secondary">Nada vence nos próximos 30 dias.</p>
        ) : (
          <div className="overflow-x-auto pb-3 pt-1">
            <div className="flex min-w-max items-stretch gap-3">
              {timeline.map((t) => {
                const credit = t.kind === "receita";
                const late = t.date < today;
                const distance = daysBetween(today, t.date);
                const sub = t.invoiceCardId !== null ? "Fatura do cartão" : t.installmentNo !== null ? `Parcela ${t.installmentNo}/${t.installmentTotal} · ${t.accountName}` : t.accountName;
                return (
                  <Link
                    key={`${t.id}-${t.date}-${t.description}`}
                    href={timelineHref(t)}
                    className={`group relative w-48 shrink-0 rounded-xl p-3.5 transition-colors ${credit ? "bg-primary-container/15 shadow-sm hover:bg-primary-container/20" : "bg-surface-container-low hover:bg-surface-container-high"}`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${credit ? "bg-primary text-on-primary" : "bg-tertiary-container/20 text-tertiary"}`}>
                        {formatDateBR(t.date).slice(0, 5)}
                      </span>
                      <span className={`font-label-sm text-label-sm ${late ? "font-medium text-tertiary" : credit ? "font-medium text-primary" : "text-secondary"}`}>
                        {late ? `atraso ${plural(-distance, "dia", "dias")}` : inDays(distance)}
                      </span>
                    </div>
                    <div className="truncate font-body-md text-body-md font-semibold text-on-surface">{t.description}</div>
                    <div className={`mb-2 truncate font-label-sm text-label-sm ${credit ? "text-on-surface-variant" : "text-secondary"}`}>{sub}</div>
                    <div className={`font-headline-md text-headline-md font-bold ${credit ? "text-primary" : "text-tertiary"}`}>
                      {credit ? "+" : "-"}{formatBRL(t.amountCents)}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Recorrências */}
      <div className="space-y-4">
        {rows.length === 0 ? (
          <div className="rounded-xl bg-surface-container p-5 font-body-sm text-body-sm text-secondary">
            Nenhuma recorrência ativa. Cadastre aluguel, salário, assinaturas e outras contas de valor fixo para a projeção contar com elas.
          </div>
        ) : (
          <RecurrenceTable rows={rows} />
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-label-sm text-label-sm text-secondary">Toque numa recorrência para editar, ajustar o valor de um mês ou encerrar.</p>
          <FormLink
            href="/lancamentos/novo?repeat=recorrente"
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 font-body-sm text-body-sm font-semibold text-on-primary shadow-sm transition-all hover:bg-primary-fixed-dim"
          >
            <span aria-hidden className={`${iconCls} text-[18px]`}>add</span>
            <span>Nova Recorrência</span>
          </FormLink>
        </div>
        {ended.length > 0 && (
          <details className="font-body-sm text-body-sm text-secondary">
            <summary className="cursor-pointer">Encerradas ({ended.length})</summary>
            <ul className="mt-2 space-y-2">
              {ended.map(({ r }) => (
                <li key={r.id}>
                  <Link href={`/agenda/recorrencias/${r.id}`} className="flex justify-between rounded-xl bg-surface-container px-5 py-3 opacity-70 transition-colors hover:bg-surface-container-high">
                    <span>{r.description}</span>
                    <span>até {formatDateBR(r.endDate ?? r.startDate)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {/* Compras parceladas */}
      <div className="space-y-4 pt-2">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-headline-md text-headline-md text-on-surface">Compras Parceladas</h2>
              <span className="rounded-full bg-secondary-container px-2 py-0.5 font-label-sm text-label-sm text-on-surface">{plural(running.length, "ativa", "ativas")}</span>
            </div>
            <p className="font-body-sm text-body-sm text-secondary">Acompanhamento das parcelas em andamento com amortização e data de encerramento.</p>
          </div>
          <FormLink
            href="/lancamentos/novo?repeat=parcelado"
            className="inline-flex items-center gap-1.5 self-start rounded-xl bg-primary px-3.5 py-1.5 font-body-sm text-body-sm font-semibold text-on-primary shadow-sm transition-all hover:bg-primary-fixed-dim sm:self-auto"
          >
            <span aria-hidden className={`${iconCls} text-[18px]`}>add</span>
            <span>Nova Compra Parcelada</span>
          </FormLink>
        </div>

        {repeated.map(([name, list]) => (
          <div key={name} className="flex items-start gap-3 rounded-xl bg-surface-container p-4 shadow-sm">
            <span aria-hidden className={`${iconCls} mt-0.5 shrink-0 text-[20px] text-tertiary-container`}>info</span>
            <div className="flex-1 font-body-sm text-body-sm text-secondary">
              <strong className="font-semibold text-on-surface">Mesmo nome, compras diferentes:</strong> {list.length} parcelamentos ativos em{" "}
              <span className="font-medium text-on-surface">{name}</span> ({list.map((p) => formatBRL(p.totalCents)).join(" e ")}). Cada um tem valor, categoria e vencimentos próprios.
            </div>
          </div>
        ))}

        {purchases.length === 0 ? (
          <div className="rounded-xl bg-surface-container p-5 font-body-sm text-body-sm text-secondary">Nenhuma compra parcelada.</div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {purchases.map((p) => (
              <PurchaseCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </div>

      {/* Projeção automatizada */}
      <div className="flex flex-col items-center justify-between gap-6 rounded-xl bg-surface-container p-5 shadow-md md:flex-row lg:p-6">
        <div className="flex items-start gap-4">
          <div aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-container/20 text-primary">
            <span className={`${iconCls} text-[26px]`}>insights</span>
          </div>
          <div>
            <h3 className="font-headline-md text-headline-md text-on-surface">Projeção Automatizada de Vencimentos</h3>
            <p className="mt-1 font-body-sm text-body-sm text-secondary">
              Com {plural(active.length, "recorrência", "recorrências")} e {plural(running.length, "parcelamento", "parcelamentos")} em andamento, o balanço mensal fixo fica em{" "}
              <strong className={`font-semibold ${net >= 0 ? "text-primary" : "text-tertiary"}`}>
                {net >= 0 ? "+" : "-"}{formatBRL(Math.abs(net))}
              </strong>
              , com {formatBRL(installmentsToPay)} ainda a pagar em parcelas.
            </p>
          </div>
        </div>
        <Link href="/relatorios" className="shrink-0 rounded-xl bg-surface-container-high px-4 py-2 font-body-sm text-body-sm font-semibold text-on-surface transition-colors hover:bg-surface-bright">
          Ver Relatório Completo
        </Link>
      </div>

      <FormLink
        href="/lancamentos/novo"
        aria-label="Adicionar nova transação"
        className="fixed bottom-20 right-7 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary-container text-on-primary shadow-xl shadow-primary-container/30 transition-all hover:scale-105 focus:outline-none focus:ring-4 focus:ring-primary-container/40 active:scale-95 md:bottom-7"
      >
        <span aria-hidden className={`${iconCls} text-3xl font-bold`}>add</span>
      </FormLink>
    </PageShell>
  );
}
