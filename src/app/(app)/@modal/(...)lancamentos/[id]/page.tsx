import { Modal } from "@/components/modal";
import { editTransactionView } from "@/app/(app)/lancamentos/transaction-views";

export default async function EditTransactionModal({ params }: PageProps<"/lancamentos/[id]">) {
  const { title, body } = editTransactionView((await params).id);
  return <Modal title={title}>{body}</Modal>;
}
