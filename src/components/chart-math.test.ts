import { describe, expect, it } from "vitest";
import { chartGeometry, linePath, type ChartPoint } from "./chart-math";

const pad = { top: 10, right: 10, bottom: 10, left: 10 };
const pts = (phases: ChartPoint["phase"][], values?: number[]): ChartPoint[] =>
  phases.map((phase, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, value: values?.[i] ?? i * 100, phase }));

describe("chartGeometry", () => {
  it("espalha os pontos horizontalmente e inverte o eixo y", () => {
    const g = chartGeometry(pts(["real", "real", "real"], [0, 100, 200]), 120, 60, pad);
    expect(g.x[0]).toBe(10);
    expect(g.x[2]).toBe(110);
    expect(g.y[2]).toBeLessThan(g.y[0]); // maior valor fica mais acima
  });

  it("série constante não quebra a escala", () => {
    const g = chartGeometry(pts(["real", "real"], [500, 500]), 100, 50, pad);
    expect(Number.isFinite(g.y[0])).toBe(true);
    expect(g.y[0]).toBe(g.y[1]);
  });

  it("um único ponto fica no centro", () => {
    const g = chartGeometry(pts(["hoje"]), 100, 50, pad);
    expect(g.x[0]).toBe(50);
  });

  it("linha de zero só aparece quando a série cruza o zero", () => {
    expect(chartGeometry(pts(["real", "real"], [-100, 100]), 100, 50, pad).zeroY).not.toBeNull();
    expect(chartGeometry(pts(["real", "real"], [100, 200]), 100, 50, pad).zeroY).toBeNull();
  });

  it("sólido até hoje e tracejado a partir de hoje", () => {
    const g = chartGeometry(pts(["real", "real", "hoje", "futuro", "futuro"]), 100, 50, pad);
    expect(g.solidEnd).toBe(2);
    expect(g.dashedStart).toBe(2);
  });

  it("mês inteiro no passado não tem tracejado", () => {
    const g = chartGeometry(pts(["real", "real", "real"]), 100, 50, pad);
    expect(g.solidEnd).toBe(2);
    expect(g.dashedStart).toBe(3);
    expect(linePath(g.x, g.y, g.dashedStart, 2)).toBe("");
  });

  it("mês inteiro no futuro não tem sólido", () => {
    const g = chartGeometry(pts(["futuro", "futuro"]), 100, 50, pad);
    expect(g.solidEnd).toBe(-1);
    expect(g.dashedStart).toBe(0);
    expect(linePath(g.x, g.y, 0, g.solidEnd)).toBe("");
  });
});

describe("linePath", () => {
  it("gera comandos M/L no intervalo pedido", () => {
    expect(linePath([0, 10, 20], [5, 6, 7], 1, 2)).toBe("M10.0,6.0 L20.0,7.0");
  });
});
