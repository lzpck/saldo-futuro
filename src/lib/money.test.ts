import { describe, expect, it } from "vitest";
import {
  centsToInput,
  formatMoneyField,
  maskMoney,
  parseBRL,
  formatBRL,
  pasteMoney,
} from "./money";

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

describe("maskMoney (digitação em centavos)", () => {
  it.each([
    ["", ""],
    ["1", "0,01"],
    ["12", "0,12"],
    ["1234", "12,34"],
    ["123456", "1.234,56"],
    ["0", ""],
    ["0,0", ""],
    ["abc", ""],
    ["0,051", "0,51"],
    ["1.234,567", "12.345,67"],
  ])("%j vira %j", (raw, expected) => {
    expect(maskMoney(raw)).toBe(expected);
  });

  it("ignora dígitos além de 12", () => {
    expect(maskMoney("1.234.567.890,123")).toBe("1.234.567.890,12");
  });

  it("ignora o sinal quando não permite negativo", () => {
    expect(maskMoney("-1")).toBe("0,01");
  });

  it("alterna o sinal a cada '-' quando permite negativo", () => {
    const o = { allowNegative: true };
    expect(maskMoney("-", o)).toBe("-");
    expect(maskMoney("-1", o)).toBe("-0,01");
    expect(maskMoney("1,00-", o)).toBe("-1,00");
    expect(maskMoney("-1,00-", o)).toBe("1,00");
  });
});

describe("pasteMoney", () => {
  it.each([
    ["R$ 1.234,56", "1.234,56"],
    ["12,5", "12,50"],
    ["12", "12,00"],
    ["12.5", "1,25"],
    ["abc", ""],
  ])("cola %j como %j", (text, expected) => {
    expect(pasteMoney(text)).toBe(expected);
  });

  it("respeita allowNegative", () => {
    expect(pasteMoney("-10,00", { allowNegative: true })).toBe("-10,00");
    expect(pasteMoney("-10,00")).toBe("10,00");
  });
});

describe("formatMoneyField", () => {
  it("formata centavos com milhar", () => {
    expect(formatMoneyField(123_456)).toBe("1.234,56");
    expect(formatMoneyField(5)).toBe("0,05");
    expect(formatMoneyField(0)).toBe("0,00");
    expect(formatMoneyField(-250)).toBe("-2,50");
  });
});
