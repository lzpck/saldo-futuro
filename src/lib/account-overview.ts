// Visão da tela de Contas: saldo projetado por conta, patrimônio líquido e ordenações.
// Módulo puro (sem banco, sem UI).

import { addDays } from "./projection";

/** Faturas que vencem até aqui entram no Saldo projetado da conta que as paga. */
export const SHORTFALL_HORIZON_DAYS = 30;

export type InvoiceDue = { payAccountId: number; dueDate: string; remainingCents: number };

export type AccountOutlook = {
  accountId: number;
  balanceCents: number;
  /** Soma das faturas a pagar por esta conta dentro do horizonte (inclui as vencidas). */
  dueCents: number;
  /** Saldo atual menos as faturas: o que sobra se todas forem pagas por ela. */
  projectedCents: number;
  /** Quanto falta para cobrir as faturas (0 quando o saldo basta). */
  shortfallCents: number;
  /** Último vencimento considerado, ou null sem faturas no horizonte. */
  coveredUntil: string | null;
};

/** Saldo projetado de cada conta: Saldo atual menos as faturas em aberto que ela paga e que vencem até o horizonte. */
export function accountOutlooks(
  accounts: { id: number; balanceCents: number }[],
  invoices: InvoiceDue[],
  today: string,
  horizonDays = SHORTFALL_HORIZON_DAYS,
): Map<number, AccountOutlook> {
  const limit = addDays(today, horizonDays);
  return new Map(
    accounts.map((a) => {
      const mine = invoices.filter((i) => i.payAccountId === a.id && i.remainingCents > 0 && i.dueDate <= limit);
      const dueCents = mine.reduce((sum, i) => sum + i.remainingCents, 0);
      const projectedCents = a.balanceCents - dueCents;
      return [
        a.id,
        {
          accountId: a.id,
          balanceCents: a.balanceCents,
          dueCents,
          projectedCents,
          shortfallCents: Math.max(-projectedCents, 0),
          coveredUntil: mine.map((i) => i.dueDate).sort().at(-1) ?? null,
        },
      ];
    }),
  );
}

/** Patrimônio líquido: tudo que é seu (disponível, benefício e guardado) menos o que falta pagar nas faturas. */
export function netWorthCents(p: { availableCents: number; benefitCents: number; savedCents: number; invoicesCents: number }): number {
  return p.availableCents + p.benefitCents + p.savedCents - p.invoicesCents;
}

/** Quantos meses de despesa o guardado cobre (uma casa decimal), ou null sem despesa para comparar. */
export function monthsCovered(savedCents: number, monthlyExpenseCents: number): number | null {
  if (monthlyExpenseCents <= 0) return null;
  return Math.round((savedCents / monthlyExpenseCents) * 10) / 10;
}

/** Contas com saldo diferente de zero primeiro; as zeradas ficam à parte. */
export function splitByBalance<T extends { balanceCents: number }>(accounts: T[]): { withBalance: T[]; empty: T[] } {
  return {
    withBalance: accounts.filter((a) => a.balanceCents !== 0),
    empty: accounts.filter((a) => a.balanceCents === 0),
  };
}

/** Vencimento mais próximo primeiro; quem não tem fatura em aberto vai para o fim, em ordem alfabética. */
export function sortByNextDue<T extends { name: string; dueDate: string | null }>(cards: T[]): T[] {
  return [...cards].sort((a, b) => {
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name, "pt-BR");
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return a.name.localeCompare(b.name, "pt-BR");
  });
}

/** Uso do limite do cartão; null quando o limite não foi informado. */
export function creditUsage(limitCents: number | null, usedCents: number) {
  if (limitCents === null) return null;
  return {
    usedCents,
    availableCents: Math.max(limitCents - usedCents, 0),
    percent: Math.min(Math.round((usedCents / limitCents) * 100), 100),
  };
}

/** Cor estável de uma conta, derivada do nome (matiz de 0 a 359), para o ícone. */
export function accountHue(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return h;
}

/** Texto de quando o cartão fecha: "fecha hoje", "fecha amanhã" ou "fecha em N dias". */
export function closingText(days: number): string {
  return days <= 0 ? "fecha hoje" : days === 1 ? "fecha amanhã" : `fecha em ${days} dias`;
}
