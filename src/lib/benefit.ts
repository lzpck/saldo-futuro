import type { AccountWithBalance } from "./repos/accounts";
import type { Category } from "./repos/categories";
import type { TransactionKind } from "./repos/transactions";

/**
 * Avisos de um Lançamento numa Conta Benefício (CONTEXT.md): nunca bloqueiam.
 * `checkBalance` fica falso ao editar, quando o saldo atual já inclui o Lançamento.
 */
export function benefitWarnings(input: {
  account: Pick<AccountWithBalance, "acceptedCategoryIds" | "balanceCents">;
  kind: TransactionKind;
  amountCents: number | null;
  categoryId: number | null;
  categories: Pick<Category, "id" | "parentId">[];
  checkBalance: boolean;
}): string[] {
  const { account, kind, amountCents, categoryId, categories, checkBalance } = input;
  const warnings: string[] = [];

  if (kind === "transferencia") {
    warnings.push("O dinheiro do Benefício tem uso restrito. Confira se ele pode mesmo sair desta conta.");
  }
  if (kind !== "despesa") return warnings;

  const accepted = account.acceptedCategoryIds;
  if (categoryId !== null && accepted.length > 0) {
    const parentId = categories.find((c) => c.id === categoryId)?.parentId ?? null;
    if (!accepted.includes(categoryId) && (parentId === null || !accepted.includes(parentId))) {
      warnings.push("Esta categoria não está entre as aceitas por este Benefício.");
    }
  }
  if (checkBalance && amountCents !== null && amountCents > account.balanceCents) {
    warnings.push("O valor é maior que o saldo deste Benefício.");
  }
  return warnings;
}
