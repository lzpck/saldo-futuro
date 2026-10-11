"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions/auth";

const ITEMS = [
  { href: "/", label: "Resumo Geral", icon: "◎" },
  { href: "/lancamentos", label: "Lançamentos", icon: "☰" },
  { href: "/relatorios", label: "Relatórios", icon: "◔" },
  { href: "/orcamento", label: "Orçamento", icon: "◧" },
  { href: "/agenda", label: "Agenda & Vencimentos", icon: "↻" },
  { href: "/contas", label: "Contas Bancárias", icon: "▣" },
  { href: "/categorias", label: "Categorias", icon: "◆" },
];

export function Nav() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      {/* Desktop: barra lateral */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-[#1f283b] bg-[#111622] md:flex">
        <div className="flex h-20 items-center gap-3 border-b border-[#1b2334] px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-emerald-400 text-lg font-bold text-slate-950 shadow-lg shadow-emerald-500/20">
            S
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight tracking-tight text-slate-100">Saldo Futuro</h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Projeção Ativa
            </p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-4 text-sm font-medium">
          {ITEMS.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 transition-colors duration-150 ${
                isActive(i.href)
                  ? "border border-emerald-500/20 bg-emerald-500/10 font-semibold text-emerald-400 shadow-sm"
                  : "text-slate-400 hover:bg-[#182030] hover:text-slate-100"
              }`}
            >
              <span aria-hidden>{i.icon}</span>
              {i.label}
            </Link>
          ))}
        </nav>
        <form action={logout} className="border-t border-[#1b2334] bg-[#0f141f] p-4">
          <button className="btn btn-ghost w-full justify-start">Sair</button>
        </form>
      </aside>

      {/* Mobile: barra inferior */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-surface md:hidden">
        {ITEMS.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] ${
              isActive(i.href) ? "text-accent" : "text-muted"
            }`}
          >
            <span aria-hidden className="text-base">{i.icon}</span>
            {i.label.split(" ")[0]}
          </Link>
        ))}
      </nav>
    </>
  );
}
