import { Modal } from "@/components/modal";
import { newCategoryView } from "../../../categorias/category-views";

export default function NewCategoryModal() {
  const { title, body } = newCategoryView();
  return <Modal title={title}>{body}</Modal>;
}
