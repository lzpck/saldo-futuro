import { LEVELS, groupExpenses, type Group, type Level } from "../expense-review";
import type { Db } from "../db/connection";
import { isCard, listAccounts } from "./accounts";
import { cardInvoices } from "./cards";
import { listWithOccurrences } from "./recurrences";

/** Faturas consideradas por cartão: as últimas já fechadas (paga ou não); a aberta ainda está incompleta. */
export const REVIEW_INVOICES = 3;

export function listLevels(db: Db): Map<string, Level> {
  const rows = db.prepare("SELECT key, level FROM expense_classes").all() as { key: string; level: Level }[];
  return new Map(rows.map((r) => [r.key, r.level]));
}

/** Grava o nível do grupo; `null` volta a "sem classificar". */
export function setLevel(db: Db, key: string, level: Level | null): void {
  if (level === null) {
    db.prepare("DELETE FROM expense_classes WHERE key = ?").run(key);
    return;
  }
  if (!LEVELS.includes(level)) throw new Error("Nível inválido.");
  db.prepare(
    "INSERT INTO expense_classes (key, level) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET level = excluded.level",
  ).run(key, level);
}

/**
 * Despesas das últimas faturas fechadas de cada cartão, em grupos. Fora ficam estornos, pagamentos
 * (transferências) e valores estimados de recorrência variável. `months` = meses de fatura cobertos.
 */
export function reviewGroups(db: Db, today: string): { groups: Group[]; months: number } {
  const base = listWithOccurrences(db, today);
  const txs = [];
  const closings = new Set<string>();
  for (const card of listAccounts(db).filter(isCard)) {
    if (card.closingDay === null || card.dueDay === null) continue;
    const closed = cardInvoices(db, card, base, today).filter((i) => i.closingDate < today);
    for (const inv of closed.slice(-REVIEW_INVOICES)) {
      closings.add(inv.closingDate.slice(0, 7));
      txs.push(...inv.items.filter((t) => t.kind === "despesa" && !t.isEstimate));
    }
  }
  return { groups: groupExpenses(txs, listLevels(db)), months: closings.size };
}
