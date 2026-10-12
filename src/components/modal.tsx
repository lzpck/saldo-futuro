"use client";

import { useRouter } from "next/navigation";
import type { FormState } from "@/lib/forms";
import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";

const icon = "material-symbols-outlined";

const ModalContext = createContext<(() => void) | null>(null);

/** Função que fecha o modal em que o formulário está, ou `null` quando ele é a página inteira. */
export function useModalClose(): (() => void) | null {
  return useContext(ModalContext);
}

/**
 * Moldura de formulário aberto por cima da tela de origem (rota interceptada). Fechar volta no histórico.
 * X e Esc fecham sempre; o clique no fundo só fecha se nada foi digitado, para não perder o que está preenchido.
 */
export function Modal({ title, children }: { title: string; children: ReactNode }) {
  const router = useRouter();
  const dirty = useRef(false);
  const close = useCallback(() => router.back(), [router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [close]);

  return (
    <ModalContext.Provider value={close}>
      <div
        className="fixed inset-0 z-50 flex items-end bg-surface-dim/80 backdrop-blur-sm md:items-center md:justify-center md:p-4"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !dirty.current) close();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onInput={() => (dirty.current = true)}
          onChange={() => (dirty.current = true)}
          className="flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-surface-container-high text-on-surface shadow-2xl md:max-w-lg md:rounded-2xl"
        >
          <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
            <h2 className="font-headline-md text-headline-md">{title}</h2>
            <button
              type="button"
              aria-label="Fechar"
              onClick={close}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
            >
              <span aria-hidden className={icon}>close</span>
            </button>
          </div>
          <div className="space-y-4 overflow-y-auto px-5 pb-5 [&_.card]:border-0 [&_.card]:bg-transparent [&_.card]:p-0">{children}</div>
        </div>
      </div>
    </ModalContext.Provider>
  );
}

/** Campo oculto que avisa a action que o formulário está num modal (ela responde `done` em vez de redirecionar). */
export function ModalField() {
  return useModalClose() ? <input type="hidden" name="modal" value="1" /> : null;
}

/**
 * Fecha o modal quando a action avisa que salvou: volta no histórico ou, se a action indicou `next`, vai para lá
 * (trocando a entrada do modal no histórico). Fora de um modal não faz nada (a action já redirecionou).
 */
export function useCloseOnDone(state: FormState): boolean {
  const close = useModalClose();
  const router = useRouter();
  useEffect(() => {
    if (!state?.done) return;
    if (state.next) router.replace(state.next);
    else close?.();
  }, [state, close, router]);
  // Já salvou: o botão fica desabilitado até a navegação terminar, para um clique duplo não salvar de novo.
  return Boolean(state?.done);
}
