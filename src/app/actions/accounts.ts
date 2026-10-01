"use server";

import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";
import { refreshAll } from "./shared";
import { getDb } from "@/lib/db/connection";
import { idField, intField, parseAccountForm, type FormState } from "@/lib/forms";
import { createAccount, setAccountArchived, updateAccount } from "@/lib/repos/accounts";

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
  redirect("/contas");
}

export async function toggleAccountArchived(fd: FormData): Promise<void> {
  await verifySession();
  setAccountArchived(getDb(), idField(fd, "id"), fd.get("archive") === "1");
  refreshAll();
}
