import { AccountPage, newAccountView } from "../account-views";

export default async function NewAccountPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const { title, body } = newAccountView((await searchParams).tipo);
  return <AccountPage title={title}>{body}</AccountPage>;
}
