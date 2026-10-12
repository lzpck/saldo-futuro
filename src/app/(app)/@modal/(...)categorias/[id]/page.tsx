import { Modal } from "@/components/modal";
import { editCategoryView } from "../../../categorias/category-views";

export default async function EditCategoryModal({ params }: PageProps<"/categorias/[id]">) {
  const { title, body } = editCategoryView((await params).id);
  return <Modal title={title}>{body}</Modal>;
}
