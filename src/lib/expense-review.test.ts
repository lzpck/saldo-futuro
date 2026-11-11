import { describe, expect, it } from "vitest";
import { groupExpenses, groupKey, normalizeDescription, summarize, type Level, type ReviewTx } from "./expense-review";

const tx = (description: string, amountCents: number, over: Partial<ReviewTx> = {}): ReviewTx => ({
  description,
  amountCents,
  date: "2026-10-10",
  purchaseId: null,
  recurrenceId: null,
  ...over,
});

describe("normalizeDescription", () => {
  it("ignora caixa, acento, pontuação e o 'n/m' de parcela", () => {
    expect(normalizeDescription("PIX  Mercado – 2/3")).toBe("pix mercado");
    expect(normalizeDescription("Açaí do Zé")).toBe("acai do ze");
    expect(normalizeDescription("Loja 10/12 ")).toBe("loja");
  });
});

describe("groupKey", () => {
  it("parcelamento e recorrência têm prioridade sobre a descrição", () => {
    expect(groupKey(tx("Notebook", 1, { purchaseId: 7, recurrenceId: 3 }))).toBe("compra:7");
    expect(groupKey(tx("Netflix", 1, { recurrenceId: 3 }))).toBe("recorrencia:3");
    expect(groupKey(tx("Padaria Pão", 1))).toBe("desc:padaria pao");
    expect(groupKey(tx("10/12", 1))).toBe("desc:sem descricao"); // nunca uma chave vazia
  });
});

describe("groupExpenses", () => {
  it("junta os repetidos, soma, conta e usa a descrição do mais recente", () => {
    const [g] = groupExpenses(
      [tx("padaria", 1_000, { date: "2026-08-10" }), tx("PADARIA", 2_000, { date: "2026-10-10" }), tx("Padaria", 500, { date: "2026-09-10" })],
      new Map(),
    );
    expect(g).toEqual({ key: "desc:padaria", label: "PADARIA", totalCents: 3_500, count: 3, level: null });
  });

  it("sem classificar primeiro; em cada bloco, o maior total antes", () => {
    const levels = new Map<string, Level>([["desc:b", "essencial"], ["desc:d", "dispensavel"]]);
    const groups = groupExpenses([tx("a", 100), tx("b", 900), tx("c", 300), tx("d", 50)], levels);
    expect(groups.map((g) => g.key)).toEqual(["desc:c", "desc:a", "desc:b", "desc:d"]);
  });
});

describe("summarize", () => {
  it("soma por nível e conta os classificados", () => {
    const levels = new Map<string, Level>([["desc:a", "dispensavel"], ["desc:b", "dispensavel"], ["desc:c", "reduzivel"]]);
    const s = summarize(groupExpenses([tx("a", 100), tx("b", 200), tx("c", 300), tx("d", 400)], levels));
    expect(s).toEqual({ byLevel: { dispensavel: 300, reduzivel: 300, essencial: 0 }, classified: 3, total: 4 });
  });
});
