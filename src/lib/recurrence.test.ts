import { describe, expect, it } from "vitest";
import {
  addMonthsClamped,
  clampedDate,
  occurrenceKey,
  occurrencesBetween,
  splitInstallments,
  virtualOccurrences,
  type RecurrenceRule,
} from "./recurrence";

const rule = (o: Partial<RecurrenceRule> & Pick<RecurrenceRule, "frequency" | "startDate">): RecurrenceRule => ({
  anchorDay: Number(o.startDate.slice(8, 10)),
  endDate: null,
  ...o,
});

describe("clampedDate / addMonthsClamped", () => {
  it("recua para o último dia em meses curtos", () => {
    expect(clampedDate(2026, 2, 31)).toBe("2026-02-28");
    expect(clampedDate(2028, 2, 31)).toBe("2028-02-29");
    expect(clampedDate(2026, 4, 31)).toBe("2026-04-30");
    expect(clampedDate(2026, 3, 31)).toBe("2026-03-31");
  });

  it("soma meses atravessando o ano e preservando o dia âncora", () => {
    expect(addMonthsClamped("2026-11-15", 3)).toBe("2027-02-15");
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2026-01-31", 2)).toBe("2026-03-31"); // não "arrasta" o recuo
    expect(addMonthsClamped("2026-12-10", 12)).toBe("2027-12-10");
    expect(addMonthsClamped("2026-02-28", 1, 31)).toBe("2026-03-31");
  });
});

describe("occurrencesBetween — mensal", () => {
  it("dia 31 cai no último dia dos meses curtos e volta ao 31", () => {
    const r = rule({ frequency: "mensal", startDate: "2026-01-31" });
    expect(occurrencesBetween(r, "2026-01-01", "2026-05-31")).toEqual([
      "2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31",
    ]);
  });

  it("fevereiro bissexto usa dia 29", () => {
    const r = rule({ frequency: "mensal", startDate: "2028-01-30" });
    expect(occurrencesBetween(r, "2028-02-01", "2028-02-29")).toEqual(["2028-02-29"]);
  });

  it("respeita início, fim (inclusive) e o recorte [from, to]", () => {
    const r = rule({ frequency: "mensal", startDate: "2026-03-10", endDate: "2026-06-10" });
    expect(occurrencesBetween(r, "2026-01-01", "2026-12-31")).toEqual(["2026-03-10", "2026-04-10", "2026-05-10", "2026-06-10"]);
    expect(occurrencesBetween(r, "2026-04-11", "2026-05-31")).toEqual(["2026-05-10"]);
    expect(occurrencesBetween(r, "2026-04-10", "2026-04-10")).toEqual(["2026-04-10"]);
  });

  it("nada antes do início nem depois do fim", () => {
    const r = rule({ frequency: "mensal", startDate: "2026-03-10", endDate: "2026-06-10" });
    expect(occurrencesBetween(r, "2026-01-01", "2026-03-09")).toEqual([]);
    expect(occurrencesBetween(r, "2026-06-11", "2026-12-31")).toEqual([]);
  });

  it("atravessa a virada de ano", () => {
    const r = rule({ frequency: "mensal", startDate: "2026-11-05" });
    expect(occurrencesBetween(r, "2026-11-01", "2027-02-28")).toEqual(["2026-11-05", "2026-12-05", "2027-01-05", "2027-02-05"]);
  });

  it("âncora explícita sobrevive a um início recuado (regra dividida em mês curto)", () => {
    const r = rule({ frequency: "mensal", startDate: "2026-02-28", anchorDay: 31 });
    expect(occurrencesBetween(r, "2026-02-01", "2026-04-30")).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
  });
});

describe("occurrencesBetween — anual, semanal, quinzenal", () => {
  it("anual de 29/fev cai em 28/fev nos anos comuns", () => {
    const r = rule({ frequency: "anual", startDate: "2028-02-29" });
    expect(occurrencesBetween(r, "2028-01-01", "2032-12-31")).toEqual(["2028-02-29", "2029-02-28", "2030-02-28", "2031-02-28", "2032-02-29"]);
  });

  it("semanal a cada 7 dias a partir do início", () => {
    const r = rule({ frequency: "semanal", startDate: "2026-10-01" });
    expect(occurrencesBetween(r, "2026-10-01", "2026-10-31")).toEqual(["2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22", "2026-10-29"]);
  });

  it("semanal mantém a fase quando o período começa muito depois do início", () => {
    const r = rule({ frequency: "semanal", startDate: "2020-01-02" });
    const got = occurrencesBetween(r, "2026-10-01", "2026-10-31");
    expect(got.length).toBeGreaterThanOrEqual(4);
    for (const d of got) {
      const days = Math.round((Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8)) - Date.UTC(2020, 0, 2)) / 86_400_000);
      expect(days % 7).toBe(0);
    }
  });

  it("quinzenal é a cada 14 dias, atravessando o mês", () => {
    const r = rule({ frequency: "quinzenal", startDate: "2026-10-20" });
    expect(occurrencesBetween(r, "2026-10-01", "2026-12-31")).toEqual(["2026-10-20", "2026-11-03", "2026-11-17", "2026-12-01", "2026-12-15", "2026-12-29"]);
  });

  it("não devolve data anterior a `from` quando o ciclo cai logo antes", () => {
    const r = rule({ frequency: "semanal", startDate: "2026-10-01" });
    expect(occurrencesBetween(r, "2026-10-09", "2026-10-20")).toEqual(["2026-10-15"]);
  });
});

describe("splitInstallments", () => {
  it("divide com a sobra de centavos nas primeiras parcelas", () => {
    expect(splitInstallments(10_000, 3)).toEqual([3_334, 3_333, 3_333]);
    expect(splitInstallments(10_001, 3)).toEqual([3_334, 3_334, 3_333]);
    expect(splitInstallments(9_000, 3)).toEqual([3_000, 3_000, 3_000]);
  });

  it("a soma das parcelas é sempre o total", () => {
    for (const [total, n] of [[99_999, 7], [1, 3], [123_457, 12], [0, 4]]) {
      expect(splitInstallments(total, n).reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it("rejeita número de parcelas inválido", () => {
    expect(() => splitInstallments(100, 0)).toThrow();
    expect(() => splitInstallments(100, 1.5)).toThrow();
  });
});

describe("virtualOccurrences", () => {
  const r1 = { id: 1, ...rule({ frequency: "mensal", startDate: "2026-10-05" }) };
  const r2 = { id: 2, ...rule({ frequency: "mensal", startDate: "2026-10-05", endDate: "2026-11-30" }) };

  it("gera as ocorrências de cada regra até `to`", () => {
    const got = virtualOccurrences([r1, r2], new Set(), "2026-12-31");
    expect(got.filter((g) => g.rule.id === 1).map((g) => g.occurrenceDate)).toEqual(["2026-10-05", "2026-11-05", "2026-12-05"]);
    expect(got.filter((g) => g.rule.id === 2).map((g) => g.occurrenceDate)).toEqual(["2026-10-05", "2026-11-05"]);
  });

  it("ocorrência já gravada ou pulada não volta a ser virtual", () => {
    const handled = new Set([occurrenceKey(1, "2026-11-05")]);
    const got = virtualOccurrences([r1], handled, "2026-12-31");
    expect(got.map((g) => g.occurrenceDate)).toEqual(["2026-10-05", "2026-12-05"]);
  });

  it("a chave é por regra: tratar a ocorrência da regra 1 não afeta a 2", () => {
    const handled = new Set([occurrenceKey(1, "2026-10-05")]);
    const got = virtualOccurrences([r1, r2], handled, "2026-10-31");
    expect(got.map((g) => `${g.rule.id}|${g.occurrenceDate}`)).toEqual(["2|2026-10-05"]);
  });
});
