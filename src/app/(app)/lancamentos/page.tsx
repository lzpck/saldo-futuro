import Link from "next/link";
import { Amount } from "@/components/amount";
import { FormLink } from "@/components/form-link";
import { BalanceChart } from "@/components/balance-chart";
import { ScrollToToday } from "@/components/scroll-to-today";
import { TransactionRow } from "@/components/transaction-list";
import { getDb } from "@/lib/db/connection";
import { formatDayHeader, monthBounds, monthLabel, shiftMonth, todayISO } from "@/lib/dates";
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
import { dailyBalances, groupByDay, lowestBalance, type DayBalance } from "@/lib/projection";
import { isSpendable, listAccounts } from "@/lib/repos/accounts";
import { listCategories } from "@/lib/repos/categories";
import { listSchedule } from "@/lib/repos/schedule";
import type { Transaction } from "@/lib/repos/transactions";
import { AccountOptions } from "@/components/account-options";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function totals(items: Transaction[], kind: "receita" | "despesa") {
  const mine = items.filter((t) => t.kind === kind);
  const sum = (status: Transaction["status"]) =>
    mine.filter((t) => t.status === status).reduce((s, t) => s + t.amountCents, 0);
  return { done: sum("efetivado"), planned: sum("previsto") };
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

  const projected = days.filter((d) => d.phase !== "real");
  const low = lowestBalance(projected.length ? projected : days);
  const endOfMonth = days.at(-1);

  const monthItems = listed.filter((t) => t.date >= from && t.date <= to);
  const income = totals(monthItems, "receita");
  const expense = totals(monthItems, "despesa");

  const link = (m: string) => `/lancamentos?${filtersToParams({ ...filters, month: m })}`;
  const pageLink = (n: number) => {
    const q = filtersToParams(filters);
    q.set("pagina", String(n));
    return `/lancamentos?${q}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Lançamentos</h1>
        <FormLink href="/lancamentos/novo" className="btn btn-primary">
          + Novo
        </FormLink>
      </div>

      {!searching && (
        <div className="flex items-center justify-between">
          <Link href={link(shiftMonth(month, -1))} className="btn px-3" aria-label="Mês anterior">
            ‹
          </Link>
          <p className="font-medium">{monthLabel(month)}</p>
          <Link href={link(shiftMonth(month, 1))} className="btn px-3" aria-label="Próximo mês">
            ›
          </Link>
        </div>
      )}

      {showBalance && (
        <section className="card space-y-4">
          <BalanceChart
            points={days.map((d) => ({ date: d.date, value: d.endBalanceCents, phase: d.phase }))}
          />
          <div className="grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
            <div>
              <p className="text-muted">{todayInMonth || month > today.slice(0, 7) ? "Saldo previsto no fim do mês" : "Saldo no fim do mês"}</p>
              <Amount cents={endOfMonth?.endBalanceCents ?? 0} className="text-lg font-semibold" />
            </div>
            <div>
              <p className="text-muted">{projected.length ? "Menor saldo projetado" : "Menor saldo do mês"}</p>
              <Amount cents={low?.endBalanceCents ?? 0} className={`text-lg font-semibold ${low && low.endBalanceCents < 0 ? "text-expense" : ""}`} />
              {low && <p className="text-xs text-muted">em {formatDayHeader(low.date)}</p>}
            </div>
          </div>
        </section>
      )}

      <details className="card py-3" open={filtered}>
        <summary className="cursor-pointer text-sm font-medium">Busca e filtros{filtered ? " (ativos)" : ""}</summary>
        <form className="mt-3 grid grid-cols-2 gap-3" method="get" role="search">
          {filters.month && <input type="hidden" name="mes" value={filters.month} />}
          <input
            type="search"
            name="q"
            defaultValue={filters.text}
            placeholder="Buscar na descrição"
            className="input col-span-2"
            aria-label="Buscar na descrição"
          />
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
          <input
            name="min"
            inputMode="decimal"
            defaultValue={filters.minCents !== null ? centsToInput(filters.minCents) : ""}
            placeholder="Valor mínimo"
            className="input"
            aria-label="Valor mínimo"
          />
          <input
            name="max"
            inputMode="decimal"
            defaultValue={filters.maxCents !== null ? centsToInput(filters.maxCents) : ""}
            placeholder="Valor máximo"
            className="input"
            aria-label="Valor máximo"
          />
          <label className="text-xs text-muted">
            De
            <input type="date" name="de" defaultValue={filters.from ?? ""} className="input mt-1" aria-label="Data inicial" />
          </label>
          <label className="text-xs text-muted">
            Até
            <input type="date" name="ate" defaultValue={filters.to ?? ""} className="input mt-1" aria-label="Data final" />
          </label>
          <select
            name="previstos"
            defaultValue={filters.includePlanned ? "1" : "0"}
            className="input col-span-2"
            aria-label="Previstos"
          >
            <option value="1">Incluir previstos</option>
            <option value="0">Só o que já aconteceu</option>
          </select>
          <button className="btn btn-primary">Filtrar</button>
          <Link href="/lancamentos" className="btn">
            Limpar filtros
          </Link>
        </form>
      </details>
      {filters.periodSwapped && (
        <p role="status" className="text-xs text-muted">As datas estavam invertidas; troquei “De” e “Até”.</p>
      )}
      {!searching && !showBalance && filtered && (
        <p className="text-xs text-muted">O saldo por dia some quando há filtro, porque a lista não mostra todo o fluxo.</p>
      )}

      {searching && !filters.to && filters.includePlanned && (
        <p className="text-xs text-muted">
          Sem data final, a busca olha até {monthLabel(shiftMonth(today.slice(0, 7), 12))}. Informe “Até” para ir além.
        </p>
      )}

      {searching && searchTotals ? (
        <div className="grid grid-cols-3 gap-3 text-sm" aria-label="Totais da busca">
          <div className="card py-3">
            <p className="text-muted">Receitas</p>
            <Amount cents={searchTotals.incomeCents} className="font-medium text-income" />
          </div>
          <div className="card py-3">
            <p className="text-muted">Despesas</p>
            <Amount cents={searchTotals.expenseCents} className="font-medium text-expense" />
          </div>
          <div className="card py-3">
            <p className="text-muted">Líquido</p>
            <Amount cents={searchTotals.netCents} className="font-medium" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="card py-3">
            <p className="text-muted">Receitas</p>
            <Amount cents={income.done} className="font-medium text-income" />
            {income.planned > 0 && (
              <p className="text-xs text-muted">+ <Amount cents={income.planned} /> previstas</p>
            )}
          </div>
          <div className="card py-3">
            <p className="text-muted">Despesas</p>
            <Amount cents={expense.done} className="font-medium text-expense" />
            {expense.planned > 0 && (
              <p className="text-xs text-muted">+ <Amount cents={expense.planned} /> previstas</p>
            )}
          </div>
        </div>
      )}

      {search ? (
        <>
          <p className="text-sm text-muted">
            {listed.length} {listed.length === 1 ? "resultado" : "resultados"}
          </p>
          {listed.length === 0 ? (
            <div className="card py-8 text-center text-sm text-muted">Nenhum lançamento encontrado.</div>
          ) : (
            <div className="space-y-3">
              {searchGroups.map((g) => (
                <section key={g.date} className="card py-3" aria-label={formatDayHeader(g.date)}>
                  <header className="border-b border-line pb-2">
                    <h2 className="text-sm font-medium">{formatDayHeader(g.date)}</h2>
                  </header>
                  <ul className="divide-y divide-line">
                    {g.items.map((t) => (
                      <TransactionRow key={t.id} t={t} actions />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
          {search.pages > 1 && (
            <nav className="flex items-center justify-between text-sm" aria-label="Paginação">
              {search.page > 1 ? (
                <Link href={pageLink(search.page - 1)} className="btn">
                  ‹ Anterior
                </Link>
              ) : (
                <span />
              )}
              <p className="text-muted">
                Página {search.page} de {search.pages}
              </p>
              {search.page < search.pages ? (
                <Link href={pageLink(search.page + 1)} className="btn">
                  Próxima ›
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      ) : groups.length === 0 ? (
        <div className="card py-8 text-center text-sm text-muted">Nenhum lançamento neste mês.</div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const isToday = g.date === today;
            const balance = balanceOf.get(g.date);
            return (
              <div key={g.date}>
                <section
                  id={isToday ? "hoje" : undefined}
                  className={`card scroll-mt-24 py-3 ${isToday ? "border-accent/60" : ""}`}
                  aria-label={formatDayHeader(g.date)}
                >
                  <header className="flex items-center justify-between border-b border-line pb-2">
                    <h2 className="flex items-center gap-2 text-sm font-medium">
                      {formatDayHeader(g.date)}
                      {isToday && (
                        <span className="rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-accent-fg">
                          Hoje
                        </span>
                      )}
                    </h2>
                    {balance && (
                      <p className="text-xs text-muted">
                        Saldo{" "}
                        <Amount
                          cents={balance.endBalanceCents}
                          className={`text-sm font-semibold ${balance.endBalanceCents < 0 ? "text-expense" : "text-fg"}`}
                        />
                      </p>
                    )}
                  </header>
                  {g.items.length === 0 ? (
                    <p className="py-3 text-sm text-muted">Nenhum lançamento hoje.</p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {g.items.map((t) => (
                        <TransactionRow key={t.id} t={t} actions />
                      ))}
                    </ul>
                  )}
                </section>
                {isToday && showBalance && (
                  <p className="my-3 flex items-center gap-3 text-xs uppercase tracking-wide text-muted" role="separator">
                    <span className="h-px flex-1 bg-line" />
                    Projeção
                    <span className="h-px flex-1 bg-line" />
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
      {!searching && todayInMonth && <ScrollToToday targetId="hoje" />}
    </div>
  );
}
