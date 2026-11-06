"use client";

import { usePathname, useSelectedLayoutSegments } from "next/navigation";
import { useState, type ReactNode } from "react";

/** As telas principais ocupam a largura toda (cada uma com seu `PageShell`); detalhes e formulários ficam numa coluna central. */
export function AppMain({ notice, children }: { notice: ReactNode; children: ReactNode }) {
  const path = usePathname();
  // Com um modal aberto a URL já é a do formulário (ex.: /lancamentos/5), mas a tela de trás não mudou: mantém a largura dela.
  const inModal = useSelectedLayoutSegments("modal")[1]?.startsWith("(...)") ?? false;
  const isWide = path === "/" || path === "/lancamentos" || path === "/relatorios" || path === "/agenda" || path === "/contas" || path === "/categorias" || path === "/orcamento";
  const [wide, setWide] = useState(isWide);
  if (!inModal && wide !== isWide) setWide(isWide);
  if (wide) {
    return (
      <main className="pb-28 md:ml-64 md:pb-10">
        <div className="mx-auto max-w-[1560px] px-4 pt-4 md:px-8">{notice}</div>
        {children}
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-4xl px-4 pb-28 pt-6 md:ml-64 md:max-w-none md:px-10 md:pb-10 md:pt-10">
      <div className="mx-auto max-w-4xl">
        {notice}
        {children}
      </div>
    </main>
  );
}
