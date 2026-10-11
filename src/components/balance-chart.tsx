"use client";

import { useId, useState } from "react";
import { formatDateBR } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { chartGeometry, linePath, type ChartPoint } from "./chart-math";

const W = 1000;
const H = 220;
const PAD = { top: 34, right: 20, bottom: 40, left: 64 };

const PHASE_LABEL = { real: "Saldo real", hoje: "Hoje", futuro: "Projeção" } as const;
const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const short = (iso: string) => `${iso.slice(8)} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const dm = (iso: string) => formatDateBR(iso).slice(0, 5);
/** Valor curto para o eixo: "R$ 5k", "-R$ 1,5k". */
const axis = (cents: number) => {
  const r = Math.abs(cents) / 100;
  const body = r >= 1000 ? `${(r / 1000).toFixed(1).replace(".", ",").replace(",0", "")}k` : String(Math.round(r));
  return `${cents < 0 ? "-" : ""}R$ ${body}`;
};

function Tag({ x, y, text, fill, color }: { x: number; y: number; text: string; fill: string; color: string }) {
  const w = text.length * 5.8 + 16;
  const left = Math.min(Math.max(x - w / 2, PAD.left), W - PAD.right - w);
  return (
    <g>
      <rect x={left} y={y} width={w} height={18} rx={4} fill={fill} />
      <text x={left + w / 2} y={y + 12.5} fontSize={10} fontWeight={700} textAnchor="middle" fill={color}>
        {text}
      </text>
    </g>
  );
}

/**
 * Saldo de fim de dia ao longo do mês, no desenho do template: verde acima do zero, coral abaixo,
 * sólido até hoje e tracejado na projeção. Marca hoje, o dia de maior variação e o menor saldo.
 */
export function BalanceChart({ points }: { points: ChartPoint[] }) {
  const uid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return null;

  const g = chartGeometry(points, W, H, PAD);
  const values = points.map((p) => p.value);
  const todayIdx = points.findIndex((p) => p.phase === "hoje");
  const lowIdx = values.indexOf(Math.min(...values));
  const highIdx = values.indexOf(Math.max(...values));
  let jumpIdx = -1;
  for (let i = 1; i < values.length; i++) {
    if (jumpIdx === -1 || Math.abs(values[i] - values[i - 1]) > Math.abs(values[jumpIdx] - values[jumpIdx - 1])) jumpIdx = i;
  }
  const flat = values.every((v) => v === values[0]);
  const active = hover ?? todayIdx;
  const activePoint = active >= 0 ? points[active] : null;
  const baseY = g.zeroY ?? (g.min > 0 ? H - PAD.bottom : PAD.top);
  const bottomY = H - PAD.bottom;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < g.x.length; i++) if (Math.abs(g.x[i] - px) < Math.abs(g.x[best] - px)) best = i;
    setHover(best);
  }

  const solid = linePath(g.x, g.y, 0, g.solidEnd);
  const dashed = linePath(g.x, g.y, g.dashedStart, points.length - 1);
  const full = linePath(g.x, g.y, 0, points.length - 1);
  const area = `${full} L${g.x[points.length - 1].toFixed(1)},${baseY.toFixed(1)} L${g.x[0].toFixed(1)},${baseY.toFixed(1)} Z`;

  // Linhas de grade: maior saldo, zero (quando o saldo o cruza) e menor saldo.
  const gridValues = [...new Set([values[highIdx], values[lowIdx], ...(g.zeroY !== null ? [0] : [])])];
  const yOf = (v: number) => (v === 0 ? (g.zeroY ?? baseY) : g.y[values.indexOf(v)]);

  const labelIdx = [...new Set([0, jumpIdx > 0 && !flat ? jumpIdx : -1, todayIdx, !flat ? lowIdx : -1, points.length - 1])]
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);

  const line = (clip: string, color: string) => (
    <g clipPath={`url(#${uid}${clip})`}>
      {dashed && <path d={dashed} fill="none" stroke={color} strokeWidth={3} strokeDasharray="6 6" strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />}
      {solid && <path d={solid} fill="none" stroke={color} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />}
    </g>
  );

  return (
    <figure className="relative" aria-label="Gráfico do saldo de fim de dia no mês">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full touch-pan-y overflow-visible" preserveAspectRatio="none" role="img" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={`${uid}s`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#4edea3" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#4edea3" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${uid}d`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#ffb4ab" stopOpacity="0" />
            <stop offset="100%" stopColor="#ff7886" stopOpacity="0.35" />
          </linearGradient>
          <clipPath id={`${uid}a`}>
            <rect x={0} y={0} width={W} height={baseY} />
          </clipPath>
          <clipPath id={`${uid}b`}>
            <rect x={0} y={baseY} width={W} height={H - baseY + 20} />
          </clipPath>
        </defs>

        {gridValues.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={yOf(v)}
              y2={yOf(v)}
              stroke={v === 0 ? "#86948a" : "#273647"}
              strokeWidth={v === 0 ? 1.5 : 1}
              strokeDasharray={v === 0 ? undefined : "4 4"}
              opacity={v === 0 ? 0.65 : 1}
              vectorEffect="non-scaling-stroke"
            />
            <text x={PAD.left - 8} y={yOf(v) + 3} fontSize={10} fontWeight={v === 0 ? 600 : 400} textAnchor="end" fill={v < 0 ? "#ffb4ab" : v === 0 ? "#d4e4fa" : "#86948a"}>
              {v === 0 ? "R$ 0" : axis(v)}
            </text>
          </g>
        ))}

        {todayIdx >= 0 && (
          <line x1={g.x[todayIdx]} x2={g.x[todayIdx]} y1={PAD.top - 12} y2={bottomY + 6} stroke="#4edea3" strokeWidth={1.5} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        )}

        <path d={area} fill={`url(#${uid}s)`} clipPath={`url(#${uid}a)`} />
        <path d={area} fill={`url(#${uid}d)`} clipPath={`url(#${uid}b)`} />
        {line("a", "#4edea3")}
        {line("b", "#ff7886")}

        {!flat && jumpIdx > 0 && jumpIdx !== lowIdx && jumpIdx !== todayIdx && (
          <g>
            <circle cx={g.x[jumpIdx]} cy={g.y[jumpIdx]} r={5} fill="#6ffbbe" stroke="#051424" strokeWidth={2} />
            <Tag
              x={g.x[jumpIdx]}
              y={g.y[jumpIdx] - 26}
              text={`${dm(points[jumpIdx].date)} · ${values[jumpIdx] - values[jumpIdx - 1] > 0 ? "+" : ""}${formatBRL(values[jumpIdx] - values[jumpIdx - 1])}`}
              fill="#122131"
              color={values[jumpIdx] - values[jumpIdx - 1] > 0 ? "#4edea3" : "#ffb2b7"}
            />
          </g>
        )}
        {todayIdx >= 0 && (
          <g>
            <circle cx={g.x[todayIdx]} cy={g.y[todayIdx]} r={6} fill="#4edea3" stroke="#051424" strokeWidth={2.5} />
            <Tag x={g.x[todayIdx]} y={g.y[todayIdx] + 12} text={`Hoje: ${formatBRL(values[todayIdx])}`} fill="#00422b" color="#4edea3" />
          </g>
        )}
        {!flat && lowIdx !== todayIdx && (
          <g>
            <circle cx={g.x[lowIdx]} cy={g.y[lowIdx]} r={6} fill="#ff7886" stroke="#051424" strokeWidth={2.5} />
            <Tag x={g.x[lowIdx]} y={g.y[lowIdx] + 12} text={`${dm(points[lowIdx].date)} · Menor: ${formatBRL(values[lowIdx])}`} fill="#93000a" color="#ffdad6" />
          </g>
        )}

        {active >= 0 && hover !== null && (
          <g>
            <line x1={g.x[active]} x2={g.x[active]} y1={PAD.top - 12} y2={bottomY + 6} stroke="#86948a" strokeWidth={1} opacity={0.5} vectorEffect="non-scaling-stroke" />
            <circle cx={g.x[active]} cy={g.y[active]} r={5} fill="#d4e4fa" stroke="#051424" strokeWidth={2} />
          </g>
        )}
      </svg>

      <div className="flex items-center justify-between px-4 pt-1 font-label-sm text-label-sm text-on-surface-variant">
        {labelIdx.map((i) => {
          const isToday = i === todayIdx;
          const isLow = !flat && i === lowIdx && !isToday;
          const isJump = !flat && i === jumpIdx && i !== lowIdx && !isToday;
          return (
            <span
              key={i}
              className={
                isToday
                  ? "rounded bg-surface-container-high px-2 py-0.5 font-bold text-on-surface"
                  : isLow && values[i] < 0
                    ? "rounded bg-error-container/40 px-2 py-0.5 font-bold text-error"
                    : isJump
                      ? "font-semibold text-primary"
                      : ""
              }
            >
              {short(points[i].date)}
              {isToday ? " (Hoje)" : ""}
            </span>
          );
        })}
      </div>

      {activePoint && (
        <figcaption className="mt-2 flex items-baseline justify-between px-1 font-body-sm text-body-sm">
          <span className="text-on-surface-variant">
            {formatDateBR(activePoint.date)} · {PHASE_LABEL[activePoint.phase]}
          </span>
          <span className={`font-semibold ${activePoint.value < 0 ? "text-error" : "text-on-surface"}`}>{formatBRL(activePoint.value)}</span>
        </figcaption>
      )}
    </figure>
  );
}
