import { FormPage } from "@/components/form-page";
import { editAccountView } from "../account-views";

export default async function EditAccountPage({ params }: PageProps<"/contas/[id]">) {
  const { title, body } = editAccountView((await params).id);
  return <FormPage title={title}>{body}</FormPage>;
}
