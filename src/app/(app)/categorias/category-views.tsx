import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/connection";
import { getCategory, listCategories } from "@/lib/repos/categories";
import { CategoryForm } from "./category-form";

/** Conteúdo dos formulários de Categoria, compartilhado pela página inteira e pelo modal (rota interceptada). */
type View = { title: string; body: ReactNode };

export function newCategoryView(): View {
  const parents = listCategories(getDb()).filter((c) => c.parentId === null);
  return { title: "Nova categoria", body: <CategoryForm parents={parents} /> };
}

export function editCategoryView(id: string): View {
  const category = getCategory(getDb(), Number(id));
  if (!category) notFound();
  return { title: "Editar categoria", body: <CategoryForm existing={category} parents={[]} /> };
}

/** Moldura da página inteira (acesso direto ou atualização); o modal usa `Modal` no lugar. */
export function CategoryPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-lg space-y-5">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}
