import { describe, expect, it } from "vitest";
import type { Account } from "./repos/accounts";
import { defaultAccountId, favoritesFirst, groupAccountOptions } from "./account-options";

let n = 0;
const acc = (name: string, over: Partial<Account> = {}): Account => ({
  id: ++n, name, kind: "corrente", initialBalanceCents: 0, archived: false, favorite: false,
  closingDay: null, dueDay: null, payAccountId: null, ...over,
});
const card = (name: string, over: Partial<Account> = {}) =>
  acc(name, { kind: "cartao", closingDay: 5, dueDay: 12, payAccountId: 1, ...over });
const names = (list: Account[]) => list.map((a) => a.name);

describe("groupAccountOptions", () => {
  it("separa Contas, Cartões e Arquivadas, nessa ordem", () => {
    const groups = groupAccountOptions([
      acc("Velha", { archived: true }), card("Visa"), acc("Corrente"),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Contas", "Cartões", "Arquivadas"]);
    expect(groups.map((g) => names(g.accounts))).toEqual([["Corrente"], ["Visa"], ["Velha"]]);
  });

  it("omite grupos vazios", () => {
    expect(groupAccountOptions([acc("Corrente")]).map((g) => g.label)).toEqual(["Contas"]);
  });

  it("favoritas primeiro em cada grupo, resto em ordem alfabética", () => {
    const groups = groupAccountOptions([
      acc("Alfa"), acc("Zeta", { favorite: true }), acc("Beta"),
      card("Master"), card("Nubank", { favorite: true }),
    ]);
    expect(names(groups[0].accounts)).toEqual(["Zeta", "Alfa", "Beta"]);
    expect(names(groups[1].accounts)).toEqual(["Nubank", "Master"]);
  });

  it("arquivada fica no grupo Arquivadas mesmo sendo cartão", () => {
    const groups = groupAccountOptions([card("Antigo", { archived: true })]);
    expect(groups.map((g) => g.label)).toEqual(["Arquivadas"]);
  });
});

describe("favoritesFirst", () => {
  it("lista única com favoritas no topo", () => {
    expect(names(favoritesFirst([acc("B"), acc("C", { favorite: true }), acc("A")]))).toEqual(["C", "A", "B"]);
  });
});

describe("defaultAccountId", () => {
  it("é a primeira favorita na ordem exibida (Contas antes de Cartões)", () => {
    const visa = card("Visa", { favorite: true });
    const carteira = acc("Carteira", { favorite: true });
    expect(defaultAccountId([acc("Corrente"), visa, carteira])).toBe(carteira.id);
  });

  it("só cartão favorito: usa o cartão", () => {
    const visa = card("Visa", { favorite: true });
    expect(defaultAccountId([acc("Corrente"), visa])).toBe(visa.id);
  });

  it("sem favoritas, cai na primeira conta que não é cartão", () => {
    const corrente = acc("Corrente");
    expect(defaultAccountId([card("Amex"), acc("Zeta"), corrente])).toBe(corrente.id);
  });

  it("ignora arquivadas e devolve undefined sem opções", () => {
    expect(defaultAccountId([acc("Velha", { archived: true })])).toBeUndefined();
    expect(defaultAccountId([])).toBeUndefined();
  });

  it("sem conta comum nem favorita, usa o primeiro cartão", () => {
    const amex = card("Amex");
    expect(defaultAccountId([amex])).toBe(amex.id);
  });
});
