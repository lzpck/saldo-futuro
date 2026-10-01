import Link from "next/link";
import { toggleCategoryArchived } from "@/app/actions/categories";
import { getDb } from "@/lib/db/connection";
import { listCategories, type Category } from "@/lib/repos/categories";

function CategoryRow({ c, sub = false }: { c: Category; sub?: boolean }) {
  return (
    <li className={`flex items-center gap-3 py-2.5 ${sub ? "pl-10" : ""}`}>
      <span
        className="flex h-8 w-8 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${c.color}26` }}
        aria-hidden
      >
        {c.icon}
      </span>
      <span className="flex-1 text-sm">{c.name}</span>
      <Link href={`/categorias/${c.id}`} className="btn px-3 py-1.5 text-xs">Editar</Link>
      <form action={toggleCategoryArchived}>
        <input type="hidden" name="id" value={c.id} />
        <input type="hidden" name="archive" value={c.archived ? "0" : "1"} />
        <button className="btn btn-ghost px-3 py-1.5 text-xs">{c.archived ? "Restaurar" : "Arquivar"}</button>
      </form>
    </li>
  );
}

function Group({ title, items }: { title: string; items: Category[] }) {
  const parents = items.filter((c) => c.parentId === null);
  return (
    <section className="card">
      <h2 className="mb-1 text-sm font-medium text-muted">{title}</h2>
      <ul className="divide-y divide-line">
        {parents.map((p) => (
          <div key={p.id}>
            <CategoryRow c={p} />
            {items.filter((c) => c.parentId === p.id).map((c) => (
              <CategoryRow key={c.id} c={c} sub />
            ))}
          </div>
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
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Categorias</h1>
        <Link href="/categorias/nova" className="btn btn-primary">+ Nova</Link>
      </div>
      <Group title="Despesas" items={active.filter((c) => c.kind === "despesa")} />
      <Group title="Receitas" items={active.filter((c) => c.kind === "receita")} />
      {archived.length > 0 && (
        <section className="card opacity-70">
          <h2 className="mb-1 text-sm font-medium text-muted">Arquivadas</h2>
          <ul className="divide-y divide-line">
            {archived.map((c) => (
              <CategoryRow key={c.id} c={c} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
