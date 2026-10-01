"use server";

import { verifySession } from "@/lib/auth/dal";
import { refreshAll } from "./shared";
import { getDb } from "@/lib/db/connection";
import { isISODate, todayISO } from "@/lib/dates";
import { dateField, idField, intField, type FormState } from "@/lib/forms";
import { parseBRL } from "@/lib/money";
import { payInvoiceFromSchedule } from "@/lib/repos/schedule";

/** Pagamento escolhido na página do cartão: valor, data e conta de origem são opcionais. */
export async function payInvoiceAction(_: FormState, fd: FormData): Promise<FormState> {
  await verifySession();
  const amountRaw = String(fd.get("amount") ?? "").trim();
  const amountCents = amountRaw === "" ? undefined : parseBRL(amountRaw);
  if (amountCents === null || (amountCents !== undefined && amountCents <= 0)) {
    return { error: "Informe um valor maior que zero (ex.: 1.234,56)." };
  }
  const date = String(fd.get("date") ?? "").trim();
  if (date !== "" && !isISODate(date)) return { error: "Data inválida." };

  try {
    const cardId = idField(fd, "cardId");
    const closingDate = dateField(fd, "closingDate");
    const from = intField(fd, "fromAccountId");
    const db = getDb();
    payInvoiceFromSchedule(db, {
      cardId,
      closingDate,
      today: todayISO(),
      amountCents,
      date: date || undefined,
      fromAccountId: from || undefined,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível registrar o pagamento." };
  }
  refreshAll();
  return undefined;
}
