import Link from "next/link";
import { classifyExpense } from "@/app/actions/review";
import { Amount } from "@/components/amount";
import { PageHeader, PageShell, PANEL } from "@/components/page-shell";
import { todayISO } from "@/lib/dates";
import { getDb } from "@/lib/db/connection";
import { LEVELS, summarize, type Group, type Level } from "@/lib/expense-review";
import { REVIEW_INVOICES, reviewGroups } from "@/lib/repos/expense-review";

// O nível vai em texto; a cor só reforça (vermelho, amarelo e azul, como as canetas do método).
const LEVEL: Record<Level, { label: string; on: string }> = {
  dispensavel: { label: "Dispensável", on: "bg-expense/15 text-expense ring-1 ring-expense" },
  reduzivel: { label: "Reduzível", on: "bg-amber-400/15 text-amber-400 ring-1 ring-amber-400" },
  essencial: { label: "Essencial", on: "bg-primary/15 text-primary ring-1 ring-primary" },
};

type SearchParams = Promise<{ nivel?: string }>;
const FILTERS = ["todos", "sem", ...LEVELS] as const;
type Filter = (typeof FILTERS)[number];

const filterLabel = (f: Filter) => ({ todos: "Todos", sem: "Sem classificar" })[f as "todos" | "sem"] ?? LEVEL[f as Level].label;
const matches = (g: Group, f: Filter) => f === "todos" || (f === "sem" ? g.level === null : g.level === f);

export default async function ReviewPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const filter = FILTERS.find((f) => f === sp.nivel) ?? "todos";
  const { groups, months } = reviewGroups(getDb(), todayISO());
  const s = summarize(groups);
  const shown = groups.filter((g) => matches(g, filter));

  return (
    <PageShell>
      <PageHeader
        title="Revisão de gastos"
        subtitle={`Classifique o que você gastou nas últimas ${REVIEW_INVOICES} faturas fechadas de cada cartão. O que se repete aparece uma vez só, e a classificação vale para as próximas faturas.`}
      />

      {groups.length === 0 ? (
        <p className={`${PANEL} text-body-md text-on-surface-variant`}>
          Nenhuma despesa em fatura fechada ainda. Lance compras num cartão (ou espere uma fatura fechar) e elas aparecem aqui.
        </p>
      ) : (
        <>
          <section aria-label="Resumo" className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className={PANEL} data-testid="total-dispensavel">
              <p className="font-body-sm text-body-sm text-on-surface-variant">Dispensável nas últimas faturas</p>
              <Amount cents={s.byLevel.dispensavel} className="font-headline-xl text-headline-xl text-expense" />
              <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
                ≈ <Amount cents={Math.round(s.byLevel.dispensavel / Math.max(months, 1))} /> por mês
              </p>
            </div>
            <div className={PANEL} data-testid="total-reduzivel">
              <p className="font-body-sm text-body-sm text-on-surface-variant">Reduzível</p>
              <Amount cents={s.byLevel.reduzivel} className="font-headline-xl text-headline-xl text-amber-400" />
              <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
                ≈ <Amount cents={Math.round(s.byLevel.reduzivel / Math.max(months, 1))} /> por mês
              </p>
            </div>
            <div className={PANEL}>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Progresso</p>
              <p className="font-headline-xl text-headline-xl" data-testid="progresso">
                {s.classified} de {s.total}
              </p>
              <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">grupos classificados</p>
            </div>
          </section>

          <nav aria-label="Filtro por nível" className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <Link
                key={f}
                href={f === "todos" ? "/revisao" : `/revisao?nivel=${f}`}
                aria-current={f === filter ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 font-label-md text-label-md transition-colors ${
                  f === filter ? "bg-primary/10 font-semibold text-primary" : "bg-surface-container-low text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {filterLabel(f)}
              </Link>
            ))}
          </nav>

          <ul className={`${PANEL} divide-y divide-outline-variant/40 py-2 lg:py-2`}>
            {shown.length === 0 && <li className="py-4 text-body-md text-on-surface-variant">Nada neste filtro.</li>}
            {shown.map((g) => (
              <li key={g.key} className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-body-md text-body-md font-medium">{g.label}</p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    <Amount cents={g.totalCents} /> · {g.count} {g.count === 1 ? "vez" : "vezes"}
                  </p>
                </div>
                <form action={classifyExpense} className="flex flex-wrap gap-2">
                  <input type="hidden" name="key" value={g.key} />
                  {LEVELS.map((l) => (
                    <button
                      key={l}
                      type="submit"
                      name="level"
                      // Tocar no nível já marcado desmarca (valor vazio).
                      value={g.level === l ? "" : l}
                      aria-pressed={g.level === l}
                      className={`cursor-pointer rounded-lg px-3 py-1.5 font-label-md text-label-md transition-colors ${
                        g.level === l ? LEVEL[l].on : "bg-surface-container-low text-on-surface-variant hover:text-on-surface"
                      }`}
                    >
                      {LEVEL[l].label}
                    </button>
                  ))}
                </form>
              </li>
            ))}
          </ul>
        </>
      )}
    </PageShell>
  );
}
