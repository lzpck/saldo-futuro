"use client";

import { useActionState } from "react";
import { editRecurrence } from "@/app/actions/schedule";
import { formatDateBR } from "@/lib/dates";
import { centsToInput } from "@/lib/money";
import type { Account } from "@/lib/repos/accounts";
import type { Category } from "@/lib/repos/categories";
import type { Recurrence } from "@/lib/repos/recurrences";
import { AccountOptions } from "@/components/account-options";

export function RecurrenceEditForm({
  rule,
  accounts,
  categories,
  fromOptions,
}: {
  rule: Recurrence;
  accounts: Account[];
  categories: Category[];
  /** Datas de ocorrência a partir das quais a alteração pode valer. */
  fromOptions: string[];
}) {
  const [state, action, pending] = useActionState(editRecurrence, undefined);
  const cats = categories.filter((c) => c.kind === rule.kind);

  return (
    <form action={action} className="card space-y-4">
      <input type="hidden" name="recurrenceId" value={rule.id} />
      <div>
        <label htmlFor="from" className="label">Alterar a partir de</label>
        <select id="from" name="from" defaultValue={fromOptions[0]} className="input">
          {fromOptions.map((d) => (
            <option key={d} value={d}>
              {d === rule.startDate ? `Desde o início (${formatDateBR(d)})` : `Ocorrência de ${formatDateBR(d)}`}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-muted">
          O que já passou não muda. Para mexer em uma ocorrência só, toque nela na lista de lançamentos.
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isVariable" defaultChecked={rule.isVariable} />
        O valor muda todo mês (luz, água, gás…)
      </label>
      <div>
        <label htmlFor="amount" className="label">{rule.isVariable ? "Valor estimado (usado até haver histórico)" : "Valor"}</label>
        <input id="amount" name="amount" inputMode="decimal" defaultValue={centsToInput(rule.amountCents)} required className="input text-lg" />
      </div>
      <div>
        <label htmlFor="description" className="label">Descrição</label>
        <input id="description" name="description" defaultValue={rule.description} required maxLength={120} className="input" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="accountId" className="label">Conta</label>
          <select id="accountId" name="accountId" defaultValue={rule.accountId} className="input">
            <AccountOptions accounts={accounts} />
          </select>
        </div>
        <div>
          <label htmlFor="categoryId" className="label">Categoria</label>
          <select id="categoryId" name="categoryId" defaultValue={rule.categoryId ?? ""} className="input">
            <option value="">Sem categoria</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>{c.parentId ? "— " : ""}{c.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="endDate" className="label">Termina em (opcional)</label>
        <input id="endDate" name="endDate" type="date" defaultValue={rule.endDate ?? ""} className="input" />
      </div>
      {state?.error && <p className="error">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "Salvando…" : "Salvar alterações"}
      </button>
    </form>
  );
}
