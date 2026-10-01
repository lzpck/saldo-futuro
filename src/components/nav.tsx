"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions/auth";

const ITEMS = [
  { href: "/", label: "Resumo", icon: "◎" },
  { href: "/lancamentos", label: "Lançamentos", icon: "☰" },
  { href: "/relatorios", label: "Relatórios", icon: "◔" },
  { href: "/orcamento", label: "Orçamento", icon: "◧" },
  { href: "/agenda", label: "Agenda", icon: "↻" },
  { href: "/contas", label: "Contas", icon: "▣" },
  { href: "/categorias", label: "Categorias", icon: "◆" },
];

export function Nav() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      {/* Desktop: barra lateral */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-surface p-5 md:flex">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent font-bold text-accent-fg">S</div>
          <span className="font-semibold">Saldo Futuro</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {ITEMS.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                isActive(i.href) ? "bg-surface-2 text-accent" : "text-muted hover:text-fg"
              }`}
            >
              <span aria-hidden>{i.icon}</span>
              {i.label}
            </Link>
          ))}
        </nav>
        <form action={logout}>
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
            {i.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
