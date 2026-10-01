"use client";

import { useState } from "react";
import { formatDateBR } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { chartGeometry, linePath, type ChartPoint } from "./chart-math";

const W = 640;
const H = 200;
const PAD = { top: 14, right: 12, bottom: 26, left: 12 };

const PHASE_LABEL = { real: "Saldo real", hoje: "Hoje", futuro: "Projeção" } as const;

/**
 * Saldo de fim de dia ao longo do mês: sólido = real, tracejado = projetado.
 * A lista de dias logo abaixo é a versão em tabela do mesmo dado.
 */
export function BalanceChart({ points }: { points: ChartPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return null;

  const g = chartGeometry(points, W, H, PAD);
  const todayIdx = points.findIndex((p) => p.phase === "hoje");
  const active = hover ?? todayIdx;
  const activePoint = active >= 0 ? points[active] : null;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < g.x.length; i++) if (Math.abs(g.x[i] - px) < Math.abs(g.x[best] - px)) best = i;
    setHover(best);
  }

  const solid = linePath(g.x, g.y, 0, g.solidEnd);
  const dashed = linePath(g.x, g.y, g.dashedStart, points.length - 1);

  return (
    <figure className="relative" aria-label="Gráfico do saldo de fim de dia no mês">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-pan-y"
        role="img"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {/* grade discreta: topo, base e a linha do zero quando o saldo cruza */}
        {[PAD.top, H - PAD.bottom].map((y) => (
          <line key={y} x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="var(--color-line)" strokeWidth={1} />
        ))}
        {g.zeroY !== null && (
          <line x1={PAD.left} x2={W - PAD.right} y1={g.zeroY} y2={g.zeroY} stroke="var(--color-expense)" strokeWidth={1} strokeDasharray="2 4" opacity={0.6} />
        )}

        {solid && <path d={solid} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {dashed && (
          <path d={dashed} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeDasharray="5 5" strokeLinejoin="round" strokeLinecap="round" opacity={0.75} />
        )}

        {todayIdx >= 0 && (
          <circle cx={g.x[todayIdx]} cy={g.y[todayIdx]} r={4.5} fill="var(--color-accent)" stroke="var(--color-surface)" strokeWidth={2} />
        )}

        {active >= 0 && hover !== null && (
          <g>
            <line x1={g.x[active]} x2={g.x[active]} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--color-muted)" strokeWidth={1} opacity={0.5} />
            <circle cx={g.x[active]} cy={g.y[active]} r={4.5} fill="var(--color-fg)" stroke="var(--color-surface)" strokeWidth={2} />
          </g>
        )}

        <text x={PAD.left} y={H - 8} fontSize={11} fill="var(--color-muted)">
          {formatDateBR(points[0].date).slice(0, 5)}
        </text>
        <text x={W - PAD.right} y={H - 8} fontSize={11} fill="var(--color-muted)" textAnchor="end">
          {formatDateBR(points[points.length - 1].date).slice(0, 5)}
        </text>
      </svg>

      {activePoint && (
        <figcaption className="mt-1 flex items-baseline justify-between text-sm">
          <span className="text-muted">
            {formatDateBR(activePoint.date)} · {PHASE_LABEL[activePoint.phase]}
          </span>
          <span className={`font-medium ${activePoint.value < 0 ? "text-expense" : ""}`}>{formatBRL(activePoint.value)}</span>
        </figcaption>
      )}
    </figure>
  );
}
