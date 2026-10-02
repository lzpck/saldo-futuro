"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { loadBudgetNotice, type BudgetNotice } from "@/app/actions/transactions";
import { formatBRL } from "@/lib/money";

/** Faixa de aviso de orçamento após salvar um lançamento (?orcamento=categoria_mês), em qualquer tela. */
export function BudgetNoticeBar() {
  const param = useSearchParams().get("orcamento");
  const [loaded, setLoaded] = useState<{ param: string; items: BudgetNotice[] } | null>(null);

  useEffect(() => {
    if (!param) return;
    const [id, month = ""] = param.split("_");
    let cancelled = false;
    loadBudgetNotice(Number(id), month).then((items) => {
      if (!cancelled) setLoaded({ param, items });
    });
    return () => {
      cancelled = true;
    };
  }, [param]);

  const items = loaded && loaded.param === param ? loaded.items : [];
  if (!param || items.length === 0) return null;
  return (
    <div role="status" className="mb-5 rounded-xl border border-expense/40 bg-expense/10 px-3.5 py-2.5 text-sm text-expense">
      {items.map((w) => (
        <p key={w.categoryName}>
          <span aria-hidden>⛔ </span>
          {w.exceeded ? "Orçamento estourado" : "Orçamento vai estourar"} em {w.categoryName}: {formatBRL(w.usedCents)} de{" "}
          {formatBRL(w.limitCents)}.{" "}
          <Link href={`/orcamento?mes=${w.month}`} className="underline">
            Ver orçamento
          </Link>
        </p>
      ))}
    </div>
  );
}
