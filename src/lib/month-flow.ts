// Fluxo de caixa do mês: módulo puro (sem banco, sem UI). Regras em CONTEXT.md (Entradas, Saídas,
// Movimento fora do saldo, Resultado do mês) e ADR 0005. Usa o mesmo escopo de contas da projeção,
// então abertura + resultado + movimento fora do saldo = saldo no fim do mês.
import { effectiveDate, type ProjectionTx } from "./projection";

export type FlowContext = {
  /** Contas que compõem o saldo: as de uso livre, ou só a Conta escolhida no filtro. */
  scope: ReadonlySet<number>;
  cardIds: ReadonlySet<number>;
};

export type FlowBucket = "entrada" | "saida" | "fora";

/** `cents` tem sinal só no movimento fora do saldo (positivo entra, negativo sai). */
export type Flow = { bucket: FlowBucket; cents: number };

export type Amounts = { done: number; planned: number };

export type MonthFlow = {
  entradas: Amounts;
  saidas: Amounts;
  /** Com sinal: aplicar numa Caixinha é negativo, resgatar é positivo. */
  foraDoSaldo: Amounts;
  /** Entradas menos Saídas. */
  resultado: Amounts;
};

/** Onde o lançamento pesa no caixa do escopo; null quando não mexe nele. */
export function classifyFlow(tx: ProjectionTx, { scope, cardIds }: FlowContext): Flow | null {
  const from = scope.has(tx.accountId);
  if (tx.kind === "receita") return from ? { bucket: "entrada", cents: tx.amountCents } : null;
  if (tx.kind === "despesa") return from ? { bucket: "saida", cents: tx.amountCents } : null;

  const to = tx.toAccountId !== null && scope.has(tx.toAccountId);
  if (from === to) return null;
  if (!from) return { bucket: "fora", cents: tx.amountCents };
  // Pagar o cartão é a Saída do caixa; qualquer outra transferência para fora só muda onde o dinheiro está.
  return tx.toAccountId !== null && cardIds.has(tx.toAccountId)
    ? { bucket: "saida", cents: tx.amountCents }
    : { bucket: "fora", cents: -tx.amountCents };
}

/** Totais de [from, to] pelo dia em que o lançamento pesa no saldo (Previsto atrasado vale hoje). */
export function monthFlow(opts: { transactions: ProjectionTx[]; today: string; from: string; to: string } & FlowContext): MonthFlow {
  const { transactions, today, from, to } = opts;
  const sums = {
    entrada: { done: 0, planned: 0 },
    saida: { done: 0, planned: 0 },
    fora: { done: 0, planned: 0 },
  };
  for (const tx of transactions) {
    const day = effectiveDate(tx, today);
    if (day < from || day > to) continue;
    const flow = classifyFlow(tx, opts);
    if (flow) sums[flow.bucket][tx.status === "efetivado" ? "done" : "planned"] += flow.cents;
  }
  return {
    entradas: sums.entrada,
    saidas: sums.saida,
    foraDoSaldo: sums.fora,
    resultado: {
      done: sums.entrada.done - sums.saida.done,
      planned: sums.entrada.planned - sums.saida.planned,
    },
  };
}

/**
 * Efeito de um lançamento na lista filtrada, que não tem saldo: a Fatura entra e a compra no cartão
 * fica de fora (só sai do caixa na Fatura). Outras transferências valem zero.
 */
export function listedFlowCents(tx: ProjectionTx, cardIds: ReadonlySet<number>): number {
  if (tx.kind === "receita") return tx.amountCents;
  if (tx.kind === "despesa") return cardIds.has(tx.accountId) ? 0 : -tx.amountCents;
  return tx.toAccountId !== null && cardIds.has(tx.toAccountId) ? -tx.amountCents : 0;
}
