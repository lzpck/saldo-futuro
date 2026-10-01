import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { migrate } from "./migrations";

export type Db = Database.Database;

export function openDb(file: string): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

const globalForDb = globalThis as unknown as { __saldoDb?: Db };

/** Conexão única do processo. O arquivo fica em ./data (ignorado pelo git) ou em DATABASE_PATH. */
export function getDb(): Db {
  if (!globalForDb.__saldoDb) {
    const file = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "saldo.db");
    globalForDb.__saldoDb = openDb(file);
  }
  return globalForDb.__saldoDb;
}
