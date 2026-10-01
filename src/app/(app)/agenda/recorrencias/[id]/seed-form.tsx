"use client";

import { useActionState } from "react";
import { saveHistorySeed } from "@/app/actions/schedule";
import { SeedFields } from "@/components/seed-fields";
import type { HistorySeedEntry } from "@/lib/repos/recurrences";

export function HistorySeedForm({
  recurrenceId,
  seed,
  maxMonth,
}: {
  recurrenceId: number;
  seed: HistorySeedEntry[];
  /** Último mês aceitável (AAAA-MM). */
  maxMonth: string;
}) {
  const [state, action, pending] = useActionState(saveHistorySeed, undefined);
  return (
    <form action={action} className="card space-y-3">
      <input type="hidden" name="recurrenceId" value={recurrenceId} />
      <div>
        <h2 className="text-sm font-medium text-muted">Valores informados à mão</h2>
        <p className="mt-1 text-xs text-muted">
          Meses anteriores usados só na previsão. Não são lançamentos e não mudam o saldo; quando o mês tem um
          lançamento efetivado, vale o efetivado.
        </p>
      </div>
      <SeedFields slots={6} defaults={seed} max={maxMonth} />
      {state?.error && <p className="error">{state.error}</p>}
      {state && !state.error && <p className="text-xs text-income">Histórico salvo.</p>}
      <button type="submit" disabled={pending} className="btn w-full">
        {pending ? "Salvando…" : "Salvar histórico"}
      </button>
    </form>
  );
}
