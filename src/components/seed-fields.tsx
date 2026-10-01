import { centsToInput } from "@/lib/money";
import type { HistorySeedEntry } from "@/lib/repos/recurrences";

/** Pares mês/valor do histórico inicial de uma Recorrência variável (campos seedMonthN/seedAmountN). */
export function SeedFields({
  slots,
  defaults = [],
  max,
}: {
  slots: number;
  defaults?: HistorySeedEntry[];
  /** Último mês aceitável (AAAA-MM): o histórico é de meses que já passaram. */
  max?: string;
}) {
  const rows = Array.from({ length: Math.max(slots, defaults.length) }, (_, i) => defaults[i]);
  return (
    <div className="space-y-2">
      {rows.map((entry, i) => (
        <div key={i} className="grid grid-cols-2 gap-3">
          <input
            name={`seedMonth${i}`}
            type="month"
            max={max}
            defaultValue={entry?.month ?? ""}
            aria-label={`Mês do histórico ${i + 1}`}
            className="input"
          />
          <input
            name={`seedAmount${i}`}
            inputMode="decimal"
            placeholder="0,00"
            defaultValue={entry ? centsToInput(entry.amountCents) : ""}
            aria-label={`Valor do histórico ${i + 1}`}
            className="input"
          />
        </div>
      ))}
    </div>
  );
}
