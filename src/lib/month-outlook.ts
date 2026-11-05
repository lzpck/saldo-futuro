// Tira de meses do Resumo: entrou, saiu, sobra, % e saldo final de cada mês. Módulo puro (sem banco, sem UI).
// Entrou/Saiu seguem o caixa do escopo do saldo (ADR 0005), Efetivado + Previsto; o saldo final é a projeção.

import { monthBounds, shiftMonth } from "./dates";
import { monthFlow, type FlowContext } from "./month-flow";
import { dailyBalances, type ProjectionAccount, type ProjectionTx } from "./projection";

/** A partir de qual mês (0 = o corrente) o número é palpite: recorrência variável e compras que ainda nem existem. */
export const ESTIMATED_FROM_MONTH = 2;

export type MonthRow = {
  month: string; // AAAA-MM
  entrouCents: number;
  saiuCents: number;
  /** Entrou menos saiu. */
  sobraCents: number;
  /** Sobra sobre o que entrou, arredondada; null quando nada entrou. */
  percent: number | null;
  /** Saldo projetado no último dia do mês, já com Movimento fora do saldo. */
  endBalanceCents: number;
  estimated: boolean;
};

export function monthlyOutlook(
  opts: { accounts: ProjectionAccount[]; transactions: ProjectionTx[]; today: string; months?: number } & FlowContext,
): MonthRow[] {
  const { accounts, transactions, today, months = 6 } = opts;
  const first = today.slice(0, 7);
  const days = dailyBalances({ accounts, transactions, today, from: today, to: monthBounds(shiftMonth(first, months - 1)).to });
  const endBalance = new Map(days.map((d) => [d.date, d.endBalanceCents]));

  return Array.from({ length: months }, (_, n) => {
    const month = shiftMonth(first, n);
    const { from, to } = monthBounds(month);
    const { entradas, saidas } = monthFlow({ transactions, today, from, to, scope: opts.scope, cardIds: opts.cardIds });
    const entrouCents = entradas.done + entradas.planned;
    const saiuCents = saidas.done + saidas.planned;
    const sobraCents = entrouCents - saiuCents;
    return {
      month,
      entrouCents,
      saiuCents,
      sobraCents,
      percent: entrouCents > 0 ? Math.round((sobraCents / entrouCents) * 100) : null,
      endBalanceCents: endBalance.get(to)!,
      estimated: n >= ESTIMATED_FROM_MONTH,
    };
  });
}
