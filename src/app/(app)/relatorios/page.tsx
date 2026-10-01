import Link from "next/link";
import { Amount } from "@/components/amount";
import { isYearMonth, monthBounds, monthLabel, shiftMonth, todayISO } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { listCategories } from "@/lib/repos/categories";
import { listSchedule } from "@/lib/repos/schedule";
import { getDb } from "@/lib/db/connection";
import {
  monthlyTotalsByCategory,
  spendingByCategory,
  topWithOthers,
  variationPercent,
  type CategorySlice,
} from "@/lib/reports";

type SearchParams = Promise<{ mes?: string; tipo?: string; previstos?: string; cat?: string }>;

const MAX_SERIES = 7;
const COMPARE_MONTHS = 6;

const shortMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  const name = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  return `${name}/${String(y).slice(2)}`;
};

const pct = (part: number, total: number) => (total > 0 ? `${((part / total) * 100).toFixed(1).replace(".", ",")}%` : "—");

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const db = getDb();
  const today = todayISO();
  const currentMonth = today.slice(0, 7);
  const month = sp.mes && isYearMonth(sp.mes) ? sp.mes : currentMonth;
  const kind = sp.tipo === "receitas" ? "receita" : "despesa";
  // Padrão: previstos ligados no mês atual e nos futuros, desligados no passado.
  const includePlanned = sp.previstos ? sp.previstos === "1" : month >= currentMonth;
  const openId = sp.cat ? Number(sp.cat) : null;

  const categories = listCategories(db, { includeArchived: true });
  const months = Array.from({ length: COMPARE_MONTHS }, (_, i) => shiftMonth(month, i - (COMPARE_MONTHS - 1)));
  // Compras no cartão entram pela data da compra, então a agenda inteira serve; o relatório só filtra.
  const schedule = listSchedule(db, monthBounds(month).to, today);

  const opts = { kind, includePlanned } as const;
  const slices = spendingByCategory(schedule, categories, { ...opts, ...monthBounds(month) });
  const previous = spendingByCategory(schedule, categories, { ...opts, ...monthBounds(shiftMonth(month, -1)) });
  const previousOf = new Map(previous.map((s) => [s.categoryId, s.totalCents]));
  const total = slices.reduce((s, x) => s + x.totalCents, 0);
  const previousTotal = previous.reduce((s, x) => s + x.totalCents, 0);
  const chartSlices = topWithOthers(slices, MAX_SERIES);
  const max = Math.max(...chartSlices.map((s) => s.totalCents), 1);
  const opened = slices.find((s) => s.categoryId !== null && s.categoryId === openId);

  const query = (over: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const base: Record<string, string | undefined> = {
      mes: month,
      tipo: kind === "receita" ? "receitas" : undefined,
      previstos: sp.previstos,
      ...over,
    };
    for (const [k, v] of Object.entries(base)) if (v !== undefined) q.set(k, v);
    return `/relatorios?${q}`;
  };
  const listLink = (categoryId: number) => `/lancamentos?${new URLSearchParams({ mes: month, categoria: String(categoryId) })}`;

  const history = monthlyTotalsByCategory(schedule, categories, months, opts);
  const topIds = topWithOthers(
    spendingByCategory(schedule, categories, { ...opts, from: `${months[0]}-01`, to: monthBounds(month).to }),
    5,
  );
  const stackKeys = topIds.map((s) => ({ id: s.name === "Outras" ? "outras" : s.categoryId, name: s.name, color: s.color }));
  const historyMax = Math.max(...history.map((m) => m.totalCents), 1);
  const stackFor = (m: (typeof history)[number]) => {
    const named = new Set(stackKeys.map((k) => k.id));
    return stackKeys.map((k) => ({
      ...k,
      cents:
        k.id === "outras"
          ? m.slices.filter((s) => !named.has(s.categoryId)).reduce((s, x) => s + x.totalCents, 0)
          : (m.slices.find((s) => s.categoryId === k.id)?.totalCents ?? 0),
    }));
  };

  const label = kind === "despesa" ? "Despesas" : "Receitas";

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Relatórios</h1>

      <div className="flex items-center justify-between">
        <Link href={query({ mes: shiftMonth(month, -1), cat: undefined })} className="btn px-3" aria-label="Mês anterior">
          ‹
        </Link>
        <p className="font-medium">{monthLabel(month)}</p>
        <Link href={query({ mes: shiftMonth(month, 1), cat: undefined })} className="btn px-3" aria-label="Próximo mês">
          ›
        </Link>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2" role="tablist" aria-label="Tipo de lançamento">
          {(["despesa", "receita"] as const).map((k) => (
            <Link
              key={k}
              role="tab"
              aria-selected={kind === k}
              href={query({ tipo: k === "receita" ? "receitas" : undefined, cat: undefined })}
              className={`btn ${kind === k ? "btn-primary" : ""}`}
            >
              {k === "despesa" ? "Despesas" : "Receitas"}
            </Link>
          ))}
        </div>
        <Link
          href={query({ previstos: includePlanned ? "0" : "1", cat: undefined })}
          className="btn text-xs"
          aria-pressed={includePlanned}
        >
          {includePlanned ? "✓ " : ""}Incluir previstos
        </Link>
      </div>

      <section className="card space-y-4" aria-labelledby="por-categoria">
        <div className="flex items-baseline justify-between">
          <h2 id="por-categoria" className="text-sm font-medium text-muted">
            {label} por categoria
          </h2>
          <p className="text-lg font-semibold">
            <Amount cents={total} className={kind === "despesa" ? "text-expense" : "text-income"} />
          </p>
        </div>

        {slices.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            Nenhuma {kind === "despesa" ? "despesa" : "receita"} neste mês{includePlanned ? "" : " efetivada"}.
          </p>
        ) : (
          <>
            <ul className="space-y-2" aria-label={`Barras de ${label.toLowerCase()} por categoria; a tabela abaixo traz os mesmos valores`}>
              {chartSlices.map((s) => (
                <li
                  key={`${s.categoryId}-${s.name}`}
                  tabIndex={0}
                  aria-label={`${s.name}: ${formatBRL(s.totalCents)}, ${pct(s.totalCents, total)}`}
                  className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate">
                      <span aria-hidden>{s.icon} </span>
                      {s.name}
                    </span>
                    <span className="shrink-0 text-muted">{pct(s.totalCents, total)}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-surface-2">
                    <div className="h-2 rounded-full" style={{ width: `${(s.totalCents / max) * 100}%`, background: s.color }} />
                  </div>
                </li>
              ))}
            </ul>

            <table className="w-full text-sm" aria-label={`${label} por categoria`}>
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-1 font-medium">Categoria</th>
                  <th className="py-1 text-right font-medium">Valor</th>
                  <th className="py-1 text-right font-medium">%</th>
                  <th className="py-1 text-right font-medium">vs. mês ant.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {slices.map((s) => (
                  <Row
                    key={`${s.categoryId}-${s.name}`}
                    s={s}
                    total={total}
                    previous={previousOf.get(s.categoryId)}
                    href={s.children.length ? query({ cat: openId === s.categoryId ? undefined : String(s.categoryId) }) : s.categoryId ? listLink(s.categoryId) : null}
                    expanded={openId !== null && openId === s.categoryId}
                  />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line font-medium">
                  <td className="py-2">Total</td>
                  <td className="py-2 text-right">{formatBRL(total)}</td>
                  <td className="py-2 text-right">100%</td>
                  <td className="py-2 text-right text-muted">{variationText(variationPercent(total, previousTotal))}</td>
                </tr>
              </tfoot>
            </table>
          </>
        )}
      </section>

      {opened && (
        <section className="card space-y-2" aria-labelledby="detalhe">
          <div className="flex items-baseline justify-between">
            <h2 id="detalhe" className="text-sm font-medium">
              {opened.icon} {opened.name}
            </h2>
            {opened.categoryId !== null && (
              <Link href={listLink(opened.categoryId)} className="text-xs text-accent hover:underline">
                Ver lançamentos
              </Link>
            )}
          </div>
          <ul className="divide-y divide-line text-sm">
            {opened.children.map((c) => (
              <li key={`${c.categoryId}-${c.name}`} className="flex items-center justify-between py-2">
                <span>{c.name}</span>
                <span>
                  {formatBRL(c.totalCents)} <span className="text-muted">· {pct(c.totalCents, opened.totalCents)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card space-y-3" aria-labelledby="comparativo">
        <h2 id="comparativo" className="text-sm font-medium text-muted">
          Comparativo dos últimos {COMPARE_MONTHS} meses
        </h2>
        {history.every((m) => m.totalCents === 0) ? (
          <p className="py-4 text-center text-sm text-muted">Sem dados nesses meses.</p>
        ) : (
          <>
            <div className="flex h-40 items-end gap-2" role="img" aria-label="Barras empilhadas do total por mês; a tabela abaixo traz os mesmos valores">
              {history.map((m) => (
                <div key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <div
                    className="flex w-full flex-col-reverse overflow-hidden rounded-md"
                    style={{ height: `${(m.totalCents / historyMax) * 100}%` }}
                    title={`${shortMonth(m.month)}: ${formatBRL(m.totalCents)}`}
                  >
                    {stackFor(m).map((k) => (
                      <div key={String(k.id)} style={{ flexGrow: k.cents, background: k.color }} title={`${k.name}: ${formatBRL(k.cents)}`} />
                    ))}
                  </div>
                  <span className={`text-[11px] ${m.month === month ? "font-semibold text-fg" : "text-muted"}`}>{shortMonth(m.month)}</span>
                </div>
              ))}
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              {stackKeys.map((k) => (
                <li key={String(k.id)} className="flex items-center gap-1.5">
                  <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: k.color }} />
                  {k.name}
                </li>
              ))}
            </ul>
            <details className="text-sm">
              <summary className="cursor-pointer text-muted">Ver como tabela</summary>
              <div className="overflow-x-auto">
                <table className="mt-2 w-full text-xs">
                  <thead className="text-left text-muted">
                    <tr>
                      <th className="py-1 font-medium">Mês</th>
                      {stackKeys.map((k) => (
                        <th key={String(k.id)} className="py-1 text-right font-medium">
                          {k.name}
                        </th>
                      ))}
                      <th className="py-1 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {history.map((m) => (
                      <tr key={m.month}>
                        <td className="py-1">{shortMonth(m.month)}</td>
                        {stackFor(m).map((k) => (
                          <td key={String(k.id)} className="py-1 text-right">
                            {formatBRL(k.cents)}
                          </td>
                        ))}
                        <td className="py-1 text-right font-medium">{formatBRL(m.totalCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </section>
    </div>
  );
}

function variationText(v: number | null) {
  if (v === null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(0)}%`;
}

function Row({
  s,
  total,
  previous,
  href,
  expanded,
}: {
  s: CategorySlice;
  total: number;
  previous: number | undefined;
  href: string | null;
  expanded: boolean;
}) {
  const v = variationPercent(s.totalCents, previous ?? 0);
  return (
    <tr>
      <td className="py-2">
        {href ? (
          <Link href={href} className="inline-flex items-center gap-1.5 hover:text-accent" aria-expanded={s.children.length ? expanded : undefined}>
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.name}
            {s.children.length > 0 && <span aria-hidden className="text-xs text-muted">{expanded ? "▾" : "▸"}</span>}
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.name}
          </span>
        )}
      </td>
      <td className="py-2 text-right">{formatBRL(s.totalCents)}</td>
      <td className="py-2 text-right text-muted">{pct(s.totalCents, total)}</td>
      <td className="py-2 text-right text-muted">{variationText(v)}</td>
    </tr>
  );
}
