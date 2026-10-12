"use client";

import { useActionState } from "react";
import { adjustBalance } from "@/app/actions/accounts";
import { centsToInput } from "@/lib/money";
import { MoneyInput } from "@/components/money-input";
import { ModalField, useCloseOnDone } from "@/components/modal";

/** Informa o saldo real do banco: a diferença vira um lançamento de ajuste e a data fica como "conferido em". */
export function AdjustBalanceForm({ id, balanceCents }: { id: number; balanceCents: number }) {
  const [state, action, pending] = useActionState(adjustBalance, undefined);
  const closing = useCloseOnDone(state);
  return (
    <form action={action} className="card space-y-3">
      <ModalField />
      <input type="hidden" name="id" value={id} />
      <div>
        <label htmlFor="actualBalance" className="label">Saldo real no banco</label>
        <MoneyInput id="actualBalance" name="actualBalance" allowNegative defaultValue={centsToInput(balanceCents)} className="input" />
        <p className="mt-1.5 text-xs text-on-surface-variant">
          Se for diferente do saldo do app, a diferença vira um lançamento &quot;Ajuste de saldo&quot; de hoje. Se for igual, só registra a conferência.
        </p>
      </div>
      {state?.error && <p className="error">{state.error}</p>}
      <button type="submit" disabled={pending || closing} className="btn w-full">
        {pending ? "Ajustando…" : "Ajustar saldo"}
      </button>
    </form>
  );
}
