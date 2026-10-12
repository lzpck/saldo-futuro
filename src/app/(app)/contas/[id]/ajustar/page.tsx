import { FormPage } from "@/components/form-page";
import { adjustBalanceView } from "../../account-views";

export default async function AdjustBalancePage({ params }: PageProps<"/contas/[id]/ajustar">) {
  const { title, body } = adjustBalanceView((await params).id);
  return <FormPage title={title}>{body}</FormPage>;
}
