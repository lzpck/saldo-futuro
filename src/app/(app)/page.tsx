import Link from "next/link";
import { FormLink } from "@/components/form-link";
import { Amount } from "@/components/amount";
import { BudgetBar, LEVEL } from "@/components/budget-bar";
import { OpenInvoice } from "@/components/open-invoice";
import { TransactionList, TransactionRow } from "@/components/transaction-list";
import { getDb } from "@/lib/db/connection";
import { formatDateBR, formatDayHeader, monthBounds, todayISO } from "@/lib/dates";
import { addDays, dailyBalances, lowestBalance, openItems } from "@/lib/projection";
import { ACCOUNT_KIND_LABEL, isCard, isSavings, isSpendable, listAccounts, savedBalanceCents, totalBalanceCents } from "@/lib/repos/accounts";
import { monthBudgets } from "@/lib/repos/budgets";
import { cardInvoices } from "@/lib/repos/cards";
import { listWithOccurrences } from "@/lib/repos/recurrences";
import { listSchedule } from "@/lib/repos/schedule";
import { listTransactions, type Transaction } from "@/lib/repos/transactions";

export default function DashboardPage() {
  const db = getDb();
  const everything = listAccounts(db);
  const accounts = everything.filter(isSpendable);
  const savings = everything.filter(isSavings);
  const cards = everything.filter(isCard);
  const total = totalBalanceCents(accounts);
  const saved = savedBalanceCents(savings);
  const month = todayISO().slice(0, 7);
  const monthTx = listTransactions(db, { from: `${month}-01`, to: `${month}-31` }).filter(
    (t) => t.status === "efetivado",
  );
  const income = monthTx.filter((t) => t.kind === "receita").reduce((s, t) => s + t.amountCents, 0);
  const expense = monthTx.filter((t) => t.kind === "despesa").reduce((s, t) => s + t.amountCents, 0);
  const recent = listTransactions(db, { status: "efetivado", limit: 8 });

  const today = todayISO();
  const { to: monthEnd } = monthBounds(month);
  const horizon = 14;
  const reach = addDays(today, horizon) > monthEnd ? addDays(today, horizon) : monthEnd;
  const scheduled = listSchedule(db, reach, today);
  const open = openItems(scheduled, today, horizon);
  const days = dailyBalances({
    accounts: accounts.map((a) => ({ id: a.id, initialBalanceCents: a.initialBalanceCents })),
    transactions: scheduled,
    today,
    from: today,
    to: monthEnd,
  });
  // Primeira fatura com valor em aberto de cada cartão.
  const cardBase = cards.length ? listWithOccurrences(db, addDays(today, 400)) : [];
  const invoicesByCard = new Map(cards.map((c) => [c.id, cardInvoices(db, c, cardBase, today)]));
  const nextInvoice = new Map(
    cards.map((c) => [c.id, invoicesByCard.get(c.id)!.find((i) => i.remainingCents > 0)]),
  );
  // Faturas no painel: o pagamento previsto vira a fatura expansível; a próxima de cada cartão que vence depois do horizonte fica à parte.
  const invoiceOf = (t: Transaction) =>
    t.invoiceCardId === null ? undefined : invoicesByCard.get(t.invoiceCardId)?.find((i) => i.closingDate === t.invoiceClosing);
  const openRow = (t: Transaction) => {
    const inv = invoiceOf(t);
    const card = cards.find((c) => c.id === t.invoiceCardId);
    return inv && card?.closingDay != null ? (
      <OpenInvoice key={t.id} inv={inv} cardName={card.name} closingDay={card.closingDay} today={today} canPay />
    ) : (
      <TransactionRow key={t.id} t={t} actions />
    );
  };
  const farLimit = addDays(today, horizon);
  const laterInvoices = cards.flatMap((c) => {
    const inv = nextInvoice.get(c.id);
    return inv && inv.dueDate > farLimit && c.closingDay !== null ? [{ inv, card: c, closingDay: c.closingDay }] : [];
  });
  // As 3 categorias com limite mais perto de estourar (ou já estouradas), considerando os previstos.
  const nearLimit = monthBudgets(db, month, today)
    .filter((i) => i.status)
    .sort((a, b) => b.status!.projectedPercent - a.status!.projectedPercent)
    .slice(0, 3);
  const endOfMonth = days.at(-1);
  const low = lowestBalance(days);

  if (everything.length === 0) {
    return (
      <div className="card mx-auto mt-10 max-w-md text-center">
        <h1 className="text-xl font-semibold">Bem-vindo ao Saldo Futuro</h1>
        <p className="mt-2 text-sm text-muted">
          Comece cadastrando sua primeira conta, com o saldo que ela tem hoje.
        </p>
        <Link href="/contas/nova" className="btn btn-primary mt-5">
          Criar primeira conta
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="card bg-gradient-to-br from-surface-2 to-surface">
        <p className="text-sm text-muted">Saldo total</p>
        <p className="mt-1 text-4xl font-semibold tracking-tight">
          <Amount cents={total} />
        </p>
        {savings.length > 0 && (
          <p className="mt-1 text-sm text-muted">
            Guardado: <Amount cents={saved} className="font-medium text-fg" />
          </p>
        )}
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm">
          <div>
            <p className="text-muted">Previsto no fim do mês</p>
            <Amount cents={endOfMonth?.endBalanceCents ?? total} className="text-lg font-medium" />
          </div>
          <div>
            <p className="text-muted">Menor saldo projetado</p>
            <Amount
              cents={low?.endBalanceCents ?? total}
              className={`text-lg font-medium ${low && low.endBalanceCents < 0 ? "text-expense" : ""}`}
            />
            {low && <p className="text-xs text-muted">em {formatDayHeader(low.date)}</p>}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm">
          <div>
            <p className="text-muted">Receitas do mês</p>
            <Amount cents={income} className="text-lg font-medium text-income" />
          </div>
          <div>
            <p className="text-muted">Despesas do mês</p>
            <Amount cents={expense} className="text-lg font-medium text-expense" />
            <Link href={`/relatorios?mes=${month}`} className="block text-xs text-accent hover:underline">
              Ver relatório
            </Link>
          </div>
        </div>
      </section>

      <section className="card" aria-labelledby="em-aberto">
        <h2 id="em-aberto" className="mb-1 text-sm font-medium text-muted">
          Contas em aberto
        </h2>
        {open.overdue.length === 0 && open.upcoming.length === 0 && laterInvoices.length === 0 ? (
          <p className="py-4 text-sm text-muted">Tudo em dia: nada em atraso nem vencendo nos próximos {horizon} dias.</p>
        ) : (
          <>
            {open.overdue.length > 0 && (
              <div>
                <h3 className="mt-2 text-xs font-semibold uppercase tracking-wide text-expense">
                  Em atraso ({open.overdue.length})
                </h3>
                <ul className="divide-y divide-line">
                  {open.overdue.map(openRow)}
                </ul>
              </div>
            )}
            {open.upcoming.length > 0 && (
              <div>
                <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">
                  Próximos {horizon} dias ({open.upcoming.length})
                </h3>
                <ul className="divide-y divide-line">
                  {open.upcoming.map(openRow)}
                </ul>
              </div>
            )}
            {laterInvoices.length > 0 && (
              <div>
                <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Faturas abertas</h3>
                <ul className="divide-y divide-line">
                  {laterInvoices.map(({ inv, card, closingDay }) => (
                    <OpenInvoice
                      key={`${card.id}-${inv.closingDate}`}
                      inv={inv}
                      cardName={card.name}
                      closingDay={closingDay}
                      today={today}
                      canPay={false}
                    />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      <section className="card" aria-labelledby="orcamento">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="orcamento" className="text-sm font-medium text-muted">
            Orçamento do mês
          </h2>
          <Link href={`/orcamento?mes=${month}`} className="text-xs text-accent hover:underline">
            Ver orçamento
          </Link>
        </div>
        {nearLimit.length === 0 ? (
          <p className="text-sm text-muted">Nenhum limite definido para este mês.</p>
        ) : (
          <ul className="space-y-4">
            {nearLimit.map((i) => (
              <li key={i.category.id}>
                <p className="mb-1 flex items-center justify-between text-sm font-medium">
                  <span>
                    <span aria-hidden>{i.category.icon} </span>
                    {i.category.name}
                  </span>
                  {i.status!.projectedLevel !== "ok" && (
                    <span className={`text-xs ${LEVEL[i.status!.projectedLevel].text}`}>
                      <span aria-hidden>{LEVEL[i.status!.projectedLevel].icon} </span>
                      {i.status!.level === "estourou" ? "Estourou" : i.status!.projectedLevel === "estourou" ? "Vai estourar" : "Atenção"}
                    </span>
                  )}
                </p>
                <BudgetBar item={i} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted">Contas</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {[...accounts, ...savings].map((a) => (
            <Link key={a.id} href={`/lancamentos?conta=${a.id}`} className="card transition hover:border-muted/50">
              <p className="text-xs text-muted">{ACCOUNT_KIND_LABEL[a.kind]}</p>
              <p className="mt-0.5 font-medium">{a.name}</p>
              <Amount cents={a.balanceCents} className="mt-2 block text-xl font-semibold" />
            </Link>
          ))}
          {cards.map((c) => {
            const inv = nextInvoice.get(c.id);
            return (
              <Link key={c.id} href={`/cartoes/${c.id}`} className="card transition hover:border-muted/50">
                <p className="text-xs text-muted">Cartão de crédito</p>
                <p className="mt-0.5 font-medium">{c.name}</p>
                {inv ? (
                  <>
                    <Amount cents={inv.remainingCents} className="mt-2 block text-xl font-semibold" />
                    <p className="text-xs text-muted">fatura vence em {formatDateBR(inv.dueDate)}</p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-muted">Sem fatura em aberto</p>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="card">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted">Últimos lançamentos</h2>
          <Link href="/lancamentos" className="text-xs text-accent">
            Ver todos
          </Link>
        </div>
        <TransactionList items={recent} />
      </section>

      <FormLink
        href="/lancamentos/novo"
        aria-label="Novo lançamento"
        className="fixed bottom-20 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-3xl text-accent-fg shadow-lg shadow-black/40 transition hover:brightness-110 md:bottom-8 md:right-8"
      >
        +
      </FormLink>
    </div>
  );
}
