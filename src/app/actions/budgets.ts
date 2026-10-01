"use server";

import { verifySession } from "@/lib/auth/dal";
import { refreshAll } from "./shared";
import { getDb } from "@/lib/db/connection";
import { parseBudgetForm, type FormState } from "@/lib/forms";
import { setBudget } from "@/lib/repos/budgets";

export async function saveBudget(_: FormState, fd: FormData): Promise<FormState> {
  await verifySession();
  const parsed = parseBudgetForm(fd);
  if (!parsed.ok) return { error: parsed.error };
  try {
    setBudget(getDb(), parsed.data.categoryId, parsed.data.month, parsed.data.amountCents);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível salvar." };
  }
  refreshAll();
}
