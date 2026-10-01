import { describe, expect, it } from "vitest";
import { centsToInput, parseBRL, formatBRL } from "./money";

describe("parseBRL", () => {
  it.each([
    ["12", 1200],
    ["12,5", 1250],
    ["12,50", 1250],
    ["1.234,56", 123456],
    ["R$ 1.234,56", 123456],
    ["0,05", 5],
    ["-10,00", -1000],
  ])("converte %s em %i centavos", (input, expected) => {
    expect(parseBRL(input)).toBe(expected);
  });

  it.each(["", "abc", "12,345", "1.23", "1,2,3", "12.5"])(
    "rejeita %j",
    (input) => {
      expect(parseBRL(input)).toBeNull();
    },
  );
});

describe("formatBRL", () => {
  it("formata centavos como reais", () => {
    expect(formatBRL(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56");
    expect(formatBRL(5).replace(/\s/g, " ")).toBe("R$ 0,05");
  });
});

describe("centsToInput", () => {
  it("formata em campo de formulário e volta pelo parseBRL", () => {
    for (const c of [0, 5, 100, 123_456, -250, 99_999_999_999]) expect(parseBRL(centsToInput(c))).toBe(c);
    expect(centsToInput(1234)).toBe("12,34");
    expect(centsToInput(5)).toBe("0,05");
  });
});
