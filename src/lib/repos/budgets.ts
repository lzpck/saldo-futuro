import { budgetStatus, categorySpending, resolveLimit, type BudgetRow, type BudgetStatus } from "../budget";
import type { Db } from "../db/connection";
import { isYearMonth, monthBounds } from "../dates";
import { getCategory, listCategories, type Category } from "./categories";
import { listSchedule } from "./schedule";

type Row = { category_id: number; month: string; amount_cents: number };

export type BudgetItem = {
  category: Category;
  /** Limite que vale no mês (já com a herança dos meses anteriores); null = sem limite. */
  limitCents: number | null;
  spentCents: number;
  plannedCents: number;
  status: BudgetStatus | null;
};

export function listBudgets(db: Db): BudgetRow[] {
  return (db.prepare("SELECT category_id, month, amount_cents FROM budgets ORDER BY category_id, month").all() as Row[]).map(
    (r) => ({ categoryId: r.category_id, month: r.month, amountCents: r.amount_cents }),
  );
}

/** Define o limite a partir de `month`; 0 remove o limite daqui em diante. Mês já gravado é substituído. */
export function setBudget(db: Db, categoryId: number, month: string, amountCents: number): void {
  const category = getCategory(db, categoryId);
  if (!category) throw new Error("Categoria não encontrada.");
  if (category.kind !== "despesa") throw new Error("Só categorias de despesa têm orçamento.");
  if (!isYearMonth(month)) throw new Error("Mês inválido.");
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) throw new Error("Informe um limite válido (0 remove o limite).");
  db.prepare(
    `INSERT INTO budgets (category_id, month, amount_cents) VALUES (?, ?, ?)
     ON CONFLICT (category_id, month) DO UPDATE SET amount_cents = excluded.amount_cents`,
  ).run(categoryId, month, amountCents);
}

/**
 * Categorias de despesa ativas com limite, gasto e status do mês. Em mês passado os previstos que
 * sobraram (Em atraso) não viram projeção.
 */
export function monthBudgets(db: Db, month: string, today: string): BudgetItem[] {
  const categories = listCategories(db);
  const rows = listBudgets(db);
  const schedule = listSchedule(db, monthBounds(month).to, today);
  const spending = categorySpending(schedule, listCategories(db, { includeArchived: true }), month);
  const hasProjection = month >= today.slice(0, 7);

  return categories
    .filter((c) => c.kind === "despesa")
    .map((category) => {
      const limitCents = resolveLimit(rows, category.id, month);
      const spent = spending.get(category.id) ?? { spentCents: 0, plannedCents: 0 };
      const plannedCents = hasProjection ? spent.plannedCents : 0;
      return {
        category,
        limitCents,
        spentCents: spent.spentCents,
        plannedCents,
        status: budgetStatus({ spentCents: spent.spentCents, plannedCents, limitCents }),
      };
    });
}

/** Itens com limite estourado (efetivado ou projetado) para a categoria do lançamento e o pai dela. */
export function budgetWarnings(db: Db, categoryId: number, month: string, today: string): BudgetItem[] {
  const own = getCategory(db, categoryId);
  if (!own) return [];
  const ids = new Set([own.id, ...(own.parentId !== null ? [own.parentId] : [])]);
  return monthBudgets(db, month, today).filter((i) => ids.has(i.category.id) && i.status?.projectedLevel === "estourou");
}
