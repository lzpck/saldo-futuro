import { createHash, randomBytes } from "node:crypto";
import type { Db } from "../db/connection";
import { hashPassword, verifyPassword } from "./password";

/** Bloqueio por inatividade: a sessão expira se ficar este tempo sem nenhuma requisição. */
export const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
/** Mesmo com atividade contínua, a sessão não passa de 12 horas. */
export const MAX_SESSION_MS = 12 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function isPasswordSet(db: Db): boolean {
  return db.prepare("SELECT 1 FROM auth_settings WHERE id = 1").get() !== undefined;
}

export function setInitialPassword(db: Db, password: string): void {
  if (isPasswordSet(db)) throw new Error("A senha já foi definida.");
  db.prepare("INSERT INTO auth_settings (id, password_hash) VALUES (1, ?)").run(hashPassword(password));
}

export function checkPassword(db: Db, password: string): boolean {
  const row = db.prepare("SELECT password_hash FROM auth_settings WHERE id = 1").get() as
    | { password_hash: string }
    | undefined;
  return row ? verifyPassword(password, row.password_hash) : false;
}

/** Troca a senha e encerra todas as sessões abertas. */
export function changePassword(db: Db, password: string): void {
  db.transaction(() => {
    db.prepare("UPDATE auth_settings SET password_hash = ? WHERE id = 1").run(hashPassword(password));
    db.prepare("DELETE FROM sessions").run();
  })();
}

/** Cria uma sessão e devolve o token (guardado só como hash no banco). */
export function createSession(db: Db, now = Date.now()): string {
  const token = randomBytes(32).toString("base64url");
  db.prepare("DELETE FROM sessions WHERE last_seen_at < ? OR created_at < ?").run(
    now - IDLE_TIMEOUT_MS,
    now - MAX_SESSION_MS,
  );
  db.prepare("INSERT INTO sessions (token_hash, created_at, last_seen_at) VALUES (?, ?, ?)").run(
    hashToken(token),
    now,
    now,
  );
  return token;
}

/** Valida o token e renova o prazo de inatividade. Sessão vencida é apagada. */
export function validateSession(db: Db, token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const hash = hashToken(token);
  const row = db.prepare("SELECT created_at, last_seen_at FROM sessions WHERE token_hash = ?").get(hash) as
    | { created_at: number; last_seen_at: number }
    | undefined;
  if (!row) return false;
  if (now - row.last_seen_at > IDLE_TIMEOUT_MS || now - row.created_at > MAX_SESSION_MS) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash);
    return false;
  }
  db.prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?").run(now, hash);
  return true;
}

export function destroySession(db: Db, token: string | undefined): void {
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}
