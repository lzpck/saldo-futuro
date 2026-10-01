// Projeção de saldo: módulo puro (sem banco, sem UI). Regras em CONTEXT.md:
//  - Saldo atual = saldo inicial + Efetivados.
//  - Projeção = saldo atual + Previstos até o dia.
//  - Previsto Em atraso conta como se fosse hoje, até o usuário resolvê-lo.

export type ProjectionAccount = { id: number; initialBalanceCents: number };

export type ProjectionTx = {
  id: number;
  kind: "receita" | "despesa" | "transferencia";
  status: "previsto" | "efetivado";
  date: string; // AAAA-MM-DD
  amountCents: number;
  accountId: number;
  toAccountId: number | null;
};

export type DayPhase = "real" | "hoje" | "futuro";

export type DayBalance = {
  date: string;
  phase: DayPhase;
  /** Saldo no fim do dia, somando as contas consideradas. */
  endBalanceCents: number;
  /** Saldo no fim do dia de cada conta considerada. */
  byAccount: Record<number, number>;
};

/** Um Previsto cuja data já passou. */
export function isOverdue(tx: Pick<ProjectionTx, "status" | "date">, today: string): boolean {
  return tx.status === "previsto" && tx.date < today;
}

/** Dia em que o lançamento passa a pesar no saldo. */
export function effectiveDate(tx: Pick<ProjectionTx, "status" | "date">, today: string): string {
  return isOverdue(tx, today) ? today : tx.date;
}

/** Variação do lançamento sobre uma conta (0 se não a afeta). */
export function deltaForAccount(tx: ProjectionTx, accountId: number): number {
  if (tx.kind === "transferencia") {
    if (tx.toAccountId === accountId) return tx.amountCents;
    if (tx.accountId === accountId) return -tx.amountCents;
    return 0;
  }
  if (tx.accountId !== accountId) return 0;
  return tx.kind === "receita" ? tx.amountCents : -tx.amountCents;
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/**
 * Saldo de fim de dia para cada dia de [from, to].
 * Só as contas informadas contam; um lançamento que toca uma conta de fora afeta só o lado de dentro.
 */
export function dailyBalances(opts: {
  accounts: ProjectionAccount[];
  transactions: ProjectionTx[];
  today: string;
  from: string;
  to: string;
}): DayBalance[] {
  const { accounts, transactions, today, from, to } = opts;

  const running: Record<number, number> = {};
  for (const a of accounts) running[a.id] = a.initialBalanceCents;

  // Agrupa variações por dia efetivo; o que cai antes de `from` vira saldo de abertura.
  const byDay = new Map<string, ProjectionTx[]>();
  for (const tx of transactions) {
    const day = effectiveDate(tx, today);
    if (day > to) continue;
    if (day < from) {
      for (const a of accounts) running[a.id] += deltaForAccount(tx, a.id);
    } else {
      const list = byDay.get(day);
      if (list) list.push(tx);
      else byDay.set(day, [tx]);
    }
  }

  const result: DayBalance[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    for (const tx of byDay.get(day) ?? []) {
      for (const a of accounts) running[a.id] += deltaForAccount(tx, a.id);
    }
    const byAccount = { ...running };
    result.push({
      date: day,
      phase: day < today ? "real" : day === today ? "hoje" : "futuro",
      endBalanceCents: Object.values(byAccount).reduce((s, v) => s + v, 0),
      byAccount,
    });
  }
  return result;
}

export type DayGroup<T extends ProjectionTx> = { date: string; items: T[] };

/**
 * Agrupa lançamentos por dia para a lista, em ordem cronológica.
 * Atrasados aparecem sob o dia de hoje quando hoje está no período; fora dele, ficam na data original.
 */
export function groupByDay<T extends ProjectionTx>(
  transactions: T[],
  opts: { today: string; from: string; to: string },
): DayGroup<T>[] {
  const { today, from, to } = opts;
  const todayInRange = today >= from && today <= to;
  const groups = new Map<string, T[]>();

  for (const tx of transactions) {
    const day = isOverdue(tx, today) && todayInRange ? today : tx.date;
    if (day < from || day > to) continue;
    const list = groups.get(day);
    if (list) list.push(tx);
    else groups.set(day, [tx]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({
      date,
      // Atrasados primeiro (mais antigos antes), depois os do dia na ordem de cadastro.
      items: [...items].sort((x, y) => {
        const ox = isOverdue(x, today) ? 0 : 1;
        const oy = isOverdue(y, today) ? 0 : 1;
        return ox - oy || (ox === 0 ? x.date.localeCompare(y.date) : 0) || x.id - y.id;
      }),
    }));
}

/** Menor saldo de fim de dia dentro de [from, to] (para alertar saldo negativo). */
export function lowestBalance(days: DayBalance[]): DayBalance | undefined {
  return days.reduce<DayBalance | undefined>(
    (min, d) => (min === undefined || d.endBalanceCents < min.endBalanceCents ? d : min),
    undefined,
  );
}

/**
 * Painel de contas em aberto: Previstos em atraso (mais antigos primeiro) e os que vencem
 * nos próximos `horizonDays` dias, contando hoje.
 */
export function openItems<T extends Pick<ProjectionTx, "status" | "date" | "id">>(
  items: T[],
  today: string,
  horizonDays: number,
): { overdue: T[]; upcoming: T[] } {
  const limit = addDays(today, horizonDays);
  const planned = items.filter((t) => t.status === "previsto");
  const byDate = (a: T, b: T) => a.date.localeCompare(b.date) || a.id - b.id;
  return {
    overdue: planned.filter((t) => isOverdue(t, today)).sort(byDate),
    upcoming: planned.filter((t) => t.date >= today && t.date <= limit).sort(byDate),
  };
}
