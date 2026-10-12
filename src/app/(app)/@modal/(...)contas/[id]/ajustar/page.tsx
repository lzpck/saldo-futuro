import { Modal } from "@/components/modal";
import { adjustBalanceView } from "../../../../contas/account-views";

export default async function AdjustBalanceModal({ params }: PageProps<"/contas/[id]/ajustar">) {
  const { title, body } = adjustBalanceView((await params).id);
  return <Modal title={title}>{body}</Modal>;
}
