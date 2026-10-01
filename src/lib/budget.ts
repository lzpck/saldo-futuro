import { monthBounds } from "./dates";
import { spendingByCategory, type ReportCategory, type ReportTx } from "./reports";

export type BudgetRow = { categoryId: number; month: string; amountCents: number };

export type BudgetLevel = "ok" | "atencao" | "estourou";

export type BudgetStatus = {
  /** Efetivado sobre o limite, em %. */
  percent: number;
  /** Efetivado + previsto sobre o limite, em %. */
  projectedPercent: number;
  /** Limite menos o efetivado (negativo se estourou). */
  remainingCents: number;
  level: BudgetLevel;
  projectedLevel: BudgetLevel;
};

const WARNING_PERCENT = 80;
const EXCEEDED_PERCENT = 100;

/**
 * Limite de uma Categoria num mês: vale a linha mais recente com `month <= mês` (o limite continua
 * valendo nos meses seguintes até ser alterado). Valor 0 significa "sem limite daqui em diante".
 */
export function resolveLimit(rows: BudgetRow[], categoryId: number, month: string): number | null {
  let latest: BudgetRow | undefined;
  for (const r of rows) {
    if (r.categoryId !== categoryId || r.month > month) continue;
    if (!latest || r.month > latest.month) latest = r;
  }
  return latest && latest.amountCents > 0 ? latest.amountCents : null;
}

// Compara em inteiros (centavos × 100) para que "exatamente 80%" não dependa de ponto flutuante.
const levelOf = (cents: number, limitCents: number): BudgetLevel =>
  cents * 100 >= limitCents * EXCEEDED_PERCENT
    ? "estourou"
    : cents * 100 >= limitCents * WARNING_PERCENT
      ? "atencao"
      : "ok";

/** Situação do gasto frente ao limite; null quando não há limite. `plannedCents` = 0 em mês passado. */
export function budgetStatus(input: {
  spentCents: number;
  plannedCents: number;
  limitCents: number | null;
}): BudgetStatus | null {
  const { spentCents, plannedCents, limitCents } = input;
  if (limitCents === null || limitCents <= 0) return null;
  const projectedCents = spentCents + plannedCents;
  return {
    percent: (spentCents * 100) / limitCents,
    projectedPercent: (projectedCents * 100) / limitCents,
    remainingCents: limitCents - spentCents,
    level: levelOf(spentCents, limitCents),
    projectedLevel: levelOf(projectedCents, limitCents),
  };
}

/**
 * Gasto efetivado e previsto de cada Categoria de despesa no mês, pela data do lançamento (compra no
 * cartão inclusa; transferências ficam de fora). O pai soma as subcategorias; a subcategoria também
 * aparece sozinha.
 */
export function categorySpending(
  txs: ReportTx[],
  categories: ReportCategory[],
  month: string,
): Map<number, { spentCents: number; plannedCents: number }> {
  const range = { kind: "despesa", ...monthBounds(month) } as const;
  const done = spendingByCategory(txs, categories, { ...range, includePlanned: false });
  const all = spendingByCategory(txs, categories, { ...range, includePlanned: true });

  const totals = (slices: typeof all) => {
    const out = new Map<number, number>();
    for (const s of slices) {
      if (s.categoryId === null) continue;
      out.set(s.categoryId, s.totalCents);
      // "Outros de X" repete o id do pai, então só as subcategorias reais entram.
      for (const c of s.children) {
        if (c.categoryId !== null && c.categoryId !== s.categoryId) out.set(c.categoryId, c.totalCents);
      }
    }
    return out;
  };

  const spent = totals(done);
  const result = new Map<number, { spentCents: number; plannedCents: number }>();
  for (const [id, totalCents] of totals(all)) {
    const spentCents = spent.get(id) ?? 0;
    result.set(id, { spentCents, plannedCents: totalCents - spentCents });
  }
  return result;
}
