"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ComponentProps } from "react";
import { withReturnTo } from "@/lib/return-to";

/** Link que abre o formulário de lançamento e lembra a tela atual, para voltar a ela ao salvar. */
export function FormLink({ href, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  return <Link href={withReturnTo(href, query ? `${pathname}?${query}` : pathname)} {...props} />;
}
