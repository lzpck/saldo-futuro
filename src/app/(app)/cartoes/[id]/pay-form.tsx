"use client";

import { useActionState } from "react";
import { payInvoiceAction } from "@/app/actions/cards";
import type { Account } from "@/lib/repos/accounts";

export function PayInvoiceForm({
  cardId,
  closingDate,
  remainingLabel,
  defaultDate,
  defaultFromId,
  payers,
}: {
  cardId: number;
  closingDate: string;
  /** Valor em aberto já formatado para o campo (ex.: "1.234,56"). */
  remainingLabel: string;
  defaultDate: string;
  defaultFromId: number;
  payers: Account[];
}) {
  const [state, action, pending] = useActionState(payInvoiceAction, undefined);
  const id = `${cardId}-${closingDate}`;

  return (
    <form action={action} className="mt-3 space-y-3 rounded-xl border border-line p-3.5">
      <input type="hidden" name="cardId" value={cardId} />
      <input type="hidden" name="closingDate" value={closingDate} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={`amount-${id}`} className="label">Valor pago</label>
          <input id={`amount-${id}`} name="amount" inputMode="decimal" defaultValue={remainingLabel} className="input" />
        </div>
        <div>
          <label htmlFor={`date-${id}`} className="label">Data</label>
          <input id={`date-${id}`} name="date" type="date" defaultValue={defaultDate} className="input" />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor={`from-${id}`} className="label">Pagar com</label>
          <select id={`from-${id}`} name="fromAccountId" defaultValue={defaultFromId} className="input">
            {payers.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      </div>
      {state?.error && <p className="error">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "Registrando…" : "Pagar fatura"}
      </button>
    </form>
  );
}
