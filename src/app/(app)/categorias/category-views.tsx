import type { FormView as View } from "@/components/form-page";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/connection";
import { getCategory, listCategories } from "@/lib/repos/categories";
import { CategoryForm } from "./category-form";

export function newCategoryView(): View {
  const parents = listCategories(getDb()).filter((c) => c.parentId === null);
  return { title: "Nova categoria", body: <CategoryForm parents={parents} /> };
}

export function editCategoryView(id: string): View {
  const category = getCategory(getDb(), Number(id));
  if (!category) notFound();
  return { title: "Editar categoria", body: <CategoryForm existing={category} parents={[]} /> };
}
