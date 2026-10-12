import { Modal } from "@/components/modal";
import { newTransactionView } from "@/app/(app)/lancamentos/transaction-views";

export default async function NewTransactionModal({ searchParams }: { searchParams: Promise<{ repeat?: string; conta?: string }> }) {
  const { title, body } = newTransactionView(await searchParams);
  return <Modal title={title}>{body}</Modal>;
}
