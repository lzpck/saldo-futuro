"use client";

import { useActionState } from "react";
import { saveBudget } from "@/app/actions/budgets";
import { centsToInput } from "@/lib/money";

export function LimitForm({
  categoryId,
  month,
  limitCents,
  name,
}: {
  categoryId: number;
  month: string;
  limitCents: number | null;
  name: string;
}) {
  const [state, action, pending] = useActionState(saveBudget, undefined);
  const id = `limite-${categoryId}`;

  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="categoryId" value={categoryId} />
      <input type="hidden" name="month" value={month} />
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="sr-only">
          Limite de {name}
        </label>
        <input
          id={id}
          name="limit"
          inputMode="decimal"
          defaultValue={limitCents ? centsToInput(limitCents) : ""}
          key={limitCents ?? "sem"}
          placeholder="Sem limite"
          className="input w-32 py-1.5 text-right"
        />
        <button type="submit" disabled={pending} className="btn px-3 py-1.5 text-xs">
          {pending ? "Salvando…" : "Salvar"}
        </button>
      </div>
      {state?.error && <p className="error text-xs">{state.error}</p>}
    </form>
  );
}
