import { Modal } from "@/components/modal";
import { purchaseEditView } from "@/app/(app)/agenda/parcelamentos/[id]/editar/purchase-edit-view";

export default async function EditPurchaseModal({ params }: PageProps<"/agenda/parcelamentos/[id]/editar">) {
  const { title, body } = purchaseEditView((await params).id);
  return <Modal title={title}>{body}</Modal>;
}
