import type { Db } from "../db/connection";
import { monthBounds } from "../dates";
import { addDays } from "../projection";

export const ACCOUNT_KINDS = ["corrente", "carteira", "beneficio", "caixinha", "cartao"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  corrente: "Conta corrente",
  carteira: "Carteira",
  beneficio: "Benefício",
  caixinha: "Caixinha",
  cartao: "Cartão de crédito",
};

export type Account = {
  id: number;
  name: string;
  kind: AccountKind;
  initialBalanceCents: number;
  archived: boolean;
  /** Conta favorita: aparece primeiro nos seletores. Conta arquivada nunca é favorita. */
  favorite: boolean;
  /** Só cartão: dia em que a fatura fecha e dia em que vence (1–31). */
  closingDay: number | null;
  dueDay: number | null;
  /** Só cartão: conta de onde a fatura é paga. */
  payAccountId: number | null;
  /** Só Benefício: Categorias aceitas (vazio = sem restrição). */
  acceptedCategoryIds: number[];
  /** Só cartão: limite de crédito (null = não informado). */
  creditLimitCents: number | null;
  /** Data da última conferência do saldo com o banco (null = nunca). */
  reconciledAt: string | null;
};

export type AccountWithBalance = Account & { balanceCents: number };

export type AccountInput = {
  name: string;
  kind: AccountKind;
  initialBalanceCents: number;
  closingDay?: number | null;
  dueDay?: number | null;
  payAccountId?: number | null;
  favorite?: boolean;
  /** Só Benefício: Categorias aceitas. */
  acceptedCategoryIds?: number[];
  /** Só cartão: limite de crédito. */
  creditLimitCents?: number | null;
};

export const isCard = (a: Pick<Account, "kind">) => a.kind === "cartao";
export const isSavings = (a: Pick<Account, "kind">) => a.kind === "caixinha";
export const isBenefit = (a: Pick<Account, "kind">) => a.kind === "beneficio";
/** Conta do dia a dia: nem cartão, nem Caixinha, nem Benefício. Só estas compõem o Saldo total e a Projeção padrão. */
export const isSpendable = (a: Pick<Account, "kind">) => !isCard(a) && !isSavings(a) && !isBenefit(a);

type Row = {
  id: number;
  name: string;
  kind: AccountKind;
  initial_balance_cents: number;
  archived: number;
  favorite: number;
  closing_day: number | null;
  due_day: number | null;
  pay_account_id: number | null;
  credit_limit_cents: number | null;
  reconciled_at: string | null;
  balance_cents: number;
  accepted_ids: string | null;
};

// Saldo atual = saldo inicial + lançamentos Efetivados (CONTEXT.md).
// Num cartão o resultado é negativo quando há dívida.
const BALANCE_SQL = `
  SELECT a.*, a.initial_balance_cents + COALESCE((
    SELECT SUM(CASE
      WHEN t.to_account_id = a.id THEN t.amount_cents
      WHEN t.kind = 'receita' THEN t.amount_cents
      ELSE -t.amount_cents
    END)
    FROM transactions t
    WHERE t.status = 'efetivado' AND (t.account_id = a.id OR t.to_account_id = a.id)
  ), 0) AS balance_cents,
  (SELECT group_concat(ac.category_id) FROM account_categories ac WHERE ac.account_id = a.id) AS accepted_ids
  FROM accounts a
`;

function toAccount(r: Row): AccountWithBalance {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    initialBalanceCents: r.initial_balance_cents,
    archived: r.archived === 1,
    favorite: r.favorite === 1,
    closingDay: r.closing_day,
    dueDay: r.due_day,
    payAccountId: r.pay_account_id,
    balanceCents: r.balance_cents,
    acceptedCategoryIds: r.accepted_ids ? r.accepted_ids.split(",").map(Number) : [],
    creditLimitCents: r.credit_limit_cents,
    reconciledAt: r.reconciled_at,
  };
}

function normalize(db: Db, input: AccountInput, currentKind?: AccountKind) {
  if (currentKind !== undefined && (currentKind === "cartao") !== (input.kind === "cartao")) {
    throw new Error("Não dá para transformar uma conta em cartão (nem o contrário). Crie uma nova.");
  }
  if (input.kind !== "cartao") {
    return { initial: input.initialBalanceCents, closingDay: null, dueDay: null, payAccountId: null, creditLimitCents: null };
  }

  const { closingDay, dueDay, payAccountId } = input;
  const validDay = (d: number | null | undefined): d is number => d != null && Number.isInteger(d) && d >= 1 && d <= 31;
  if (!validDay(closingDay)) throw new Error("Informe o dia de fechamento da fatura (1 a 31).");
  if (!validDay(dueDay)) throw new Error("Informe o dia de vencimento da fatura (1 a 31).");
  if (payAccountId == null) throw new Error("Escolha a conta que paga a fatura.");
  const payer = getAccount(db, payAccountId);
  if (!payer) throw new Error("Conta de pagamento não encontrada.");
  if (isCard(payer)) throw new Error("A fatura deve ser paga por uma conta, não por outro cartão.");
  if (isSavings(payer)) throw new Error("A fatura deve ser paga por uma conta do dia a dia, não por uma Caixinha. Resgate o valor antes.");
  if (isBenefit(payer)) throw new Error("A fatura deve ser paga por uma conta do dia a dia, não por um Benefício. Transfira o valor antes.");
  // A dívida do cartão nasce dos lançamentos; um saldo inicial aqui só confundiria as faturas.
  const creditLimitCents = input.creditLimitCents ?? null;
  if (creditLimitCents !== null && (!Number.isSafeInteger(creditLimitCents) || creditLimitCents <= 0)) {
    throw new Error("O limite do cartão deve ser maior que zero.");
  }
  return { initial: 0, closingDay, dueDay, payAccountId, creditLimitCents };
}

export function createAccount(db: Db, input: AccountInput): number {
  const n = normalize(db, input);
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO accounts (name, kind, initial_balance_cents, closing_day, due_day, pay_account_id, favorite, credit_limit_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(input.name, input.kind, n.initial, n.closingDay, n.dueDay, n.payAccountId, input.favorite ? 1 : 0, n.creditLimitCents);
  saveAcceptedCategories(db, Number(lastInsertRowid), input);
  return Number(lastInsertRowid);
}

// Só o Benefício restringe Categorias; trocar de tipo limpa a lista.
function saveAcceptedCategories(db: Db, id: number, input: AccountInput) {
  db.prepare("DELETE FROM account_categories WHERE account_id = ?").run(id);
  if (input.kind !== "beneficio") return;
  // Ids que não são Categorias existentes são ignorados, em vez de estourar a chave estrangeira.
  const insert = db.prepare(
    "INSERT OR IGNORE INTO account_categories (account_id, category_id) SELECT ?, id FROM categories WHERE id = ?",
  );
  for (const categoryId of input.acceptedCategoryIds ?? []) insert.run(id, categoryId);
}

export function updateAccount(db: Db, id: number, input: AccountInput): void {
  const current = getAccount(db, id);
  if (!current) throw new Error("Conta não encontrada.");
  const n = normalize(db, input, current.kind);
  if (input.kind === "caixinha" || input.kind === "beneficio") {
    const pays = db.prepare("SELECT 1 FROM accounts WHERE pay_account_id = ? LIMIT 1").get(id);
    const label = input.kind === "caixinha" ? "Caixinha" : "Benefício";
    if (pays) throw new Error(`Esta conta paga a fatura de um cartão e não pode virar ${label}. Troque a conta de pagamento do cartão antes.`);
  }
  db.prepare(
    `UPDATE accounts SET name = ?, kind = ?, initial_balance_cents = ?, closing_day = ?, due_day = ?, pay_account_id = ?,
       favorite = ?, credit_limit_cents = ?
     WHERE id = ?`,
  ).run(
    input.name, input.kind, n.initial, n.closingDay, n.dueDay, n.payAccountId,
    input.favorite && !current.archived ? 1 : 0, // conta arquivada nunca é favorita
    n.creditLimitCents,
    id,
  );
  saveAcceptedCategories(db, id, input);
}

export function setAccountArchived(db: Db, id: number, archived: boolean): void {
  // Arquivar tira a marca de favorita; desarquivar não a devolve.
  db.prepare("UPDATE accounts SET archived = ?, favorite = 0 WHERE id = ?").run(archived ? 1 : 0, id);
}

export function setAccountFavorite(db: Db, id: number, favorite: boolean): void {
  const account = getAccount(db, id);
  if (!account) throw new Error("Conta não encontrada.");
  if (account.archived) throw new Error("Conta arquivada não pode ser favorita.");
  db.prepare("UPDATE accounts SET favorite = ? WHERE id = ?").run(favorite ? 1 : 0, id);
}

export function getAccount(db: Db, id: number): AccountWithBalance | undefined {
  const row = db.prepare(`${BALANCE_SQL} WHERE a.id = ?`).get(id) as Row | undefined;
  return row && toAccount(row);
}

export function listAccounts(db: Db, opts: { includeArchived?: boolean } = {}): AccountWithBalance[] {
  const where = opts.includeArchived ? "" : "WHERE a.archived = 0";
  return (db.prepare(`${BALANCE_SQL} ${where} ORDER BY a.archived, a.name`).all() as Row[]).map(
    toAccount,
  );
}

/**
 * Saldo total do dinheiro disponível: cartões ficam de fora (a dívida sai no vencimento da fatura)
 * e Caixinhas e Benefícios também (aparecem à parte, em Guardado e Benefício).
 */
export function totalBalanceCents(accounts: AccountWithBalance[]): number {
  return accounts.filter(isSpendable).reduce((sum, a) => sum + a.balanceCents, 0);
}

/** Guardado: soma dos saldos das Caixinhas. */
export function savedBalanceCents(accounts: AccountWithBalance[]): number {
  return accounts.filter(isSavings).reduce((sum, a) => sum + a.balanceCents, 0);
}

/** Benefício: soma dos saldos das Contas Benefício. */
export function benefitBalanceCents(accounts: AccountWithBalance[]): number {
  return accounts.filter(isBenefit).reduce((sum, a) => sum + a.balanceCents, 0);
}

/** Texto do lançamento criado por "Ajustar saldo". */
export const ADJUSTMENT_DESCRIPTION = "Ajuste de saldo";

/**
 * Confere o saldo com o do banco: se divergir, lança a diferença como Receita ou Despesa de ajuste
 * (sem Categoria, Efetivada hoje); em qualquer caso grava a data da conferência. Devolve a diferença
 * aplicada (positiva = entrou dinheiro). Cartão não se ajusta: a dívida nasce dos lançamentos.
 */
export function reconcileBalance(db: Db, id: number, actualCents: number, today: string): number {
  const account = getAccount(db, id);
  if (!account) throw new Error("Conta não encontrada.");
  if (account.archived) throw new Error("Conta arquivada não pode ser ajustada.");
  if (isCard(account)) throw new Error("Cartão não tem saldo para ajustar: lance as compras e os pagamentos.");
  if (!Number.isSafeInteger(actualCents)) throw new Error("Saldo inválido.");
  const diff = actualCents - account.balanceCents;
  db.transaction(() => {
    if (diff !== 0) {
      // Direto no SQL: importar `createTransaction` fecharia um ciclo de módulos com transactions.ts.
      db.prepare(
        `INSERT INTO transactions (kind, status, date, amount_cents, description, account_id)
         VALUES (?, 'efetivado', ?, ?, ?, ?)`,
      ).run(diff > 0 ? "receita" : "despesa", today, Math.abs(diff), ADJUSTMENT_DESCRIPTION, id);
    }
    db.prepare("UPDATE accounts SET reconciled_at = ? WHERE id = ?").run(today, id);
  })();
  return diff;
}

/** Despesa mensal média dos últimos 90 dias (Efetivadas, fora das Caixinhas e dos ajustes de saldo): base do "cobre N meses". */
export function averageMonthlyExpenseCents(db: Db, today: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(t.amount_cents), 0) AS total
       FROM transactions t JOIN accounts a ON a.id = t.account_id
       WHERE t.kind = 'despesa' AND t.status = 'efetivado' AND a.kind <> 'caixinha'
         AND t.description <> ? AND t.date > ? AND t.date <= ?`,
    )
    .get(ADJUSTMENT_DESCRIPTION, addDays(today, -90), today) as { total: number };
  return Math.round(row.total / 3);
}

/** Receitas efetivadas no mês ("YYYY-MM") por conta, sem os ajustes de saldo: o rendimento das Caixinhas. */
export function monthIncomeByAccount(db: Db, month: string): Map<number, number> {
  const { from, to } = monthBounds(month);
  const rows = db
    .prepare(
      `SELECT account_id, SUM(amount_cents) AS total FROM transactions
       WHERE kind = 'receita' AND status = 'efetivado' AND description <> ? AND date BETWEEN ? AND ?
       GROUP BY account_id`,
    )
    .all(ADJUSTMENT_DESCRIPTION, from, to) as { account_id: number; total: number }[];
  return new Map(rows.map((r) => [r.account_id, r.total]));
}
