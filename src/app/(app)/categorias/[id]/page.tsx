import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/connection";
import { getCategory } from "@/lib/repos/categories";
import { CategoryForm } from "../category-form";

export default async function EditCategoryPage({ params }: PageProps<"/categorias/[id]">) {
  const { id } = await params;
  const category = getCategory(getDb(), Number(id));
  if (!category) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <h1 className="text-2xl font-semibold">Editar categoria</h1>
      <CategoryForm existing={category} parents={[]} />
    </div>
  );
}
