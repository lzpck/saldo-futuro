"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions/auth";

const icon = "material-symbols-outlined";

const ITEMS = [
  { href: "/", label: "Resumo Geral", short: "Resumo", icon: "space_dashboard" },
  { href: "/lancamentos", label: "Lançamentos", short: "Lançamentos", icon: "receipt_long" },
  { href: "/relatorios", label: "Relatórios", short: "Relatórios", icon: "pie_chart" },
  { href: "/orcamento", label: "Orçamento", short: "Orçamento", icon: "savings" },
  { href: "/agenda", label: "Agenda & Vencimentos", short: "Agenda", icon: "event_repeat" },
  { href: "/contas", label: "Contas Bancárias", short: "Contas", icon: "account_balance" },
  { href: "/categorias", label: "Categorias", short: "Categorias", icon: "category" },
];

/** Na barra inferior cabem 4 destinos mais "Mais" (o resto fica no menu). */
const MOBILE_MAIN = ["/", "/lancamentos", "/agenda", "/contas"];

export function Nav() {
  const pathname = usePathname();
  // A tela de um cartão pertence a Contas.
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href) || (href === "/contas" && pathname.startsWith("/cartoes"));
  const more = ITEMS.filter((i) => !MOBILE_MAIN.includes(i.href));
  const moreActive = more.some((i) => isActive(i.href));
  const tab = (active: boolean) =>
    `flex flex-1 flex-col items-center gap-0.5 py-2 font-label-sm text-label-sm transition-colors ${
      active ? "text-primary" : "text-on-surface-variant hover:text-on-surface"
    }`;

  return (
    <>
      {/* Desktop: barra lateral */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-surface-container-high bg-surface-container-low font-jakarta md:flex">
        <div className="flex h-20 items-center border-b border-surface-container-high px-6">
          <Image src="/logo/horizontal-cor-escuro.svg" alt="Saldo Futuro" width={150} height={42} priority />
        </div>
        <nav aria-label="Principal" className="flex flex-1 flex-col gap-1 overflow-y-auto p-4 text-body-md font-medium">
          {ITEMS.map((i) => {
            const active = isActive(i.href);
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 transition-colors duration-150 ${
                  active
                    ? "bg-primary/10 font-semibold text-primary"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                }`}
              >
                <span aria-hidden className={`${icon} text-[22px]`} style={{ fontVariationSettings: `"FILL" ${active ? 1 : 0}` }}>
                  {i.icon}
                </span>
                {i.label}
              </Link>
            );
          })}
        </nav>
        <form action={logout} className="border-t border-surface-container-high p-4">
          <button className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3.5 py-2.5 text-body-md font-medium text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface">
            <span aria-hidden className={`${icon} text-[22px]`}>logout</span>
            Sair
          </button>
        </form>
      </aside>

      {/* Mobile: barra inferior */}
      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-[45] flex border-t border-surface-container-high bg-surface-container-low font-jakarta md:hidden">
        {ITEMS.filter((i) => MOBILE_MAIN.includes(i.href)).map((i) => {
          const active = isActive(i.href);
          return (
            <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined} className={tab(active)}>
              <span aria-hidden className={`${icon} text-[24px]`} style={{ fontVariationSettings: `"FILL" ${active ? 1 : 0}` }}>
                {i.icon}
              </span>
              {i.short}
            </Link>
          );
        })}
        <details key={pathname} className="relative flex flex-1 [&_summary::-webkit-details-marker]:hidden">
          <summary className={`${tab(moreActive)} w-full cursor-pointer list-none`}>
            <span aria-hidden className={`${icon} text-[24px]`}>more_horiz</span>
            Mais
          </summary>
          <div className="absolute bottom-full right-2 mb-2 flex w-56 flex-col gap-1 rounded-xl bg-surface-container-high p-2 shadow-2xl">
            {more.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                aria-current={isActive(i.href) ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-body-md ${
                  isActive(i.href) ? "bg-primary/10 font-semibold text-primary" : "text-on-surface hover:bg-surface-container-highest"
                }`}
              >
                <span aria-hidden className={`${icon} text-[20px]`}>{i.icon}</span>
                {i.label}
              </Link>
            ))}
            <form action={logout}>
              <button className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-body-md text-on-surface-variant hover:bg-surface-container-highest">
                <span aria-hidden className={`${icon} text-[20px]`}>logout</span>
                Sair
              </button>
            </form>
          </div>
        </details>
      </nav>
    </>
  );
}
