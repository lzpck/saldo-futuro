import { isISODate, isYearMonth } from "./dates";
import { centsToInput, parseBRL } from "./money";
import { isOverdue } from "./projection";

// Filtros da lista de lançamentos (ticket 06c). Puro: lê a query string, filtra, totaliza e pagina.

export const PAGE_SIZE = 50;

export type Filters = {
  /** Mês da visão do mês ("YYYY-MM"); null = mês atual. */
  month: string | null;
  text: string;
  kind: "receita" | "despesa" | "transferencia" | null;
  status: "previsto" | "efetivado" | "atrasado" | null;
  minCents: number | null;
  maxCents: number | null;
  from: string | null;
  to: string | null;
  accountId: number | null;
  categoryId: number | null;
  includePlanned: boolean;
  page: number;
  /** O período digitado estava invertido e foi trocado. */
  periodSwapped: boolean;
};

export type FilterableTx = {
  id: number;
  kind: "receita" | "despesa" | "transferencia";
  status: "previsto" | "efetivado";
  date: string;
  amountCents: number;
  description: string;
  accountId: number;
  toAccountId: number | null;
  categoryId: number | null;
  isVirtual: boolean;
};

type Query = Record<string, string | string[] | undefined>;

const first = (q: Query, key: string): string => {
  const v = q[key];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
};

const oneOf = <T extends string>(v: string, allowed: readonly T[]): T | null =>
  (allowed as readonly string[]).includes(v) ? (v as T) : null;

const positiveInt = (v: string): number | null => {
  const n = Number(v);
  return /^\d+$/.test(v) && Number.isSafeInteger(n) && n > 0 ? n : null;
};

const dateOrNull = (v: string) => (isISODate(v) ? v : null);

/** Valor digitado em reais ("1.234,50") em centavos; vazio, inválido ou negativo vira null. */
const centsOrNull = (v: string): number | null => {
  const cents = v ? parseBRL(v) : null;
  return cents !== null && cents >= 0 ? cents : null;
};

export function parseFilters(q: Query): Filters {
  const month = first(q, "mes");
  let minCents = centsOrNull(first(q, "min"));
  let maxCents = centsOrNull(first(q, "max"));
  if (minCents !== null && maxCents !== null && minCents > maxCents) [minCents, maxCents] = [maxCents, minCents];

  let from = dateOrNull(first(q, "de"));
  let to = dateOrNull(first(q, "ate"));
  let periodSwapped = false;
  if (from && to && from > to) {
    [from, to] = [to, from];
    periodSwapped = true;
  }

  return {
    month: isYearMonth(month) ? month : null,
    text: first(q, "q"),
    kind: oneOf(first(q, "tipo"), ["receita", "despesa", "transferencia"]),
    status: oneOf(first(q, "situacao"), ["previsto", "efetivado", "atrasado"]),
    minCents,
    maxCents,
    from,
    to,
    accountId: positiveInt(first(q, "conta")),
    categoryId: positiveInt(first(q, "categoria")),
    includePlanned: first(q, "previstos") !== "0",
    page: positiveInt(first(q, "pagina")) ?? 1,
    periodSwapped,
  };
}

/** Busca (lista plana, com totais) quando há texto, período livre ou faixa de valor; senão, visão do mês. */
export function isSearchMode(f: Filters): boolean {
  return f.text !== "" || f.from !== null || f.to !== null || f.minCents !== null || f.maxCents !== null;
}

/** Algum filtro além do mês: a lista deixou de ser o fluxo completo. */
export function hasActiveFilters(f: Filters): boolean {
  return (
    isSearchMode(f) ||
    f.kind !== null ||
    f.status !== null ||
    f.accountId !== null ||
    f.categoryId !== null ||
    !f.includePlanned
  );
}

/** Minúsculas e sem acentos: "CAFÉ" → "cafe". */
export function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Filtra e ordena por data decrescente (mais novo primeiro). */
export function filterTransactions<T extends FilterableTx>(
  txs: T[],
  f: Filters,
  categories: { id: number; parentId: number | null }[],
  today: string,
): T[] {
  const needle = normalizeText(f.text);
  // Filtrar por uma categoria principal inclui as subcategorias dela (é o que o relatório soma).
  const categoryIds = f.categoryId
    ? new Set([f.categoryId, ...categories.filter((c) => c.parentId === f.categoryId).map((c) => c.id)])
    : null;

  return txs
    .filter((t) => {
      if (needle && !normalizeText(t.description).includes(needle)) return false;
      if (f.kind && t.kind !== f.kind) return false;
      if (f.status === "atrasado" ? !isOverdue(t, today) : f.status && t.status !== f.status) return false;
      if (f.minCents !== null && t.amountCents < f.minCents) return false;
      if (f.maxCents !== null && t.amountCents > f.maxCents) return false;
      if (f.from && t.date < f.from) return false;
      if (f.to && t.date > f.to) return false;
      if (f.accountId && t.accountId !== f.accountId && t.toAccountId !== f.accountId) return false;
      if (categoryIds && (t.categoryId === null || !categoryIds.has(t.categoryId))) return false;
      if (!f.includePlanned && t.status === "previsto" && (t.isVirtual || t.date > today)) return false;
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

export function summarize(txs: Pick<FilterableTx, "kind" | "amountCents">[]) {
  let incomeCents = 0;
  let expenseCents = 0;
  for (const t of txs) {
    if (t.kind === "receita") incomeCents += t.amountCents;
    else if (t.kind === "despesa") expenseCents += t.amountCents;
  }
  return { incomeCents, expenseCents, netCents: incomeCents - expenseCents, count: txs.length };
}

export function paginate<T>(items: T[], page: number, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), pages);
  return { items: items.slice((current - 1) * size, current * size), page: current, pages };
}

/** Query string com os filtros ativos (sem página); usada em links e na paginação. */
export function filtersToParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.month) p.set("mes", f.month);
  if (f.text) p.set("q", f.text);
  if (f.kind) p.set("tipo", f.kind);
  if (f.status) p.set("situacao", f.status);
  if (f.minCents !== null) p.set("min", centsToInput(f.minCents));
  if (f.maxCents !== null) p.set("max", centsToInput(f.maxCents));
  if (f.from) p.set("de", f.from);
  if (f.to) p.set("ate", f.to);
  if (f.accountId) p.set("conta", String(f.accountId));
  if (f.categoryId) p.set("categoria", String(f.categoryId));
  if (!f.includePlanned) p.set("previstos", "0");
  return p;
}

