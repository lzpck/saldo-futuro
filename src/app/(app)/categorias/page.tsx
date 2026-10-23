import Link from "next/link";
import { toggleCategoryArchived } from "@/app/actions/categories";
import { PageHeader, PageShell, PANEL, PRIMARY_ACTION } from "@/components/page-shell";
import { getDb } from "@/lib/db/connection";
import { listCategories, type Category } from "@/lib/repos/categories";

const icon = "material-symbols-outlined";

function CategoryRow({ c, sub = false }: { c: Category; sub?: boolean }) {
  return (
    <li className={`group flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-surface-container-high ${sub ? "ml-8" : ""}`}>
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg"
        style={{ backgroundColor: `${c.color}26` }}
        aria-hidden
      >
        {c.icon}
      </span>
      <span className={`min-w-0 flex-1 truncate font-body-md text-body-md ${sub ? "text-on-surface-variant" : "font-semibold"}`}>{c.name}</span>
      <Link
        href={`/categorias/${c.id}`}
        aria-label={`Editar ${c.name}`}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-highest hover:text-on-surface"
      >
        <span aria-hidden className={`${icon} text-[20px]`}>edit</span>
      </Link>
      <form action={toggleCategoryArchived}>
        <input type="hidden" name="id" value={c.id} />
        <input type="hidden" name="archive" value={c.archived ? "0" : "1"} />
        <button
          aria-label={`${c.archived ? "Restaurar" : "Arquivar"} ${c.name}`}
          title={c.archived ? "Restaurar" : "Arquivar"}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-highest hover:text-on-surface"
        >
          <span aria-hidden className={`${icon} text-[20px]`}>{c.archived ? "unarchive" : "archive"}</span>
        </button>
      </form>
    </li>
  );
}

/** `flat` lista sem hierarquia: uma arquivada pode ter a categoria principal ainda ativa. */
function Group({ title, items, flat = false }: { title: string; items: Category[]; flat?: boolean }) {
  const parents = flat ? items : items.filter((c) => c.parentId === null);
  return (
    <section className={`${PANEL} ${flat ? "opacity-80" : ""}`}>
      <h2 className="mb-3 font-label-md text-label-md font-semibold uppercase tracking-wide text-on-surface-variant">
        {title} <span className="ml-1 rounded-full bg-surface-container-high px-2 py-0.5 normal-case tracking-normal">{items.length}</span>
      </h2>
      <ul className="space-y-0.5">
        {parents.map((p) => (
          <li key={p.id}>
            <ul className="space-y-0.5">
              <CategoryRow c={p} />
              {(flat ? [] : items.filter((c) => c.parentId === p.id)).map((c) => (
                <CategoryRow key={c.id} c={c} sub />
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function CategoriesPage() {
  const all = listCategories(getDb(), { includeArchived: true });
  const active = all.filter((c) => !c.archived);
  const archived = all.filter((c) => c.archived);

  return (
    <PageShell>
      <PageHeader
        title="Categorias"
        subtitle="Como seus lançamentos são classificados nos relatórios e no orçamento."
        actions={
          <Link href="/categorias/nova" className={PRIMARY_ACTION}>
            <span aria-hidden className={icon}>add</span>
            Nova categoria
          </Link>
        }
      />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Group title="Despesas" items={active.filter((c) => c.kind === "despesa")} />
        <Group title="Receitas" items={active.filter((c) => c.kind === "receita")} />
      </div>
      {archived.length > 0 && <Group title="Arquivadas" items={archived} flat />}
    </PageShell>
  );
}
