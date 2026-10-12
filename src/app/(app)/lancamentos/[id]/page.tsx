import { FormPage } from "@/components/form-page";
import { editTransactionView } from "../transaction-views";

export default async function EditTransactionPage({ params }: PageProps<"/lancamentos/[id]">) {
  const { title, body } = editTransactionView((await params).id);
  return <FormPage title={title}>{body}</FormPage>;
}
