import type { Db } from "./db/connection";
import { daysBetween, isYearMonth, shiftMonth } from "./dates";
import { listAccounts } from "./repos/accounts";
import { listCategories } from "./repos/categories";
import { listSchedule } from "./repos/schedule";
import {
  addDays,
  natureTotals,
  periodRange,
  spendingByCategory,
  variationOf,
  type CategorySlice,
  type ReportPeriod,
  type Variation,
} from "./reports";

type Query = Record<string, string | string[] | undefined>;

export type ReportParams = {
  month: string;
  kind: "despesa" | "receita";
  includePlanned: boolean;
  period: ReportPeriod;
  accountId: number | null;
  /** "parcial": compara só até o mesmo dia nos dois períodos; "fechado": período inteiro contra período inteiro. */
  compare: "parcial" | "fechado";
  seriesId: number | null;
};

const first = (q: Query, k: string) => {
  const v = q[k];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
};

export function parseReportParams(q: Query, today: string): ReportParams {
  const currentMonth = today.slice(0, 7);
  const m = first(q, "mes");
  const month = isYearMonth(m) ? m : currentMonth;
  const p = first(q, "periodo");
  const period: ReportPeriod = p === "trimestre" || p === "ano" ? p : "mes";
  const acc = Number(first(q, "conta"));
  const ser = Number(first(q, "serie"));
  return {
    month,
    kind: first(q, "tipo") === "receitas" ? "receita" : "despesa",
    // Padrão: previstos ligados no período atual e nos futuros, desligados no passado.
    includePlanned: first(q, "previstos") ? first(q, "previstos") === "1" : month >= currentMonth,
    period,
    accountId: Number.isInteger(acc) && acc > 0 ? acc : null,
    compare: first(q, "comparar") === "fechado" ? "fechado" : "parcial",
    seriesId: Number.isInteger(ser) && ser > 0 ? ser : null,
  };
}

/** Cores bem espaçadas no matiz, atribuídas por posição na tabela (a mesma ordem da legenda do gráfico). */
export const REPORT_PALETTE = ["#818cf8", "#f472b6", "#fbbf24", "#2dd4bf", "#fb923c", "#a3e635", "#e879f9"];
export const REPORT_PALETTE_REST = "#8b97a6";

export type ReportRow = CategorySlice & {
  color: string;
  sharePercent: number;
  variation: Variation | null;
  /** Compras parceladas pesam o bastante para explicar o valor. */
  mostlyInstallment: boolean;
};

export type ChartMonth = { month: string; realizedCents: number; plannedCents: number };

export function buildReport(db: Db, p: ReportParams, today: string) {
  const categories = listCategories(db, { includeArchived: true });
  const accounts = listAccounts(db, { includeArchived: true });
  const range = periodRange(p.month, p.period);
  const schedule = listSchedule(db, range.to, today);
  const base = { kind: p.kind, includePlanned: p.includePlanned, accountId: p.accountId } as const;

  const slices = spendingByCategory(schedule, categories, { ...base, from: range.from, to: range.to });

  // Comparação: se o período ainda está em andamento, os dois lados vão só até o mesmo dia.
  const partial = p.compare === "parcial" && today >= range.from && today <= range.to;
  const elapsedDays = partial ? daysBetween(range.from, today) : null;
  const cmpTo = partial ? today : range.to;
  const prevTo = elapsedDays !== null ? addDays(range.prevFrom, Math.min(elapsedDays, daysBetween(range.prevFrom, range.prevTo))) : range.prevTo;
  const cmpSlices = partial ? spendingByCategory(schedule, categories, { ...base, from: range.from, to: cmpTo }) : slices;
  const prevSlices = spendingByCategory(schedule, categories, { ...base, from: range.prevFrom, to: prevTo });
  const cmpOf = new Map(cmpSlices.map((s) => [s.categoryId, s.totalCents]));
  const prevOf = new Map(prevSlices.map((s) => [s.categoryId, s.totalCents]));
  const sum = (xs: CategorySlice[], pick: (s: CategorySlice) => number) => xs.reduce((s, x) => s + pick(x), 0);

  const total = sum(slices, (s) => s.totalCents);
  const rows: ReportRow[] = slices.map((s, i) => ({
    ...s,
    color: i < REPORT_PALETTE.length ? REPORT_PALETTE[i] : REPORT_PALETTE_REST,
    sharePercent: total > 0 ? (s.totalCents / total) * 100 : 0,
    variation: variationOf(cmpOf.get(s.categoryId) ?? 0, prevOf.get(s.categoryId) ?? 0),
    mostlyInstallment: s.totalCents > 0 && s.installmentCents / s.totalCents >= 0.5,
  }));

  const totalCmp = sum(cmpSlices, (s) => s.totalCents);
  const totalPrev = sum(prevSlices, (s) => s.totalCents);

  // Resultado do período: receitas menos despesas (sem filtro de tipo).
  const sideOf = (kind: "despesa" | "receita") =>
    spendingByCategory(schedule, categories, { kind, includePlanned: p.includePlanned, accountId: p.accountId, from: range.from, to: range.to });
  const inc = sideOf("receita");
  const exp = sideOf("despesa");
  const result = {
    incomeCents: sum(inc, (s) => s.totalCents),
    expenseCents: sum(exp, (s) => s.totalCents),
    incomeRealizedCents: sum(inc, (s) => s.realizedCents),
    expenseRealizedCents: sum(exp, (s) => s.realizedCents),
  };

  // Gráfico: só meses com dados; série = total ou uma categoria escolhida.
  const chartMonths = p.period === "ano" ? range.months : Array.from({ length: 6 }, (_, i) => shiftMonth(p.month, i - 5));
  const series = p.seriesId ? rows.find((r) => r.categoryId === p.seriesId) ?? null : null;
  const allMonths: ChartMonth[] = chartMonths.map((month) => {
    const from = `${month}-01`;
    const to = `${month}-31`;
    const ms = spendingByCategory(schedule, categories, { ...base, from, to });
    const pick = p.seriesId ? ms.filter((s) => s.categoryId === p.seriesId) : ms;
    return { month, realizedCents: sum(pick, (s) => s.realizedCents), plannedCents: sum(pick, (s) => s.plannedCents) };
  });
  const chart = allMonths.filter((m) => m.realizedCents + m.plannedCents > 0);

  // Maior parcela do período, para explicar saltos em categorias parceladas.
  const biggestInstallment = schedule
    .filter((t) => t.kind === p.kind && t.purchaseId !== null && t.date >= range.from && t.date <= range.to && (p.includePlanned || t.status !== "previsto"))
    .filter((t) => !p.accountId || t.accountId === p.accountId)
    .sort((a, b) => b.amountCents - a.amountCents)[0];

  return {
    categories,
    accounts,
    range,
    rows,
    total,
    realized: sum(slices, (s) => s.realizedCents),
    planned: sum(slices, (s) => s.plannedCents),
    nature: natureTotals(slices),
    partial,
    cmpTo,
    prevTo,
    totalVariation: variationOf(totalCmp, totalPrev),
    result,
    chart,
    omittedMonths: allMonths.length - chart.length,
    series,
    biggestInstallment: biggestInstallment ?? null,
  };
}

export type Report = ReturnType<typeof buildReport>;
