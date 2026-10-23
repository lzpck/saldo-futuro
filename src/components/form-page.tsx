import type { ReactNode } from "react";

/** Conteúdo de um formulário, compartilhado pela página inteira e pelo modal (rota interceptada). */
export type FormView = { title: string; body: ReactNode };

/** Moldura da página inteira (acesso direto ou atualização); o modal usa `Modal` no lugar. */
export function FormPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-lg space-y-5">
      <h1 className="font-headline-xl text-headline-xl tracking-tight">{title}</h1>
      {children}
    </div>
  );
}
