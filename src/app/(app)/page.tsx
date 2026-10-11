import Link from "next/link";
import { FormLink } from "@/components/form-link";
import { PageHeader, PageShell, PANEL, PRIMARY_ACTION } from "@/components/page-shell";
import { LEVEL } from "@/components/budget-bar";
import { OpenInvoice } from "@/components/open-invoice";
import { TransactionRow } from "@/components/transaction-list";
import { getDb } from "@/lib/db/connection";
import { formatDateBR, formatDayHeader, monthBounds, monthLabel, shiftMonth, todayISO } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { addDays, dailyBalances, lowestBalance, openItems } from "@/lib/projection";
import { ACCOUNT_KIND_LABEL, benefitBalanceCents, isBenefit, isCard, isSavings, isSpendable, listAccounts, savedBalanceCents, totalBalanceCents } from "@/lib/repos/accounts";
import { monthBudgets } from "@/lib/repos/budgets";
import { cardInvoices } from "@/lib/repos/cards";
import { listWithOccurrences } from "@/lib/repos/recurrences";
import { listSchedule } from "@/lib/repos/schedule";
import { listTransactions, type Transaction } from "@/lib/repos/transactions";

/** Janela da projeção: sempre estes dias a partir de hoje, não até o fim do mês. */
const PROJECTION_DAYS = 30;
const monthName = (ym: string) => monthLabel(ym).split(" de ")[0];
const weekday = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const w = new Date(y, m - 1, d).toLocaleDateString("pt-BR", { weekday: "short" }).replace(/\./g, "");
  return w.charAt(0).toUpperCase() + w.slice(1);
};
const shortDate = (iso: string) => formatDateBR(iso).slice(0, 5);
const initials = (name: string) => name.replace(/[^\p{L}\p{N} ]/gu, "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
/** Valor com o sinal do fluxo: despesa negativa, receita positiva, transferência neutra. */
const flow = (t: Transaction) => (t.kind === "despesa" ? -t.amountCents : t.amountCents);

export default function DashboardPage() {
  const db = getDb();
  const everything = listAccounts(db);
  const accounts = everything.filter(isSpendable);
  const savings = everything.filter(isSavings);
  const benefits = everything.filter(isBenefit);
  const cards = everything.filter(isCard);
  const total = totalBalanceCents(accounts);
  const saved = savedBalanceCents(savings);
  const today = todayISO();
  const month = today.slice(0, 7);
  const prevMonth = shiftMonth(month, -1);
  const monthTx = listTransactions(db, { from: `${month}-01`, to: `${month}-31` }).filter((t) => t.status === "efetivado");
  const income = monthTx.filter((t) => t.kind === "receita").reduce((s, t) => s + t.amountCents, 0);
  const expense = monthTx.filter((t) => t.kind === "despesa").reduce((s, t) => s + t.amountCents, 0);
  const prevExpense = listTransactions(db, { from: `${prevMonth}-01`, to: `${prevMonth}-${today.slice(8)}` })
    .filter((t) => t.status === "efetivado" && t.kind === "despesa")
    .reduce((s, t) => s + t.amountCents, 0);
  const recent = listTransactions(db, { status: "efetivado", limit: 8 });

  const { to: monthEnd } = monthBounds(month);
  const horizon = 14;
  // A projeção olha sempre 30 dias à frente, a partir de hoje.
  const projectionEnd = addDays(today, PROJECTION_DAYS);
  const reach = projectionEnd;
  const scheduled = listSchedule(db, reach, today);
  const open = openItems(scheduled, today, horizon);
  const days = dailyBalances({
    accounts: accounts.map((a) => ({ id: a.id, initialBalanceCents: a.initialBalanceCents })),
    transactions: scheduled,
    today,
    from: today,
    to: projectionEnd,
  });
  // Primeira fatura com valor em aberto de cada cartão.
  const cardBase = cards.length ? listWithOccurrences(db, addDays(today, 400)) : [];
  const invoicesByCard = new Map(cards.map((c) => [c.id, cardInvoices(db, c, cardBase, today)]));
  const nextInvoice = new Map(cards.map((c) => [c.id, invoicesByCard.get(c.id)!.find((i) => i.remainingCents > 0)]));
  // Contas em aberto: o pagamento previsto vira a fatura expansível; a próxima de cada cartão que vence depois do horizonte fica à parte.
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
  const budgets = monthBudgets(db, month, today).filter((i) => i.status);
  const nearLimit = [...budgets].sort((a, b) => b.status!.projectedPercent - a.status!.projectedPercent).slice(0, 2);
  const endOfMonth = days.find((d) => d.date === monthEnd) ?? days.at(-1);
  const low = lowestBalance(days);

  if (everything.length === 0) {
    return (
      <PageShell>
        <div className={`${PANEL} mx-auto mt-6 max-w-md text-center`}>
          <h1 className="font-headline-xl text-headline-xl tracking-tight">Bem-vindo ao Saldo Futuro</h1>
          <p className="mt-2 font-body-md text-body-md text-on-surface-variant">Comece cadastrando sua primeira conta, com o saldo que ela tem hoje.</p>
          <Link href="/contas/nova" className={`${PRIMARY_ACTION} mt-5 justify-center`}>
            Criar primeira conta
          </Link>
        </div>
      </PageShell>
    );
  }

  const deficit = low && low.endBalanceCents < 0 ? low : undefined;
  const firstNegative = days.find((d) => d.endBalanceCents < 0);
  const dueTotal = [...nextInvoice.values()].reduce((sum, i) => sum + (i?.remainingCents ?? 0), 0);
  const dueCards = cards
    .map((c) => ({ card: c, inv: nextInvoice.get(c.id) }))
    .sort((a, b) => (a.inv?.dueDate ?? "9999").localeCompare(b.inv?.dueDate ?? "9999"));
  const soonest = dueCards.find((x) => x.inv);
  const openCount = dueCards.filter((x) => x.inv).length;
  const zeroCount = dueCards.length - openCount;
  const withBalance = accounts.filter((a) => a.balanceCents !== 0);
  const zeroed = accounts.filter((a) => a.balanceCents === 0);
  const principal = [...withBalance].sort((a, b) => b.balanceCents - a.balanceCents)[0];
  const sum = (list: typeof accounts) => list.reduce((s, a) => s + a.balanceCents, 0);
  const events = [...open.overdue, ...open.upcoming.filter((t) => t.date <= addDays(today, 7))].slice(0, 3);
  const overdueIds = new Set(open.overdue.map((t) => t.id));
  const delta = prevExpense > 0 ? Math.round(((expense - prevExpense) / prevExpense) * 100) : null;
  const spark = days.length > 1 ? sparkline(days.map((d) => d.endBalanceCents)) : null;
  
  return (
    <PageShell>
      <PageHeader
        title="Resumo Geral"
        subtitle={`${monthLabel(month).replace(" de ", " / ")} · Atualizado em ${formatDateBR(today)}`}
        actions={
          <FormLink href="/lancamentos/novo" className={PRIMARY_ACTION}>
            <span aria-hidden className="material-symbols-outlined text-body-lg font-bold">add</span>
            <span>Novo Lançamento</span>
          </FormLink>
        }
      />

      {deficit && (
        <section className={`${PANEL} relative overflow-hidden border border-error/40`}>
          <div className="relative z-10 flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
            <div className="max-w-2xl space-y-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="flex items-center gap-1.5 rounded-full border border-error/40 bg-error/10 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-error">
                  Atenção ao fluxo de caixa de {monthName(deficit.date.slice(0, 7))}
                </span>
                <span className="text-xs text-on-surface-variant">Déficit previsto em {shortDate(firstNegative?.date ?? deficit.date)}</span>
              </div>
              <h2 className="font-headline-md text-headline-md text-on-surface">
                Faltam <span className="font-extrabold text-error">{formatBRL(-deficit.endBalanceCents)}</span> para cobrir {dueTotal > 0 ? "as faturas" : "os compromissos"} de {monthName(deficit.date.slice(0, 7)).toLowerCase()}
              </h2>
              <p className="text-xs leading-relaxed text-on-surface-variant md:text-sm">
                Seu saldo disponível imediato (<strong className="text-on-surface">{formatBRL(total)}</strong>) não cobre
                {dueTotal > 0 && (
                  <>
                    {" "}as faturas a vencer acumuladas (<strong className="text-error">{formatBRL(-dueTotal)}</strong>) e
                  </>
                )}{" "}
                os demais previstos. O saldo projetado ficará negativo a partir de <strong>{shortDate(firstNegative?.date ?? deficit.date)}</strong>.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              {savings.length > 0 && (
                <FormLink
                  href="/lancamentos/novo"
                  className="flex items-center gap-2 rounded-xl bg-error px-4 py-2.5 text-xs font-semibold text-on-surface shadow-lg shadow-error/25 transition-all hover:bg-error"
                >
                  Transferir da Caixinha
                </FormLink>
              )}
              <Link href="/agenda" className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2.5 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container-high">
                Ver agenda →
              </Link>
            </div>
          </div>
          <div className="relative z-10 mt-6 border-t border-outline-variant/20 pt-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-on-surface-variant">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-2.5 bg-primary" /> Hoje ({shortDate(today)}) {formatBRL(days[0]?.endBalanceCents ?? total)}
              </span>
              {soonest?.inv && (
                <span className="flex items-center gap-1.5 text-tertiary">
                  <span className="h-2 w-2 rounded-full bg-tertiary" /> {shortDate(soonest.inv.dueDate)} Venc. {soonest.card.name} ({formatBRL(-soonest.inv.remainingCents)})
                </span>
              )}
              <span className="flex items-center gap-1.5 font-semibold text-error">
                <span className="h-2 w-2 rounded-full bg-error" /> {shortDate(deficit.date)} Menor saldo ({formatBRL(deficit.endBalanceCents)})
              </span>
              <span>{shortDate(projectionEnd)} Saldo projetado</span>
            </div>
            {spark && (
              <div className="relative h-16 w-full">
                <svg viewBox="0 0 300 48" preserveAspectRatio="none" className="h-full w-full" aria-hidden>
                  <defs>
                    <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-error)" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="var(--color-error)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <line x1="0" x2="300" y1={spark.zeroY} y2={spark.zeroY} stroke="var(--color-outline-variant)" strokeDasharray="3 3" />
                  <polygon points={`0,48 ${spark.points} 300,48`} fill="url(#spark-fill)" />
                  <polyline points={spark.points} fill="none" stroke="var(--color-error)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                </svg>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className={`${PANEL} flex flex-col justify-between lg:col-span-8`}>
          <div>
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Saldo total</span>
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Disponível agora</span>
              </div>
              <span className="text-xs text-on-surface-variant">Atualizado em {formatDateBR(today)}</span>
            </div>
            <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-baseline md:justify-between">
              <div>
                <span data-testid="saldo-total" className="text-4xl font-extrabold tracking-tight text-on-surface md:text-5xl">{formatBRL(total)}</span>
                {withBalance.length > 0 && (
                  <p className="mt-2 flex flex-wrap items-center gap-3 text-xs text-on-surface-variant">
                    <span>Composição:</span>
                    {withBalance.map((a) => (
                      <span key={a.id} className="rounded bg-surface-container-low px-2 py-0.5 font-medium text-on-surface-variant">
                        {a.name}: {formatBRL(a.balanceCents)}
                      </span>
                    ))}
                  </p>
                )}
              </div>
              {(benefits.length > 0 || savings.length > 0) && (
                <div className="flex shrink-0 flex-col gap-2">
                  {benefits.length > 0 && (
                    <div className="flex items-center justify-between gap-4 rounded-xl border border-outline-variant/20 bg-surface-container-low px-3.5 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs">🥪</span>
                        <div>
                          <p className="text-[10px] font-semibold uppercase text-on-surface-variant">Benefício / VR ({benefits[0].name})</p>
                          <p className="text-xs font-bold text-on-surface">{formatBRL(benefitBalanceCents(benefits))}</p>
                        </div>
                      </div>
                      <span className="rounded border border-secondary/20 bg-secondary/10 px-1.5 py-0.5 text-[10px] text-secondary">Uso restrito</span>
                    </div>
                  )}
                  {savings.length > 0 && (
                    <div className="flex items-center justify-between gap-4 rounded-xl border border-outline-variant/20 bg-surface-container-low px-3.5 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs">🛡️</span>
                        <div>
                          <p className="text-[10px] font-semibold uppercase text-on-surface-variant">{savings[0].name}</p>
                          <p className="text-xs font-bold text-primary">{formatBRL(saved)}</p>
                        </div>
                      </div>
                      <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">Guardado</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          {!deficit && spark && (
            <svg viewBox="0 0 300 48" preserveAspectRatio="none" className="mt-5 h-12 w-full" aria-label="Saldo projetado nos próximos 30 dias">
              <polyline points={spark.points} fill="none" stroke="var(--color-primary)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </svg>
          )}
          <Link
            href={`/relatorios?mes=${month}`}
            className="mt-6 grid grid-cols-2 items-center gap-4 rounded-lg border-t border-outline-variant/20 pt-5 transition-colors hover:bg-surface-container-high md:grid-cols-3"
          >
            <div>
              <p className="text-xs text-on-surface-variant">Receitas do mês</p>
              <p className="mt-0.5 text-lg font-bold text-primary">+{formatBRL(income)}</p>
            </div>
            <div>
              <p className="text-xs text-on-surface-variant">Despesas do mês</p>
              <p className="mt-0.5 text-lg font-bold text-error">-{formatBRL(expense)}</p>
            </div>
            <span className="col-span-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary md:col-span-1 md:justify-end">
              Ver relatório completo <span>→</span>
            </span>
          </Link>
        </div>

        <div className={`${PANEL} flex flex-col justify-between lg:col-span-4`}>
          <div>
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Cenário fim do mês</h3>
            <div className="space-y-4">
              <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-3.5">
                <p className="text-xs text-on-surface-variant">Previsto no fim do mês</p>
                <p className="mt-1 text-xl font-bold text-on-surface">{formatBRL(endOfMonth?.endBalanceCents ?? total)}</p>
                <p className="mt-1 text-[11px] text-on-surface-variant">Considerando receitas agendadas</p>
              </div>
              <div className={`rounded-xl border p-3.5 ${deficit ? "border-error/40 bg-error/10" : "border-outline-variant/20 bg-surface-container-low"}`}>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-on-surface-variant">Menor saldo em 30 dias</p>
                  {deficit && <span className="rounded bg-error/10 px-1.5 py-0.5 text-[10px] font-medium text-error">Crítico</span>}
                </div>
                <p className={`mt-1 text-xl font-bold ${deficit ? "text-error" : "text-on-surface"}`}>{formatBRL(low?.endBalanceCents ?? total)}</p>
                {low && <p className={`mt-1 text-[11px] ${deficit ? "text-error/80" : "text-on-surface-variant"}`}>Estimado em {formatDayHeader(low.date)}</p>}
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-outline-variant/20 pt-4 text-xs text-on-surface-variant">
            <span>Status financeiro:</span>
            <span className={`font-medium ${deficit ? "text-tertiary" : "text-primary"}`}>{deficit ? "Requer atenção imediata" : "Saudável"}</span>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className={`${PANEL} lg:col-span-8`}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-headline-md text-headline-md text-on-surface">Próximos 7 dias (Agenda financeira)</h3>
            <Link href="/agenda" className="text-xs text-primary hover:underline">
              Abrir calendário completo
            </Link>
          </div>
          {events.length === 0 ? (
            <p className="py-4 text-sm text-on-surface-variant">Nada em atraso nem previsto para os próximos 7 dias.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {events.map((t) => {
                const incoming = t.kind === "receita";
                const late = overdueIds.has(t.id);
                const badge = late ? "Em atraso" : t.invoiceCardId !== null ? "Fatura" : incoming ? "Receita" : t.kind === "despesa" ? "Despesa" : "Transferência";
                const badgeColor = late || t.kind === "despesa" ? "bg-error/10 text-error" : incoming ? "bg-primary/10 text-primary font-semibold" : "bg-tertiary/10 text-tertiary";
                return (
                  <div key={t.id} className={`flex flex-col justify-between rounded-xl border p-3.5 ${incoming ? "border-primary/30 bg-primary/10" : "border-outline-variant/20 bg-surface-container-low"}`}>
                    <div>
                      <div className="mb-1 flex items-center justify-between text-[11px] text-on-surface-variant">
                        <span className={`font-medium ${incoming ? "text-primary" : "text-on-surface-variant"}`}>
                          {shortDate(t.date)} · {weekday(t.date)}
                        </span>
                        <span className={`rounded px-1.5 text-[10px] ${badgeColor}`}>{badge}</span>
                      </div>
                      <p className="truncate text-xs font-semibold text-on-surface">{t.description}</p>
                      <p className="text-[11px] text-on-surface-variant">{t.categoryName ?? t.accountName}</p>
                    </div>
                    <div className="mt-3 flex items-baseline justify-between border-t border-outline-variant/20 pt-2">
                      <span className="text-[10px] text-on-surface-variant">{incoming ? "Recebimento" : "Previsão"}</span>
                      <span className={`text-sm font-bold ${incoming ? "text-primary" : "text-error"}`}>
                        {incoming ? "+" : ""}
                        {formatBRL(flow(t))}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className={`${PANEL} flex flex-col justify-between lg:col-span-4`}>
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-headline-md text-headline-md text-on-surface">Tendência &amp; comparativo</h3>
              <span className="text-[10px] text-on-surface-variant">vs. {monthName(prevMonth)}</span>
            </div>
            <p className="text-xs leading-relaxed text-on-surface-variant">
              {delta === null ? (
                "Sem despesas no mês anterior para comparar."
              ) : (
                <>
                  Você gastou{" "}
                  <span className={`font-semibold ${delta <= 0 ? "text-primary" : "text-error"}`}>
                    {Math.abs(delta)}% {delta <= 0 ? "a menos" : "a mais"}
                  </span>{" "}
                  até este mesmo dia do mês anterior.
                </>
              )}
            </p>
            <div className="mt-4">
              <div role="region" aria-labelledby="orcamento" className="space-y-3">
                <h4 id="orcamento" className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                  Orçamento do mês
                </h4>
                {nearLimit.length === 0 && <p className="text-xs text-on-surface-variant">Nenhum limite definido para este mês.</p>}
                {nearLimit.map((i) => {
                  const pct = Math.min(i.status!.percent, 100);
                  const lv = LEVEL[i.status!.projectedLevel];
                  return (
                    <div key={i.category.id}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="text-on-surface">
                          <span aria-hidden>{i.category.icon} </span>
                          {i.category.name}
                        </span>
                        <span className="text-[11px] text-on-surface-variant">
                          {formatBRL(i.spentCents)} / {formatBRL(i.limitCents ?? 0)}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-container-high">
                        <div className={`h-full rounded-full ${LEVEL[i.status!.level].bar}`} style={{ width: `${pct}%` }} />
                      </div>
                      {i.status!.projectedLevel !== "ok" && (
                        <p className={`mt-1 text-[11px] ${lv.text}`}>
                          <span aria-hidden>{lv.icon} </span>
                          {i.status!.level === "estourou" ? "Estourou" : i.status!.projectedLevel === "estourou" ? "Vai estourar" : "Atenção"}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-outline-variant/20 pt-3 text-[11px] text-on-surface-variant">
            <span>Ritmo de economia:</span>
            <span className={`font-medium ${delta === null ? "text-on-surface-variant" : delta <= 0 ? "text-primary" : "text-tertiary"}`}>
              {delta === null ? "Sem base" : delta <= 0 ? "Dentro da meta" : "Acima do mês anterior"}
            </span>
          </div>
        </div>
      </section>

      <section className={PANEL} aria-labelledby="em-aberto">
        <h3 id="em-aberto" className="font-headline-md text-headline-md text-on-surface">
          Contas em aberto
        </h3>
        {open.overdue.length === 0 && open.upcoming.length === 0 && laterInvoices.length === 0 ? (
          <p className="py-4 text-sm text-on-surface-variant">Tudo em dia: nada em atraso nem vencendo nos próximos {horizon} dias.</p>
        ) : (
          <>
            {open.overdue.length > 0 && (
              <div>
                <h4 className="mt-2 text-xs font-semibold uppercase tracking-wide text-error">Em atraso ({open.overdue.length})</h4>
                <ul className="divide-y divide-outline-variant/20">{open.overdue.map(openRow)}</ul>
              </div>
            )}
            {open.upcoming.length > 0 && (
              <div>
                <h4 className="mt-3 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                  Próximos {horizon} dias ({open.upcoming.length})
                </h4>
                <ul className="divide-y divide-outline-variant/20">{open.upcoming.map(openRow)}</ul>
              </div>
            )}
            {laterInvoices.length > 0 && (
              <div>
                <h4 className="mt-3 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Faturas abertas</h4>
                <ul className="divide-y divide-outline-variant/20">
                  {laterInvoices.map(({ inv, card, closingDay }) => (
                    <OpenInvoice key={`${card.id}-${inv.closingDate}`} inv={inv} cardName={card.name} closingDay={closingDay} today={today} canPay={false} />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      {cards.length > 0 && (
        <section className={PANEL}>
          <div className="mb-5 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <h3 className="font-headline-md text-headline-md text-on-surface">Faturas de cartão de crédito</h3>
              <p className="mt-0.5 text-xs text-on-surface-variant">
                Ordenadas cronologicamente por vencimento · Total a pagar: <strong className="font-semibold text-error">{formatBRL(-dueTotal)}</strong>
              </p>
            </div>
            <span className="rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-1 text-xs text-on-surface-variant">
              {openCount} {openCount === 1 ? "fatura aberta" : "faturas abertas"}
              {zeroCount > 0 && ` · ${zeroCount} ${zeroCount === 1 ? "zerada" : "zeradas"}`}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {dueCards.map(({ card, inv }) => {
              const next = inv !== undefined && inv === soonest?.inv;
              return (
                <div
                  key={card.id}
                  className={`relative flex flex-col justify-between rounded-xl bg-surface-container-low p-4 transition-all ${
                    next ? "border-2 border-tertiary/40 hover:border-tertiary" : inv ? "border border-outline-variant/20 hover:border-outline-variant/20" : "border border-outline-variant/20 opacity-80 hover:opacity-100"
                  }`}
                >
                  {next && (
                    <span className="absolute -top-2.5 right-3 rounded-full bg-tertiary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-on-primary">
                      Próximo vencimento
                    </span>
                  )}
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant/20 bg-surface-container-high text-xs font-bold text-on-surface">{initials(card.name)}</div>
                      <div>
                        <h4 className={`text-sm font-bold leading-tight ${inv ? "text-on-surface" : "text-on-surface-variant"}`}>{card.name}</h4>
                        <p className={`text-[11px] ${next ? "font-medium text-tertiary" : "text-on-surface-variant"}`}>{inv ? `Vence em ${formatDateBR(inv.dueDate)}` : "Sem vencimento ativo"}</p>
                      </div>
                    </div>
                    <div className="mt-4">
                      <p className="text-[11px] text-on-surface-variant">Valor da fatura</p>
                      <p className={`text-2xl tracking-tight ${inv ? "font-black text-error" : "font-bold text-on-surface-variant"}`}>{inv ? formatBRL(-inv.remainingCents) : formatBRL(0)}</p>
                      {inv ? (
                        <p className="mt-1 text-[11px] text-on-surface-variant">
                          {inv.items.length} {inv.items.length === 1 ? "lançamento computado" : "lançamentos computados"}
                        </p>
                      ) : (
                        <p className="mt-1 text-[11px] text-primary/90">Nenhum débito em aberto</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-outline-variant/20 pt-3">
                    <span className="text-[10px] text-on-surface-variant">{ACCOUNT_KIND_LABEL.cartao}</span>
                    {inv ? (
                      <Link
                        href={`/cartoes/${card.id}`}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                          next ? "border-tertiary/40 bg-tertiary/10 text-tertiary hover:bg-tertiary/10" : "border-outline-variant/20 bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
                        }`}
                      >
                        Pagar fatura
                      </Link>
                    ) : (
                      <Link href={`/cartoes/${card.id}`} className="text-xs text-on-surface-variant hover:underline">
                        Zerado
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className={PANEL}>
        <div className="mb-5 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h3 className="font-headline-md text-headline-md text-on-surface">Contas &amp; patrimônio</h3>
            <p className="mt-0.5 text-xs text-on-surface-variant">Benefício e reserva ficam fora do saldo disponível: são dinheiro de uso restrito ou guardado</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-outline-variant/20 bg-surface-container-low px-2.5 py-1 text-xs text-on-surface-variant">
              Disponível agora: <strong className="text-on-surface">{formatBRL(total)}</strong>
            </span>
            <span className="rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs text-primary">
              Total geral: <strong>{formatBRL(total + saved + benefitBalanceCents(benefits))}</strong>
            </span>
          </div>
        </div>
        <div className="space-y-4">
          {accounts.length > 0 && (
            <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-primary" />
                <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Contas correntes ativas</span>
                <span className="text-xs text-on-surface-variant">(Disponível {formatBRL(sum(accounts))})</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {withBalance.map((a) => (
                  <Link key={a.id} href={`/lancamentos?conta=${a.id}`} className="flex items-center justify-between rounded-xl border border-outline-variant/20 bg-surface-container-low p-3 transition hover:border-outline-variant/20">
                    <div>
                      <p className="text-xs font-semibold text-on-surface">{a.name}</p>
                      <p className="text-[11px] text-on-surface-variant">{ACCOUNT_KIND_LABEL[a.kind]}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-on-surface">{formatBRL(a.balanceCents)}</p>
                      <span className={`text-[10px] ${a === principal ? "text-primary" : "text-on-surface-variant"}`}>{a === principal ? "Principal" : "Ativa"}</span>
                    </div>
                  </Link>
                ))}
                {zeroed.length > 0 && (
                  <details className="group rounded-xl border border-dashed border-outline-variant/20 bg-surface-container-low p-3 sm:col-span-2">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 transition-colors">
                      <span className="text-xs font-medium text-on-surface-variant">
                        <span className="group-open:hidden">Mostrar</span>
                        <span className="hidden group-open:inline">Ocultar</span> contas correntes zeradas ({zeroed.length})
                      </span>
                      <span className="truncate text-[11px] text-on-surface-variant">{zeroed.map((a) => a.name).join(", ")} ({formatBRL(0)})</span>
                    </summary>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {zeroed.map((a) => (
                        <Link key={a.id} href={`/lancamentos?conta=${a.id}`} className="flex items-center justify-between rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-xs text-on-surface-variant hover:border-outline-variant/20">
                          {a.name}
                          <span className="text-on-surface-variant">{formatBRL(0)}</span>
                        </Link>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {benefits.length > 0 && (
              <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🍱</span>
                    <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Benefícios &amp; vales</span>
                  </div>
                  <span className="text-xs font-bold text-on-surface">{formatBRL(benefitBalanceCents(benefits))}</span>
                </div>
                <div className="space-y-3">
                  {benefits.map((a) => (
                    <Link key={a.id} href={`/lancamentos?conta=${a.id}`} className="flex items-center justify-between rounded-xl border border-outline-variant/20 bg-surface-container-low p-3 transition hover:border-outline-variant/20">
                      <div>
                        <p className="text-xs font-semibold text-on-surface">{a.name}</p>
                        <p className="text-[11px] text-on-surface-variant">{ACCOUNT_KIND_LABEL[a.kind]}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-on-surface">{formatBRL(a.balanceCents)}</p>
                        <span className="text-[10px] text-secondary">Uso restrito</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {savings.length > 0 && (
              <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🏦</span>
                    <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Investimentos &amp; reservas</span>
                  </div>
                  <span className="text-xs font-bold text-primary">{formatBRL(saved)}</span>
                </div>
                <div className="space-y-3">
                  {savings.map((a) => (
                    <Link key={a.id} href={`/lancamentos?conta=${a.id}`} className="flex items-center justify-between rounded-xl border border-outline-variant/20 bg-surface-container-low p-3 transition hover:border-outline-variant/20">
                      <div>
                        <p className="text-xs font-semibold text-on-surface">{a.name}</p>
                        <p className="text-[11px] text-on-surface-variant">{ACCOUNT_KIND_LABEL[a.kind]}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-primary">{formatBRL(a.balanceCents)}</p>
                        <span className="text-[10px] text-primary">Guardado</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={PANEL}>
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-tertiary/40 bg-tertiary/10 text-tertiary">◧</div>
            <div>
              <h3 className="font-headline-md text-headline-md text-on-surface">
                {budgets.length === 0 ? `Orçamento de ${monthName(month)} não configurado` : `Orçamento de ${monthName(month)}`}
              </h3>
              <p className="mt-1 max-w-xl text-xs text-on-surface-variant">
                {budgets.length === 0
                  ? "Definir limites por categoria impede surpresas nas faturas."
                  : `${budgets.length} ${budgets.length === 1 ? "categoria com limite" : "categorias com limite"} neste mês.`}
              </p>
            </div>
          </div>
          <div className="flex w-full shrink-0 items-center gap-3 md:w-auto">
            <Link
              href={`/orcamento?mes=${month}`}
              className="flex-1 rounded-xl bg-primary px-4 py-2 text-center text-xs font-bold text-on-primary shadow-md shadow-primary/20 transition-colors hover:opacity-90 md:flex-none"
            >
              {budgets.length === 0 ? "Definir limites de gastos" : "Ver orçamento"}
            </Link>
          </div>
        </div>
      </section>

      <section className={PANEL}>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="font-headline-md text-headline-md text-on-surface">Últimos lançamentos</h3>
            <p className="mt-0.5 text-xs text-on-surface-variant">Extrato unificado de compras e reembolsos</p>
          </div>
          <Link href="/lancamentos" className="text-xs font-medium text-primary hover:underline">
            Ver todos →
          </Link>
        </div>
        <div className="divide-y divide-outline-variant/20 text-sm">
          {recent.map((t) => {
            const incoming = t.kind === "receita";
            return (
              <Link
                key={t.id}
                href={`/lancamentos/${t.id}`}
                className={`flex items-center justify-between gap-4 rounded-lg px-2 py-3.5 transition-colors ${
                  incoming ? "border-l-2 border-primary bg-primary/10 hover:bg-primary/10" : "hover:bg-surface-container-high"
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl border text-sm ${incoming ? "border-primary/30 bg-primary/10 text-primary" : "border-tertiary-container/20 bg-tertiary-container/10"}`}>
                    {incoming ? "↩️" : t.categoryIcon ?? (t.kind === "transferencia" ? "⇄" : "↑")}
                  </div>
                  <div>
                    <p className={`text-xs font-semibold sm:text-sm ${incoming ? "text-primary" : "text-on-surface"}`}>{t.description}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
                      <span>{formatDateBR(t.date)}</span>
                      {t.categoryName && (
                        <>
                          <span>•</span>
                          <span className={`rounded px-2 text-[11px] ${incoming ? "border border-primary/30 bg-primary/10 font-medium text-primary" : "bg-surface-container-high text-on-surface-variant"}`}>{t.categoryName}</span>
                        </>
                      )}
                      <span>•</span>
                      <span>{t.accountName}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-sm md:text-base ${incoming ? "font-black text-primary" : "font-bold text-error"}`}>
                    {incoming ? "+" : t.kind === "despesa" ? "-" : ""}
                    {formatBRL(t.amountCents)}
                  </span>
                  <p className={`text-[10px] ${incoming ? "text-primary/80" : "text-on-surface-variant"}`}>
                    {incoming ? "Entrada" : t.kind === "transferencia" ? "Transferência" : t.accountKind === "cartao" ? "Crédito" : "Débito"}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <FormLink
        href="/lancamentos/novo"
        aria-label="Novo lançamento"
        className="fixed bottom-20 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-3xl font-black text-on-primary shadow-xl shadow-primary/20 transition-all hover:scale-105 hover:bg-primary active:scale-95 md:bottom-7 md:right-7"
      >
        +
      </FormLink>
    </PageShell>
  );
}

/** Pontos de uma linha de saldo (viewBox 300x48) e a altura do zero. */
function sparkline(values: number[]) {
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = max - min || 1;
  const y = (v: number) => 44 - ((v - min) / range) * 40;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 300},${y(v).toFixed(1)}`).join(" ");
  return { points, zeroY: y(0) };
}
