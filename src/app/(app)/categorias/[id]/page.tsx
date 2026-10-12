import { CategoryPage, editCategoryView } from "../category-views";

export default async function EditCategoryPage({ params }: PageProps<"/categorias/[id]">) {
  const { title, body } = editCategoryView((await params).id);
  return <CategoryPage title={title}>{body}</CategoryPage>;
}
