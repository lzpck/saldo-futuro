import { FormPage } from "@/components/form-page";
import { occurrenceView } from "../../occurrence-view";

export default async function OccurrencePage({ params, searchParams }: PageProps<"/agenda/ocorrencia/[recurrenceId]/[date]">) {
  const { recurrenceId, date } = await params;
  const { title, body } = occurrenceView(recurrenceId, date, await searchParams);
  return <FormPage title={title}>{body}</FormPage>;
}
