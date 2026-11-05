// "Pode gastar por dia": módulo puro (sem banco, sem UI).
// Regra: menor saldo projetado de hoje até o fim do mês ÷ dias restantes (contando hoje).
// As faturas já estão no saldo projetado como pagamento previsto (ADR 0003), então entram sozinhas.

import type { DayBalance } from "./projection";

export type DailyAllowance = {
  /** Quanto dá para gastar por dia sem o saldo projetado ficar abaixo de zero; 0 se já vai faltar. */
  perDayCents: number;
  /** Dia do menor saldo no intervalo. */
  lowestDate: string;
  lowestCents: number;
  /** Dias contados, de hoje até `untilDate` inclusive. */
  daysCount: number;
  untilDate: string;
};

/** `days` começa hoje (como `dailyBalances`); `untilDate` é o último dia considerado. Sem dias no intervalo, null. */
export function dailyAllowance(days: DayBalance[], untilDate: string): DailyAllowance | null {
  const window = days.filter((d) => d.date <= untilDate);
  if (window.length === 0) return null;
  const low = window.reduce((min, d) => (d.endBalanceCents < min.endBalanceCents ? d : min));
  return {
    perDayCents: low.endBalanceCents > 0 ? Math.floor(low.endBalanceCents / window.length) : 0,
    lowestDate: low.date,
    lowestCents: low.endBalanceCents,
    daysCount: window.length,
    untilDate,
  };
}
