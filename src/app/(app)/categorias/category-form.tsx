"use client";

import { useActionState, useState } from "react";
import { saveCategory } from "@/app/actions/categories";
import type { Category } from "@/lib/repos/categories";

export function CategoryForm({ existing, parents }: { existing?: Category; parents: Category[] }) {
  const [state, action, pending] = useActionState(saveCategory, undefined);
  const [kind, setKind] = useState(existing?.kind ?? "despesa");

  return (
    <form action={action} className="card space-y-4">
      {existing && <input type="hidden" name="id" value={existing.id} />}
      {existing && <input type="hidden" name="kind" value={existing.kind} />}

      <div className="grid grid-cols-[4rem_1fr] gap-3">
        <div>
          <label htmlFor="icon" className="label">Ícone</label>
          <input id="icon" name="icon" defaultValue={existing?.icon ?? "📦"} maxLength={8} required className="input text-center text-lg" />
        </div>
        <div>
          <label htmlFor="name" className="label">Nome</label>
          <input id="name" name="name" defaultValue={existing?.name} required maxLength={60} autoFocus className="input" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="color" className="label">Cor</label>
          <input id="color" name="color" type="color" defaultValue={existing?.color ?? "#2dd4bf"} className="input h-11 p-1" />
        </div>
        {!existing && (
          <div>
            <label htmlFor="kind" className="label">Tipo</label>
            <select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as "despesa" | "receita")} className="input">
              <option value="despesa">Despesa</option>
              <option value="receita">Receita</option>
            </select>
          </div>
        )}
      </div>

      {!existing && (
        <div>
          <label htmlFor="parentId" className="label">Subcategoria de</label>
          <select id="parentId" name="parentId" defaultValue="" className="input" key={kind}>
            <option value="">Nenhuma (categoria principal)</option>
            {parents.filter((p) => p.kind === kind).map((p) => (
              <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
            ))}
          </select>
        </div>
      )}

      {state?.error && <p className="error">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "Salvando…" : "Salvar categoria"}
      </button>
    </form>
  );
}
