"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { editPurchase } from "@/app/actions/schedule";
import { AccountOptions } from "@/components/account-options";
import { MoneyInput } from "@/components/money-input";
import { centsToInput } from "@/lib/money";
import type { Account } from "@/lib/repos/accounts";
import type { Category } from "@/lib/repos/categories";
import type { PurchaseEditDefaults, PurchaseSummary } from "@/lib/repos/installments";

export function PurchaseEditForm({
  purchase,
  defaults,
  accounts,
  categories,
}: {
  purchase: PurchaseSummary;
  defaults: PurchaseEditDefaults & { firstDate: string };
  accounts: Account[];
  categories: Category[];
}) {
  const [state, action, pending] = useActionState(editPurchase, undefined);
  const [mode, setMode] = useState<"parcela" | "total">("parcela");
  const accountLocked = defaults.paidCount > 0;

  return (
    <form action={action} className="card space-y-4">
      <input type="hidden" name="purchaseId" value={purchase.id} />
      <input type="hidden" name="initialDate" value={defaults.firstDate} />
      <input type="hidden" name="initialAmountCents" value={defaults.amountCents ?? ""} />

      <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-xs text-muted">
        Descrição e categoria valem para todas as parcelas. Mudar o nº de parcelas só acrescenta ou remove parcelas no
        final. Valor e vencimento só mudam nas parcelas ainda previstas — e, se você alterar esses campos, os ajustes
        feitos em cada parcela serão sobrescritos.
      </p>

      <div>
        <label htmlFor="description" className="label">Descrição</label>
        <input id="description" name="description" defaultValue={purchase.description} required maxLength={120} className="input" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="installments" className="label">Nº de parcelas</label>
          <input
            id="installments"
            name="installments"
            type="number"
            min={Math.max(2, purchase.paidCount)}
            max={120}
            defaultValue={purchase.totalInstallments}
            required
            className="input"
          />
        </div>
        <div>
          <label htmlFor="date" className="label">Vencimento da 1ª parcela</label>
          <input id="date" name="date" type="date" defaultValue={defaults.firstDate} required className="input" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="amount" className="label">{mode === "total" ? "Valor total da compra" : "Valor de cada parcela"}</label>
          <MoneyInput
            id="amount"
            name="amount"
            defaultValue={defaults.amountCents === null ? "" : centsToInput(defaults.amountCents)}
            required
            className="input"
          />
        </div>
        <div>
          <label htmlFor="amountMode" className="label">Valor informado</label>
          <select
            id="amountMode"
            name="amountMode"
            value={mode}
            onChange={(e) => setMode(e.target.value as "parcela" | "total")}
            className="input"
          >
            <option value="parcela">Por parcela</option>
            <option value="total">Total da compra</option>
          </select>
        </div>
      </div>
      {mode === "total" && (
        <p className="-mt-2 text-xs text-muted">
          O que falta depois das parcelas já pagas é dividido entre as previstas.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="accountId" className="label">Conta</label>
          <select
            id="accountId"
            name={accountLocked ? undefined : "accountId"}
            defaultValue={purchase.accountId}
            disabled={accountLocked}
            className="input"
          >
            <AccountOptions accounts={accounts} />
          </select>
          {accountLocked && <input type="hidden" name="accountId" value={purchase.accountId} />}
          {accountLocked && <p className="mt-1.5 text-xs text-muted">Não muda depois de haver parcela paga.</p>}
        </div>
        <div>
          <label htmlFor="categoryId" className="label">Categoria</label>
          <select id="categoryId" name="categoryId" defaultValue={purchase.categoryId ?? ""} className="input">
            <option value="">Sem categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.parentId ? "— " : ""}{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {state?.error && <p className="error">{state.error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <Link href={`/agenda/parcelamentos/${purchase.id}`} className="btn text-center">Voltar</Link>
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Salvando…" : "Salvar alterações"}
        </button>
      </div>
    </form>
  );
}
