import Link from "next/link";
import { Amount } from "@/components/amount";
import { FormLink } from "@/components/form-link";
import { BalanceChart } from "@/components/balance-chart";
import { ScrollToToday } from "@/components/scroll-to-today";
import { FeedRow } from "@/components/feed-row";
import { MonthStepper, PageHeader, PageShell, PRIMARY_ACTION } from "@/components/page-shell";
import { getDb } from "@/lib/db/connection";
import { formatDateBR, formatDayHeader, monthBounds, monthLabel, shiftMonth, todayISO } from "@/lib/dates";
import {
  filterTransactions,
  filtersToParams,
  hasActiveFilters,
  isSearchMode,
  paginate,
  parseFilters,
  summarize,
} from "@/lib/filters";
import { centsToInput } from "@/lib/money";
import { dailyBalances, groupByDay, isOverdue, lowestBalance, type DayBalance } from "@/lib/projection";
import { isSpendable, listAccounts } from "@/lib/repos/accounts";
import { listCategories } from "@/lib/repos/categories";
import { invoicesDueInMonth, openInvoices } from "@/lib/repos/cards";
import { listWithOccurrences } from "@/lib/repos/recurrences";
import { listSchedule } from "@/lib/repos/schedule";
import type { Transaction } from "@/lib/repos/transactions";
import { AccountOptions } from "@/components/account-options";
import { MoneyInput } from "@/components/money-input";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function totals(items: Transaction[], kind: "receita" | "despesa") {
  const mine = items.filter((t) => t.kind === kind);
  const sum = (status: Transaction["status"]) =>
    mine.filter((t) => t.status === status).reduce((s, t) => s + t.amountCents, 0);
  // Compra prevista no cartão só vira saída de caixa na Fatura; contá-la aqui e na Fatura dobraria o gasto.
  const onCard = mine
    .filter((t) => t.status === "previsto" && t.accountKind === "cartao" && t.invoiceCardId === null)
    .reduce((s, t) => s + t.amountCents, 0);
  return { done: sum("efetivado"), planned: sum("previsto") - onCard, onCard };
}

export default async function TransactionsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const db = getDb();
  const today = todayISO();
  const filters = parseFilters(sp);
  const searching = isSearchMode(filters);
  const filtered = hasActiveFilters(filters);
  const month = filters.month ?? today.slice(0, 7);
  const { from, to } = monthBounds(month);
  const accountId = filters.accountId ?? undefined;
  const todayInMonth = today >= from && today <= to;

  const allAccounts = listAccounts(db, { includeArchived: true });
  const categories = listCategories(db, { includeArchived: true });
  const scope = accountId ? allAccounts.filter((a) => a.id === accountId) : allAccounts.filter((a) => !a.archived && isSpendable(a));

  // Busca sem "até": olha um ano à frente (ou só até hoje, sem previstos).
  const searchTo = filters.to ?? (filters.includePlanned ? monthBounds(shiftMonth(today.slice(0, 7), 12)).to : today);
  // Visão do mês: todo o histórico até o fim do mês, porque a projeção precisa dele para o saldo de abertura.
  const history = listSchedule(db, searching ? searchTo : to, today);
  const listed = filterTransactions(history, searching ? filters : { ...filters, from: null, to: null }, categories, today);

  const search = searching ? paginate(listed, filters.page) : null;
  const searchTotals = searching ? summarize(listed) : null;
  const searchGroups: { date: string; items: Transaction[] }[] = [];
  for (const t of search?.items ?? []) {
    const last = searchGroups.at(-1);
    if (last?.date === t.date) last.items.push(t);
    else searchGroups.push({ date: t.date, items: [t] });
  }

  const groups = searching ? [] : groupByDay(listed, { today, from, to });
  // Hoje sempre aparece no mês corrente, mesmo sem lançamentos, para marcar a divisória.
  if (!searching && todayInMonth && !groups.some((g) => g.date === today)) {
    groups.push({ date: today, items: [] });
    groups.sort((a, b) => a.date.localeCompare(b.date));
  }

  // Só o filtro de conta mantém o saldo: qualquer outro deixa a lista de ser o fluxo todo.
  const showBalance = !searching && !filters.categoryId && !filters.kind && !filters.status && filters.includePlanned;
  const days: DayBalance[] = showBalance
    ? dailyBalances({
        accounts: scope.map((a) => ({ id: a.id, initialBalanceCents: a.initialBalanceCents })),
        transactions: history,
        today,
        from,
        to,
      })
    : [];
  const balanceOf = new Map(days.map((d) => [d.date, d]));
  const prevBalance = new Map(days.map((d, i) => [d.date, i > 0 ? days[i - 1].endBalanceCents : undefined]));

  const projected = days.filter((d) => d.phase !== "real");
  const low = lowestBalance(projected.length ? projected : days);
  const endOfMonth = days.at(-1);

  const monthItems = listed.filter((t) => t.date >= from && t.date <= to);
  const income = totals(monthItems, "receita");
  const expense = totals(monthItems, "despesa");
  // Faturas saem do caixa no vencimento: entram nas saídas previstas. A aberta é só informativa (ADR 0003).
  const cardBase = showBalance ? listWithOccurrences(db, to) : [];
  const dueInvoices = showBalance ? invoicesDueInMonth(db, cardBase, { from, to }, today, accountId) : [];
  const openCycle = showBalance && todayInMonth ? openInvoices(db, cardBase, today, accountId) : [];
  const invoicesCents = dueInvoices.reduce((s, i) => s + i.remainingCents, 0);
  const plannedOut = expense.planned + invoicesCents;

  const onlyFuture = first(sp.futuros) === "1";
  const hideTransfers = first(sp.semtransf) === "1";
  const build = (over: Partial<typeof filters> = {}, flags: { futuros?: boolean; semtransf?: boolean; semcat?: boolean } = {}) => {
    const q = filtersToParams({ ...filters, ...over });
    if (flags.futuros ?? onlyFuture) q.set("futuros", "1");
    if (flags.semtransf ?? hideTransfers) q.set("semtransf", "1");
    if (flags.semcat ?? first(sp.semcat) === "1") q.set("semcat", "1");
    return `/lancamentos?${q}`;
  };
  const link = (m: string) => build({ month: m });
  const pageLink = (n: number) => {
    const q = filtersToParams(filters);
    q.set("pagina", String(n));
    return `/lancamentos?${q}`;
  };

  const todayBalance = days.find((d) => d.phase === "hoje") ?? null;
  const overdueCount = history.filter((t) => isOverdue(t, today)).length;
  const isUncategorized = (t: Transaction) => t.kind !== "transferencia" && t.categoryId === null && t.invoiceCardId === null;
  const uncategorizedCount = monthItems.filter(isUncategorized).length;
  const semCategoria = first(sp.semcat) === "1";
  const deficit = low && low.endBalanceCents < 0 ? low : null;
  const advancedOpen =
    filters.kind !== null || filters.status !== null || filters.categoryId !== null || filters.minCents !== null ||
    filters.maxCents !== null || filters.from !== null || filters.to !== null || !filters.includePlanned;
  const accountLink = (id: number | null) => build({ accountId: id });
  const overdueLink = build({ status: filters.status === "atrasado" ? null : "atrasado" });
  const kindLink = (k: "receita" | "despesa") => build({ kind: filters.kind === k ? null : k });
  const semCatLink = build({}, { semcat: !semCategoria });
  // Categorias mais usadas no mês, como atalho de filtro.
  const catCount = new Map<number, number>();
  for (const t of monthItems) if (t.categoryId !== null) catCount.set(t.categoryId, (catCount.get(t.categoryId) ?? 0) + 1);
  const topCategories = [...catCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id]) => categories.find((c) => c.id === id))
    .filter((c) => c !== undefined);

  // Semanas do design: 1–7, 8–14, 15–21 e 22 em diante. Dias vazios somem (menos hoje).
  const visibleGroups = groups
    .filter((g) => !onlyFuture || g.date >= today)
    .map((g) => ({
      ...g,
      items: g.items.filter((t) => (!hideTransfers || t.kind !== "transferencia") && (!semCategoria || isUncategorized(t))),
    }))
    .filter((g) => g.items.length > 0 || g.date === today);
  const weeks: { n: number; start: number; end: number; days: typeof visibleGroups }[] = [];
  for (const g of visibleGroups) {
    const n = Math.min(Math.ceil(Number(g.date.slice(8)) / 7), 4);
    let w = weeks.find((x) => x.n === n);
    if (!w) {
      w = { n, start: (n - 1) * 7 + 1, end: n === 4 ? Number(to.slice(8)) : n * 7, days: [] };
      weeks.push(w);
    }
    w.days.push(g);
  }
  const flowOf = (t: Transaction) => (t.kind === "despesa" ? -t.amountCents : t.kind === "receita" ? t.amountCents : 0);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const [ty, tm, td] = today.split("-").map(Number);
  const todayDate = new Date(ty, tm - 1, td);
  const todayShort = `${td} de ${todayDate.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}`;
  const todayLong = cap(todayDate.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }).replace(/^(\S+), (\d+) de (\S+)$/, (_, w, d, m) => `${w}, ${d} de ${cap(m)}`));
  const monthName = cap(monthLabel(month));
  const pad = (n: number) => String(n).padStart(2, "0");
  const dot = ["bg-primary", "bg-secondary", "bg-tertiary-container", "bg-surface-bright", "bg-primary-fixed"];
  const chipBase = "flex items-center gap-1.5 rounded-full px-3 py-1 font-label-md text-label-md transition-colors";
  const chipOff = `${chipBase} bg-surface-container text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface`;
  const chipOn = `${chipBase} bg-surface-container-high font-semibold text-primary shadow-sm`;
  const iconCls = "material-symbols-outlined";
  const monthResult = income.done - expense.done;

  return (
    <PageShell>
      <PageHeader
        title="Lançamentos"
        subtitle={searching ? "Resultado da busca" : undefined}
        actions={
          <>
            {!searching && <MonthStepper label={monthName} prevHref={link(shiftMonth(month, -1))} nextHref={link(shiftMonth(month, 1))} />}
            <FormLink href="/lancamentos/novo" className={PRIMARY_ACTION}>
              <span className={`${iconCls} text-body-lg font-bold`}>add</span>
              <span>Novo Lançamento</span>
            </FormLink>
          </>
        }
      >
        {!searching && (
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={todayInMonth ? "#hoje" : build({ month: null })}
              className="flex items-center gap-1.5 rounded-lg bg-surface-container-low px-3.5 py-1.5 font-label-md text-label-md text-primary shadow-sm transition-all hover:bg-surface-container-high active:scale-95"
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              <span>Hoje ({todayShort})</span>
            </Link>
            <div className="flex items-center rounded-xl bg-surface-container-low p-1 shadow-sm" role="group" aria-label="Escopo da lista">
              <Link href={build({}, { futuros: false })} className={`rounded-lg px-3.5 py-1.5 font-label-md text-label-md transition-all ${!onlyFuture ? "bg-primary-container font-semibold text-on-primary shadow-sm" : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"}`}>
                Todos os Lançamentos
              </Link>
              <Link href={build({}, { futuros: true })} className={`rounded-lg px-3.5 py-1.5 font-label-md text-label-md transition-all ${onlyFuture ? "bg-primary-container font-semibold text-on-primary shadow-sm" : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"}`}>
                Apenas de Hoje em Diante
              </Link>
            </div>
          </div>
        )}
      </PageHeader>

      {/* Curva de projeção e liquidez futura */}
      {showBalance && (
        <section className="relative flex flex-col gap-6 overflow-hidden rounded-xl bg-surface-container p-5 shadow-md lg:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container-low text-primary">
                <span className={iconCls}>query_stats</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-headline-md text-headline-md text-on-surface">Curva de Projeção &amp; Liquidez Futura</h2>
                  <span className="rounded-full bg-surface-container px-2 py-0.5 font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">Janela {days.length} Dias</span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Trajetória preditiva diária considerando saldos atuais, receitas garantidas e fechamento de faturas</p>
              </div>
            </div>
            {deficit && (
              <div className="flex items-center gap-2 rounded-lg bg-error-container/40 px-3.5 py-1.5 text-error shadow-sm">
                <span className={`${iconCls} text-body-lg text-error`}>warning</span>
                <span className="font-label-md text-label-md font-semibold">Alerta de Déficit: Vale Crítico projetado em {formatDateBR(deficit.date).slice(0, 5)}</span>
              </div>
            )}
          </div>

          <div className={`grid grid-cols-1 gap-4 ${todayBalance ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
            {todayBalance && (
              <div className="flex flex-col justify-between rounded-lg bg-surface-container-low p-4 shadow-sm">
                <div className="flex items-center justify-between text-on-surface-variant">
                  <span className="font-label-md text-label-md">Saldo Bancário Atual</span>
                  <span className={`${iconCls} text-body-lg text-primary`}>account_balance_wallet</span>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <Amount cents={todayBalance.endBalanceCents} className={`font-headline-xl text-headline-xl ${todayBalance.endBalanceCents < 0 ? "text-error" : "text-on-surface"}`} />
                  <span className="font-label-sm text-label-sm font-semibold text-primary">Disponível em contas</span>
                </div>
                <div className="mt-2 flex items-center gap-1.5 font-body-sm text-label-sm text-on-surface-variant">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Reconciliado até {todayShort.replace(/^(\d+) de (\S+)$/, (_, d, m) => `${d} de ${cap(m)}`)}
                </div>
              </div>
            )}
            <div className="flex flex-col justify-between rounded-lg bg-surface-container-low p-4 shadow-sm">
              <div className="flex items-center justify-between text-on-surface-variant">
                <span className="font-label-md text-label-md">
                  {todayInMonth || month > today.slice(0, 7) ? "Previsto ao fim do mês" : "Saldo no fim do mês"} ({endOfMonth ? formatDateBR(endOfMonth.date).slice(0, 5) : ""})
                </span>
                <span className={`${iconCls} text-body-lg text-secondary`}>event_available</span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <Amount cents={endOfMonth?.endBalanceCents ?? 0} className={`font-headline-xl text-headline-xl ${(endOfMonth?.endBalanceCents ?? 0) < 0 ? "text-error" : "text-primary"}`} />
                {todayBalance && todayBalance.endBalanceCents !== endOfMonth?.endBalanceCents && (
                  <Amount cents={todayBalance.endBalanceCents} className="font-label-sm text-label-sm text-on-surface-variant line-through" />
                )}
              </div>
              <div className="mt-2 flex items-center gap-1 font-body-sm text-label-sm text-on-surface-variant">
                <span className={`${iconCls} text-[14px] text-primary`}>add_circle</span>
                {income.planned > 0 || expense.planned > 0 ? (
                  <span>
                    Previstos no mês: + <Amount cents={income.planned} /> · − <Amount cents={expense.planned} />
                  </span>
                ) : (
                  <span>Sem previstos no restante do mês</span>
                )}
              </div>
            </div>
            <div className="relative flex flex-col justify-between overflow-hidden rounded-lg bg-surface-container-low p-4 shadow-sm">
              <div className="flex items-center justify-between text-on-surface-variant">
                <span className={`font-label-md text-label-md ${deficit ? "text-error" : ""}`}>{projected.length ? "Menor Saldo Projetado" : "Menor Saldo do Mês"}</span>
                {deficit && <span className="rounded bg-error-container px-2 py-0.5 font-label-sm text-label-sm font-bold text-on-error-container">Atenção ao fluxo</span>}
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <Amount cents={low?.endBalanceCents ?? 0} className={`font-headline-xl text-headline-xl ${deficit ? "text-error" : "text-on-surface"}`} />
                {low && <span className={`font-label-sm text-label-sm font-semibold ${deficit ? "text-error" : "text-on-surface-variant"}`}>{formatDayHeader(low.date)}</span>}
              </div>
              <div className="mt-2 flex items-center gap-1 font-body-sm text-label-sm text-on-surface-variant">
                <span className={`${iconCls} text-[14px] ${deficit ? "text-error" : "text-primary"}`}>south_east</span>
                {plannedOut > 0 ? <span>Saídas previstas no mês: − <Amount cents={plannedOut} /></span> : <span>Sem saídas previstas no mês</span>}
              </div>
              {dueInvoices.length > 0 && (
                <ul className="mt-1 flex flex-col gap-0.5 font-body-sm text-label-sm text-on-surface-variant" aria-label="Faturas a pagar no mês">
                  {dueInvoices.map((i) => (
                    <li key={`${i.cardId}-${i.dueDate}`} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1">
                        <span className={`${iconCls} text-[14px]`}>credit_card</span>
                        Fatura {i.cardName} · {i.overdue ? "venceu" : "vence"} {formatDateBR(i.dueDate).slice(0, 5)}
                      </span>
                      <span className={i.overdue ? "font-semibold text-error" : ""}>− <Amount cents={i.remainingCents} /></span>
                    </li>
                  ))}
                </ul>
              )}
              {openCycle.length > 0 && (
                <ul className="mt-2 flex flex-col gap-0.5 border-t border-outline-variant/30 pt-2 font-body-sm text-label-sm text-on-surface-variant" aria-label="Faturas abertas">
                  {openCycle.map((i) => (
                    <li key={i.cardId} className="flex items-center justify-between gap-2">
                      <span>Fatura aberta {i.cardName} · vence {formatDateBR(i.dueDate).slice(0, 5)}</span>
                      <span><Amount cents={i.totalCents} /></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-lg bg-surface-container-low p-5 shadow-inner">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 font-label-md text-label-md text-on-surface-variant">
              <div className="flex flex-wrap items-center gap-4">
                <span className="flex items-center gap-1.5"><span className="h-1 w-3 rounded bg-primary" /> Saldo Superavitário</span>
                <span className="flex items-center gap-1.5"><span className="h-1 w-3 rounded bg-error" /> Saldo Deficitário Projetado</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-secondary" /> Eventos Chave</span>
              </div>
              <div className="font-label-sm text-label-sm">
                Linha de corte zero: <span className="font-semibold text-on-surface">R$ 0,00</span>
              </div>
            </div>
            <BalanceChart points={days.map((d) => ({ date: d.date, value: d.endBalanceCents, phase: d.phase }))} />
          </div>
        </section>
      )}

      {/* Filtro rápido por natureza financeira */}
      {searching && searchTotals ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3" aria-label="Totais da busca">
          <div className="rounded-xl bg-surface-container p-4 shadow-md">
            <p className="font-label-md text-label-md text-on-surface-variant">Receitas</p>
            <Amount cents={searchTotals.incomeCents} className="mt-3 block font-headline-lg text-headline-lg font-bold text-primary" />
          </div>
          <div className="rounded-xl bg-surface-container p-4 shadow-md">
            <p className="font-label-md text-label-md text-on-surface-variant">Despesas</p>
            <Amount cents={searchTotals.expenseCents} className="mt-3 block font-headline-lg text-headline-lg font-bold text-tertiary" />
          </div>
          <div className="rounded-xl bg-surface-container p-4 shadow-md">
            <p className="font-label-md text-label-md text-on-surface-variant">Líquido</p>
            <Amount cents={searchTotals.netCents} className="mt-3 block font-headline-lg text-headline-lg font-bold text-on-surface" />
          </div>
        </div>
      ) : (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Filtro Rápido por Natureza Financeira</h3>
            <Link
              href={build({}, { semtransf: !hideTransfers })}
              aria-pressed={hideTransfers}
              className="group flex cursor-pointer select-none items-center gap-2.5 rounded-lg bg-surface-container-low px-3.5 py-1.5"
            >
              <span className={`flex h-4 w-4 items-center justify-center rounded ${hideTransfers ? "bg-primary text-on-primary" : "bg-surface-container"}`}>
                {hideTransfers && <span className={`${iconCls} text-[14px] font-bold`}>check</span>}
              </span>
              <span className="flex items-center gap-1.5 font-label-md text-label-md text-on-surface-variant transition-colors group-hover:text-on-surface">
                <span className={`${iconCls} text-[16px] text-secondary`}>swap_horiz</span>
                Ocultar Transferências Internas
              </span>
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Link href={kindLink("receita")} aria-label="Filtrar só receitas" className={`group w-full rounded-xl bg-surface-container p-4 text-left shadow-sm transition-all hover:bg-surface-container-high focus:outline-none focus:ring-2 focus:ring-primary/40 ${filters.kind === "receita" ? "ring-2 ring-primary/60" : ""}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><span className={`${iconCls} text-body-md`}>arrow_downward</span></span>
                  <span className="font-label-md text-label-md text-on-surface-variant group-hover:text-on-surface">Total Receitas</span>
                </div>
                <span className="rounded bg-surface-container px-2 py-0.5 font-label-sm text-label-sm font-semibold text-primary group-hover:bg-primary-container group-hover:text-on-primary">{filters.kind === "receita" ? "Limpar" : "Filtrar"}</span>
              </div>
              <div className="mt-3">
                <div className="font-headline-lg text-headline-lg font-bold text-primary">+<Amount cents={income.done} /></div>
                <div className="mt-1 font-body-sm text-label-sm text-on-surface-variant">{income.planned > 0 ? <>+ <Amount cents={income.planned} /> previstos</> : "Nenhuma receita prevista"}</div>
              </div>
            </Link>
            <Link href={kindLink("despesa")} aria-label="Filtrar só despesas" className={`group w-full rounded-xl bg-surface-container p-4 text-left shadow-sm transition-all hover:bg-surface-container-high focus:outline-none focus:ring-2 focus:ring-tertiary-container/40 ${filters.kind === "despesa" ? "ring-2 ring-tertiary-container/60" : ""}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-tertiary-container/20 text-tertiary"><span className={`${iconCls} text-body-md`}>arrow_upward</span></span>
                  <span className="font-label-md text-label-md text-on-surface-variant group-hover:text-on-surface">Total Despesas</span>
                </div>
                <span className="rounded bg-surface-container px-2 py-0.5 font-label-sm text-label-sm font-semibold text-tertiary group-hover:bg-tertiary-container group-hover:text-on-tertiary-container">{filters.kind === "despesa" ? "Limpar" : "Filtrar"}</span>
              </div>
              <div className="mt-3">
                <div className="font-headline-lg text-headline-lg font-bold text-tertiary">−<Amount cents={expense.done} /></div>
                <div className="mt-1 font-body-sm text-label-sm text-on-surface-variant">{expense.planned > 0 ? <>− <Amount cents={expense.planned} /> previstos</> : "Nenhuma despesa prevista"}</div>
                {expense.onCard > 0 && (
                  <div className="mt-1 font-body-sm text-label-sm text-on-surface-variant">
                    <Amount cents={expense.onCard} /> em compras no cartão, que saem só na fatura
                  </div>
                )}
              </div>
            </Link>
            <div className="group w-full rounded-xl bg-surface-container p-4 text-left shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-container-highest text-secondary"><span className={`${iconCls} text-body-md`}>balance</span></span>
                  <span className="font-label-md text-label-md text-on-surface-variant">Resultado Operacional</span>
                </div>
                <span className={`rounded px-2 py-0.5 font-label-sm text-label-sm font-semibold ${monthResult >= 0 ? "bg-primary/10 text-primary" : "bg-tertiary-container/20 text-tertiary"}`}>{monthResult >= 0 ? "Superávit" : "Déficit"}</span>
              </div>
              <div className="mt-3">
                <div className="font-headline-lg text-headline-lg font-bold text-on-surface">{monthResult > 0 && "+"}<Amount cents={monthResult} /></div>
                <div className={`mt-1 flex items-center gap-1 font-body-sm text-label-sm font-semibold ${monthResult >= 0 ? "text-primary" : "text-tertiary"}`}>
                  <span className={`${iconCls} text-[14px]`}>{monthResult >= 0 ? "trending_up" : "trending_down"}</span>
                  {monthResult >= 0 ? "Saldo positivo acumulado em" : "Saldo negativo acumulado em"} {monthName.split(" ")[0]}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Busca e chips de filtro */}
      <form className="flex flex-col gap-3 rounded-xl bg-surface-container-low p-4 shadow-md" method="get" role="search">
        {filters.month && <input type="hidden" name="mes" value={filters.month} />}
        {onlyFuture && <input type="hidden" name="futuros" value="1" />}
        {hideTransfers && <input type="hidden" name="semtransf" value="1" />}
        {semCategoria && <input type="hidden" name="semcat" value="1" />}
        <div className="relative w-full">
          <span className={`${iconCls} pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-body-lg text-on-surface-variant`}>search</span>
          <input
            type="search"
            name="q"
            defaultValue={filters.text}
            placeholder="Buscar por descrição..."
            aria-label="Buscar na descrição"
            className="w-full rounded-lg bg-surface-container py-2.5 pl-11 pr-10 font-body-md text-body-md text-on-surface shadow-inner outline-none placeholder:text-outline focus:ring-2 focus:ring-primary [&::-webkit-search-cancel-button]:hidden"
          />
          {filters.text && (
            <Link href={build({ text: "" })} aria-label="Limpar busca" className="absolute right-3.5 top-1/2 -translate-y-1/2 text-body-md text-on-surface-variant hover:text-on-surface">
              <span className={iconCls}>close</span>
            </Link>
          )}
          <button className="sr-only">Filtrar</button>
        </div>

        <input type="checkbox" id="mais-filtros" defaultChecked={advancedOpen} className="peer sr-only" />
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 font-label-sm text-label-sm font-semibold uppercase text-outline">Contas:</span>
            <Link href={accountLink(null)} className={`${accountId === undefined ? chipOn : chipOff} px-3 py-1`}>
              Todas
            </Link>
            {allAccounts
              .filter((a) => !a.archived && isSpendable(a))
              .map((a, i) => (
                <Link key={a.id} href={accountLink(a.id)} className={accountId === a.id ? chipOn : chipOff}>
                  <span className={`h-2 w-2 rounded-full ${dot[i % dot.length]}`} />
                  {a.name}
                </Link>
              ))}
            <div className="mx-1 h-5 w-px bg-surface-container-highest" />
            <Link href={overdueLink} className={`${chipBase} ${filters.status === "atrasado" ? "bg-surface-container-high" : "bg-surface-container"} text-error hover:bg-error-container/20`}>
              <span className={`${iconCls} text-[14px]`}>pending_actions</span>
              Pendentes de Confirmação ({overdueCount})
            </Link>
            <Link href={semCatLink} className={`${chipBase} ${semCategoria ? "bg-surface-container-high" : "bg-surface-container"} text-tertiary hover:bg-surface-container-high`}>
              <span className={`${iconCls} text-[14px]`}>label_off</span>
              Sem Categoria ({uncategorizedCount})
            </Link>
          </div>
          <div className="flex items-center gap-3">
            {filtered && (
              <Link href="/lancamentos" className="font-label-sm text-label-sm text-primary hover:underline">
                Limpar filtros
              </Link>
            )}
            <label htmlFor="mais-filtros" className="flex cursor-pointer items-center gap-1 rounded-lg bg-surface-container px-3 py-1 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container-high peer-focus-visible:ring-2 peer-focus-visible:ring-primary">
              <span className={`${iconCls} text-body-md`}>tune</span>
              <span>Mais Filtros</span>
            </label>
          </div>
        </div>

        {topCategories.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 font-label-sm text-label-sm font-semibold uppercase text-outline">Categorias:</span>
            {topCategories.map((c) => (
              <Link key={c.id} href={build({ categoryId: filters.categoryId === c.id ? null : c.id })} className={filters.categoryId === c.id ? chipOn : chipOff}>
                {c.name}
              </Link>
            ))}
          </div>
        )}

        <div className="hidden flex-wrap items-center gap-4 border-t border-surface-container-highest/40 pt-3 peer-checked:flex">
          <div className="grid w-full grid-cols-2 gap-3 md:grid-cols-4">
            <select name="tipo" defaultValue={filters.kind ?? ""} className="input" aria-label="Filtrar por tipo">
              <option value="">Todos os tipos</option>
              <option value="receita">Receita</option>
              <option value="despesa">Despesa</option>
              <option value="transferencia">Transferência</option>
            </select>
            <select name="situacao" defaultValue={filters.status ?? ""} className="input" aria-label="Filtrar por situação">
              <option value="">Todas as situações</option>
              <option value="previsto">Previsto</option>
              <option value="efetivado">Efetivado</option>
              <option value="atrasado">Em atraso</option>
            </select>
            <select name="conta" defaultValue={accountId ?? ""} className="input" aria-label="Filtrar por conta">
              <option value="">Todas as contas</option>
              <AccountOptions accounts={allAccounts} />
            </select>
            <select name="categoria" defaultValue={filters.categoryId ?? ""} className="input" aria-label="Filtrar por categoria">
              <option value="">Todas as categorias</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parentId ? "— " : ""}
                  {c.name}
                </option>
              ))}
            </select>
            <MoneyInput name="min" defaultValue={filters.minCents !== null ? centsToInput(filters.minCents) : ""} placeholder="Valor mínimo" className="input" aria-label="Valor mínimo" />
            <MoneyInput name="max" defaultValue={filters.maxCents !== null ? centsToInput(filters.maxCents) : ""} placeholder="Valor máximo" className="input" aria-label="Valor máximo" />
            <label className="font-label-sm text-label-sm text-on-surface-variant">
              De
              <input type="date" name="de" defaultValue={filters.from ?? ""} className="input mt-1" aria-label="Data inicial" />
            </label>
            <label className="font-label-sm text-label-sm text-on-surface-variant">
              Até
              <input type="date" name="ate" defaultValue={filters.to ?? ""} className="input mt-1" aria-label="Data final" />
            </label>
            <select name="previstos" defaultValue={filters.includePlanned ? "1" : "0"} className="input col-span-2" aria-label="Previstos">
              <option value="1">Incluir previstos</option>
              <option value="0">Só o que já aconteceu</option>
            </select>
            <button className="rounded-lg bg-primary-container px-4 py-2 font-label-md text-label-md font-semibold text-on-primary transition hover:opacity-95">Aplicar filtros</button>
          </div>
        </div>
      </form>
      {filters.periodSwapped && (
        <p role="status" className="font-label-sm text-label-sm text-on-surface-variant">As datas estavam invertidas; troquei “De” e “Até”.</p>
      )}
      {!searching && !showBalance && filtered && (
        <p className="font-label-sm text-label-sm text-on-surface-variant">O saldo por dia some quando há filtro, porque a lista não mostra todo o fluxo.</p>
      )}
      {searching && !filters.to && filters.includePlanned && (
        <p className="font-label-sm text-label-sm text-on-surface-variant">
          Sem data final, a busca olha até {monthLabel(shiftMonth(today.slice(0, 7), 12))}. Informe “Até” para ir além.
        </p>
      )}

      {/* Lista */}
      {search ? (
        <div className="flex flex-col gap-4" aria-label="Lista de lançamentos">
          <p className="px-2 font-body-sm text-body-sm text-on-surface-variant">
            {listed.length} {listed.length === 1 ? "resultado" : "resultados"}
          </p>
          {listed.length === 0 ? (
            <div className="rounded-xl bg-surface-container-low py-8 text-center font-body-sm text-body-sm text-on-surface-variant">Nenhum lançamento encontrado.</div>
          ) : (
            searchGroups.map((g) => (
              <section key={g.date} className="flex flex-col gap-2" aria-label={formatDayHeader(g.date)}>
                <header className="flex items-center gap-2 px-2 py-1">
                  <h2 className="font-label-md text-label-md font-bold uppercase tracking-wider text-on-surface">{formatDayHeader(g.date)}</h2>
                  <span className="rounded bg-surface-container px-2 py-0.5 font-label-sm text-label-sm text-on-surface-variant">
                    {g.items.length} {g.items.length === 1 ? "lançamento" : "lançamentos"}
                  </span>
                </header>
                <ul className="flex flex-col gap-1.5 rounded-xl bg-surface-container-low p-2 shadow-sm">
                  {g.items.map((t) => (
                    <FeedRow key={t.id} t={t} />
                  ))}
                </ul>
              </section>
            ))
          )}
          {search.pages > 1 && (
            <nav className="flex items-center justify-between font-body-sm text-body-sm" aria-label="Paginação">
              {search.page > 1 ? (
                <Link href={pageLink(search.page - 1)} className="rounded-lg bg-surface-container px-4 py-2 text-on-surface hover:bg-surface-container-high">
                  ‹ Anterior
                </Link>
              ) : (
                <span />
              )}
              <p className="text-on-surface-variant">
                Página {search.page} de {search.pages}
              </p>
              {search.page < search.pages ? (
                <Link href={pageLink(search.page + 1)} className="rounded-lg bg-surface-container px-4 py-2 text-on-surface hover:bg-surface-container-high">
                  Próxima ›
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </div>
      ) : weeks.length === 0 ? (
        <div className="rounded-xl bg-surface-container-low py-8 text-center font-body-sm text-body-sm text-on-surface-variant">Nenhum lançamento neste mês.</div>
      ) : (
        <div className="flex flex-col gap-6" aria-label="Lista de lançamentos">
          {weeks.map((w) => {
            const items = w.days.flatMap((d) => d.items);
            const subtotal = items.reduce((sum, t) => sum + flowOf(t), 0);
            const lastDay = w.days.at(-1)?.date;
            const endBalance = showBalance && lastDay ? [...days].reverse().find((d) => d.date <= lastDay) : undefined;
            return (
              <section key={w.n} className="flex flex-col gap-2" aria-label={`Semana ${w.n}`}>
                <header className="flex flex-wrap items-center justify-between gap-2 px-2 py-1 text-on-surface-variant">
                  <div className="flex items-center gap-2">
                    <h2 className="font-label-md text-label-md font-bold uppercase tracking-wider text-on-surface">
                      Semana {w.n} · {pad(w.start)} a {pad(w.end)} de {monthName.split(" ")[0]}
                    </h2>
                    <span className="rounded bg-surface-container px-2 py-0.5 font-label-sm text-label-sm">
                      {items.length} {items.length === 1 ? "lançamento" : "lançamentos"}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 font-label-md text-label-md">
                    <span>
                      Subtotal: <strong className={`font-semibold ${subtotal < 0 ? "text-tertiary" : "text-primary"}`}>{subtotal > 0 && "+"}<Amount cents={subtotal} /></strong>
                    </span>
                    {endBalance && (
                      <span>
                        Saldo ao fim: <strong className={`font-semibold ${endBalance.endBalanceCents < 0 ? "text-error" : "text-on-surface"}`}><Amount cents={endBalance.endBalanceCents} /></strong>
                      </span>
                    )}
                  </div>
                </header>
                <div className="flex flex-col gap-1.5 rounded-xl bg-surface-container-low p-2 shadow-sm">
                  {w.days.map((g) => {
                    if (g.date !== today) {
                      const bal = balanceOf.get(g.date);
                      return (
                        <div key={g.date}>
                          <ul className="flex flex-col gap-1.5">
                            {g.items.map((t) => (
                              <FeedRow key={t.id} t={t} />
                            ))}
                          </ul>
                          {/* O saldo só aparece quando o dia o mudou. */}
                          {bal && bal.endBalanceCents !== prevBalance.get(g.date) && (
                            <p className="px-3 pt-1 text-right font-label-sm text-label-sm text-outline">
                              Saldo ao fim do dia <Amount cents={bal.endBalanceCents} className={`font-semibold ${bal.endBalanceCents < 0 ? "text-error" : "text-on-surface-variant"}`} />
                            </p>
                          )}
                        </div>
                      );
                    }
                    const balance = balanceOf.get(g.date);
                    return (
                      <div key={g.date} id="hoje" className="flex scroll-mt-28 flex-col gap-1.5" aria-label={formatDayHeader(g.date)}>
                        <div className="my-2 flex items-center justify-between rounded-xl bg-surface-container-high p-3.5 shadow-md">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-bold text-on-primary">
                              <span className={`${iconCls} text-body-lg`}>today</span>
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-headline-md text-body-md font-bold text-on-surface">Hoje · {todayLong}</span>
                                <span className="rounded-full bg-primary-container px-2 py-0.5 font-label-sm text-label-sm font-bold uppercase tracking-wider text-on-primary">Marco Temporal</span>
                              </div>
                              <div className="font-label-sm text-label-sm text-on-surface-variant">
                                Todos os lançamentos anteriores impactaram seu saldo atual
                                {balance && (
                                  <>
                                    {" de "}
                                    <strong className="text-on-surface"><Amount cents={balance.endBalanceCents} /></strong>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="hidden items-center gap-1.5 font-label-md text-label-md font-semibold text-primary sm:flex">
                            <span className="relative flex h-2 w-2">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                            </span>
                            Ponto focal de liquidez
                          </div>
                        </div>
                        {g.items.length === 0 ? (
                          <p className="px-3 py-2 font-body-sm text-body-sm text-on-surface-variant">Nenhum lançamento hoje.</p>
                        ) : (
                          <ul className="flex flex-col gap-1.5">
                            {g.items.map((t) => (
                              <FeedRow key={t.id} t={t} />
                            ))}
                          </ul>
                        )}
                        {showBalance && (
                          <p className="my-3 flex items-center gap-3 font-label-sm text-label-sm uppercase tracking-wide text-on-surface-variant" role="separator">
                            <span className="h-px flex-1 bg-surface-container-highest" />
                            Projeção
                            <span className="h-px flex-1 bg-surface-container-highest" />
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {!searching && todayInMonth && <ScrollToToday targetId="hoje" />}

      <FormLink
        href="/lancamentos/novo"
        aria-label="Adicionar nova transação"
        className="fixed bottom-20 right-7 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary-container text-on-primary shadow-xl shadow-primary-container/30 transition-all hover:scale-105 focus:outline-none focus:ring-4 focus:ring-primary-container/40 active:scale-95 md:bottom-7"
      >
        <span className={`${iconCls} text-3xl font-bold`}>add</span>
      </FormLink>
    </PageShell>
  );
}
