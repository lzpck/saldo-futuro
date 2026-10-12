"use client";

import Link from "next/link";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useEffect, useRef, useState, type ReactNode } from "react";

const icon = "material-symbols-outlined";

/**
 * Menu "⋯" da linha (Editar e Excluir). A exclusão abre um diálogo de confirmação, como no template;
 * o formulário que de fato exclui vem em `children`.
 */
export function RowMenu({ label, editHref, skipping, children }: { label: string; editHref: string; skipping: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`Ações para ${label}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
      >
        <span className={icon}>more_horiz</span>
      </button>

      {open && !confirming && (
        <div role="menu" className="absolute right-0 top-9 z-30 min-w-[190px] rounded-xl bg-surface-container-high p-1.5 text-on-surface shadow-2xl backdrop-blur-md">
          <Link href={editHref} role="menuitem" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-body-sm font-body-sm transition-colors hover:bg-surface-container">
            <span className={`${icon} text-[18px] text-on-surface-variant`}>edit</span>
            <span>Editar Lançamento</span>
          </Link>
          <div className="my-1 h-px bg-surface-container-highest" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setConfirming(true);
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-body-sm font-body-sm text-error transition-colors hover:bg-error-container/30"
          >
            <span className={`${icon} text-[18px] text-error`}>delete_forever</span>
            <span>{skipping ? "Pular Ocorrência" : "Excluir com Confirmação"}</span>
          </button>
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          label="Confirmar exclusão"
          title={skipping ? "Pular ocorrência" : "Confirmar Exclusão"}
          subtitle="Esta ação recalculará a curva de projeção financeira."
          description={
            skipping
              ? "Só esta ocorrência deixa de valer; as demais continuam. Ela sai dos fluxos de caixa futuros e do saldo previsto."
              : "Tem certeza de que deseja remover este lançamento? Ele será desvinculado dos fluxos de caixa futuros e do saldo previsto."
          }
          onCancel={() => setConfirming(false)}
        >
          {children}
        </ConfirmDialog>
      )}
    </div>
  );
}
