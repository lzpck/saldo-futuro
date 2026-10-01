import { describe, expect, it } from "vitest";
import { predictAmount, type HistoryPoint } from "./prediction";

const h = (month: string, amountCents: number): HistoryPoint => ({ month, amountCents });

describe("predictAmount: sem histórico ou com pouco", () => {
  it("sem histórico usa a estimativa inicial", () => {
    const r = predictAmount([], "2026-10", 15_000);
    expect(r).toMatchObject({ amountCents: 15_000, method: "inicial", monthsUsed: 0, seasonal: false });
    expect(r.explanation).toMatch(/inicial/i);
  });

  it("um só ponto: usa esse valor", () => {
    const r = predictAmount([h("2026-09", 18_000)], "2026-10", 15_000);
    expect(r).toMatchObject({ amountCents: 18_000, method: "historico", monthsUsed: 1, seasonal: false });
    expect(r.explanation).toMatch(/1 mês/);
  });

  it("dois pontos: o mais recente pesa mais (pesos 1 e 2)", () => {
    const r = predictAmount([h("2026-08", 10_000), h("2026-09", 20_000)], "2026-10", 1);
    // (10000*1 + 20000*2) / 3
    expect(r.amountCents).toBe(16_667);
    expect(r.monthsUsed).toBe(2);
    expect(r.explanation).toMatch(/2 meses/);
  });

  it("ignora a ordem em que o histórico chega", () => {
    const a = predictAmount([h("2026-09", 20_000), h("2026-08", 10_000)], "2026-10", 1);
    expect(a.amountCents).toBe(16_667);
  });
});

describe("predictAmount: janela e buracos", () => {
  it("usa só os 6 meses mais recentes", () => {
    const hist = [
      h("2026-01", 99_999), // fora da janela
      h("2026-02", 10_000),
      h("2026-03", 10_000),
      h("2026-04", 10_000),
      h("2026-05", 10_000),
      h("2026-06", 10_000),
      h("2026-07", 10_000),
    ];
    const r = predictAmount(hist, "2026-08", 1);
    expect(r.monthsUsed).toBe(6);
    expect(r.amountCents).toBe(10_000);
  });

  it("buracos nos meses não quebram: usa os meses que existem", () => {
    const r = predictAmount([h("2026-03", 10_000), h("2026-07", 20_000)], "2026-09", 1);
    expect(r.monthsUsed).toBe(2);
    expect(r.amountCents).toBe(16_667);
  });

  it("soma mais de um lançamento no mesmo mês", () => {
    const r = predictAmount([h("2026-09", 6_000), h("2026-09", 4_000)], "2026-10", 1);
    expect(r).toMatchObject({ amountCents: 10_000, monthsUsed: 1 });
  });

  it("virada de ano: dezembro vem antes de janeiro", () => {
    const r = predictAmount([h("2025-12", 10_000), h("2026-01", 20_000)], "2026-02", 1);
    expect(r.amountCents).toBe(16_667); // janeiro pesa 2
  });

  it("ignora dados do próprio mês-alvo e do futuro", () => {
    const hist = [h("2026-08", 10_000), h("2026-09", 10_000), h("2026-10", 90_000), h("2026-12", 90_000)];
    const r = predictAmount(hist, "2026-10", 1);
    expect(r.monthsUsed).toBe(2);
    expect(r.amountCents).toBe(10_000);
  });

  it("só dados do futuro equivale a sem histórico", () => {
    const r = predictAmount([h("2026-12", 90_000)], "2026-10", 7_000);
    expect(r).toMatchObject({ amountCents: 7_000, method: "inicial" });
  });
});

describe("predictAmount: outlier", () => {
  it("um valor muito acima da mediana entra limitado a 2,5× a mediana", () => {
    // mediana de [10000, 10000, 10000, 100000] = 10000 → teto 25000
    const hist = [h("2026-06", 10_000), h("2026-07", 10_000), h("2026-08", 10_000), h("2026-09", 100_000)];
    const r = predictAmount(hist, "2026-10", 1);
    // (10000*1 + 10000*2 + 10000*3 + 25000*4) / 10
    expect(r.amountCents).toBe(16_000);
  });

  it("valores normais não são alterados", () => {
    const hist = [h("2026-07", 10_000), h("2026-08", 12_000), h("2026-09", 14_000)];
    const r = predictAmount(hist, "2026-10", 1);
    // (10000 + 24000 + 42000) / 6
    expect(r.amountCents).toBe(12_667);
  });
});

describe("predictAmount: sazonalidade", () => {
  it("sem o mesmo mês do ano anterior, não é sazonal", () => {
    const r = predictAmount([h("2026-07", 10_000), h("2026-08", 10_000), h("2026-09", 10_000)], "2026-10", 1);
    expect(r.seasonal).toBe(false);
    expect(r.explanation).not.toMatch(/sazonal/i);
  });

  it("com o mesmo mês do ano anterior, mistura 50/50 com a média recente", () => {
    // ano passado: set/24 ... out/25. Recente estável em 10000; outubro passado foi 20000 (pico de verão).
    const hist = [
      h("2025-07", 10_000),
      h("2025-08", 10_000),
      h("2025-09", 10_000),
      h("2025-10", 20_000),
      h("2026-07", 10_000),
      h("2026-08", 10_000),
      h("2026-09", 10_000),
    ];
    const r = predictAmount(hist, "2026-10", 1);
    // média recente = 10000; tendência = 10000/10000 = 1; sazonal = 20000 * 1; mistura = 15000
    expect(r.amountCents).toBe(15_000);
    expect(r.seasonal).toBe(true);
    expect(r.explanation).toMatch(/sazonal/i);
    expect(r.explanation).toMatch(/3 meses/);
  });

  it("aplica o fator de tendência (recente ÷ mesmo recorte do ano anterior)", () => {
    const hist = [
      h("2025-08", 10_000),
      h("2025-09", 10_000),
      h("2025-10", 20_000),
      h("2026-08", 12_000),
      h("2026-09", 12_000),
    ];
    const r = predictAmount(hist, "2026-10", 1);
    // recente = 12000; recorte do ano anterior = 10000 → fator 1,2; sazonal = 20000*1,2 = 24000; mistura = 18000
    expect(r.amountCents).toBe(18_000);
  });

  it("limita o fator de tendência a [0,7; 1,4]", () => {
    const alto = predictAmount(
      [h("2025-09", 1_000), h("2025-10", 10_000), h("2026-09", 100_000)],
      "2026-10",
      1,
    );
    // fator bruto 100 → 1,4; sazonal = 14000; recente = 100000 limitado pelo outlier? só 1 ponto no recorte, sem outlier.
    // mistura = (100000 + 14000) / 2
    expect(alto.amountCents).toBe(57_000);

    const baixo = predictAmount(
      [h("2025-09", 100_000), h("2025-10", 10_000), h("2026-09", 1_000)],
      "2026-10",
      1,
    );
    // fator bruto 0,01 → 0,7; sazonal = 7000; mistura = (1000 + 7000) / 2
    expect(baixo.amountCents).toBe(4_000);
  });

  it("ano anterior sem recorte comparável: fator 1", () => {
    const hist = [h("2025-10", 20_000), h("2026-08", 10_000), h("2026-09", 10_000)];
    const r = predictAmount(hist, "2026-10", 1);
    // recorte do ano anterior (2025-08, 2025-09) não existe → fator 1; sazonal = 20000; mistura = 15000
    expect(r.amountCents).toBe(15_000);
    expect(r.seasonal).toBe(true);
  });

  it("virada de ano: alvo em janeiro olha janeiro do ano anterior", () => {
    const hist = [h("2025-01", 30_000), h("2025-11", 10_000), h("2025-12", 10_000)];
    const r = predictAmount(hist, "2026-01", 1);
    expect(r.seasonal).toBe(true);
    expect(r.amountCents).toBeGreaterThan(10_000);
  });
});

describe("predictAmount: invariantes", () => {
  it("o resultado é sempre inteiro e positivo", () => {
    const casos: [HistoryPoint[], number][] = [
      [[], 1],
      [[h("2026-09", 1)], 1],
      [[h("2026-08", 1), h("2026-09", 2)], 1],
      [[h("2026-07", 3), h("2026-08", 3), h("2026-09", 4)], 1],
      [[h("2025-10", 1), h("2026-09", 1)], 1],
    ];
    for (const [hist, fallback] of casos) {
      const r = predictAmount(hist, "2026-10", fallback);
      expect(Number.isInteger(r.amountCents)).toBe(true);
      expect(r.amountCents).toBeGreaterThanOrEqual(1);
    }
  });

  it("o mínimo é 1 centavo mesmo com fallback inválido", () => {
    expect(predictAmount([], "2026-10", 0).amountCents).toBe(1);
  });

  it("a explicação cita o valor estimado em reais", () => {
    const r = predictAmount([h("2026-08", 10_000), h("2026-09", 20_000)], "2026-10", 1);
    expect(r.explanation).toMatch(/R\$\s*166,67/);
  });
});
