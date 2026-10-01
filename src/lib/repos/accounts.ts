import type { Db } from "../db/connection";

export const ACCOUNT_KINDS = ["corrente", "carteira", "beneficio", "cartao"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  corrente: "Conta corrente",
  carteira: "Carteira",
  beneficio: "Benefício",
  cartao: "Cartão de crédito",
};

export type Account = {
  id: number;
  name: string;
  kind: AccountKind;
  initialBalanceCents: number;
  archived: boolean;
  /** Só cartão: dia em que a fatura fecha e dia em que vence (1–31). */
  closingDay: number | null;
  dueDay: number | null;
  /** Só cartão: conta de onde a fatura é paga. */
  payAccountId: number | null;
};

export type AccountWithBalance = Account & { balanceCents: number };

export type AccountInput = {
  name: string;
  kind: AccountKind;
  initialBalanceCents: number;
  closingDay?: number | null;
  dueDay?: number | null;
  payAccountId?: number | null;
};

export const isCard = (a: Pick<Account, "kind">) => a.kind === "cartao";

type Row = {
  id: number;
  name: string;
  kind: AccountKind;
  initial_balance_cents: number;
  archived: number;
  closing_day: number | null;
  due_day: number | null;
  pay_account_id: number | null;
  balance_cents: number;
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
  ), 0) AS balance_cents
  FROM accounts a
`;

function toAccount(r: Row): AccountWithBalance {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    initialBalanceCents: r.initial_balance_cents,
    archived: r.archived === 1,
    closingDay: r.closing_day,
    dueDay: r.due_day,
    payAccountId: r.pay_account_id,
    balanceCents: r.balance_cents,
  };
}

function normalize(db: Db, input: AccountInput, currentKind?: AccountKind) {
  if (currentKind !== undefined && (currentKind === "cartao") !== (input.kind === "cartao")) {
    throw new Error("Não dá para transformar uma conta em cartão (nem o contrário). Crie uma nova.");
  }
  if (input.kind !== "cartao") {
    return { initial: input.initialBalanceCents, closingDay: null, dueDay: null, payAccountId: null };
  }

  const { closingDay, dueDay, payAccountId } = input;
  const validDay = (d: number | null | undefined): d is number => d != null && Number.isInteger(d) && d >= 1 && d <= 31;
  if (!validDay(closingDay)) throw new Error("Informe o dia de fechamento da fatura (1 a 31).");
  if (!validDay(dueDay)) throw new Error("Informe o dia de vencimento da fatura (1 a 31).");
  if (payAccountId == null) throw new Error("Escolha a conta que paga a fatura.");
  const payer = getAccount(db, payAccountId);
  if (!payer) throw new Error("Conta de pagamento não encontrada.");
  if (isCard(payer)) throw new Error("A fatura deve ser paga por uma conta, não por outro cartão.");
  // A dívida do cartão nasce dos lançamentos; um saldo inicial aqui só confundiria as faturas.
  return { initial: 0, closingDay, dueDay, payAccountId };
}

export function createAccount(db: Db, input: AccountInput): number {
  const n = normalize(db, input);
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO accounts (name, kind, initial_balance_cents, closing_day, due_day, pay_account_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(input.name, input.kind, n.initial, n.closingDay, n.dueDay, n.payAccountId);
  return Number(lastInsertRowid);
}

export function updateAccount(db: Db, id: number, input: AccountInput): void {
  const current = getAccount(db, id);
  if (!current) throw new Error("Conta não encontrada.");
  const n = normalize(db, input, current.kind);
  db.prepare(
    `UPDATE accounts SET name = ?, kind = ?, initial_balance_cents = ?, closing_day = ?, due_day = ?, pay_account_id = ?
     WHERE id = ?`,
  ).run(input.name, input.kind, n.initial, n.closingDay, n.dueDay, n.payAccountId, id);
}

export function setAccountArchived(db: Db, id: number, archived: boolean): void {
  db.prepare("UPDATE accounts SET archived = ? WHERE id = ?").run(archived ? 1 : 0, id);
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

/** Saldo total do dinheiro que você tem: cartões ficam de fora (a dívida sai no vencimento da fatura). */
export function totalBalanceCents(accounts: AccountWithBalance[]): number {
  return accounts.filter((a) => !isCard(a)).reduce((sum, a) => sum + a.balanceCents, 0);
}
