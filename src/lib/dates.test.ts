import { describe, expect, it } from "vitest";
import { daysBetween, formatDayHeader, isISODate, isYearMonth, monthBounds, monthLabel, shiftMonth } from "./dates";

describe("datas", () => {
  it("valida datas reais", () => {
    expect(isISODate("2026-02-28")).toBe(true);
    expect(isISODate("2028-02-29")).toBe(true);
    expect(isISODate("2026-02-29")).toBe(false);
    expect(isISODate("26-02-01")).toBe(false);
  });

  it("navega entre meses virando o ano", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-10", 0)).toBe("2026-10");
  });

  it("calcula limites do mês, inclusive fevereiro bissexto", () => {
    expect(monthBounds("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthBounds("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthBounds("2026-10").to).toBe("2026-10-31");
  });

  it("formata o cabeçalho do dia com a inicial maiúscula só no dia da semana", () => {
    expect(formatDayHeader("2026-10-01")).toBe("Qui, 01 de out");
  });

  it("conta dias entre datas, inclusive virando mês e ano", () => {
    expect(daysBetween("2026-10-10", "2026-10-15")).toBe(5);
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(daysBetween("2026-10-15", "2026-10-10")).toBe(-5);
    expect(daysBetween("2026-10-15", "2026-10-15")).toBe(0);
  });

  it("valida ano-mês e rotula em português", () => {
    expect(isYearMonth("2026-13")).toBe(false);
    expect(isYearMonth("2026-1")).toBe(false);
    expect(monthLabel("2026-10")).toBe("Outubro de 2026");
  });
});
