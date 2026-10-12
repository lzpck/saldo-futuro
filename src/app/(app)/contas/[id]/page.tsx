import { AccountPage, editAccountView } from "../account-views";

export default async function EditAccountPage({ params }: PageProps<"/contas/[id]">) {
  const { title, body } = editAccountView((await params).id);
  return <AccountPage title={title}>{body}</AccountPage>;
}
