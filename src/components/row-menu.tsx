"use client";

import Link from "next/link";
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-dim/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Confirmar exclusão">
          <div className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-surface-container-high p-6 text-left text-on-surface shadow-2xl">
            <div className="flex items-center gap-3 text-error">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-error-container/30">
                <span className={`${icon} text-headline-md`}>warning</span>
              </div>
              <div>
                <h4 className="font-headline-md text-headline-md text-on-surface">{skipping ? "Pular ocorrência" : "Confirmar Exclusão"}</h4>
                <p className="font-label-sm text-label-sm text-on-surface-variant">Esta ação recalculará a curva de projeção financeira.</p>
              </div>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant">
              {skipping
                ? "Só esta ocorrência deixa de valer; as demais continuam. Ela sai dos fluxos de caixa futuros e do saldo previsto."
                : "Tem certeza de que deseja remover este lançamento? Ele será desvinculado dos fluxos de caixa futuros e do saldo previsto."}
            </p>
            <div className="mt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-lg bg-surface-container px-4 py-2 font-label-md text-label-md text-on-surface transition-colors hover:bg-surface-container-highest"
              >
                Cancelar
              </button>
              {children}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
