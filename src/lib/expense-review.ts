// Revisão de gastos do cartão: agrupa o que se repete entre as faturas para o usuário classificar
// cada grupo uma vez só. Módulo puro (sem banco, sem UI).

export const LEVELS = ["dispensavel", "reduzivel", "essencial"] as const;
export type Level = (typeof LEVELS)[number];

export type ReviewTx = {
  description: string;
  amountCents: number;
  date: string;
  purchaseId: number | null;
  recurrenceId: number | null;
};

export type Group = {
  key: string;
  /** Descrição do lançamento mais recente do grupo. */
  label: string;
  totalCents: number;
  count: number;
  level: Level | null;
};

/** Sem caixa, acento, "2/10" nem pontuação: "PIX Mercado – 2/3" e "pix mercado" são o mesmo gasto. */
export function normalizeDescription(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b\d{1,2}\s*\/\s*\d{1,2}\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Parcelas da mesma compra e ocorrências da mesma recorrência são um grupo; o resto agrupa pela descrição. */
export function groupKey(t: Pick<ReviewTx, "description" | "purchaseId" | "recurrenceId">): string {
  if (t.purchaseId !== null) return `compra:${t.purchaseId}`;
  if (t.recurrenceId !== null) return `recorrencia:${t.recurrenceId}`;
  return `desc:${normalizeDescription(t.description) || "sem descricao"}`;
}

/** Formato aceito para a chave que volta do formulário (campo oculto adulterável). */
export const GROUP_KEY_RE = /^(compra:\d+|recorrencia:\d+|desc:.{1,120})$/;

/** Grupos dos lançamentos, os sem classificação primeiro e, em cada bloco, do maior total para o menor. */
export function groupExpenses(txs: ReviewTx[], levels: ReadonlyMap<string, Level>): Group[] {
  const byKey = new Map<string, Group>();
  const lastDate = new Map<string, string>();
  for (const t of txs) {
    const key = groupKey(t);
    const g = byKey.get(key) ?? { key, label: t.description, totalCents: 0, count: 0, level: levels.get(key) ?? null };
    g.totalCents += t.amountCents;
    g.count += 1;
    if (t.date >= (lastDate.get(key) ?? "")) {
      lastDate.set(key, t.date);
      g.label = t.description;
    }
    byKey.set(key, g);
  }
  return [...byKey.values()].sort((a, b) => Number(a.level !== null) - Number(b.level !== null) || b.totalCents - a.totalCents);
}

export type ReviewSummary = { byLevel: Record<Level, number>; classified: number; total: number };

export function summarize(groups: Group[]): ReviewSummary {
  const byLevel: Record<Level, number> = { dispensavel: 0, reduzivel: 0, essencial: 0 };
  let classified = 0;
  for (const g of groups) {
    if (g.level === null) continue;
    byLevel[g.level] += g.totalCents;
    classified += 1;
  }
  return { byLevel, classified, total: groups.length };
}
