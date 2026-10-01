import { describe, expect, it } from "vitest";
import { budgetStatus, categorySpending, resolveLimit, type BudgetRow } from "./budget";
import type { ReportCategory, ReportTx } from "./reports";

const row = (categoryId: number, month: string, amountCents: number): BudgetRow => ({ categoryId, month, amountCents });

describe("resolveLimit", () => {
  const rows = [row(1, "2026-03", 60_000), row(1, "2026-06", 80_000), row(2, "2026-01", 10_000)];

  it("sem linha anterior não há limite", () => {
    expect(resolveLimit(rows, 1, "2026-02")).toBeNull();
    expect(resolveLimit(rows, 3, "2026-06")).toBeNull();
  });

  it("vale a linha mais recente até o mês pedido (carry-forward)", () => {
    expect(resolveLimit(rows, 1, "2026-03")).toBe(60_000);
    expect(resolveLimit(rows, 1, "2026-05")).toBe(60_000);
    expect(resolveLimit(rows, 1, "2026-06")).toBe(80_000);
    expect(resolveLimit(rows, 1, "2027-12")).toBe(80_000);
  });

  it("atravessa a virada de ano", () => {
    expect(resolveLimit([row(1, "2025-11", 50_000)], 1, "2026-02")).toBe(50_000);
  });

  it("limite 0 interrompe o carry-forward", () => {
    const withStop = [...rows, row(1, "2026-09", 0)];
    expect(resolveLimit(withStop, 1, "2026-08")).toBe(80_000);
    expect(resolveLimit(withStop, 1, "2026-09")).toBeNull();
    expect(resolveLimit(withStop, 1, "2027-01")).toBeNull();
  });

  it("um novo limite depois do 0 volta a valer", () => {
    const rows2 = [row(1, "2026-03", 60_000), row(1, "2026-04", 0), row(1, "2026-07", 70_000)];
    expect(resolveLimit(rows2, 1, "2026-05")).toBeNull();
    expect(resolveLimit(rows2, 1, "2026-08")).toBe(70_000);
  });
});

describe("budgetStatus", () => {
  const s = (spentCents: number, plannedCents: number, limitCents: number | null) =>
    budgetStatus({ spentCents, plannedCents, limitCents });

  it("sem limite ou com limite 0 não há status", () => {
    expect(s(100, 0, null)).toBeNull();
    expect(s(100, 0, 0)).toBeNull();
  });

  it("abaixo de 80% está ok e calcula percentual e sobra", () => {
    const r = s(42_000, 0, 60_000)!;
    expect(r.percent).toBeCloseTo(70);
    expect(r.remainingCents).toBe(18_000);
    expect(r.level).toBe("ok");
    expect(r.projectedLevel).toBe("ok");
  });

  it("exatamente 80% é atenção; um centavo antes é ok", () => {
    expect(s(79_999, 0, 100_000)!.level).toBe("ok");
    expect(s(80_000, 0, 100_000)!.level).toBe("atencao");
  });

  it("exatamente 100% é estourou; um centavo antes é atenção", () => {
    expect(s(99_999, 0, 100_000)!.level).toBe("atencao");
    expect(s(100_000, 0, 100_000)!.level).toBe("estourou");
  });

  it("gasto acima do limite: sobra negativa e percentual acima de 100", () => {
    const r = s(130_000, 0, 100_000)!;
    expect(r.level).toBe("estourou");
    expect(r.remainingCents).toBe(-30_000);
    expect(r.percent).toBeCloseTo(130);
  });

  it("só os previstos estouram: nível efetivo ok, projetado estourou", () => {
    const r = s(50_000, 60_000, 100_000)!;
    expect(r.level).toBe("ok");
    expect(r.projectedLevel).toBe("estourou");
    expect(r.projectedPercent).toBeCloseTo(110);
    expect(r.remainingCents).toBe(50_000); // a sobra considera só o efetivado
  });

  it("sem previstos (mês passado) a projeção é igual ao efetivado", () => {
    const r = s(85_000, 0, 100_000)!;
    expect(r.projectedLevel).toBe(r.level);
    expect(r.projectedPercent).toBe(r.percent);
  });
});

describe("categorySpending", () => {
  const cat = (id: number, parentId: number | null = null, kind: "despesa" | "receita" = "despesa"): ReportCategory => ({
    id,
    name: `C${id}`,
    kind,
    parentId,
    color: "#000",
    icon: "•",
  });
  const categories = [cat(1), cat(2), cat(3, 2), cat(4, 2), cat(5, null, "receita")];
  let n = 1;
  const tx = (o: Partial<ReportTx> & Pick<ReportTx, "date" | "amountCents">): ReportTx => ({
    id: n++,
    kind: "despesa",
    status: "efetivado",
    categoryId: 1,
    ...o,
  });

  it("separa efetivado de previsto e soma subcategorias no pai", () => {
    const txs = [
      tx({ date: "2026-10-05", amountCents: 100, categoryId: 3 }),
      tx({ date: "2026-10-06", amountCents: 50, categoryId: 2 }),
      tx({ date: "2026-10-20", amountCents: 30, categoryId: 4, status: "previsto" }),
      tx({ date: "2026-10-07", amountCents: 70, categoryId: 1 }),
    ];
    const m = categorySpending(txs, categories, "2026-10");
    expect(m.get(1)).toEqual({ spentCents: 70, plannedCents: 0 });
    expect(m.get(2)).toEqual({ spentCents: 150, plannedCents: 30 }); // pai = próprio + subcategorias
    expect(m.get(3)).toEqual({ spentCents: 100, plannedCents: 0 }); // a subcategoria é independente
    expect(m.get(4)).toEqual({ spentCents: 0, plannedCents: 30 });
  });

  it("ignora outros meses, receitas, transferências e sem categoria", () => {
    const txs = [
      tx({ date: "2026-09-30", amountCents: 999 }),
      tx({ date: "2026-11-01", amountCents: 999 }),
      tx({ date: "2026-10-10", amountCents: 999, kind: "receita", categoryId: 5 }),
      tx({ date: "2026-10-10", amountCents: 999, kind: "transferencia", categoryId: null }),
      tx({ date: "2026-10-10", amountCents: 999, categoryId: null }),
    ];
    expect(categorySpending(txs, categories, "2026-10").size).toBe(0);
  });
});
