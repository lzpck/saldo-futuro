// Previsão de valor de Recorrências variáveis (luz, gás, água): módulo puro, sem banco nem UI.
// Estatística local, determinística e explicável (ticket 05).

import { formatBRL } from "./money";

export type HistoryPoint = { month: string /* AAAA-MM */; amountCents: number };

export type Prediction = {
  amountCents: number;
  method: "historico" | "inicial";
  monthsUsed: number;
  seasonal: boolean;
  explanation: string;
};

/** Quantos meses (com dado) entram na média recente. */
const WINDOW = 6;
/** Os meses recentes vêm só dos últimos 11 meses, para o "mesmo mês do ano anterior" ficar de fora. */
const LOOKBACK_MONTHS = 11;
/** Valor acima de OUTLIER_FACTOR × mediana entra limitado a esse teto. */
const OUTLIER_FACTOR = 2.5;
const TREND_MIN = 0.7;
const TREND_MAX = 1.4;
const SEASONAL_WEIGHT = 0.5;

/** `month` (AAAA-MM) deslocado em `n` meses. */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Média com pesos 1…n (o último valor, o mais recente, pesa mais). */
function weightedMean(values: number[], weights?: number[]): number {
  let sum = 0;
  let total = 0;
  values.forEach((v, i) => {
    const w = weights ? weights[i] : i + 1;
    sum += v * w;
    total += w;
  });
  return sum / total;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Estima o valor da ocorrência de `targetMonth`. Só usa meses anteriores a ele (nunca dados do futuro).
 * `fallbackCents` é a estimativa inicial, usada enquanto não houver histórico.
 */
export function predictAmount(history: HistoryPoint[], targetMonth: string, fallbackCents: number): Prediction {
  const byMonth = new Map<string, number>();
  for (const p of history) {
    if (p.month < targetMonth) byMonth.set(p.month, (byMonth.get(p.month) ?? 0) + p.amountCents);
  }

  const earliest = shiftMonth(targetMonth, -LOOKBACK_MONTHS);
  const recent = [...byMonth.entries()]
    .filter(([month]) => month >= earliest)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-WINDOW);

  if (recent.length === 0) {
    const amountCents = Math.max(1, Math.round(fallbackCents));
    return {
      amountCents,
      method: "inicial",
      monthsUsed: 0,
      seasonal: false,
      explanation: `Estimativa inicial de ${formatBRL(amountCents)} (ainda sem histórico).`,
    };
  }

  const cap = OUTLIER_FACTOR * median(recent.map(([, v]) => v));
  const values = recent.map(([, v]) => Math.min(v, cap));
  const recentMean = weightedMean(values);

  let estimate = recentMean;
  let seasonal = false;
  const sameMonthLastYear = byMonth.get(shiftMonth(targetMonth, -12));
  if (sameMonthLastYear !== undefined) {
    seasonal = true;
    // Tendência: como o recorte recente está em relação ao mesmo recorte um ano antes (só meses que existem nos dois).
    const nowSlice: number[] = [];
    const thenSlice: number[] = [];
    const weights: number[] = [];
    recent.forEach(([month], i) => {
      const before = byMonth.get(shiftMonth(month, -12));
      if (before !== undefined) {
        nowSlice.push(values[i]);
        thenSlice.push(before);
        weights.push(i + 1);
      }
    });
    const factor =
      nowSlice.length === 0 ? 1 : clamp(weightedMean(nowSlice, weights) / weightedMean(thenSlice, weights), TREND_MIN, TREND_MAX);
    estimate = (1 - SEASONAL_WEIGHT) * recentMean + SEASONAL_WEIGHT * sameMonthLastYear * factor;
  }

  const amountCents = Math.max(1, Math.round(estimate));
  const n = recent.length;
  const base = n === 1 ? "último valor informado (1 mês)" : `média ponderada dos últimos ${n} meses`;
  return {
    amountCents,
    method: "historico",
    monthsUsed: n,
    seasonal,
    explanation: `Estimado em ${formatBRL(amountCents)} · ${base}${seasonal ? " + ajuste sazonal" : ""}`,
  };
}
