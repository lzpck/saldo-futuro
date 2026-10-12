import { AccountPage, adjustBalanceView } from "../../account-views";

export default async function AdjustBalancePage({ params }: PageProps<"/contas/[id]/ajustar">) {
  const { title, body } = adjustBalanceView((await params).id);
  return <AccountPage title={title}>{body}</AccountPage>;
}
