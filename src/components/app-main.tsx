"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** O Resumo e os Lançamentos ocupam a largura toda (cabeçalho fixo e conteúdo próprio); as demais telas ficam numa coluna central. */
export function AppMain({ notice, children }: { notice: ReactNode; children: ReactNode }) {
  const path = usePathname();
  const wide = path === "/" || path === "/lancamentos" || path === "/relatorios" || path === "/agenda";
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
