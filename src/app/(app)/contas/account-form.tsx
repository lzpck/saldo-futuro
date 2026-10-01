"use client";

import { useActionState, useState } from "react";
import { saveAccount } from "@/app/actions/accounts";
import { centsToInput } from "@/lib/money";
import { accountLabel } from "@/lib/account-options";
import { ACCOUNT_KINDS, ACCOUNT_KIND_LABEL, type Account, type AccountKind } from "@/lib/repos/accounts";

export function AccountForm({
  existing,
  payers,
  initialKind = "corrente",
}: {
  existing?: Account;
  /** Contas (não-cartão) que podem pagar a fatura de um cartão. */
  payers: Account[];
  initialKind?: AccountKind;
}) {
  const [state, action, pending] = useActionState(saveAccount, undefined);
  const [kind, setKind] = useState<AccountKind>(existing?.kind ?? initialKind);
  const isCardKind = kind === "cartao";
  // Cartão e conta comum não se convertem: ao editar, a lista de tipos fica do mesmo lado.
  const kinds = existing ? ACCOUNT_KINDS.filter((k) => (k === "cartao") === (existing.kind === "cartao")) : ACCOUNT_KINDS;

  return (
    <form action={action} className="card space-y-4">
      {existing && <input type="hidden" name="id" value={existing.id} />}
      <div>
        <label htmlFor="name" className="label">Nome</label>
        <input id="name" name="name" defaultValue={existing?.name} placeholder={isCardKind ? "Ex.: Cartão Nubank" : "Ex.: Nubank"} required maxLength={60} autoFocus className="input" />
      </div>
      <div>
        <label htmlFor="kind" className="label">Tipo</label>
        <select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as AccountKind)} className="input">
          {kinds.map((k) => (
            <option key={k} value={k}>{ACCOUNT_KIND_LABEL[k]}</option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="favorite" defaultChecked={existing?.favorite} disabled={existing?.archived} />
        Favorita <span className="text-xs text-muted">(aparece primeiro nos seletores)</span>
      </label>

      {isCardKind ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="closingDay" className="label">Fecha no dia</label>
              <input id="closingDay" name="closingDay" type="number" min={1} max={31} defaultValue={existing?.closingDay ?? ""} required className="input" />
            </div>
            <div>
              <label htmlFor="dueDay" className="label">Vence no dia</label>
              <input id="dueDay" name="dueDay" type="number" min={1} max={31} defaultValue={existing?.dueDay ?? ""} required className="input" />
            </div>
          </div>
          <div>
            <label htmlFor="payAccountId" className="label">Paga a fatura com</label>
            <select id="payAccountId" name="payAccountId" defaultValue={existing?.payAccountId ?? payers[0]?.id ?? ""} required className="input">
              {payers.length === 0 && <option value="">Crie uma conta primeiro</option>}
              {payers.map((a) => (
                <option key={a.id} value={a.id}>{accountLabel(a)}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted">
            A compra entra na fatura que fecha no dia dela ou depois. O dinheiro só sai da conta no vencimento. Mudar
            o dia de fechamento reorganiza as compras entre as faturas.
          </p>
        </>
      ) : (
        <div>
          <label htmlFor="initialBalance" className="label">Saldo inicial</label>
          <input
            id="initialBalance"
            name="initialBalance"
            inputMode="decimal"
            placeholder="0,00"
            defaultValue={existing ? centsToInput(existing.initialBalanceCents) : ""}
            className="input"
          />
          <p className="mt-1.5 text-xs text-muted">
            Quanto havia na conta antes do primeiro lançamento. O saldo atual é este valor mais os lançamentos efetivados.
          </p>
        </div>
      )}

      {state?.error && <p className="error">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "Salvando…" : isCardKind ? "Salvar cartão" : "Salvar conta"}
      </button>
    </form>
  );
}
