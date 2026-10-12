import { FormPage } from "@/components/form-page";
import { newAccountView } from "../account-views";

export default async function NewAccountPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const { title, body } = newAccountView((await searchParams).tipo);
  return <FormPage title={title}>{body}</FormPage>;
}
