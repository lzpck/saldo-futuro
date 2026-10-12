import { Modal } from "@/components/modal";
import { editAccountView } from "../../../contas/account-views";

export default async function EditAccountModal({ params }: PageProps<"/contas/[id]">) {
  const { title, body } = editAccountView((await params).id);
  return <Modal title={title}>{body}</Modal>;
}
