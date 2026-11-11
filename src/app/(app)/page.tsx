import Link from "next/link";
import { FormLink } from "@/components/form-link";
import { PageHeader, PageShell, PANEL, PRIMARY_ACTION } from "@/components/page-shell";
import { dailyAllowance } from "@/lib/daily-allowance";
import { getDb } from "@/lib/db/connection";
import { formatDateBR, formatDayHeader, monthBounds, monthLabel, shiftMonth, todayISO } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { monthlyOutlook } from "@/lib/month-outlook";
import { addDays, dailyBalances, lowestBalance, openItems } from "@/lib/projection";
import { benefitBalanceCents, isBenefit, isCard, isSavings, isSpendable, listAccounts, savedBalanceCents, totalBalanceCents } from "@/lib/repos/accounts";
import { loadSchedule } from "@/lib/repos/schedule";
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
  const monthTx = listTransactions(db, { from: `${month}-01`, to: `${month}-31` }).filter((t) => t.status === "efetivado");
  const income = monthTx.filter((t) => t.kind === "receita").reduce((s, t) => s + t.amountCents, 0);
  const expense = monthTx.filter((t) => t.kind === "despesa").reduce((s, t) => s + t.amountCents, 0);

  const { to: monthEnd } = monthBounds(month);
  const horizon = 14;
  // A projeção olha sempre 30 dias à frente, a partir de hoje.
  const projectionEnd = addDays(today, PROJECTION_DAYS);
  const outlookMonths = 6;
  // As faturas olham 400 dias à frente; a mesma leitura da agenda serve às duas coisas.
  const { transactions: scheduled, invoicesByCard } = loadSchedule(db, monthBounds(shiftMonth(month, outlookMonths - 1)).to, today, addDays(today, 400));
  const open = openItems(scheduled, today, horizon);
  const days = dailyBalances({
    accounts: accounts.map((a) => ({ id: a.id, initialBalanceCents: a.initialBalanceCents })),
    transactions: scheduled,
    today,
    from: today,
    to: projectionEnd,
  });
  // Primeira fatura com valor em aberto de cada cartão.
  const nextInvoice = new Map(cards.map((c) => [c.id, invoicesByCard.get(c.id)!.find((i) => i.remainingCents > 0)]));
  const endOfMonth = days.find((d) => d.date === monthEnd) ?? days.at(-1);
  const low = lowestBalance(days);
  const allowance = dailyAllowance(days, monthEnd);
  const outlook = monthlyOutlook({
    accounts: accounts.map((a) => ({ id: a.id, initialBalanceCents: a.initialBalanceCents })),
    transactions: scheduled,
    today,
    months: outlookMonths,
    scope: new Set(accounts.map((a) => a.id)),
    cardIds: new Set(cards.map((c) => c.id)),
  });

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
  const withBalance = accounts.filter((a) => a.balanceCents !== 0);
  const events = [...open.overdue, ...open.upcoming.filter((t) => t.date <= addDays(today, 7))].slice(0, 3);
  const overdueIds = new Set(open.overdue.map((t) => t.id));
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

      {allowance && (
        <section className={`${PANEL} flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1`} aria-label="Pode gastar por dia">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Pode gastar por dia</span>
            <p data-testid="pode-gastar" className={`text-4xl font-extrabold tracking-tight md:text-5xl ${allowance.perDayCents > 0 ? "text-on-surface" : "text-error"}`}>
              {formatBRL(allowance.perDayCents)}
            </p>
          </div>
          <p className="text-xs text-on-surface-variant">
            {allowance.lowestCents > 0 ? (
              <>até {shortDate(allowance.untilDate)} · menor saldo previsto {formatBRL(allowance.lowestCents)} em {shortDate(allowance.lowestDate)}</>
            ) : (
              <>o saldo previsto chega a {formatBRL(allowance.lowestCents)} em {shortDate(allowance.lowestDate)}</>
            )}
          </p>
        </section>
      )}

      <section className={`${PANEL} overflow-x-auto`} aria-label="Próximos 6 meses">
        <table className="w-full min-w-[30rem] text-sm">
          <thead>
            <tr className="text-right text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
              <th className="py-1 text-left font-semibold">Mês</th>
              <th className="py-1 font-semibold">Entrou</th>
              <th className="py-1 font-semibold">Saiu</th>
              <th className="py-1 font-semibold">Sobra</th>
              <th className="py-1 font-semibold">%</th>
              <th className="py-1 font-semibold">Saldo final</th>
            </tr>
          </thead>
          <tbody>
            {outlook.map((r, i) => (
              <tr key={r.month} className={`border-t border-outline-variant/20 text-right ${i === 0 ? "font-semibold" : ""}`}>
                <th scope="row" className="py-2 text-left font-medium">
                  {monthName(r.month)}
                  {r.estimated && <span className="ml-1.5 text-[10px] font-normal text-on-surface-variant">estimado</span>}
                </th>
                <td className="py-2">{formatBRL(r.entrouCents)}</td>
                <td className="py-2">{formatBRL(r.saiuCents)}</td>
                <td className={`py-2 ${r.sobraCents < 0 ? "text-error" : ""}`}>{formatBRL(r.sobraCents)}</td>
                <td className={`py-2 ${r.sobraCents < 0 ? "text-error" : ""}`}>{r.percent === null ? "—" : `${r.percent}%`}</td>
                <td className={`py-2 ${r.endBalanceCents < 0 ? "text-error" : ""}`}>{formatBRL(r.endBalanceCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

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
        <div className={`${PANEL} lg:col-span-12`}>
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
