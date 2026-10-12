import { FormPage } from "@/components/form-page";
import { newCategoryView } from "../category-views";

export default function NewCategoryPage() {
  const { title, body } = newCategoryView();
  return <FormPage title={title}>{body}</FormPage>;
}
