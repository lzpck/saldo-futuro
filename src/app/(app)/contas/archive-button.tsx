"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toggleAccountArchived } from "@/app/actions/accounts";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useModalClose } from "@/components/modal";

/** "Arquivar" com confirmação. Ao concluir, fecha o modal (ou volta à lista de Contas, na página inteira). */
export function ArchiveAccountButton({ id, noun }: { id: number; noun: string }) {
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();
  const closeModal = useModalClose();

  return (
    <div>
      <button type="button" onClick={() => setConfirming(true)} className="btn btn-danger w-full">Arquivar {noun}</button>
      <p className="mt-2 text-xs text-muted">Some das listas, mas os lançamentos e o histórico continuam guardados.</p>
      {confirming && (
        <ConfirmDialog
          label={`Arquivar ${noun}`}
          title={`Arquivar ${noun}`}
          subtitle="Dá para restaurar depois."
          description="Deixa de ser oferecida para novos lançamentos, mas o histórico e os lançamentos antigos continuam guardados."
          onCancel={() => setConfirming(false)}
        >
          <form
            action={async (fd) => {
              await toggleAccountArchived(fd);
              if (closeModal) closeModal();
              else router.push("/contas");
            }}
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="archive" value="1" />
            <button className="rounded-lg bg-error-container px-4 py-2 font-label-md text-label-md text-on-error-container transition-opacity hover:opacity-90">
              Arquivar
            </button>
          </form>
        </ConfirmDialog>
      )}
    </div>
  );
}
