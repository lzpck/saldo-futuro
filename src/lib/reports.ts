import { monthBounds, shiftMonth } from "./dates";
import type { Transaction } from "./repos/transactions";

export type ReportTx = Pick<Transaction, "id" | "kind" | "status" | "date" | "amountCents" | "categoryId"> &
  Partial<Pick<Transaction, "accountId" | "recurrenceId" | "purchaseId" | "description" | "installmentNo" | "installmentTotal">>;

export type ReportCategory = {
  id: number;
  name: string;
  kind: "despesa" | "receita";
  parentId: number | null;
  color: string;
  icon: string;
};

export type CategorySlice = {
  categoryId: number | null;
  name: string;
  color: string;
  icon: string;
  totalCents: number;
  /** Parte já efetivada e parte ainda prevista do total. */
  realizedCents: number;
  plannedCents: number;
  /** Quanto do total veio de Recorrências e de parcelas; o resto é pontual. */
  recurringCents: number;
  installmentCents: number;
  children: CategorySlice[];
};

export type ReportOptions = { kind: "despesa" | "receita"; includePlanned: boolean };

type Bucket = { total: number; realized: number; planned: number; recurring: number; installment: number };

const NO_CATEGORY = { name: "Sem categoria", color: "#8b97a6", icon: "?" };

const emptyBucket = (): Bucket => ({ total: 0, realized: 0, planned: 0, recurring: 0, installment: 0 });

const addTo = (b: Bucket, t: ReportTx) => {
  b.total += t.amountCents;
  if (t.status === "previsto") b.planned += t.amountCents;
  else b.realized += t.amountCents;
  if (t.purchaseId != null) b.installment += t.amountCents;
  else if (t.recurrenceId != null) b.recurring += t.amountCents;
};

const byTotalDesc = (a: CategorySlice, b: CategorySlice) =>
  b.totalCents - a.totalCents || a.name.localeCompare(b.name, "pt-BR");

/**
 * Agrega Despesas (ou Receitas) por Categoria no período. Transferências e pagamentos de fatura
 * não entram; a subcategoria soma no pai e aparece em `children`.
 */
export function spendingByCategory(
  txs: ReportTx[],
  categories: ReportCategory[],
  opts: ReportOptions & { from: string; to: string; accountId?: number | null },
): CategorySlice[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const direct = new Map<number | null, Bucket>();

  for (const t of txs) {
    if (t.kind !== opts.kind) continue;
    if (t.date < opts.from || t.date > opts.to) continue;
    if (t.status === "previsto" && !opts.includePlanned) continue;
    if (opts.accountId && t.accountId !== opts.accountId) continue;
    const id = t.categoryId !== null && byId.has(t.categoryId) ? t.categoryId : null;
    const b = direct.get(id) ?? emptyBucket();
    addTo(b, t);
    direct.set(id, b);
  }

  const make = (categoryId: number | null, name: string, color: string, icon: string, b: Bucket): CategorySlice => ({
    categoryId,
    name,
    color,
    icon,
    totalCents: b.total,
    realizedCents: b.realized,
    plannedCents: b.planned,
    recurringCents: b.recurring,
    installmentCents: b.installment,
    children: [],
  });
  const leaf = (id: number, name: string, b: Bucket) => {
    const c = byId.get(id)!;
    return make(id, name, c.color, c.icon, b);
  };
  const merge = (slice: CategorySlice, b: Bucket) => {
    slice.totalCents += b.total;
    slice.realizedCents += b.realized;
    slice.plannedCents += b.planned;
    slice.recurringCents += b.recurring;
    slice.installmentCents += b.installment;
  };

  const slices = new Map<number | null, CategorySlice>();
  for (const [id, b] of direct) {
    if (id === null) {
      slices.set(null, make(null, NO_CATEGORY.name, NO_CATEGORY.color, NO_CATEGORY.icon, b));
      continue;
    }
    const c = byId.get(id)!;
    const parent = c.parentId !== null ? byId.get(c.parentId) : undefined;
    if (!parent) {
      const slice = slices.get(id) ?? leaf(id, c.name, emptyBucket());
      merge(slice, b);
      slices.set(id, slice);
      continue;
    }
    const slice = slices.get(parent.id) ?? leaf(parent.id, parent.name, emptyBucket());
    merge(slice, b);
    slice.children.push(leaf(id, c.name, b));
    slices.set(parent.id, slice);
  }

  for (const slice of slices.values()) {
    if (slice.children.length === 0 || slice.categoryId === null) continue;
    const own = direct.get(slice.categoryId);
    if (own && own.total > 0) slice.children.push(leaf(slice.categoryId, `Outros de ${slice.name}`, own));
    slice.children.sort(byTotalDesc);
  }

  return [...slices.values()].sort(byTotalDesc);
}

/** Um item por mês pedido (inclusive vazios), para o comparativo. */
export function monthlyTotalsByCategory(
  txs: ReportTx[],
  categories: ReportCategory[],
  months: string[],
  opts: ReportOptions & { accountId?: number | null },
): { month: string; totalCents: number; slices: CategorySlice[] }[] {
  return months.map((month) => {
    const slices = spendingByCategory(txs, categories, { ...opts, ...monthBounds(month) });
    return { month, totalCents: slices.reduce((s, x) => s + x.totalCents, 0), slices };
  });
}

/** As `max` maiores fatias; o resto vira uma única "Outras" (o total não muda). */
export function topWithOthers(slices: CategorySlice[], max: number): CategorySlice[] {
  if (slices.length <= max) return slices;
  const rest = slices.slice(max);
  const sum = (pick: (s: CategorySlice) => number) => rest.reduce((s, x) => s + pick(x), 0);
  return [
    ...slices.slice(0, max),
    {
      categoryId: null,
      name: "Outras",
      color: "#586374", // distinta de "Sem categoria", que pode aparecer ao lado
      icon: "…",
      totalCents: sum((x) => x.totalCents),
      realizedCents: sum((x) => x.realizedCents),
      plannedCents: sum((x) => x.plannedCents),
      recurringCents: sum((x) => x.recurringCents),
      installmentCents: sum((x) => x.installmentCents),
      children: [],
    },
  ];
}

/** Variação percentual sobre o mês anterior; null quando não há base. */
export function variationPercent(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Como a variação aparece: "novo" sem base, "0%" se igual, senão o percentual com sinal. */
export type Variation = { kind: "new" | "same" | "pct"; percent: number };

export function variationOf(current: number, previous: number): Variation | null {
  if (current <= 0 && previous <= 0) return null;
  if (previous <= 0) return { kind: "new", percent: 0 };
  if (current === previous) return { kind: "same", percent: 0 };
  return { kind: "pct", percent: ((current - previous) / previous) * 100 };
}

/** Variação grande o bastante para destacar. */
export const BIG_VARIATION_PERCENT = 50;

export const isBigVariation = (v: Variation | null) =>
  v !== null && (v.kind === "new" || Math.abs(v.percent) >= BIG_VARIATION_PERCENT);

export function variationLabel(v: Variation | null): string {
  if (!v) return "—";
  if (v.kind === "new") return "novo";
  if (v.kind === "same") return "0%";
  const r = Math.round(v.percent);
  return `${r > 0 ? "+" : ""}${r}%`;
}

/** Soma de dias a uma data "AAAA-MM-DD". */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export type ReportPeriod = "mes" | "trimestre" | "ano";

export type PeriodRange = { from: string; to: string; prevFrom: string; prevTo: string; months: string[] };

/** Intervalo do período que contém `month`, mais o período anterior de mesmo tamanho. */
export function periodRange(month: string, period: ReportPeriod): PeriodRange {
  const [y, m] = month.split("-").map(Number);
  const span = period === "mes" ? 1 : period === "trimestre" ? 3 : 12;
  const firstMonth = period === "mes" ? m : period === "trimestre" ? Math.floor((m - 1) / 3) * 3 + 1 : 1;
  const start = `${y}-${String(firstMonth).padStart(2, "0")}`;
  return {
    from: monthBounds(start).from,
    to: monthBounds(shiftMonth(start, span - 1)).to,
    prevFrom: monthBounds(shiftMonth(start, -span)).from,
    prevTo: monthBounds(shiftMonth(start, -1)).to,
    months: Array.from({ length: span }, (_, i) => shiftMonth(start, i)),
  };
}

/** Rótulo de quem é maior entre natureza do gasto: recorrente, parcelado ou pontual. */
export function natureTotals(slices: CategorySlice[]) {
  const total = slices.reduce((s, x) => s + x.totalCents, 0);
  const recurring = slices.reduce((s, x) => s + x.recurringCents, 0);
  const installment = slices.reduce((s, x) => s + x.installmentCents, 0);
  return { total, recurring, installment, oneOff: total - recurring - installment };
}
