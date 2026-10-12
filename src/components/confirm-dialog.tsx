"use client";

import type { ReactNode } from "react";

const icon = "material-symbols-outlined";

/**
 * Diálogo de confirmação de uma ação destrutiva. Cancelar chama `onCancel`; o botão que de fato
 * executa a ação (um formulário) vem em `children`, ao lado de Cancelar.
 */
export function ConfirmDialog({
  label,
  title,
  subtitle,
  description,
  onCancel,
  children,
}: {
  label: string;
  title: string;
  subtitle: string;
  description: string;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-surface-dim/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={label}>
      <div className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-surface-container-high p-6 text-left text-on-surface shadow-2xl">
        <div className="flex items-center gap-3 text-error">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-error-container/30">
            <span className={`${icon} text-headline-md`}>warning</span>
          </div>
          <div>
            <h4 className="font-headline-md text-headline-md text-on-surface">{title}</h4>
            <p className="font-label-sm text-label-sm text-on-surface-variant">{subtitle}</p>
          </div>
        </div>
        <p className="font-body-md text-body-md text-on-surface-variant">{description}</p>
        <div className="mt-2 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg bg-surface-container px-4 py-2 font-label-md text-label-md text-on-surface transition-colors hover:bg-surface-container-highest"
          >
            Cancelar
          </button>
          {children}
        </div>
      </div>
    </div>
  );
}
