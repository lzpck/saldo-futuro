import Link from "next/link";
import type { ReactNode } from "react";

const icon = "material-symbols-outlined";

/** Cartão padrão das telas principais; cartões aninhados usam `bg-surface-container-low` (ou `-high` em destaque). */
export const PANEL = "rounded-xl bg-surface-container p-5 shadow-md lg:p-6";
/** Ação principal do cabeçalho de uma página. */
export const PRIMARY_ACTION =
  "flex items-center gap-2 rounded-lg bg-primary-container px-4 py-2 font-headline-md text-body-md text-on-primary shadow-lg shadow-primary-container/20 transition-all hover:opacity-95 active:scale-95";

/** Moldura comum das telas principais: largura, gutters e espaçamento vertical entre blocos. */
export function PageShell({ width = "wide", children }: { width?: "wide" | "narrow"; children: ReactNode }) {
  const max = width === "wide" ? "max-w-[1560px]" : "max-w-4xl";
  return <div className={`mx-auto flex w-full ${max} flex-col gap-6 px-4 py-7 font-jakarta text-on-surface md:px-8`}>{children}</div>;
}

/** Cabeçalho comum: `h1`, subtítulo opcional e controles à direita; `children` vai numa segunda linha (filtros). */
export function PageHeader({
  title,
  subtitle,
  actions,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-headline-xl text-headline-xl tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 font-body-md text-body-md text-secondary">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/** Seletor de período com setas; os destinos (`prevHref`/`nextHref`) são montados por cada página. */
export function MonthStepper({
  label,
  prevHref,
  nextHref,
  prevLabel = "Mês anterior",
  nextLabel = "Próximo mês",
}: {
  label: ReactNode;
  prevHref: string;
  nextHref: string;
  prevLabel?: string;
  nextLabel?: string;
}) {
  const arrow = "flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface";
  return (
    <div className="flex items-center rounded-xl bg-surface-container-low p-1 shadow-sm">
      <Link href={prevHref} aria-label={prevLabel} className={arrow}>
        <span aria-hidden className={`${icon} text-[18px]`}>chevron_left</span>
      </Link>
      <div className="flex select-none items-center gap-2 px-3 py-1 font-body-sm text-body-sm font-semibold">
        <span aria-hidden className={`${icon} text-[18px] text-primary`}>calendar_month</span>
        <span>{label}</span>
      </div>
      <Link href={nextHref} aria-label={nextLabel} className={arrow}>
        <span aria-hidden className={`${icon} text-[18px]`}>chevron_right</span>
      </Link>
    </div>
  );
}
