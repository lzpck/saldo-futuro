import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../db/connection";
import { createAccount, getAccount, setAccountArchived, setAccountFavorite, updateAccount } from "./accounts";

let db: Db;
let corrente: number;
let cartao: number;

beforeEach(() => {
  db = openDb(":memory:");
  corrente = createAccount(db, { name: "Corrente", kind: "corrente", initialBalanceCents: 0 });
  cartao = createAccount(db, { name: "Visa", kind: "cartao", initialBalanceCents: 0, closingDay: 5, dueDay: 12, payAccountId: corrente });
});

describe("conta favorita", () => {
  it("nasce não favorita", () => {
    expect(getAccount(db, corrente)!.favorite).toBe(false);
  });

  it("conta e cartão podem ser favoritos ao mesmo tempo", () => {
    setAccountFavorite(db, corrente, true);
    setAccountFavorite(db, cartao, true);
    expect(getAccount(db, corrente)!.favorite).toBe(true);
    expect(getAccount(db, cartao)!.favorite).toBe(true);
  });

  it("desmarca", () => {
    setAccountFavorite(db, corrente, true);
    setAccountFavorite(db, corrente, false);
    expect(getAccount(db, corrente)!.favorite).toBe(false);
  });

  it("arquivar tira a marca e desarquivar não a devolve", () => {
    setAccountFavorite(db, corrente, true);
    setAccountArchived(db, corrente, true);
    expect(getAccount(db, corrente)!.favorite).toBe(false);
    setAccountArchived(db, corrente, false);
    expect(getAccount(db, corrente)!.favorite).toBe(false);
  });

  it("conta arquivada não pode ser marcada", () => {
    setAccountArchived(db, corrente, true);
    expect(() => setAccountFavorite(db, corrente, true)).toThrow();
  });

  it("createAccount e updateAccount gravam a marca", () => {
    const nova = createAccount(db, { name: "Nova", kind: "carteira", initialBalanceCents: 0, favorite: true });
    expect(getAccount(db, nova)!.favorite).toBe(true);
    updateAccount(db, nova, { name: "Nova", kind: "carteira", initialBalanceCents: 0, favorite: false });
    expect(getAccount(db, nova)!.favorite).toBe(false);
  });

  it("editar uma conta arquivada não a torna favorita", () => {
    setAccountArchived(db, corrente, true);
    updateAccount(db, corrente, { name: "Corrente", kind: "corrente", initialBalanceCents: 0, favorite: true });
    expect(getAccount(db, corrente)!.favorite).toBe(false);
  });
});
