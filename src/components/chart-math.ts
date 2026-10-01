export type ChartPoint = { date: string; value: number; phase: "real" | "hoje" | "futuro" };

export type ChartGeometry = {
  x: number[];
  y: number[];
  min: number;
  max: number;
  zeroY: number | null;
  /** índice do último ponto da parte sólida (real), e primeiro da tracejada (projetada). */
  solidEnd: number;
  dashedStart: number;
};

/** Converte pontos em coordenadas de um quadro `width × height` com margem `pad`. */
export function chartGeometry(
  points: ChartPoint[],
  width: number,
  height: number,
  pad: { top: number; right: number; bottom: number; left: number },
): ChartGeometry {
  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 100;
    max += 100;
  }
  const margin = (max - min) * 0.1;
  min -= margin;
  max += margin;

  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const n = points.length;
  const x = points.map((_, i) => pad.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW));
  const yOf = (v: number) => pad.top + (1 - (v - min) / (max - min)) * innerH;

  const todayIdx = points.findIndex((p) => p.phase === "hoje");
  const firstFuture = points.findIndex((p) => p.phase === "futuro");
  // Sólido vai até hoje (inclusive); tracejado começa em hoje para as duas partes se encostarem.
  let solidEnd: number;
  let dashedStart: number;
  if (todayIdx >= 0) {
    solidEnd = todayIdx;
    dashedStart = todayIdx;
  } else if (firstFuture === -1) {
    solidEnd = n - 1;
    dashedStart = n; // nada tracejado: mês inteiro no passado
  } else if (firstFuture === 0) {
    solidEnd = -1; // nada sólido: mês inteiro no futuro
    dashedStart = 0;
  } else {
    solidEnd = firstFuture - 1;
    dashedStart = firstFuture - 1;
  }

  return {
    x,
    y: values.map(yOf),
    min,
    max,
    zeroY: min < 0 && max > 0 ? yOf(0) : null,
    solidEnd,
    dashedStart,
  };
}

export function linePath(x: number[], y: number[], from: number, to: number): string {
  const parts: string[] = [];
  for (let i = Math.max(from, 0); i <= Math.min(to, x.length - 1); i++) {
    parts.push(`${parts.length === 0 ? "M" : "L"}${x[i].toFixed(1)},${y[i].toFixed(1)}`);
  }
  return parts.join(" ");
}
