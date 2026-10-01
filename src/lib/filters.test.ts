import { describe, expect, it } from "vitest";
import {
  filterTransactions,
  isSearchMode,
  paginate,
  parseFilters,
  summarize,
  type FilterableTx,
} from "./filters";

const TODAY = "2026-10-15";
let nextId = 1;
const tx = (o: Partial<FilterableTx> & Pick<FilterableTx, "date" | "amountCents">): FilterableTx => ({
  id: nextId++,
  kind: "despesa",
  status: "efetivado",
  description: "x",
  accountId: 1,
  toAccountId: null,
  categoryId: null,
  isVirtual: false,
  ...o,
});
const cats = [
  { id: 10, parentId: null },
  { id: 11, parentId: 10 },
  { id: 12, parentId: 10 },
  { id: 20, parentId: null },
];
const run = (txs: FilterableTx[], q: Record<string, string | string[]>) =>
  filterTransactions(txs, parseFilters(q), cats, TODAY).map((t) => t.id);

describe("parseFilters", () => {
  it("usa o padrão sem parâmetros", () => {
    const f = parseFilters({});
    expect(f).toMatchObject({ text: "", kind: null, status: null, includePlanned: true, page: 1, month: null });
    expect(isSearchMode(f)).toBe(false);
  });

  it("ignora lixo sem erro", () => {
    const f = parseFilters({
      tipo: "foo", situacao: "bar", min: "abc", max: "", de: "2026-13-40", ate: "x",
      conta: "-3", categoria: "abc", pagina: "0", mes: "2026-99", previstos: "talvez",
    });
    expect(f).toMatchObject({
      text: "", kind: null, status: null, minCents: null, maxCents: null, from: null, to: null,
      accountId: null, categoryId: null, page: 1, month: null, includePlanned: true,
    });
  });

  it("lê valores com vírgula e milhar", () => {
    const f = parseFilters({ min: "1.234,50", max: "2.000" });
    expect(f.minCents).toBe(123_450);
    expect(f.maxCents).toBe(200_000);
  });

  it("corrige período invertido e avisa", () => {
    const f = parseFilters({ de: "2026-10-20", ate: "2026-10-01" });
    expect(f).toMatchObject({ from: "2026-10-01", to: "2026-10-20", periodSwapped: true });
  });

  it("corrige faixa de valor invertida", () => {
    const f = parseFilters({ min: "50", max: "10" });
    expect([f.minCents, f.maxCents]).toEqual([1000, 5000]);
  });

  it("previstos=0 desliga; modo busca com texto, período ou valor", () => {
    expect(parseFilters({ previstos: "0" }).includePlanned).toBe(false);
    expect(isSearchMode(parseFilters({ q: "café" }))).toBe(true);
    expect(isSearchMode(parseFilters({ de: "2026-10-01" }))).toBe(true);
    expect(isSearchMode(parseFilters({ min: "1" }))).toBe(true);
    expect(isSearchMode(parseFilters({ tipo: "despesa", conta: "1" }))).toBe(false);
  });

  it("aceita parâmetro repetido pegando o primeiro", () => {
    expect(parseFilters({ q: ["a", "b"] }).text).toBe("a");
  });
});

describe("filterTransactions", () => {
  it("texto ignora caixa e acento", () => {
    const a = tx({ date: "2026-10-01", amountCents: 100, description: "Café da manhã" });
    const b = tx({ date: "2026-10-01", amountCents: 100, description: "CAFÉ" });
    const c = tx({ date: "2026-10-01", amountCents: 100, description: "Luz" });
    expect(new Set(run([a, b, c], { q: "cafe" }))).toEqual(new Set([a.id, b.id]));
    expect(new Set(run([a, b, c], { q: "CAFÉ" }))).toEqual(new Set([a.id, b.id]));
  });

  it("faixa de valor", () => {
    const a = tx({ date: "2026-10-01", amountCents: 500 });
    const b = tx({ date: "2026-10-01", amountCents: 1500 });
    const c = tx({ date: "2026-10-01", amountCents: 2500 });
    expect(run([a, b, c], { min: "10,00", max: "20" })).toEqual([b.id]);
    expect(new Set(run([a, b, c], { min: "15" }))).toEqual(new Set([b.id, c.id]));
  });

  it("tipo", () => {
    const r = tx({ date: "2026-10-01", amountCents: 1, kind: "receita" });
    const d = tx({ date: "2026-10-01", amountCents: 1 });
    expect(run([r, d], { tipo: "receita" })).toEqual([r.id]);
  });

  it("situação: previsto, efetivado e em atraso", () => {
    const done = tx({ date: "2026-10-01", amountCents: 1 });
    const late = tx({ date: "2026-10-10", amountCents: 1, status: "previsto" });
    const future = tx({ date: "2026-10-20", amountCents: 1, status: "previsto" });
    expect(run([done, late, future], { situacao: "efetivado" })).toEqual([done.id]);
    expect(new Set(run([done, late, future], { situacao: "previsto" }))).toEqual(new Set([late.id, future.id]));
    expect(run([done, late, future], { situacao: "atrasado" })).toEqual([late.id]);
  });

  it("categoria pai inclui as filhas; filha não inclui a mãe", () => {
    const pai = tx({ date: "2026-10-01", amountCents: 1, categoryId: 10 });
    const f1 = tx({ date: "2026-10-01", amountCents: 1, categoryId: 11 });
    const outra = tx({ date: "2026-10-01", amountCents: 1, categoryId: 20 });
    const sem = tx({ date: "2026-10-01", amountCents: 1 });
    expect(new Set(run([pai, f1, outra, sem], { categoria: "10" }))).toEqual(new Set([pai.id, f1.id]));
    expect(run([pai, f1, outra, sem], { categoria: "11" })).toEqual([f1.id]);
  });

  it("conta casa por origem ou destino", () => {
    const t = tx({ date: "2026-10-01", amountCents: 1, kind: "transferencia", accountId: 1, toAccountId: 2 });
    const o = tx({ date: "2026-10-01", amountCents: 1, accountId: 3 });
    expect(run([t, o], { conta: "2" })).toEqual([t.id]);
    expect(run([t, o], { conta: "1" })).toEqual([t.id]);
  });

  it("período livre é inclusivo", () => {
    const a = tx({ date: "2026-09-30", amountCents: 1 });
    const b = tx({ date: "2026-10-01", amountCents: 1 });
    const c = tx({ date: "2026-10-31", amountCents: 1 });
    const d = tx({ date: "2026-11-01", amountCents: 1 });
    expect(new Set(run([a, b, c, d], { de: "2026-10-01", ate: "2026-10-31" }))).toEqual(new Set([b.id, c.id]));
  });

  it("sem previstos: some virtual e futuro, mantém atrasado", () => {
    const done = tx({ date: "2026-10-01", amountCents: 1 });
    const late = tx({ date: "2026-10-10", amountCents: 1, status: "previsto" });
    const future = tx({ date: "2026-10-20", amountCents: 1, status: "previsto" });
    const virt = tx({ date: "2026-10-12", amountCents: 1, status: "previsto", isVirtual: true });
    expect(new Set(run([done, late, future, virt], { previstos: "0" }))).toEqual(new Set([done.id, late.id]));
  });

  it("combina filtros e ordena por data decrescente", () => {
    const a = tx({ date: "2026-10-01", amountCents: 1000, description: "Mercado", categoryId: 11 });
    const b = tx({ date: "2026-10-05", amountCents: 1000, description: "Mercado", categoryId: 12 });
    const c = tx({ date: "2026-10-06", amountCents: 9000, description: "Mercado", categoryId: 11 });
    expect(run([a, b, c], { q: "merc", categoria: "10", max: "20" })).toEqual([b.id, a.id]);
  });
});

describe("summarize e paginate", () => {
  it("totaliza receitas, despesas e líquido, ignorando transferências", () => {
    const s = summarize([
      tx({ date: "2026-10-01", amountCents: 1000, kind: "receita" }),
      tx({ date: "2026-10-01", amountCents: 300 }),
      tx({ date: "2026-10-01", amountCents: 5000, kind: "transferencia", toAccountId: 2 }),
    ]);
    expect(s).toEqual({ incomeCents: 1000, expenseCents: 300, netCents: 700, count: 3 });
  });

  it("pagina de 50 em 50 e limita a página ao intervalo", () => {
    const items = Array.from({ length: 120 }, (_, i) => i);
    expect(paginate(items, 1).items).toHaveLength(50);
    expect(paginate(items, 3)).toMatchObject({ page: 3, pages: 3, items: items.slice(100) });
    expect(paginate(items, 9).page).toBe(3);
    expect(paginate([], 1)).toMatchObject({ page: 1, pages: 1, items: [] });
  });
});
