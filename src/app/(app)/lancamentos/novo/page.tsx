import { FormPage } from "@/components/form-page";
import { newTransactionView } from "../transaction-views";

export default async function NewTransactionPage({ searchParams }: { searchParams: Promise<{ repeat?: string; conta?: string }> }) {
  const { title, body } = newTransactionView(await searchParams);
  return <FormPage title={title}>{body}</FormPage>;
}
