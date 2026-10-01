import type { BudgetLevel } from "@/lib/budget";
import { formatBRL } from "@/lib/money";
import type { BudgetItem } from "@/lib/repos/budgets";

// O nível vai em ícone + texto; a cor só reforça.
export const LEVEL: Record<BudgetLevel, { icon: string; label: string; text: string; bar: string }> = {
  ok: { icon: "✓", label: "Dentro do limite", text: "text-income", bar: "bg-income" },
  atencao: { icon: "⚠", label: "Atenção", text: "text-amber-400", bar: "bg-amber-400" },
  estourou: { icon: "⛔", label: "Estourou", text: "text-expense", bar: "bg-expense" },
};

const intPercent = (p: number) => `${Math.round(p)}%`;

/** Barra de progresso (efetivado + trecho claro de previstos) e o texto "R$ 420 de R$ 600 · restam R$ 180". */
export function BudgetBar({ item }: { item: BudgetItem }) {
  const { status, limitCents, spentCents, plannedCents } = item;
  if (!status || limitCents === null) return <p className="text-xs text-muted">Sem limite definido.</p>;

  const level = LEVEL[status.level];
  const projected = LEVEL[status.projectedLevel];
  const spentWidth = Math.min(status.percent, 100);
  const plannedWidth = Math.min(status.projectedPercent, 100) - spentWidth;

  return (
    <div className="space-y-1.5">
      <div
        role="progressbar"
        aria-label={`${item.category.name}: ${level.label}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(status.percent, 100))}
        className="flex h-2 overflow-hidden rounded-full bg-surface-2"
      >
        <div className={level.bar} style={{ width: `${spentWidth}%` }} />
        <div className={`${projected.bar} opacity-40`} style={{ width: `${plannedWidth}%` }} />
      </div>
      <p className="text-sm">
        {formatBRL(spentCents)} de {formatBRL(limitCents)} ·{" "}
        {status.remainingCents >= 0 ? `restam ${formatBRL(status.remainingCents)}` : `estourou em ${formatBRL(-status.remainingCents)}`}
      </p>
      <p className={`text-xs font-medium ${level.text}`}>
        <span aria-hidden>{level.icon} </span>
        {level.label} ({intPercent(status.percent)})
      </p>
      {plannedCents > 0 && (
        <p className={`text-xs ${status.projectedLevel === "ok" ? "text-muted" : projected.text}`}>
          <span aria-hidden>{status.projectedLevel === "ok" ? "" : `${projected.icon} `}</span>
          {formatBRL(plannedCents)} previstos até o fim do mês
          {status.projectedLevel === "ok" ? "" : ` · projeção: ${projected.label.toLowerCase()} (${intPercent(status.projectedPercent)})`}
        </p>
      )}
    </div>
  );
}
