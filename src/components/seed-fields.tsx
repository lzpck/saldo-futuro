"use client";

import { useState } from "react";
import { centsToInput } from "@/lib/money";
import { monthLabel } from "@/lib/dates";
import type { HistorySeedEntry } from "@/lib/repos/recurrences";
import { MoneyInput } from "@/components/money-input";

/** Linha de mês fixo: só o valor é digitado; o mês (seedMonthN) vai junto quando há valor. */
function FixedRow({ index, month }: { index: number; month: string }) {
  const [amount, setAmount] = useState("");
  return (
    <div className="grid grid-cols-2 items-center gap-3">
      <span className="text-sm text-on-surface-variant">{monthLabel(month)}</span>
      {amount !== "" && <input type="hidden" name={`seedMonth${index}`} value={month} />}
      <MoneyInput
        name={`seedAmount${index}`}
        placeholder="0,00"
        value={amount}
        onValueChange={setAmount}
        aria-label={`Valor de ${monthLabel(month)}`}
        className="input"
      />
    </div>
  );
}

/** Pares mês/valor do histórico inicial de uma Recorrência variável (campos seedMonthN/seedAmountN). */
export function SeedFields({
  slots,
  defaults = [],
  max,
  months,
}: {
  slots: number;
  defaults?: HistorySeedEntry[];
  /** Último mês aceitável (AAAA-MM): o histórico é de meses que já passaram. */
  max?: string;
  /** Meses já definidos (AAAA-MM): a pessoa só informa os valores, sem escolher o mês. */
  months?: string[];
}) {
  if (months) {
    return (
      <div className="space-y-2">
        {months.map((m, i) => (
          <FixedRow key={m} index={i} month={m} />
        ))}
      </div>
    );
  }
  const rows = Array.from({ length: Math.max(slots, defaults.length) }, (_, i) => defaults[i]);
  return (
    <div className="space-y-2">
      {rows.map((entry, i) => (
        <div key={i} className="grid grid-cols-2 gap-3">
          <input
            name={`seedMonth${i}`}
            type="month"
            max={max}
            // Firefox não tem <input type="month">: vira texto puro, então precisa de dica e formato.
            placeholder="AAAA-MM"
            pattern="\d{4}-(0[1-9]|1[0-2])"
            title="Mês no formato AAAA-MM, ex.: 2026-07"
            defaultValue={entry?.month ?? ""}
            aria-label={`Mês do histórico ${i + 1}`}
            className="input"
          />
          <MoneyInput
            name={`seedAmount${i}`}
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
