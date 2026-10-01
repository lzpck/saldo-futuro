import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/db/connection";
import { todayISO } from "@/lib/dates";
import { occurrencesBetween } from "@/lib/recurrence";
import { listAccounts } from "@/lib/repos/accounts";
import { listCategories } from "@/lib/repos/categories";
import { getRecurrence, predictOccurrence } from "@/lib/repos/recurrences";
import type { Transaction } from "@/lib/repos/transactions";
import { TransactionForm } from "../../../../lancamentos/transaction-form";

export default async function OccurrencePage({
  params,
  searchParams,
}: PageProps<"/agenda/ocorrencia/[recurrenceId]/[date]">) {
  const { recurrenceId, date } = await params;
  const { pago } = await searchParams;
  const db = getDb();
  const rule = getRecurrence(db, Number(recurrenceId));
  if (!rule || occurrencesBetween(rule, date, date).length !== 1) notFound();

  // Se esta ocorrência já virou lançamento gravado, a edição é a de um lançamento comum.
  const saved = db
    .prepare("SELECT id FROM transactions WHERE recurrence_id = ? AND occurrence_date = ?")
    .get(rule.id, date) as { id: number } | undefined;
  if (saved) redirect(`/lancamentos/${saved.id}`);

  // Recorrência variável: o valor pré-preenchido é a previsão; quem paga informa o real.
  const prediction = predictOccurrence(db, rule, date);
  const today = todayISO();
  const paying = pago === "1";

  // id 0 = ainda não existe no banco; salvar cria a exceção desta ocorrência.
  const prefilled: Transaction = {
    id: 0,
    kind: rule.kind,
    status: paying ? "efetivado" : "previsto",
    date: paying && date > today ? today : date,
    amountCents: prediction?.amountCents ?? rule.amountCents,
    description: rule.description,
    accountId: rule.accountId,
    accountName: rule.accountName,
    toAccountId: null,
    toAccountName: null,
    categoryId: rule.categoryId,
    categoryName: rule.categoryName,
    categoryIcon: rule.categoryIcon,
    categoryColor: rule.categoryColor,
    recurrenceId: rule.id,
    occurrenceDate: date,
    purchaseId: null,
    installmentNo: null,
    installmentTotal: null,
    invoiceCardId: null,
    invoiceClosing: null,
    isVirtual: true,
    isEstimate: prediction !== null,
    estimateNote: prediction?.explanation ?? null,
  };

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <h1 className="text-2xl font-semibold">{paying ? "Informar valor pago" : "Editar ocorrência"}</h1>
      {prediction && (
        <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-xs text-muted">
          {paying ? "Confira o valor real da conta. " : ""}
          {prediction.explanation}
        </p>
      )}
      <TransactionForm
        accounts={listAccounts(db, { includeArchived: true })}
        categories={listCategories(db, { includeArchived: true })}
        defaultDate={today}
        existing={prefilled}
        occurrence={{ recurrenceId: rule.id, date }}
      />
    </div>
  );
}
