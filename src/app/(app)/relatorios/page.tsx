import Link from "next/link";
import { MonthStepper, PageHeader, PageShell } from "@/components/page-shell";
import { Amount } from "@/components/amount";
import { getDb } from "@/lib/db/connection";
import { formatDateBR, monthLabel, shiftMonth, todayISO } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { isCard, isSpendable } from "@/lib/repos/accounts";
import { buildReport, parseReportParams, type ReportRow } from "@/lib/report-view";
import { isBigVariation, variationLabel, type Variation } from "@/lib/reports";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const iconCls = "material-symbols-outlined";
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pct1 = (n: number) => `${n.toFixed(1).replace(".", ",")}%`;
const brlShort = (cents: number) => `R$ ${Math.round(cents / 100).toLocaleString("pt-BR")}`;
const shortMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}/${String(y).slice(2)}`;
};
const dm = (iso: string) => formatDateBR(iso).slice(0, 5);

/** Sólido = realizado; listrado = previsto. */
const solid = (c: string) => ({ background: c });
const striped = (c: string) => ({ backgroundImage: `repeating-linear-gradient(135deg, ${c}cc 0 4px, ${c}33 4px 8px)` });

/** Teto "redondo" do eixo do gráfico (1, 2, 2,5, 5 × 10^n) e o passo entre as linhas. */
function niceAxis(maxCents: number) {
  const max = Math.max(maxCents, 100);
  const exp = 10 ** Math.floor(Math.log10(max / 4));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * exp).find((s) => s * 4 >= max) ?? 10 * exp;
  return { step, top: step * 4 };
}

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const db = getDb();
  const today = todayISO();
  const p = parseReportParams(sp, today);
  const r = buildReport(db, p, today);
  const expenses = p.kind === "despesa";
  const label = expenses ? "Despesas" : "Receitas";
  const raw = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));

  const query = (over: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const base: Record<string, string | undefined> = {
      mes: p.month,
      tipo: expenses ? undefined : "receitas",
      previstos: raw("previstos"),
      periodo: p.period === "mes" ? undefined : p.period,
      conta: p.accountId ? String(p.accountId) : undefined,
      comparar: p.compare === "fechado" ? "fechado" : undefined,
      serie: p.seriesId ? String(p.seriesId) : undefined,
      ...over,
    };
    for (const [k, v] of Object.entries(base)) if (v !== undefined) q.set(k, v);
    return `/relatorios?${q}`;
  };
  const listLink = (categoryId: number) => {
    const q = new URLSearchParams({ categoria: String(categoryId), previstos: p.includePlanned ? "1" : "0" });
    if (p.period === "mes") q.set("mes", p.month);
    else {
      q.set("de", r.range.from);
      q.set("ate", r.range.to);
    }
    if (p.accountId) q.set("conta", String(p.accountId));
    return `/lancamentos?${q}`;
  };
  const exportHref = query({}).replace("/relatorios?", "/relatorios/exportar?");

  const stepFor = (delta: number) => shiftMonth(p.month, delta * (p.period === "mes" ? 1 : p.period === "trimestre" ? 3 : 12));
  const periodTitle =
    p.period === "mes"
      ? cap(monthLabel(p.month))
      : p.period === "trimestre"
        ? `${Math.floor((Number(r.range.from.slice(5, 7)) - 1) / 3) + 1}º trimestre de ${r.range.from.slice(0, 4)}`
        : `Ano ${r.range.from.slice(0, 4)}`;

  const accounts = r.accounts.filter((a) => !a.archived && (isSpendable(a) || isCard(a)));
  const chipBase = "flex items-center gap-1.5 rounded-full px-3 py-1 font-label-md text-label-md transition-colors";
  const chipOff = `${chipBase} bg-surface-container text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface`;
  const chipOn = `${chipBase} bg-surface-container-high font-semibold text-primary shadow-sm`;
  const segOn = "rounded-lg bg-surface-container-highest px-3 py-1.5 font-label-md text-label-md font-semibold text-primary";
  const segOff = "rounded-lg px-3 py-1.5 font-label-md text-label-md text-on-surface-variant hover:text-on-surface";

  const swing = [...r.rows]
    .filter((x) => x.variation?.kind === "pct" && isBigVariation(x.variation))
    .sort((a, b) => Math.abs(b.variation!.percent) - Math.abs(a.variation!.percent))
    .slice(0, 3);
  const newOnes = r.rows.filter((x) => x.variation?.kind === "new").slice(0, 3);

  const { result, nature } = r;
  const balance = result.incomeCents - result.expenseCents;
  const savings = result.incomeCents > 0 ? (balance / result.incomeCents) * 100 : null;
  const natureParts = [
    { name: "Recorrentes", cents: nature.recurring, color: "#818cf8" },
    { name: "Parceladas", cents: nature.installment, color: "#c084fc" },
    { name: "Pontuais", cents: nature.oneOff, color: "#fbbf24" },
  ];

  const axis = niceAxis(Math.max(...r.chart.map((m) => m.realizedCents + m.plannedCents), 0));
  const seriesColor = r.series ? r.rows.find((x) => x.categoryId === r.series!.categoryId)!.color : "#4edea3";
  const seriesName = r.series ? r.series.name : `${label} totais`;

  return (
    <PageShell>
      <PageHeader
        title={<>Análise de {label} &amp; Projeção</>}
        subtitle="Visão gerencial do período, com o realizado e o previsto."
        actions={
          <>
            <MonthStepper
              label={periodTitle}
              prevHref={query({ mes: stepFor(-1), serie: undefined })}
              nextHref={query({ mes: stepFor(1), serie: undefined })}
              prevLabel="Período anterior"
              nextLabel="Próximo período"
            />
            <div className="flex rounded-xl bg-surface-container-low p-1 shadow-sm" role="group" aria-label="Período">
              {([["mes", "Mês"], ["trimestre", "Trimestre"], ["ano", "Ano"]] as const).map(([k, name]) => (
                <Link key={k} href={query({ periodo: k === "mes" ? undefined : k, serie: undefined })} aria-current={p.period === k ? "true" : undefined} className={p.period === k ? segOn : segOff}>
                  {name}
                </Link>
              ))}
            </div>
            <a href={exportHref} className="flex items-center gap-1.5 rounded-xl bg-surface-container-low px-3 py-2 font-label-md text-label-md text-on-surface shadow-sm transition-colors hover:bg-surface-container-high">
              <span aria-hidden className={`${iconCls} text-[18px]`}>download</span>
              Exportar CSV
            </a>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por conta ou cartão">
          <span className="mr-1 flex items-center gap-1 font-label-sm text-label-sm font-semibold uppercase text-on-surface-variant">
            <span aria-hidden className={`${iconCls} text-[16px] text-secondary`}>account_balance_wallet</span>
            Conta ou cartão:
          </span>
          <Link href={query({ conta: undefined })} className={p.accountId === null ? chipOn : chipOff}>
            Todas
          </Link>
          {accounts.map((a) => (
            <Link key={a.id} href={query({ conta: String(a.id) })} className={p.accountId === a.id ? chipOn : chipOff}>
              {isCard(a) && <span aria-hidden className={`${iconCls} text-[14px]`}>credit_card</span>}
              {a.name}
            </Link>
          ))}
        </div>
      </PageHeader>

      {/* Total do período e como ele fecha com as outras telas */}
      <section className="relative overflow-hidden rounded-xl bg-surface-container p-5 shadow-md lg:p-6" aria-labelledby="total-periodo">
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="total-periodo" className="rounded-lg bg-surface-container-high px-2.5 py-1 font-label-sm text-label-sm uppercase tracking-wide text-on-surface-variant">
                {label} {p.period === "mes" ? "do mês" : "do período"}
              </h2>
              <span className="flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant">
                <span aria-hidden className={`${iconCls} text-[15px] text-primary`}>schedule</span>
                {dm(r.range.from)} a {dm(r.range.to)}
              </span>
            </div>
            <div className="flex items-baseline gap-3">
              <Amount cents={r.total} className={`font-headline-xl text-[40px] font-bold leading-tight tracking-tight ${expenses ? "text-tertiary" : "text-primary"}`} />
              <span className="font-label-md text-label-md text-on-surface-variant">{p.includePlanned ? "total com previstos" : "só o que já aconteceu"}</span>
            </div>
            {p.includePlanned ? (
              <div className="flex flex-wrap items-center gap-2 pt-1 font-body-sm text-body-sm">
                <span className="inline-flex items-center gap-1.5 font-semibold text-on-surface">
                  <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-primary" />
                  {formatBRL(r.realized)} realizado
                </span>
                <span aria-hidden className="font-bold text-outline">+</span>
                <span className="inline-flex items-center gap-1.5 font-semibold text-tertiary">
                  <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={striped("#ffb2b7")} />
                  {formatBRL(r.planned)} previsto
                </span>
                {r.planned > 0 && <span className="text-on-surface-variant">· o Resumo e os Lançamentos mostram só o realizado ({formatBRL(r.realized)}).</span>}
              </div>
            ) : (
              <p className="pt-1 font-body-sm text-body-sm text-on-surface-variant">Previstos fora da conta. Ligue a chave ao lado para somar {formatBRL(r.planned > 0 ? r.planned : 0)} ainda por acontecer.</p>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-xl bg-surface-container-low p-2 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex rounded-lg bg-surface-container-high p-1" role="tablist" aria-label="Tipo de lançamento">
              {(["despesa", "receita"] as const).map((k) => (
                <Link
                  key={k}
                  role="tab"
                  aria-selected={p.kind === k}
                  href={query({ tipo: k === "receita" ? "receitas" : undefined, serie: undefined })}
                  className={`flex items-center gap-1.5 rounded-md px-4 py-2 font-label-md text-label-md transition-colors ${
                    p.kind === k ? (k === "despesa" ? "bg-tertiary-container font-bold text-on-tertiary-container shadow-sm" : "bg-primary-container font-bold text-on-primary shadow-sm") : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  <span aria-hidden className={`${iconCls} text-[16px]`}>{k === "despesa" ? "trending_down" : "trending_up"}</span>
                  {k === "despesa" ? "Despesas" : "Receitas"}
                </Link>
              ))}
            </div>
            <Link
              href={query({ previstos: p.includePlanned ? "0" : "1", serie: undefined })}
              role="switch"
              aria-checked={p.includePlanned}
              aria-label={`Previstos: ${p.includePlanned ? "ligado" : "desligado"}`}
              className="group flex items-center gap-3 rounded-lg px-3 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="flex flex-col">
                <span className="font-label-md text-label-md font-semibold">Previstos: {p.includePlanned ? "ligado" : "desligado"}</span>
                <span className="font-label-sm text-label-sm text-on-surface-variant">Faturas abertas e agendamentos</span>
              </span>
              <span aria-hidden className={`relative h-6 w-12 shrink-0 rounded-full p-0.5 transition-colors ${p.includePlanned ? "bg-primary" : "bg-surface-container-highest"}`}>
                <span className={`block h-5 w-5 rounded-full shadow transition-transform ${p.includePlanned ? "translate-x-6 bg-on-primary-container" : "translate-x-0 bg-on-surface-variant"}`} />
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* Leituras do período */}
      <section className="grid grid-cols-1 gap-5 md:grid-cols-3" aria-label="Leituras do período">
        <div className="flex flex-col justify-between rounded-xl bg-surface-container p-5 shadow-md">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-label-md text-label-md uppercase tracking-wider text-secondary">Natureza do gasto</span>
              <span aria-hidden className={`${iconCls} text-[20px] text-secondary`}>pie_chart</span>
            </div>
            <h2 className="font-headline-md text-headline-md">Recorrente, parcelado e pontual</h2>
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
              {r.biggestInstallment
                ? `Maior parcela: ${r.biggestInstallment.description}${r.biggestInstallment.installmentNo ? ` (${r.biggestInstallment.installmentNo}/${r.biggestInstallment.installmentTotal})` : ""}, ${formatBRL(r.biggestInstallment.amountCents)}.`
                : "Separa o que se repete todo mês do que foi uma compra isolada."}
            </p>
            <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-surface-container-highest" role="img" aria-label={natureParts.map((n) => `${n.name} ${formatBRL(n.cents)}`).join(", ")}>
              {natureParts.map((n) => (
                <div key={n.name} className="h-full" style={{ width: `${nature.total > 0 ? (n.cents / nature.total) * 100 : 0}%`, background: n.color }} />
              ))}
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-outline-variant/30 pt-3">
            {natureParts.map((n) => (
              <div key={n.name}>
                <dt className="flex items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant">
                  <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: n.color }} />
                  {n.name}
                </dt>
                <dd className="mt-0.5 font-body-md text-body-md font-bold">{formatBRL(n.cents)}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex flex-col justify-between rounded-xl bg-surface-container p-5 shadow-md">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-label-md text-label-md uppercase tracking-wider text-secondary">Resultado do período</span>
              <span aria-hidden className={`${iconCls} text-[20px] text-primary`}>savings</span>
            </div>
            <h2 className="font-headline-md text-headline-md">Taxa de poupança</h2>
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
              Receitas {formatBRL(result.incomeCents)} menos despesas {formatBRL(result.expenseCents)}{p.includePlanned ? ", com previstos" : ""}.
            </p>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-surface-container-high px-3 py-2">
              <span className="font-label-sm text-label-sm text-on-surface-variant">{balance >= 0 ? "Superávit" : "Déficit"}</span>
              <span className={`font-body-lg text-body-lg font-bold ${balance >= 0 ? "text-primary" : "text-tertiary"}`}>
                {balance > 0 && "+"}
                {formatBRL(balance)}
              </span>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-outline-variant/30 pt-3">
            <div>
              <span className="block font-label-sm text-label-sm text-on-surface-variant">Taxa de poupança</span>
              <span className={`mt-0.5 block font-headline-md text-headline-md font-bold ${savings === null ? "" : savings >= 0 ? "text-primary" : "text-tertiary"}`}>{savings === null ? "—" : pct1(savings)}</span>
            </div>
            <div>
              <span className="block font-label-sm text-label-sm text-on-surface-variant">Só o realizado</span>
              <span className="mt-0.5 block font-body-lg text-body-lg font-bold">{formatBRL(result.incomeRealizedCents - result.expenseRealizedCents)}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl bg-surface-container p-5 shadow-md">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-label-md text-label-md uppercase tracking-wider text-secondary">O que mais mudou</span>
              <span aria-hidden className={`${iconCls} text-[20px] text-tertiary-container`}>warning</span>
            </div>
            <h2 className="font-headline-md text-headline-md">Maiores variações</h2>
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
              {r.partial ? `Até o dia ${Number(r.cmpTo.slice(8))} nos dois períodos (${dm(r.range.prevFrom)} a ${dm(r.prevTo)} antes).` : "Período inteiro contra o período anterior inteiro."}
            </p>
          </div>
          <ul className="mt-4 divide-y divide-outline-variant/20 border-t border-outline-variant/30">
            {[...swing, ...newOnes].slice(0, 4).map((x) => (
              <li key={`${x.categoryId}-${x.name}`} className="flex items-center justify-between gap-2 py-2 font-body-sm text-body-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm" style={solid(x.color)} />
                  <span className="truncate">{x.name}</span>
                </span>
                <VarBadge expenses={expenses} v={x.variation} />
              </li>
            ))}
            {swing.length + newOnes.length === 0 && <li className="py-2 font-body-sm text-body-sm text-on-surface-variant">Nada variou muito.</li>}
          </ul>
        </div>
      </section>

      {/* Composição por categoria: barras, valores e detalhe numa lista só */}
      <section className="overflow-hidden rounded-xl bg-surface-container shadow-md" aria-labelledby="composicao">
        <div className="flex flex-col justify-between gap-4 p-5 md:flex-row md:items-center lg:p-6">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="composicao" className="font-headline-md text-headline-md">{label} por categoria</h2>
              <span className="rounded-full bg-surface-container-highest px-2 py-0.5 font-label-sm text-label-sm text-secondary">
                {r.rows.length} {r.rows.length === 1 ? "categoria" : "categorias"}
              </span>
            </div>
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
              A barra mostra a fatia de cada categoria no total de {formatBRL(r.total)}. Clique numa linha para ver as subcategorias.
            </p>
          </div>
          <div className="flex items-center gap-1.5 rounded-xl bg-surface-container-high p-1 font-label-sm text-label-sm">
            <span className="px-2 text-on-surface-variant">Comparar:</span>
            <Link scroll={false} href={query({ comparar: undefined })} className={`rounded-lg px-2.5 py-1 ${p.compare === "parcial" ? "bg-surface-container-highest font-semibold text-primary" : "text-on-surface-variant hover:text-on-surface"}`}>
              Mesmo dia
            </Link>
            <Link scroll={false} href={query({ comparar: "fechado" })} className={`rounded-lg px-2.5 py-1 ${p.compare === "fechado" ? "bg-surface-container-highest font-semibold text-primary" : "text-on-surface-variant hover:text-on-surface"}`}>
              Período fechado
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-outline-variant/20 bg-surface-container-low px-6 py-2.5 font-label-sm text-label-sm text-on-surface">
          <div className="flex items-center gap-5">
            <span className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-3 rounded bg-primary" /> Realizado</span>
            <span className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-3 rounded" style={striped("#4edea3")} /> Previsto</span>
          </div>
          <span className="text-on-surface-variant">
            % = parte do total · variação {r.partial ? `até ${dm(r.cmpTo)} contra ${dm(r.prevTo)}` : "do período fechado"}
            {r.totalVariation && <> · total <VarBadge expenses={expenses} v={r.totalVariation} /></>}
          </span>
        </div>

        {r.rows.length === 0 ? (
          <p className="px-6 py-10 text-center font-body-sm text-body-sm text-on-surface-variant">
            Nenhuma {expenses ? "despesa" : "receita"} neste {p.period === "mes" ? "mês" : "período"}
            {p.includePlanned ? "" : " efetivada"}.
          </p>
        ) : (
          <div aria-label={`${label} por categoria`} role="list">
            <div aria-hidden className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,2fr)_100px_100px_110px_64px_84px_24px] items-center gap-3 px-6 py-3 font-label-md text-label-md font-semibold text-on-surface-variant md:grid">
              <span>Categoria</span>
              <span>Fatia do total</span>
              <span className="text-right">Realizado</span>
              <span className="text-right">Previsto</span>
              <span className="text-right">Total</span>
              <span className="text-right">%</span>
              <span className="text-right">Variação</span>
              <span />
            </div>
            <div className="divide-y divide-outline-variant/15">
              {r.rows.map((row) => (
                <CategoryRow key={`${row.categoryId}-${row.name}`} row={row} total={r.total} href={row.categoryId ? listLink(row.categoryId) : null} expenses={expenses} />
              ))}
            </div>
            <div className="grid grid-cols-2 items-center gap-3 border-t-2 border-outline-variant/40 bg-surface-container-high/90 px-6 py-4 font-semibold md:grid-cols-[minmax(0,2.2fr)_minmax(0,2fr)_100px_100px_110px_64px_84px_24px]">
              <span className="font-body-lg text-body-lg font-bold">Total</span>
              <span className="hidden md:block">
                <span className="flex h-3 w-full overflow-hidden rounded-full bg-surface-container-highest">
                  <span className="h-full" style={{ width: `${r.total > 0 ? (r.realized / r.total) * 100 : 0}%`, ...solid("#4edea3") }} />
                  <span className="h-full" style={{ width: `${r.total > 0 ? (r.planned / r.total) * 100 : 0}%`, ...striped("#4edea3") }} />
                </span>
              </span>
              <span className="hidden text-right font-mono text-primary md:block">{formatBRL(r.realized)}</span>
              <span className="hidden text-right font-mono text-tertiary md:block">{formatBRL(r.planned)}</span>
              <span className="text-right font-mono text-body-lg font-bold">{formatBRL(r.total)}</span>
              <span className="hidden text-right md:block">100%</span>
              <span className="hidden text-right md:block">
                <VarBadge expenses={expenses} v={r.totalVariation} />
              </span>
              <span className="hidden md:block" />
            </div>
          </div>
        )}
      </section>

      {/* Evolução */}
      <section className="rounded-xl bg-surface-container p-5 shadow-md lg:p-6" aria-labelledby="evolucao">
        <div className="flex flex-col justify-between gap-4 border-b border-outline-variant/20 pb-5 md:flex-row md:items-start">
          <div>
            <h2 id="evolucao" className="font-headline-md text-headline-md">Evolução: {seriesName}</h2>
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
              {p.period === "ano" ? "Todos os meses do ano" : "Últimos 6 meses"}, só com meses que têm dados
              {r.omittedMonths > 0 ? ` (${r.omittedMonths} sem lançamentos omitidos)` : ""}. Escolha uma categoria para acompanhá-la.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Série do gráfico">
            <Link scroll={false} href={query({ serie: undefined })} className={p.seriesId === null ? chipOn : chipOff}>Total</Link>
            {r.rows.filter((x) => x.categoryId !== null).slice(0, 8).map((x) => (
              <Link key={x.categoryId} scroll={false} href={query({ serie: String(x.categoryId) })} className={p.seriesId === x.categoryId ? chipOn : chipOff}>
                <span aria-hidden className="h-2 w-2 rounded-full" style={solid(x.color)} />
                {x.name}
              </Link>
            ))}
          </div>
        </div>

        {r.chart.length === 0 ? (
          <p className="py-10 text-center font-body-sm text-body-sm text-on-surface-variant">Sem dados neste intervalo para {seriesName.toLowerCase()}.</p>
        ) : (
          <div className="pt-6">
            <div className="flex flex-wrap items-center gap-5 pb-4 font-label-sm text-label-sm">
              <span className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-3 rounded" style={solid(seriesColor)} /> Realizado</span>
              <span className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-3 rounded" style={striped(seriesColor)} /> Previsto</span>
            </div>
            <div className="relative h-60 pl-16" role="img" aria-label={`Barras de ${seriesName} por mês; o botão abaixo traz os mesmos valores em tabela`}>
              {[4, 3, 2, 1, 0].map((i) => (
                <div key={i} className="absolute inset-x-0 flex items-center gap-2" style={{ bottom: `calc(28px + (100% - 28px) * ${i / 4})`, transform: "translateY(50%)" }}>
                  <span className="w-14 text-right font-mono text-[11px] text-on-surface-variant">{brlShort(axis.step * i)}</span>
                  <span className={`flex-1 border-b ${i === 0 ? "border-outline-variant/40" : "border-dashed border-outline-variant/20"}`} />
                </div>
              ))}
              <div className="absolute inset-y-0 left-16 right-0 flex items-end justify-around gap-3 pb-0">
                {r.chart.map((m) => {
                  const t = m.realizedCents + m.plannedCents;
                  const h = (t / axis.top) * 100;
                  return (
                    <div key={m.month} className="flex h-full max-w-[96px] flex-1 flex-col items-center justify-end">
                      <span className="mb-1 font-mono text-[11px] font-semibold">{brlShort(t)}</span>
                      <div className="flex w-full flex-col-reverse overflow-hidden rounded-t-lg" style={{ height: `calc((100% - 28px) * ${h / 100})` }} title={`${shortMonth(m.month)}: ${formatBRL(t)} (${formatBRL(m.realizedCents)} realizado, ${formatBRL(m.plannedCents)} previsto)`}>
                        <div style={{ flexGrow: m.realizedCents, ...solid(seriesColor) }} />
                        <div style={{ flexGrow: m.plannedCents, ...striped(seriesColor) }} />
                      </div>
                      <span className={`mt-2 h-5 font-label-sm text-label-sm ${m.month === p.month ? "font-bold text-primary" : "text-on-surface-variant"}`}>{shortMonth(m.month)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <details className="mt-4 text-body-sm">
              <summary className="inline-flex cursor-pointer items-center gap-1 rounded-xl bg-surface-container-low px-3 py-1.5 font-label-md text-label-md text-on-surface hover:bg-surface-container-high">
                <span aria-hidden className={`${iconCls} text-[16px]`}>table_chart</span>
                Ver como tabela
              </summary>
              <div className="overflow-x-auto">
                <table className="mt-3 w-full text-left font-body-sm text-body-sm">
                  <caption className="sr-only">{seriesName} por mês</caption>
                  <thead className="text-on-surface-variant">
                    <tr>
                      <th scope="col" className="py-1.5 font-semibold">Mês</th>
                      <th scope="col" className="py-1.5 text-right font-semibold">Realizado</th>
                      <th scope="col" className="py-1.5 text-right font-semibold">Previsto</th>
                      <th scope="col" className="py-1.5 text-right font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/15">
                    {r.chart.map((m) => (
                      <tr key={m.month}>
                        <th scope="row" className="py-1.5 font-normal">{shortMonth(m.month)}</th>
                        <td className="py-1.5 text-right font-mono">{formatBRL(m.realizedCents)}</td>
                        <td className="py-1.5 text-right font-mono">{formatBRL(m.plannedCents)}</td>
                        <td className="py-1.5 text-right font-mono font-bold">{formatBRL(m.realizedCents + m.plannedCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        )}
      </section>
    </PageShell>
  );
}

/** Despesa que sobe é ruim; receita que sobe é boa. */
function VarBadge({ v, expenses }: { v: Variation | null; expenses: boolean }) {
  const big = isBigVariation(v);
  const up = v && (v.kind === "new" || v.percent > 0);
  const bad = expenses ? up : !up;
  const tone = !v || v.kind === "same" ? "bg-surface-container-highest text-on-surface-variant" : bad ? "bg-tertiary-container/25 text-tertiary" : "bg-primary/10 text-primary";
  return (
    <span
      title={v?.kind === "new" ? "Não havia gasto nesta categoria no período anterior" : v?.kind === "same" ? "Igual ao período anterior" : undefined}
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-label-md text-label-md ${big ? "font-bold" : "font-semibold"} ${tone}`}
    >
      {big && v?.kind === "pct" && <span aria-hidden className={`${iconCls} text-[12px]`}>{up ? "arrow_upward" : "arrow_downward"}</span>}
      {variationLabel(v)}
    </span>
  );
}

function CategoryRow({
  row,
  total,
  href,
  expenses,
}: {
  row: ReportRow;
  total: number;
  href: string | null;
  expenses: boolean;
}) {
  const share = (cents: number) => (total > 0 ? (cents / total) * 100 : 0);
  const recurring = row.totalCents > 0 && row.recurringCents / row.totalCents >= 0.5;
  const subtitle = row.children.length
    ? row.children
        .slice(0, 3)
        .map((c) => c.name)
        .join(", ") + (row.children.length > 3 ? ` +${row.children.length - 3}` : "")
    : null;
  return (
    <details className="group" role="listitem">
      <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-6 py-3.5 transition-colors hover:bg-surface-container-high/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary md:grid-cols-[minmax(0,2.2fr)_minmax(0,2fr)_100px_100px_110px_64px_84px_24px] [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-3">
          <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base" style={{ background: `${row.color}33` }}>
            {row.icon}
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-body-md text-body-md font-bold">{row.name}</span>
              {row.mostlyInstallment && <span className="rounded bg-purple-950 px-1.5 py-0.5 font-label-sm text-[10px] font-semibold uppercase text-purple-300">Parcelado</span>}
              {recurring && <span className="rounded bg-indigo-950 px-1.5 py-0.5 font-label-sm text-[10px] font-semibold uppercase text-indigo-300">Recorrente</span>}
            </span>
            {subtitle && <span className="block truncate font-label-sm text-label-sm text-on-surface-variant">{subtitle}</span>}
          </span>
        </span>
        <span className="col-span-2 row-start-2 md:col-span-1 md:row-start-auto">
          <span className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-container-highest">
            <span className="h-full" style={{ width: `${share(row.realizedCents)}%`, ...solid(row.color) }} title={`Realizado: ${formatBRL(row.realizedCents)}`} />
            <span className="h-full" style={{ width: `${share(row.plannedCents)}%`, ...striped(row.color) }} title={`Previsto: ${formatBRL(row.plannedCents)}`} />
          </span>
        </span>
        <span className="hidden text-right font-mono text-body-sm md:block">{formatBRL(row.realizedCents)}</span>
        <span className="hidden text-right font-mono text-body-sm text-on-surface-variant md:block">{formatBRL(row.plannedCents)}</span>
        <span className="text-right font-mono text-body-md font-bold">{formatBRL(row.totalCents)}</span>
        <span className="hidden text-right font-body-sm font-bold md:block" style={{ color: row.color }}>{pct1(row.sharePercent)}</span>
        <span className="hidden text-right md:block">
          <VarBadge expenses={expenses} v={row.variation} />
        </span>
        <span aria-hidden className="material-symbols-outlined hidden text-[20px] text-on-surface-variant transition-transform group-open:rotate-180 md:block">expand_more</span>
      </summary>
      <div className="bg-surface-container-low/80 px-6 py-4 md:px-8">
        <div className="flex flex-col gap-3 border-l-2 pl-5" style={{ borderColor: `${row.color}99` }}>
          <div className="flex flex-wrap items-center justify-between gap-2 font-label-md text-label-md text-on-surface-variant">
            <span>
              {formatBRL(row.realizedCents)} realizado + {formatBRL(row.plannedCents)} previsto · variação <VarBadge expenses={expenses} v={row.variation} />
            </span>
            {href && (
              <Link href={href} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                Ver lançamentos
                <span aria-hidden className="material-symbols-outlined text-[14px]">open_in_new</span>
              </Link>
            )}
          </div>
          {row.children.length > 0 && (
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-3" aria-label={`Subcategorias de ${row.name}`}>
              {row.children.map((c) => (
                <li key={`${c.categoryId}-${c.name}`} className="flex items-center justify-between gap-2 rounded-lg bg-surface-container p-2.5 font-body-sm text-body-sm">
                  <span className="truncate">{c.name}</span>
                  <span className="shrink-0 font-mono font-bold">
                    {formatBRL(c.totalCents)} <span className="font-normal text-on-surface-variant">· {pct1(row.totalCents > 0 ? (c.totalCents / row.totalCents) * 100 : 0)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </details>
  );
}
