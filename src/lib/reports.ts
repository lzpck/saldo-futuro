import { monthBounds } from "./dates";
import type { Transaction } from "./repos/transactions";

export type ReportTx = Pick<Transaction, "id" | "kind" | "status" | "date" | "amountCents" | "categoryId">;

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
  children: CategorySlice[];
};

export type ReportOptions = { kind: "despesa" | "receita"; includePlanned: boolean };

const NO_CATEGORY = { name: "Sem categoria", color: "#8b97a6", icon: "?" };

const byTotalDesc = (a: CategorySlice, b: CategorySlice) =>
  b.totalCents - a.totalCents || a.name.localeCompare(b.name, "pt-BR");

/**
 * Agrega Despesas (ou Receitas) por Categoria no período. Transferências e pagamentos de fatura
 * não entram; a subcategoria soma no pai e aparece em `children`.
 */
export function spendingByCategory(
  txs: ReportTx[],
  categories: ReportCategory[],
  opts: ReportOptions & { from: string; to: string },
): CategorySlice[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const direct = new Map<number | null, number>();

  for (const t of txs) {
    if (t.kind !== opts.kind) continue;
    if (t.date < opts.from || t.date > opts.to) continue;
    if (t.status === "previsto" && !opts.includePlanned) continue;
    const id = t.categoryId !== null && byId.has(t.categoryId) ? t.categoryId : null;
    direct.set(id, (direct.get(id) ?? 0) + t.amountCents);
  }

  const leaf = (id: number, name: string, totalCents: number): CategorySlice => {
    const c = byId.get(id)!;
    return { categoryId: id, name, color: c.color, icon: c.icon, totalCents, children: [] };
  };

  const slices = new Map<number | null, CategorySlice>();
  for (const [id, cents] of direct) {
    if (id === null) {
      slices.set(null, { categoryId: null, ...NO_CATEGORY, totalCents: cents, children: [] });
      continue;
    }
    const c = byId.get(id)!;
    const parent = c.parentId !== null ? byId.get(c.parentId) : undefined;
    if (!parent) {
      const slice = slices.get(id) ?? leaf(id, c.name, 0);
      slice.totalCents += cents;
      slices.set(id, slice);
      continue;
    }
    const slice = slices.get(parent.id) ?? leaf(parent.id, parent.name, 0);
    slice.totalCents += cents;
    slice.children.push(leaf(id, c.name, cents));
    slices.set(parent.id, slice);
  }

  for (const slice of slices.values()) {
    if (slice.children.length === 0 || slice.categoryId === null) continue;
    const own = direct.get(slice.categoryId) ?? 0;
    if (own > 0) slice.children.push(leaf(slice.categoryId, `Outros de ${slice.name}`, own));
    slice.children.sort(byTotalDesc);
  }

  return [...slices.values()].sort(byTotalDesc);
}

/** Um item por mês pedido (inclusive vazios), para o comparativo. */
export function monthlyTotalsByCategory(
  txs: ReportTx[],
  categories: ReportCategory[],
  months: string[],
  opts: ReportOptions,
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
  return [
    ...slices.slice(0, max),
    {
      categoryId: null,
      name: "Outras",
      color: "#586374", // distinta de "Sem categoria", que pode aparecer ao lado
      icon: "…",
      totalCents: rest.reduce((s, x) => s + x.totalCents, 0),
      children: [],
    },
  ];
}

/** Variação percentual sobre o mês anterior; null quando não há base. */
export function variationPercent(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}
