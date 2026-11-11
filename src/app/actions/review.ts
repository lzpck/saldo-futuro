"use server";

import { verifySession } from "@/lib/auth/dal";
import { refreshAll } from "./shared";
import { getDb } from "@/lib/db/connection";
import { parseExpenseClassForm } from "@/lib/forms";
import { setLevel } from "@/lib/repos/expense-review";

/** Um toque: grava o nível do grupo (nível vazio = desmarcar). */
export async function classifyExpense(fd: FormData): Promise<void> {
  await verifySession();
  const { key, level } = parseExpenseClassForm(fd);
  setLevel(getDb(), key, level);
  refreshAll();
}
