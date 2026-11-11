import { describe, expect, it } from "vitest";
import { afterSaveUrl, safeReturnTo, withReturnTo } from "./return-to";

describe("safeReturnTo", () => {
  it("aceita caminhos internos com query", () => {
    expect(safeReturnTo("/cartoes/7?x=1")).toBe("/cartoes/7?x=1");
  });
  it.each([undefined, "", "https://evil.com", "//evil.com", "/\\evil.com", "cartoes", "/\t/evil.com", "/\n/evil.com"])(
    "rejeita %j",
    (v) => {
      expect(safeReturnTo(v)).toBe("/lancamentos");
    },
  );
  it("não volta para telas de formulário", () => {
    expect(safeReturnTo("/lancamentos/12")).toBe("/lancamentos");
    expect(safeReturnTo("/lancamentos/novo")).toBe("/lancamentos");
    expect(safeReturnTo("/agenda/ocorrencia/1/2026-01-01")).toBe("/lancamentos");
  });
  it("aceita a lista de lançamentos com filtros", () => {
    expect(safeReturnTo("/lancamentos?conta=3")).toBe("/lancamentos?conta=3");
  });
});

describe("withReturnTo", () => {
  it("anexa a origem codificada", () => {
    expect(withReturnTo("/lancamentos/novo", "/cartoes/7?a=1")).toBe("/lancamentos/novo?voltar=%2Fcartoes%2F7%3Fa%3D1");
    expect(withReturnTo("/lancamentos/novo?conta=7", "/cartoes/7")).toBe("/lancamentos/novo?conta=7&voltar=%2Fcartoes%2F7");
  });
});

describe("afterSaveUrl", () => {
  it("volta à origem", () => {
    expect(afterSaveUrl("/cartoes/7", "2026-10")).toBe("/cartoes/7");
    expect(afterSaveUrl("/lancamentos?conta=3", "2026-10")).toBe("/lancamentos?conta=3");
  });
  it("sem origem válida cai em Lançamentos no mês do lançamento", () => {
    expect(afterSaveUrl(null, "2026-11")).toBe("/lancamentos?mes=2026-11");
    expect(afterSaveUrl("//evil.com", "2026-11")).toBe("/lancamentos?mes=2026-11");
  });
});
