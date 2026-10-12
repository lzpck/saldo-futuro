import { FormPage } from "@/components/form-page";
import { purchaseEditView } from "./purchase-edit-view";

export default async function EditPurchasePage({ params }: PageProps<"/agenda/parcelamentos/[id]/editar">) {
  const { title, body } = purchaseEditView((await params).id);
  return <FormPage title={title}>{body}</FormPage>;
}
