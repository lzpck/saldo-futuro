// Backtest da previsão local (ticket 05b): mede o quanto predictAmount erraria nos meses passados.

import { predictAmount, type HistoryPoint } from "./prediction";

export type BacktestPoint = { month: string; predictedCents: number; actualCents: number; ape: number };

/**
 * Para cada mês com valor real, prevê usando só os meses anteriores. O primeiro mês fica de fora
 * (sem histórico a previsão seria só a estimativa inicial, o que não mede o método).
 * `ape` = erro percentual absoluto, como fração do valor real (0,5 = 50%).
 */
export function backtestSeries(history: HistoryPoint[], fallbackCents: number): BacktestPoint[] {
  const actual = new Map<string, number>();
  for (const p of history) actual.set(p.month, (actual.get(p.month) ?? 0) + p.amountCents);

  return [...actual.keys()]
    .sort()
    .slice(1)
    .map((month) => {
      const actualCents = actual.get(month)!;
      const predictedCents = predictAmount(history, month, fallbackCents).amountCents;
      return { month, predictedCents, actualCents, ape: Math.abs(predictedCents - actualCents) / actualCents };
    });
}

export function summarize(points: { ape: number }[]): { points: number; mape: number | null } {
  if (points.length === 0) return { points: 0, mape: null };
  return { points: points.length, mape: points.reduce((s, p) => s + p.ape, 0) / points.length };
}
