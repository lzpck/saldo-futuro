"use client";

import { useActionState, useState } from "react";
import { saveTransaction } from "@/app/actions/transactions";
import { SeedFields } from "@/components/seed-fields";
import { shiftMonth } from "@/lib/prediction";
import { centsToInput } from "@/lib/money";
import { FREQUENCIES, FREQUENCY_LABEL, type Frequency } from "@/lib/recurrence";
import { isCard, type Account } from "@/lib/repos/accounts";
import type { Category } from "@/lib/repos/categories";
import type { Transaction, TransactionKind, TransactionStatus } from "@/lib/repos/transactions";
import { AccountOptions } from "@/components/account-options";
import { defaultAccountId } from "@/lib/account-options";

const KINDS: { value: TransactionKind; label: string }[] = [
  { value: "despesa", label: "Despesa" },
  { value: "receita", label: "Receita" },
  { value: "transferencia", label: "Transferência" },
];

const STATUSES: { value: TransactionStatus; despesa: string; receita: string }[] = [
  { value: "efetivado", despesa: "Já paguei", receita: "Já recebi" },
  { value: "previsto", despesa: "Vou pagar", receita: "Vou receber" },
];

type Repeat = "none" | "recorrente" | "parcelado";

export function TransactionForm({
  accounts,
  categories,
  defaultDate,
  existing,
  occurrence,
  initialRepeat = "none",
  initialAccountId,
}: {
  accounts: Account[];
  categories: Category[];
  /** Hoje (AAAA-MM-DD). */
  defaultDate: string;
  existing?: Transaction;
  /** Edição de uma ocorrência de recorrência: o tipo fica fixo e nada se repete. */
  occurrence?: { recurrenceId: number; date: string };
  initialRepeat?: Repeat;
  /** Conta pré-selecionada ao criar (ex.: vindo da página de um cartão). */
  initialAccountId?: number;
}) {
  const [state, action, pending] = useActionState(saveTransaction, undefined);
  const [kind, setKind] = useState<TransactionKind>(existing?.kind ?? "despesa");
  const [date, setDate] = useState(existing?.date ?? defaultDate);
  const [status, setStatus] = useState<TransactionStatus>(existing?.status ?? "efetivado");
  const [statusTouched, setStatusTouched] = useState(false);
  const [repeat, setRepeat] = useState<Repeat>(initialRepeat);
  const [isVariable, setIsVariable] = useState(false);
  const [amountMode, setAmountMode] = useState<"parcela" | "total">("parcela");
  const [accountId, setAccountId] = useState<number>(
    existing?.accountId ?? initialAccountId ?? defaultAccountId(accounts) ?? 0,
  );
  const onCard = accounts.find((a) => a.id === accountId && isCard(a));

  const canRepeat = !existing && !occurrence && kind !== "transferencia";
  const activeRepeat: Repeat = canRepeat && (repeat !== "parcelado" || kind === "despesa") ? repeat : "none";
  const cats = categories.filter((c) => c.kind === kind);
  const parents = cats.filter((c) => c.parentId === null);

  // defaultDate é "hoje". Data futura sugere Previsto, enquanto a pessoa não escolher.
  function changeDate(value: string) {
    setDate(value);
    if (!statusTouched && value) setStatus(value > defaultDate ? "previsto" : "efetivado");
  }

  const variable = activeRepeat === "recorrente" && isVariable;
  const amountLabel =
    activeRepeat === "parcelado"
      ? amountMode === "total" ? "Valor total da compra" : "Valor de cada parcela"
      : variable ? "Valor estimado (usado até haver histórico)" : "Valor";
  const dateLabel = activeRepeat === "parcelado" ? "Vencimento da 1ª parcela" : activeRepeat === "recorrente" ? "Primeira data" : "Data";

  return (
    <form action={action} className="card space-y-4">
      {existing && <input type="hidden" name="id" value={existing.id} />}
      {occurrence && (
        <>
          <input type="hidden" name="recurrenceId" value={occurrence.recurrenceId} />
          <input type="hidden" name="occurrenceDate" value={occurrence.date} />
        </>
      )}

      {occurrence ? (
        <>
          <input type="hidden" name="kind" value={kind} />
          <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-xs text-muted">
            Você está editando só esta ocorrência da recorrência. As outras não mudam.
          </p>
        </>
      ) : (
        <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
          {KINDS.map((k) => (
            <label
              key={k.value}
              className={`cursor-pointer rounded-lg py-2 text-center text-sm transition ${
                kind === k.value ? "bg-accent font-medium text-accent-fg" : "text-muted"
              }`}
            >
              <input
                type="radio"
                name="kind"
                value={k.value}
                checked={kind === k.value}
                onChange={() => setKind(k.value)}
                className="sr-only"
              />
              {k.label}
            </label>
          ))}
        </div>
      )}

      <div>
        <label htmlFor="amount" className="label">{amountLabel}</label>
        <input
          id="amount"
          name="amount"
          inputMode="decimal"
          placeholder="0,00"
          defaultValue={existing ? centsToInput(existing.amountCents) : ""}
          autoFocus
          required
          className="input text-lg"
        />
      </div>

      <div>
        <label htmlFor="description" className="label">Descrição</label>
        <input id="description" name="description" defaultValue={existing?.description} required maxLength={120} className="input" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="date" className="label">{dateLabel}</label>
          <input id="date" name="date" type="date" value={date} onChange={(e) => changeDate(e.target.value)} required className="input" />
        </div>
        <div>
          <label htmlFor="accountId" className="label">{kind === "transferencia" ? "Origem" : "Conta"}</label>
          <select id="accountId" name="accountId" value={accountId} onChange={(e) => setAccountId(Number(e.target.value))} required className="input">
            <AccountOptions accounts={accounts} />
          </select>
        </div>
      </div>
      {onCard && kind !== "transferencia" && (
        <p className="-mt-2 text-xs text-muted">
          {kind === "receita"
            ? "Estorno no cartão: abate a fatura em que cair."
            : "Compra no cartão: entra na fatura do ciclo e só sai da sua conta no vencimento dela."}
        </p>
      )}

      <fieldset>
        <legend className="label">{activeRepeat === "none" ? "Situação" : activeRepeat === "parcelado" ? "Situação da 1ª parcela" : "Situação da 1ª ocorrência"}</legend>
        <div role="radiogroup" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
          {STATUSES.map((s) => (
            <label
              key={s.value}
              className={`cursor-pointer rounded-lg py-2 text-center text-sm transition ${
                status === s.value ? "bg-surface font-medium text-fg ring-1 ring-line" : "text-muted"
              }`}
            >
              <input
                type="radio"
                name="status"
                value={s.value}
                checked={status === s.value}
                onChange={() => {
                  setStatus(s.value);
                  setStatusTouched(true);
                }}
                className="sr-only"
              />
              {kind === "transferencia"
                ? s.value === "efetivado" ? "Já feita" : "Vou fazer"
                : kind === "receita" ? s.receita : s.despesa}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted">
          {status === "previsto"
            ? "Entra na projeção de saldo, mas ainda não muda o saldo atual."
            : "Já aconteceu: muda o saldo atual."}
        </p>
      </fieldset>

      {kind === "transferencia" ? (
        <div>
          <label htmlFor="toAccountId" className="label">Destino</label>
          <select id="toAccountId" name="toAccountId" defaultValue={existing?.toAccountId ?? ""} required className="input">
            <option value="" disabled>Escolha…</option>
            <AccountOptions accounts={accounts} />
          </select>
        </div>
      ) : (
        <div>
          <label htmlFor="categoryId" className="label">Categoria</label>
          <select id="categoryId" name="categoryId" defaultValue={existing?.categoryId ?? ""} className="input" key={kind}>
            <option value="">Sem categoria</option>
            {parents.map((p) => (
              <optgroup key={p.id} label={`${p.icon} ${p.name}`}>
                <option value={p.id}>{p.name}</option>
                {cats.filter((c) => c.parentId === p.id).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}

      {canRepeat && (
        <div className="space-y-3 rounded-xl border border-line p-3.5">
          <div>
            <label htmlFor="repeat" className="label">Repetição</label>
            <select id="repeat" name="repeat" value={activeRepeat} onChange={(e) => setRepeat(e.target.value as Repeat)} className="input">
              <option value="none">Não se repete</option>
              <option value="recorrente">Recorrente</option>
              {kind === "despesa" && <option value="parcelado">Compra parcelada</option>}
            </select>
          </div>

          {activeRepeat === "recorrente" && (
            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" name="isVariable" checked={isVariable} onChange={(e) => setIsVariable(e.target.checked)} />
                O valor muda todo mês (luz, água, gás…)
              </label>
              <div>
                <label htmlFor="frequency" className="label">Frequência</label>
                <select id="frequency" name="frequency" defaultValue="mensal" className="input">
                  {FREQUENCIES.map((f: Frequency) => (
                    <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="endDate" className="label">Termina em (opcional)</label>
                <input id="endDate" name="endDate" type="date" className="input" />
              </div>
              {date < defaultDate && (
                <p className="col-span-2 text-xs text-expense">
                  Com início no passado, as ocorrências que já venceram ficam Em atraso até você efetivá-las ou pulá-las.
                </p>
              )}
              {isVariable && (
                <fieldset className="col-span-2">
                  <legend className="label">Valores dos últimos meses (opcional)</legend>
                  <p className="mb-2 text-xs text-muted">
                    Ajuda a prever desde o primeiro dia. Não cria lançamentos nem muda o saldo.
                  </p>
                  <SeedFields slots={6} max={shiftMonth(defaultDate.slice(0, 7), -1)} />
                </fieldset>
              )}
            </div>
          )}

          {activeRepeat === "parcelado" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="installments" className="label">Nº de parcelas</label>
                <input id="installments" name="installments" type="number" min={2} max={120} defaultValue={6} required className="input" />
              </div>
              <div>
                <label htmlFor="amountMode" className="label">Valor informado</label>
                <select id="amountMode" name="amountMode" value={amountMode} onChange={(e) => setAmountMode(e.target.value as "parcela" | "total")} className="input">
                  <option value="parcela">Por parcela</option>
                  <option value="total">Total da compra</option>
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {state?.error && <p className="error">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending
          ? "Salvando…"
          : existing || occurrence
            ? "Salvar alterações"
            : activeRepeat === "recorrente"
              ? "Criar recorrência"
              : activeRepeat === "parcelado"
                ? "Criar compra parcelada"
                : "Adicionar lançamento"}
      </button>
    </form>
  );
}
