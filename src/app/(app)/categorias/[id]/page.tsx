import { FormPage } from "@/components/form-page";
import { editCategoryView } from "../category-views";

export default async function EditCategoryPage({ params }: PageProps<"/categorias/[id]">) {
  const { title, body } = editCategoryView((await params).id);
  return <FormPage title={title}>{body}</FormPage>;
}
