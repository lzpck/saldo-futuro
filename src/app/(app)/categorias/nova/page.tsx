import { getDb } from "@/lib/db/connection";
import { listCategories } from "@/lib/repos/categories";
import { CategoryForm } from "../category-form";

export default function NewCategoryPage() {
  const parents = listCategories(getDb()).filter((c) => c.parentId === null);
  return (
    <div className="mx-auto max-w-lg space-y-5">
      <h1 className="text-2xl font-semibold">Nova categoria</h1>
      <CategoryForm parents={parents} />
    </div>
  );
}
