import { describe, expect, it } from "vitest";
import {
  monthlyTotalsByCategory,
  spendingByCategory,
  topWithOthers,
  variationPercent,
  type ReportCategory,
  type ReportTx,
} from "./reports";

const cat = (id: number, name: string, parentId: number | null = null, kind: "despesa" | "receita" = "despesa"): ReportCategory => ({
  id,
  name,
  kind,
  parentId,
  color: `#00000${id}`,
  icon: "•",
});
const categories = [
  cat(1, "Mercado"),
  cat(2, "Casa"),
  cat(3, "Luz", 2),
  cat(4, "Aluguel", 2),
  cat(5, "Salário", null, "receita"),
];

let nextId = 1;
const tx = (o: Partial<ReportTx> & Pick<ReportTx, "date" | "amountCents">): ReportTx => ({
  id: nextId++,
  kind: "despesa",
  status: "efetivado",
  categoryId: null,
  ...o,
});

const opts = { from: "2026-10-01", to: "2026-10-31", kind: "despesa" as const, includePlanned: false };
const sumOf = (xs: { totalCents: number }[]) => xs.reduce((s, x) => s + x.totalCents, 0);

describe("spendingByCategory", () => {
  it("soma por categoria e ordena por total decrescente", () => {
    const r = spendingByCategory(
      [
        tx({ date: "2026-10-02", amountCents: 1000, categoryId: 1 }),
        tx({ date: "2026-10-03", amountCents: 500, categoryId: 1 }),
        tx({ date: "2026-10-04", amountCents: 3000, categoryId: 2 }),
      ],
      categories,
      opts,
    );
    expect(r.map((s) => [s.name, s.totalCents])).toEqual([["Casa", 3000], ["Mercado", 1500]]);
    expect(r[1]).toMatchObject({ categoryId: 1, color: "#000001", icon: "•", children: [] });
  });

  it("subcategoria soma no pai e aparece em children; lançamento direto no pai vira 'Outros de <pai>'", () => {
    const r = spendingByCategory(
      [
        tx({ date: "2026-10-02", amountCents: 800, categoryId: 3 }),
        tx({ date: "2026-10-03", amountCents: 2000, categoryId: 4 }),
        tx({ date: "2026-10-04", amountCents: 100, categoryId: 2 }),
      ],
      categories,
      opts,
    );
    expect(r).toHaveLength(1);
    expect(r[0].totalCents).toBe(2900);
    expect(r[0].children.map((c) => [c.name, c.totalCents])).toEqual([
      ["Aluguel", 2000],
      ["Luz", 800],
      ["Outros de Casa", 100],
    ]);
    expect(sumOf(r[0].children)).toBe(r[0].totalCents);
  });

  it("sem categoria vai para 'Sem categoria'", () => {
    const r = spendingByCategory([tx({ date: "2026-10-02", amountCents: 700 })], categories, opts);
    expect(r).toMatchObject([{ categoryId: null, name: "Sem categoria", totalCents: 700 }]);
  });

  it("categoria desconhecida cai em 'Sem categoria'", () => {
    const r = spendingByCategory([tx({ date: "2026-10-02", amountCents: 700, categoryId: 99 })], categories, opts);
    expect(r[0].categoryId).toBeNull();
  });

  it("ignora transferências, o outro tipo e datas fora do período", () => {
    const r = spendingByCategory(
      [
        tx({ date: "2026-10-02", amountCents: 100, kind: "transferencia" }),
        tx({ date: "2026-10-02", amountCents: 200, kind: "receita", categoryId: 5 }),
        tx({ date: "2026-09-30", amountCents: 300, categoryId: 1 }),
        tx({ date: "2026-11-01", amountCents: 400, categoryId: 1 }),
        tx({ date: "2026-10-31", amountCents: 50, categoryId: 1 }),
      ],
      categories,
      opts,
    );
    expect(r.map((s) => s.totalCents)).toEqual([50]);
  });

  it("estorno no cartão (receita) aparece na aba de receitas e não abate a despesa", () => {
    const txs = [
      tx({ date: "2026-10-02", amountCents: 1000, categoryId: 1 }),
      tx({ date: "2026-10-03", amountCents: 400, kind: "receita", categoryId: 5 }),
    ];
    expect(spendingByCategory(txs, categories, opts)[0].totalCents).toBe(1000);
    expect(spendingByCategory(txs, categories, { ...opts, kind: "receita" })).toMatchObject([
      { name: "Salário", totalCents: 400 },
    ]);
  });

  it("previstos só entram com includePlanned", () => {
    const txs = [
      tx({ date: "2026-10-02", amountCents: 1000, categoryId: 1 }),
      tx({ date: "2026-10-20", amountCents: 500, categoryId: 1, status: "previsto" }),
    ];
    expect(spendingByCategory(txs, categories, opts)[0].totalCents).toBe(1000);
    expect(spendingByCategory(txs, categories, { ...opts, includePlanned: true })[0].totalCents).toBe(1500);
  });

  it("mês sem dados devolve lista vazia", () => {
    expect(spendingByCategory([], categories, opts)).toEqual([]);
  });

  it("a soma das fatias fecha com o total dos lançamentos (propriedade)", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let round = 0; round < 50; round++) {
      const txs = Array.from({ length: 30 }, () =>
        tx({
          date: `2026-10-${String(1 + Math.floor(rnd() * 31)).padStart(2, "0")}`,
          amountCents: 1 + Math.floor(rnd() * 100_000),
          categoryId: [null, 1, 2, 3, 4][Math.floor(rnd() * 5)],
          status: rnd() < 0.3 ? "previsto" : "efetivado",
        }),
      );
      const r = spendingByCategory(txs, categories, { ...opts, includePlanned: true });
      expect(sumOf(r)).toBe(txs.reduce((s, t) => s + t.amountCents, 0));
      for (const s of r) if (s.children.length) expect(sumOf(s.children)).toBe(s.totalCents);
    }
  });
});

describe("monthlyTotalsByCategory", () => {
  it("devolve um item por mês pedido, inclusive meses vazios", () => {
    const r = monthlyTotalsByCategory(
      [
        tx({ date: "2026-09-10", amountCents: 100, categoryId: 1 }),
        tx({ date: "2026-10-10", amountCents: 300, categoryId: 1 }),
        tx({ date: "2026-10-11", amountCents: 50, categoryId: 2 }),
      ],
      categories,
      ["2026-08", "2026-09", "2026-10"],
      { kind: "despesa", includePlanned: false },
    );
    expect(r.map((m) => [m.month, m.totalCents])).toEqual([["2026-08", 0], ["2026-09", 100], ["2026-10", 350]]);
    expect(r[2].slices.map((s) => s.name)).toEqual(["Mercado", "Casa"]);
  });
});

describe("topWithOthers", () => {
  const slice = (name: string, totalCents: number) => ({
    categoryId: null,
    name,
    color: "#000",
    icon: "•",
    totalCents,
    children: [],
  });
  it("mantém tudo quando cabe", () => {
    expect(topWithOthers([slice("a", 3), slice("b", 2)], 7)).toHaveLength(2);
  });
  it("agrupa o excedente em 'Outras', preservando o total", () => {
    const all = Array.from({ length: 10 }, (_, i) => slice(`c${i}`, 100 - i));
    const r = topWithOthers(all, 7);
    expect(r).toHaveLength(8);
    expect(r[7]).toMatchObject({ name: "Outras", totalCents: 93 + 92 + 91 });
    expect(sumOf(r)).toBe(sumOf(all));
  });
});

describe("variationPercent", () => {
  it("calcula a variação sobre o mês anterior", () => {
    expect(variationPercent(150, 100)).toBe(50);
    expect(variationPercent(50, 100)).toBe(-50);
  });
  it("sem base de comparação devolve null", () => {
    expect(variationPercent(100, 0)).toBeNull();
  });
});
