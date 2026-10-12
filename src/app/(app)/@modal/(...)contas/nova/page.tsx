import { Modal } from "@/components/modal";
import { newAccountView } from "../../../contas/account-views";

export default async function NewAccountModal({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const { title, body } = newAccountView((await searchParams).tipo);
  return <Modal title={title}>{body}</Modal>;
}
