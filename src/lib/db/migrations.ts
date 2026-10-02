import type Database from "better-sqlite3";

type Migration = (db: Database.Database) => void;

const DEFAULT_CATEGORIES: {
  name: string;
  kind: "despesa" | "receita";
  color: string;
  icon: string;
  children?: string[];
}[] = [
  { name: "Moradia", kind: "despesa", color: "#6366f1", icon: "🏠", children: ["Aluguel", "Condomínio", "Luz", "Água", "Gás", "Internet"] },
  { name: "Mercado", kind: "despesa", color: "#22c55e", icon: "🛒" },
  { name: "Alimentação", kind: "despesa", color: "#f97316", icon: "🍽️" },
  { name: "Transporte", kind: "despesa", color: "#0ea5e9", icon: "🚗" },
  { name: "Saúde", kind: "despesa", color: "#ef4444", icon: "💊" },
  { name: "Lazer", kind: "despesa", color: "#a855f7", icon: "🎮" },
  { name: "Assinaturas", kind: "despesa", color: "#ec4899", icon: "📺" },
  { name: "Educação", kind: "despesa", color: "#eab308", icon: "📚" },
  { name: "Outros", kind: "despesa", color: "#94a3b8", icon: "📦" },
  { name: "Salário", kind: "receita", color: "#10b981", icon: "💼" },
  { name: "Rendimentos", kind: "receita", color: "#14b8a6", icon: "📈" },
  { name: "Outras receitas", kind: "receita", color: "#64748b", icon: "💰" },
];

// A posição no array é a versão do esquema (PRAGMA user_version). Nunca reordene nem edite
// migrações já aplicadas: acrescente novas ao final.
const MIGRATIONS: Migration[] = [
  (db) => {
    db.exec(`
      CREATE TABLE accounts (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        initial_balance_cents INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE categories (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('despesa', 'receita')),
        parent_id INTEGER REFERENCES categories(id),
        color TEXT NOT NULL,
        icon TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE transactions (
        id INTEGER PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('receita', 'despesa', 'transferencia')),
        status TEXT NOT NULL DEFAULT 'efetivado' CHECK (status IN ('previsto', 'efetivado')),
        date TEXT NOT NULL,
        amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
        description TEXT NOT NULL,
        account_id INTEGER NOT NULL REFERENCES accounts(id),
        to_account_id INTEGER REFERENCES accounts(id),
        category_id INTEGER REFERENCES categories(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK ((kind = 'transferencia') = (to_account_id IS NOT NULL)),
        CHECK (kind <> 'transferencia' OR to_account_id <> account_id)
      );
      CREATE INDEX idx_transactions_date ON transactions(date);
      CREATE INDEX idx_transactions_account ON transactions(account_id);

      CREATE TABLE auth_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        password_hash TEXT NOT NULL
      );

      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
      );
    `);

    const insertCat = db.prepare(
      "INSERT INTO categories (name, kind, parent_id, color, icon) VALUES (?, ?, ?, ?, ?)",
    );
    for (const c of DEFAULT_CATEGORIES) {
      const { lastInsertRowid } = insertCat.run(c.name, c.kind, null, c.color, c.icon);
      for (const child of c.children ?? []) {
        insertCat.run(child, c.kind, lastInsertRowid, c.color, c.icon);
      }
    }
  },
  // Fatia 3: recorrências (regra virtual + exceções gravadas, ADR 0002) e compras parceladas.
  (db) => {
    db.exec(`
      CREATE TABLE recurrences (
        id INTEGER PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('receita', 'despesa')),
        description TEXT NOT NULL,
        amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
        account_id INTEGER NOT NULL REFERENCES accounts(id),
        category_id INTEGER REFERENCES categories(id),
        frequency TEXT NOT NULL CHECK (frequency IN ('semanal', 'quinzenal', 'mensal', 'anual')),
        start_date TEXT NOT NULL,
        anchor_day INTEGER NOT NULL CHECK (anchor_day BETWEEN 1 AND 31),
        end_date TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE recurrence_skips (
        recurrence_id INTEGER NOT NULL REFERENCES recurrences(id) ON DELETE CASCADE,
        occurrence_date TEXT NOT NULL,
        PRIMARY KEY (recurrence_id, occurrence_date)
      );

      CREATE TABLE installment_purchases (
        id INTEGER PRIMARY KEY,
        description TEXT NOT NULL,
        total_installments INTEGER NOT NULL CHECK (total_installments >= 2),
        account_id INTEGER NOT NULL REFERENCES accounts(id),
        category_id INTEGER REFERENCES categories(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      ALTER TABLE transactions ADD COLUMN recurrence_id INTEGER REFERENCES recurrences(id);
      ALTER TABLE transactions ADD COLUMN occurrence_date TEXT;
      ALTER TABLE transactions ADD COLUMN purchase_id INTEGER REFERENCES installment_purchases(id);
      ALTER TABLE transactions ADD COLUMN installment_no INTEGER;

      CREATE UNIQUE INDEX idx_transactions_occurrence
        ON transactions(recurrence_id, occurrence_date) WHERE recurrence_id IS NOT NULL;
      CREATE INDEX idx_transactions_purchase ON transactions(purchase_id) WHERE purchase_id IS NOT NULL;
    `);
  },
  // Fatia 4: contas de cartão (dia de fechamento, de vencimento e conta que paga a fatura).
  (db) => {
    db.exec(`
      ALTER TABLE accounts ADD COLUMN closing_day INTEGER CHECK (closing_day IS NULL OR closing_day BETWEEN 1 AND 31);
      ALTER TABLE accounts ADD COLUMN due_day INTEGER CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 31);
      ALTER TABLE accounts ADD COLUMN pay_account_id INTEGER REFERENCES accounts(id);
    `);
  },
  // Fatia 5: recorrência variável (luz, gás) com previsão de valor. `series_id` agrupa as regras
  // que nasceram de divisões ("editar a partir de"), para o histórico seguir a conta.
  (db) => {
    db.exec(`
      ALTER TABLE recurrences ADD COLUMN is_variable INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE recurrences ADD COLUMN series_id INTEGER;
      UPDATE recurrences SET series_id = id;

      CREATE TABLE recurrence_history_seed (
        series_id INTEGER NOT NULL,
        month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
        amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
        PRIMARY KEY (series_id, month)
      );
    `);
  },
  // Fatia 6: Orçamento mensal por Categoria. O limite vale a partir do mês gravado até a próxima linha
  // (0 = sem limite daqui em diante); a regra de herança fica em src/lib/budget.ts.
  (db) => {
    db.exec(`
      CREATE TABLE budgets (
        id INTEGER PRIMARY KEY,
        category_id INTEGER NOT NULL REFERENCES categories(id),
        month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
        amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
        UNIQUE (category_id, month)
      );
    `);
  },
  // Conta favorita: sobe para o topo dos seletores de conta.
  (db) => {
    db.exec(`ALTER TABLE accounts ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0;`);
  },
  // Benefício: Categorias que a Conta aceita (vazio = sem restrição).
  (db) => {
    db.exec(`
      CREATE TABLE account_categories (
        account_id INTEGER NOT NULL REFERENCES accounts(id),
        category_id INTEGER NOT NULL REFERENCES categories(id),
        PRIMARY KEY (account_id, category_id)
      );
    `);
  },
];

export function migrate(db: Database.Database): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      MIGRATIONS[v](db);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}
