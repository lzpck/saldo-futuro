import { Modal } from "@/components/modal";
import { occurrenceView } from "@/app/(app)/agenda/ocorrencia/occurrence-view";

export default async function OccurrenceModal({ params, searchParams }: PageProps<"/agenda/ocorrencia/[recurrenceId]/[date]">) {
  const { recurrenceId, date } = await params;
  const { title, body } = occurrenceView(recurrenceId, date, await searchParams, true);
  return <Modal title={title}>{body}</Modal>;
}
