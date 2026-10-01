import Link from "next/link";
import { Amount } from "@/components/amount";
import { BalanceChart } from "@/components/balance-chart";
import { ScrollToToday } from "@/components/scroll-to-today";
import { TransactionRow } from "@/components/transaction-list";
import { getDb } from "@/lib/db/connection";
import {
  formatDayHeader,
  isYearMonth,
  monthBounds,
  monthLabel,
  shiftMonth,
  todayISO,
} from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { dailyBalances, groupByDay, lowestBalance, type DayBalance } from "@/lib/projection";
import { isCard, listAccounts } from "@/lib/repos/accounts";
import { budgetWarnings } from "@/lib/repos/budgets";
import { listCategories } from "@/lib/repos/categories";
import { listSchedule } from "@/lib/repos/schedule";
import type { Transaction } from "@/lib/repos/transactions";

type SearchParams = Promise<{ mes?: string; conta?: string; categoria?: string; orcamento?: string }>;

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
  const month = sp.mes && isYearMonth(sp.mes) ? sp.mes : today.slice(0, 7);
  const { from, to } = monthBounds(month);
  const accountId = sp.conta ? Number(sp.conta) : undefined;
  const categoryId = sp.categoria ? Number(sp.categoria) : undefined;
  const todayInMonth = today >= from && today <= to;

  const allAccounts = listAccounts(db, { includeArchived: true });
  const categories = listCategories(db, { includeArchived: true });
  const scope = accountId ? allAccounts.filter((a) => a.id === accountId) : allAccounts.filter((a) => !a.archived && !isCard(a));

  // Todo o histórico até o fim do mês: a projeção precisa dele para o saldo de abertura.
  const history = listSchedule(db, to, today);
  const touchesAccount = (t: Transaction) =>
    !accountId || t.accountId === accountId || t.toAccountId === accountId;
  // Filtrar por uma categoria principal inclui as subcategorias dela (é o que o relatório soma).
  const categoryIds = new Set(
    categoryId
      ? [categoryId, ...categories.filter((c) => c.parentId === categoryId).map((c) => c.id)]
      : [],
  );
  const listed = history.filter(
    (t) => touchesAccount(t) && (!categoryId || (t.categoryId !== null && categoryIds.has(t.categoryId))),
  );

  const groups = groupByDay(listed, { today, from, to });
  // Hoje sempre aparece no mês corrente, mesmo sem lançamentos, para marcar a divisória.
  if (todayInMonth && !groups.some((g) => g.date === today)) {
    groups.push({ date: today, items: [] });
    groups.sort((a, b) => a.date.localeCompare(b.date));
  }

  // Com filtro de categoria o saldo deixa de fazer sentido (a lista não é o fluxo todo).
  const showBalance = !categoryId;
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

  const warnedId = Number(sp.orcamento);
  const warnings = Number.isInteger(warnedId) && warnedId > 0 ? budgetWarnings(db, warnedId, month, today) : [];

  const link = (m: string) => {
    const q = new URLSearchParams({ mes: m });
    if (accountId) q.set("conta", String(accountId));
    if (categoryId) q.set("categoria", String(categoryId));
    return `/lancamentos?${q}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Lançamentos</h1>
        <Link href="/lancamentos/novo" className="btn btn-primary">
          + Novo
        </Link>
      </div>

      {warnings.length > 0 && (
        <div role="status" className="rounded-xl border border-expense/40 bg-expense/10 px-3.5 py-2.5 text-sm text-expense">
          {warnings.map((w) => (
            <p key={w.category.id}>
              <span aria-hidden>⛔ </span>
              {w.status!.level === "estourou" ? "Orçamento estourado" : "Orçamento vai estourar"} em {w.category.name}:{" "}
              {formatBRL(w.spentCents + w.plannedCents)} de {formatBRL(w.limitCents!)}.{" "}
              <Link href={`/orcamento?mes=${month}`} className="underline">
                Ver orçamento
              </Link>
            </p>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <Link href={link(shiftMonth(month, -1))} className="btn px-3" aria-label="Mês anterior">
          ‹
        </Link>
        <p className="font-medium">{monthLabel(month)}</p>
        <Link href={link(shiftMonth(month, 1))} className="btn px-3" aria-label="Próximo mês">
          ›
        </Link>
      </div>

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

      <form className="grid grid-cols-2 gap-3" method="get">
        <input type="hidden" name="mes" value={month} />
        <select name="conta" defaultValue={accountId ?? ""} className="input" aria-label="Filtrar por conta">
          <option value="">Todas as contas</option>
          {allAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select name="categoria" defaultValue={categoryId ?? ""} className="input" aria-label="Filtrar por categoria">
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.parentId ? "— " : ""}
              {c.name}
            </option>
          ))}
        </select>
        <button className="btn col-span-2">Filtrar</button>
      </form>
      {categoryId && (
        <p className="text-xs text-muted">O saldo por dia some quando há filtro de categoria, porque a lista não mostra todo o fluxo.</p>
      )}

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

      {groups.length === 0 ? (
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
      {todayInMonth && <ScrollToToday targetId="hoje" />}
    </div>
  );
}
