"use client";

import { useActionState, useState } from "react";
import { anticipatePurchase } from "@/app/actions/schedule";
import { MoneyInput } from "@/components/money-input";
import { centsToInput } from "@/lib/money";

/**
 * Antecipar as últimas N parcelas restantes. `amountsCents` são as parcelas que dá para antecipar, da
 * primeira para a última; o valor cobrado vem preenchido com a soma das N últimas e pode ter desconto.
 */
export function AnticipateForm({ purchaseId, amountsCents }: { purchaseId: number; amountsCents: number[] }) {
  const [state, action, pending] = useActionState(anticipatePurchase, undefined);
  const [count, setCount] = useState(amountsCents.length);
  const original = amountsCents.slice(-count).reduce((s, c) => s + c, 0);

  return (
    <form action={action} className="card space-y-2">
      <input type="hidden" name="purchaseId" value={purchaseId} />
      <p className="text-sm text-muted">
        Pagou parcelas antes do vencimento (o banco costuma dar desconto): as últimas parcelas passam a ter a data de hoje e o valor cobrado.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="antecipar-count" className="label">Parcelas</label>
          <input
            id="antecipar-count"
            name="count"
            type="number"
            min={1}
            max={amountsCents.length}
            value={count}
            onChange={(e) => setCount(Math.min(amountsCents.length, Math.max(1, Number(e.target.value) || 1)))}
            className="input"
          />
        </div>
        <div>
          <label htmlFor="antecipar-amount" className="label">Valor cobrado</label>
          <MoneyInput key={count} id="antecipar-amount" name="amount" defaultValue={centsToInput(original)} className="input" />
        </div>
      </div>
      {state?.error && <p className="error">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn w-full">
        {pending ? "Antecipando…" : "Antecipar parcelas"}
      </button>
    </form>
  );
}
