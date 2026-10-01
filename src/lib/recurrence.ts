// Regras de recorrência e parcelamento: módulo puro (sem banco, sem UI). Ver ADR 0002.

import { daysBetween } from "./dates";
import { addDays } from "./projection";

export const FREQUENCIES = ["semanal", "quinzenal", "mensal", "anual"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  semanal: "Toda semana",
  quinzenal: "A cada 14 dias",
  mensal: "Todo mês",
  anual: "Todo ano",
};

export type RecurrenceRule = {
  frequency: Frequency;
  /** Primeira ocorrência (âncora do ciclo semanal/quinzenal e do mês de início). */
  startDate: string;
  /** Dia do mês das regras mensais/anuais. Preservado mesmo quando um mês curto força o recuo. */
  anchorDay: number;
  /** Última data possível (inclusive); null = sem término. */
  endDate: string | null;
};

const pad = (n: number) => String(n).padStart(2, "0");

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Dia `anchorDay` do mês, recuando para o último dia se o mês for mais curto (31 → 30/28/29). */
export function clampedDate(year: number, month: number, anchorDay: number): string {
  return `${year}-${pad(month)}-${pad(Math.min(anchorDay, daysInMonth(year, month)))}`;
}

/** `iso` mais `n` meses, mantendo o dia âncora (recuando em meses curtos). */
export function addMonthsClamped(iso: string, n: number, anchorDay?: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return clampedDate(Math.floor(total / 12), (total % 12) + 1, anchorDay ?? d);
}

/** Datas agendadas da regra dentro de [from, to], em ordem. */
export function occurrencesBetween(rule: RecurrenceRule, from: string, to: string): string[] {
  const last = rule.endDate !== null && rule.endDate < to ? rule.endDate : to;
  if (last < from || last < rule.startDate) return [];
  const result: string[] = [];
  const push = (date: string) => {
    if (date >= from && date >= rule.startDate && date <= last) result.push(date);
  };

  if (rule.frequency === "semanal" || rule.frequency === "quinzenal") {
    const step = rule.frequency === "semanal" ? 7 : 14;
    let date = rule.startDate;
    if (from > date) {
      // salta direto para o primeiro ciclo dentro do período, sem percorrer anos de datas
      const diff = daysBetween(rule.startDate, from);
      date = addDays(rule.startDate, Math.floor(diff / step) * step);
    }
    for (; date <= last; date = addDays(date, step)) push(date);
    return result;
  }

  const [sy, sm] = rule.startDate.split("-").map(Number);
  const step = rule.frequency === "mensal" ? 1 : 12;
  for (let k = 0; ; k++) {
    const total = sy * 12 + (sm - 1) + k * step;
    const date = clampedDate(Math.floor(total / 12), (total % 12) + 1, rule.anchorDay);
    if (date > last) break;
    push(date);
  }
  return result;
}

/** Quebra um total em N parcelas inteiras; a sobra de centavos vai para as primeiras. */
export function splitInstallments(totalCents: number, n: number): number[] {
  if (!Number.isInteger(n) || n < 1) throw new Error("Número de parcelas inválido.");
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}

export type OccurrenceRef = { recurrenceId: number; occurrenceDate: string };
export const occurrenceKey = (recurrenceId: number, occurrenceDate: string) => `${recurrenceId}|${occurrenceDate}`;

/**
 * Ocorrências virtuais: datas das regras até `to` que ainda não viraram lançamento gravado
 * nem foram puladas. `handled` contém as chaves (occurrenceKey) das já tratadas.
 */
export function virtualOccurrences<R extends RecurrenceRule & { id: number }>(
  rules: R[],
  handled: Set<string>,
  to: string,
): { rule: R; occurrenceDate: string }[] {
  const result: { rule: R; occurrenceDate: string }[] = [];
  for (const rule of rules) {
    for (const occurrenceDate of occurrencesBetween(rule, rule.startDate, to)) {
      if (!handled.has(occurrenceKey(rule.id, occurrenceDate))) result.push({ rule, occurrenceDate });
    }
  }
  return result;
}
