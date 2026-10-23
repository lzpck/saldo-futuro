import { BudgetBar } from "@/components/budget-bar";
import { MonthStepper, PageHeader, PageShell } from "@/components/page-shell";
import { getDb } from "@/lib/db/connection";
import { isYearMonth, monthLabel, shiftMonth, todayISO } from "@/lib/dates";
import { monthBudgets, type BudgetItem } from "@/lib/repos/budgets";
import { LimitForm } from "./limit-form";

const icon = "material-symbols-outlined";

type SearchParams = Promise<{ mes?: string }>;

export default async function BudgetPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const today = todayISO();
  const month = sp.mes && isYearMonth(sp.mes) ? sp.mes : today.slice(0, 7);
  const items = monthBudgets(getDb(), month, today);

  const parents = items.filter((i) => i.category.parentId === null);
  const childrenOf = (id: number) => items.filter((i) => i.category.parentId === id);
  const href = (m: string) => `/orcamento?mes=${m}`;

  return (
    <PageShell>
      <PageHeader
        title="Orçamento"
        subtitle="O limite vale a partir deste mês, até você mudá-lo (meses anteriores não são alterados)."
        actions={<MonthStepper label={monthLabel(month)} prevHref={href(shiftMonth(month, -1))} nextHref={href(shiftMonth(month, 1))} />}
      />

      <p className="flex items-start gap-2 rounded-xl bg-surface-container-low px-4 py-3 font-body-sm text-body-sm text-on-surface-variant">
        <span aria-hidden className={`${icon} text-[18px] text-primary`}>info</span>
        Deixe em branco ou use 0 para remover. O limite de uma categoria principal inclui as subcategorias; o de uma
        subcategoria conta só o gasto dela.
      </p>

      <ul className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {parents.map((p) => {
          const subs = childrenOf(p.category.id);
          return (
            <li key={p.category.id} className="card space-y-3">
              <Row item={p} month={month} />
              {subs.length > 0 && (
                <details className="group border-t border-outline-variant/40 pt-3">
                  <summary className="flex cursor-pointer list-none items-center gap-1 font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface">
                    <span aria-hidden className={`${icon} text-[18px] transition-transform group-open:rotate-90`}>chevron_right</span>
                    Subcategorias ({subs.length})
                  </summary>
                  <ul className="mt-3 space-y-4">
                    {subs.map((s) => (
                      <li key={s.category.id} className="rounded-lg bg-surface-container-low p-3">
                        <Row item={s} month={month} />
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </PageShell>
  );
}

function Row({ item, month }: { item: BudgetItem; month: string }) {
  const { category } = item;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-headline-md text-body-lg font-semibold">
          <span aria-hidden>{category.icon} </span>
          {category.name}
        </h2>
        <LimitForm categoryId={category.id} month={month} limitCents={item.limitCents} name={category.name} />
      </div>
      <BudgetBar item={item} />
    </div>
  );
}
