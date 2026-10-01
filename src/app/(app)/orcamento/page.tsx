import Link from "next/link";
import { BudgetBar } from "@/components/budget-bar";
import { getDb } from "@/lib/db/connection";
import { isYearMonth, monthLabel, shiftMonth, todayISO } from "@/lib/dates";
import { monthBudgets, type BudgetItem } from "@/lib/repos/budgets";
import { LimitForm } from "./limit-form";

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
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Orçamento</h1>

      <div className="flex items-center justify-between">
        <Link href={href(shiftMonth(month, -1))} className="btn px-3" aria-label="Mês anterior">
          ‹
        </Link>
        <p className="font-medium">{monthLabel(month)}</p>
        <Link href={href(shiftMonth(month, 1))} className="btn px-3" aria-label="Próximo mês">
          ›
        </Link>
      </div>

      <p className="text-sm text-muted">
        O limite vale a partir deste mês, até você mudá-lo (meses anteriores não são alterados). Deixe em branco ou
        use 0 para remover. O limite de uma categoria principal inclui as subcategorias; o de uma subcategoria conta só
        o gasto dela.
      </p>

      <ul className="space-y-3">
        {parents.map((p) => {
          const subs = childrenOf(p.category.id);
          return (
            <li key={p.category.id} className="card space-y-3">
              <Row item={p} month={month} />
              {subs.length > 0 && (
                <details className="border-t border-line pt-3">
                  <summary className="cursor-pointer text-sm text-muted">Subcategorias ({subs.length})</summary>
                  <ul className="mt-3 space-y-4">
                    {subs.map((s) => (
                      <li key={s.category.id} className="border-l-2 border-line pl-3">
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
    </div>
  );
}

function Row({ item, month }: { item: BudgetItem; month: string }) {
  const { category } = item;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">
          <span aria-hidden>{category.icon} </span>
          {category.name}
        </h2>
        <LimitForm categoryId={category.id} month={month} limitCents={item.limitCents} name={category.name} />
      </div>
      <BudgetBar item={item} />
    </div>
  );
}
