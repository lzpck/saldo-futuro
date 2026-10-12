"use server";

import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";
import { refreshAll } from "./shared";
import { getDb } from "@/lib/db/connection";
import { idField, intField, parseAccountForm, type FormState } from "@/lib/forms";
import { parseBRL } from "@/lib/money";
import { todayISO } from "@/lib/dates";
import { createAccount, reconcileBalance, setAccountArchived, setAccountFavorite, updateAccount } from "@/lib/repos/accounts";

export async function saveAccount(_: FormState, fd: FormData): Promise<FormState> {
  await verifySession();
  const parsed = parseAccountForm(fd);
  if (!parsed.ok) return { error: parsed.error };

  try {
    const id = intField(fd, "id");
    if (id) updateAccount(getDb(), id, parsed.data);
    else createAccount(getDb(), parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível salvar." };
  }

  refreshAll();
  if (fd.get("modal")) return { done: true };
  redirect("/contas");
}

/** "Ajustar saldo": informa o saldo real do banco; a diferença vira um lançamento de ajuste. */
export async function adjustBalance(_: FormState, fd: FormData): Promise<FormState> {
  await verifySession();
  const id = idField(fd, "id");
  const actualCents = parseBRL(String(fd.get("actualBalance") ?? ""));
  if (actualCents === null) return { error: "Informe o saldo real (ex.: 1.234,56)." };
  try {
    reconcileBalance(getDb(), id, actualCents, todayISO());
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível ajustar o saldo." };
  }
  refreshAll();
  if (fd.get("modal")) return { done: true };
  redirect("/contas");
}

export async function toggleAccountArchived(fd: FormData): Promise<void> {
  await verifySession();
  setAccountArchived(getDb(), idField(fd, "id"), fd.get("archive") === "1");
  refreshAll();
}

export async function toggleAccountFavorite(fd: FormData): Promise<void> {
  await verifySession();
  setAccountFavorite(getDb(), idField(fd, "id"), fd.get("favorite") === "1");
  refreshAll();
}
