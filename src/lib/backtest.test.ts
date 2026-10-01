import { describe, expect, it } from "vitest";
import { backtestSeries, summarize } from "./backtest";

const pts = (...values: number[]) => values.map((amountCents, i) => ({ month: `2026-${String(i + 1).padStart(2, "0")}`, amountCents }));

describe("backtestSeries", () => {
  it("prevê cada mês só com os anteriores e ignora o primeiro (sem histórico)", () => {
    const r = backtestSeries(pts(10_000, 10_000, 20_000), 99_999);
    expect(r.map((x) => x.month)).toEqual(["2026-02", "2026-03"]);
    expect(r[0]).toMatchObject({ predictedCents: 10_000, actualCents: 10_000, ape: 0 });
    // março: previsto 10 000 (só jan e fev), real 20 000 → erro de 50% do real
    expect(r[1]).toMatchObject({ predictedCents: 10_000, actualCents: 20_000, ape: 0.5 });
  });

  it("série com um único mês não gera pontos", () => {
    expect(backtestSeries(pts(10_000), 1)).toEqual([]);
  });
});

describe("summarize", () => {
  it("MAPE é a média dos erros percentuais absolutos", () => {
    expect(summarize([{ ape: 0.1 }, { ape: 0.3 }])).toEqual({ points: 2, mape: 0.2 });
  });

  it("sem pontos, MAPE é nulo", () => {
    expect(summarize([])).toEqual({ points: 0, mape: null });
  });
});
