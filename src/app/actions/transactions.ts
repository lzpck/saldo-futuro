"use server";

import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";
import { refreshAll } from "./shared";
import { getDb } from "@/lib/db/connection";
import { todayISO } from "@/lib/dates";
import { dateField, idField, intField, optionalDateField, parseTransactionForm, type FormState } from "@/lib/forms";
import { budgetWarnings } from "@/lib/repos/budgets";
import { createInstallmentPurchase } from "@/lib/repos/installments";
import {
  createRecurrence,
  deleteTransactionKeepingSchedule,
  effectuateOccurrence,
  saveOccurrence,
  skipOccurrence,
} from "@/lib/repos/recurrences";
import { payInvoiceFromSchedule } from "@/lib/repos/schedule";
import { createTransaction, markEffectuated, updateTransaction } from "@/lib/repos/transactions";
import { afterSaveUrl } from "@/lib/return-to";

export async function saveTransaction(_: FormState, fd: FormData): Promise<FormState> {
  await verifySession();
  const parsed = parseTransactionForm(fd);
  if (!parsed.ok) return { error: parsed.error };
  const { data, repeat } = parsed;
  const db = getDb();
  const month = data.date.slice(0, 7);
  const warnsBudget = data.kind === "despesa" && data.categoryId != null;
  // O aviso é só para quem faz estourar: se o limite já estava estourado antes, não repete.
  const alreadyOver = warnsBudget && budgetWarnings(db, data.categoryId!, month, todayISO()).length > 0;

  try {
    const id = intField(fd, "id");
    const recurrenceId = intField(fd, "recurrenceId");
    const occurrenceDate = optionalDateField(fd, "occurrenceDate");

    if (id) {
      updateTransaction(db, id, data);
    } else if (recurrenceId && occurrenceDate) {
      saveOccurrence(db, recurrenceId, occurrenceDate, data);
    } else if (repeat.type === "recorrente" && data.kind !== "transferencia") {
      const newId = createRecurrence(db, {
        kind: data.kind,
        description: data.description,
        amountCents: data.amountCents,
        accountId: data.accountId,
        categoryId: data.categoryId ?? null,
        frequency: repeat.frequency,
        startDate: data.date,
        endDate: repeat.endDate,
        isVariable: repeat.isVariable,
        historySeed: repeat.historySeed,
      });
      // O valor digitado é o real da 1ª ocorrência (numa recorrência variável, difere da previsão).
      if (data.status === "efetivado") effectuateOccurrence(db, newId, data.date, todayISO(), data.amountCents);
    } else if (repeat.type === "parcelado") {
      createInstallmentPurchase(db, {
        description: data.description,
        installments: repeat.installments,
        firstDate: data.date,
        accountId: data.accountId,
        categoryId: data.categoryId ?? null,
        mode: repeat.mode,
        valueCents: data.amountCents,
        firstPaid: data.status === "efetivado",
        today: todayISO(),
      });
    } else {
      createTransaction(db, data);
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível salvar." };
  }

  refreshAll();
  // Aviso discreto (não bloqueia): qualquer tela de destino o exibe, recalculando o orçamento da categoria.
  const notice =
    warnsBudget && !alreadyOver && budgetWarnings(db, data.categoryId!, month, todayISO()).length > 0
      ? `${data.categoryId}_${month}`
      : undefined;
  redirect(afterSaveUrl(fd.get("voltar"), month, notice));
}

export type BudgetNotice = { categoryName: string; exceeded: boolean; usedCents: number; limitCents: number; month: string };

/** Avisos de orçamento da categoria no mês, para a faixa exibida após salvar um lançamento. */
export async function loadBudgetNotice(categoryId: number, month: string): Promise<BudgetNotice[]> {
  await verifySession();
  if (!Number.isInteger(categoryId) || categoryId <= 0 || !/^\d{4}-\d{2}$/.test(month)) return [];
  return budgetWarnings(getDb(), categoryId, month, todayISO()).map((w) => ({
    categoryName: w.category.name,
    exceeded: w.status!.level === "estourou",
    usedCents: w.spentCents + w.plannedCents,
    limitCents: w.limitCents!,
    month,
  }));
}

/** Efetiva um lançamento gravado (id) ou uma ocorrência virtual (recurrenceId + occurrenceDate). */
export async function effectuateTransaction(fd: FormData): Promise<void> {
  await verifySession();
  const db = getDb();
  const id = intField(fd, "id");
  const cardId = intField(fd, "cardId");
  if (cardId > 0) {
    // Pagamento de fatura previsto: paga tudo que falta, da conta de pagamento do cartão.
    const closingDate = dateField(fd, "closingDate");
    payInvoiceFromSchedule(db, { cardId, closingDate, today: todayISO() });
  } else if (id > 0) {
    markEffectuated(db, id, todayISO());
  } else {
    effectuateOccurrence(db, idField(fd, "recurrenceId"), dateField(fd, "occurrenceDate"), todayISO());
  }
  refreshAll();
}

/** Exclui um lançamento gravado ou pula uma ocorrência virtual. */
export async function removeTransaction(fd: FormData): Promise<void> {
  await verifySession();
  const db = getDb();
  const id = intField(fd, "id");
  if (id > 0) {
    deleteTransactionKeepingSchedule(db, id);
  } else {
    skipOccurrence(db, idField(fd, "recurrenceId"), dateField(fd, "occurrenceDate"));
  }
  refreshAll();
}
