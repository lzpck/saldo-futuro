import { CategoryPage, newCategoryView } from "../category-views";

export default function NewCategoryPage() {
  const { title, body } = newCategoryView();
  return <CategoryPage title={title}>{body}</CategoryPage>;
}
