"use server";

import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";
import { refreshAll } from "./shared";
import { getDb } from "@/lib/db/connection";
import { todayISO } from "@/lib/dates";
import { dateField, idField, parseRecurrenceEditForm, parseSeedForm, type FormState } from "@/lib/forms";
import { cancelRemaining, settleRemaining } from "@/lib/repos/installments";
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
  cancelRemaining(getDb(), idField(fd, "purchaseId"));
  refreshAll();
}

export async function settlePurchaseRemaining(fd: FormData): Promise<void> {
  await verifySession();
  settleRemaining(getDb(), idField(fd, "purchaseId"), todayISO());
  refreshAll();
}
