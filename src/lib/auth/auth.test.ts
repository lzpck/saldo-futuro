import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../db/connection";
import { hashPassword, verifyPassword } from "./password";
import {
  IDLE_TIMEOUT_MS,
  MAX_SESSION_MS,
  changePassword,
  checkPassword,
  createSession,
  destroySession,
  isPasswordSet,
  setInitialPassword,
  validateSession,
} from "./sessions";

describe("senha", () => {
  it("verifica a senha correta e rejeita a errada", () => {
    const stored = hashPassword("segredo123");
    expect(verifyPassword("segredo123", stored)).toBe(true);
    expect(verifyPassword("segredo124", stored)).toBe(false);
  });

  it("não guarda a senha em texto e usa sal diferente a cada hash", () => {
    const a = hashPassword("segredo123");
    expect(a).not.toContain("segredo123");
    expect(a).not.toBe(hashPassword("segredo123"));
  });

  it("rejeita formato desconhecido", () => {
    expect(verifyPassword("x", "lixo")).toBe(false);
  });
});

describe("sessões", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb(":memory:");
    setInitialPassword(db, "segredo123");
  });

  it("a senha só pode ser definida uma vez", () => {
    expect(isPasswordSet(db)).toBe(true);
    expect(() => setInitialPassword(db, "outra-senha")).toThrow(/já foi definida/);
    expect(checkPassword(db, "segredo123")).toBe(true);
    expect(checkPassword(db, "outra-senha")).toBe(false);
  });

  it("aceita token válido e rejeita ausente ou desconhecido", () => {
    const token = createSession(db, 1_000);
    expect(validateSession(db, token, 2_000)).toBe(true);
    expect(validateSession(db, undefined, 2_000)).toBe(false);
    expect(validateSession(db, "inventado", 2_000)).toBe(false);
  });

  it("expira após o tempo de inatividade, mas atividade renova o prazo", () => {
    const token = createSession(db, 0);
    expect(validateSession(db, token, IDLE_TIMEOUT_MS - 1)).toBe(true);
    // renovada: ainda vale quase um período inteiro depois
    expect(validateSession(db, token, IDLE_TIMEOUT_MS * 2 - 2)).toBe(true);
    expect(validateSession(db, token, IDLE_TIMEOUT_MS * 4)).toBe(false);
    // depois de vencida, não volta a valer
    expect(validateSession(db, token, IDLE_TIMEOUT_MS * 4 + 1)).toBe(false);
  });

  it("expira no limite absoluto mesmo com atividade contínua", () => {
    const token = createSession(db, 0);
    for (let t = IDLE_TIMEOUT_MS - 1; t < MAX_SESSION_MS; t += IDLE_TIMEOUT_MS - 1) {
      expect(validateSession(db, token, t)).toBe(true);
    }
    expect(validateSession(db, token, MAX_SESSION_MS + 1)).toBe(false);
  });

  it("logout invalida o token", () => {
    const token = createSession(db, 0);
    destroySession(db, token);
    expect(validateSession(db, token, 1)).toBe(false);
  });

  it("trocar a senha derruba todas as sessões", () => {
    const token = createSession(db, 0);
    changePassword(db, "nova-senha-456");
    expect(validateSession(db, token, 1)).toBe(false);
    expect(checkPassword(db, "nova-senha-456")).toBe(true);
  });

  it("o token não fica salvo em texto no banco", () => {
    const token = createSession(db, 0);
    const rows = db.prepare("SELECT token_hash FROM sessions").all() as { token_hash: string }[];
    expect(rows.map((r) => r.token_hash)).not.toContain(token);
  });
});
