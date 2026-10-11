"use server";

import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";
import { refreshAll } from "./shared";
import { getDb } from "@/lib/db/connection";
import { todayISO } from "@/lib/dates";
import { parsePurchaseEditForm, dateField, idField, parseRecurrenceEditForm, parseSeedForm, type FormState } from "@/lib/forms";
import { parseBRL } from "@/lib/money";
import { anticipateInstallments, cancelRemaining, deletePurchase as removePurchase, getPurchase, updatePurchase } from "@/lib/repos/installments";
import { endRecurrence, getRecurrence, setHistorySeed, updateRecurrenceFrom } from "@/lib/repos/recurrences";

export async function editRecurrence(_: FormState, fd: FormData): Promise<FormState> {
  await verifySession();
  const parsed = parseRecurrenceEditForm(fd);
  if (!parsed.ok) return { error: parsed.error };
  const { recurrenceId, from, ...values } = parsed.data;

  try {
    updateRecurrenceFrom(getDb(), recurrenceId, from, values);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível salvar." };
  }
  refreshAll();
  redirect("/agenda");
}

export async function saveHistorySeed(_: FormState, fd: FormData): Promise<FormState> {
  await verifySession();
  const parsed = parseSeedForm(fd);
  if (!parsed.ok) return { error: parsed.error };
  const db = getDb();
  const rule = getRecurrence(db, parsed.data.recurrenceId);
  if (!rule) return { error: "Recorrência não encontrada." };

  try {
    setHistorySeed(db, rule.seriesId, parsed.data.historySeed);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível salvar." };
  }
  refreshAll();
  return {};
}

export async function stopRecurrence(fd: FormData): Promise<void> {
  await verifySession();
  endRecurrence(getDb(), idField(fd, "recurrenceId"), dateField(fd, "lastDate"));
  refreshAll();
  redirect("/agenda");
}

export async function cancelPurchaseRemaining(fd: FormData): Promise<void> {
  await verifySession();
  const db = getDb();
  const purchaseId = idField(fd, "purchaseId");
  cancelRemaining(db, purchaseId);
  refreshAll();
  // Sem parcelas sobrando a compra deixa de existir: a página dela já não abre.
  if (!getPurchase(db, purchaseId)) redirect("/agenda");
}

export async function editPurchase(_: FormState, fd: FormData): Promise<FormState> {
  await verifySession();
  const parsed = parsePurchaseEditForm(fd);
  if (!parsed.ok) return { error: parsed.error };
  const { purchaseId, ...values } = parsed.data;

  try {
    updatePurchase(getDb(), purchaseId, values);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível salvar." };
  }
  refreshAll();
  redirect(`/agenda/parcelamentos/${purchaseId}`);
}

/** Exclui a compra inteira, inclusive as parcelas já efetivadas. */
export async function deletePurchase(fd: FormData): Promise<void> {
  await verifySession();
  removePurchase(getDb(), idField(fd, "purchaseId"));
  refreshAll();
  redirect("/agenda");
}

/** Antecipa as últimas N parcelas restantes pelo valor cobrado (desconto incluído). */
export async function anticipatePurchase(_: FormState, fd: FormData): Promise<FormState> {
  await verifySession();
  const count = Number(String(fd.get("count") ?? "").trim());
  const chargedCents = parseBRL(String(fd.get("amount") ?? "").trim());
  if (!Number.isInteger(count) || count < 1) return { error: "Informe quantas parcelas antecipar." };
  if (chargedCents === null || chargedCents <= 0) return { error: "Informe um valor maior que zero (ex.: 1.234,56)." };

  const purchaseId = idField(fd, "purchaseId");
  try {
    anticipateInstallments(getDb(), purchaseId, { count, chargedCents, today: todayISO() });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível antecipar." };
  }
  refreshAll();
  return {};
}
