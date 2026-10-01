import { notFound } from "next/navigation";
import { stopRecurrence } from "@/app/actions/schedule";
import { Amount } from "@/components/amount";
import { ConfirmButton } from "@/components/confirm-button";
import { formatDateBR, todayISO } from "@/lib/dates";
import { getDb } from "@/lib/db/connection";
import { addDays } from "@/lib/projection";
import { FREQUENCY_LABEL, occurrencesBetween } from "@/lib/recurrence";
import { listAccounts } from "@/lib/repos/accounts";
import { listCategories } from "@/lib/repos/categories";
import { shiftMonth } from "@/lib/prediction";
import { getHistorySeed, getRecurrence, getSeriesHistory, predictOccurrence } from "@/lib/repos/recurrences";
import { RecurrenceEditForm } from "./edit-form";
import { HistorySeedForm } from "./seed-form";

export default async function RecurrencePage({ params }: PageProps<"/agenda/recorrencias/[id]">) {
  const { id } = await params;
  const db = getDb();
  const rule = getRecurrence(db, Number(id));
  if (!rule) notFound();

  const today = todayISO();
  const upcoming = occurrencesBetween(rule, today, addDays(today, 800)).slice(0, 12);
  const ended = rule.endDate !== null && rule.endDate < today && upcoming.length === 0;
  const fromOptions = [...(rule.startDate >= today ? [] : [rule.startDate]), ...upcoming];
  if (fromOptions.length === 0) fromOptions.push(rule.startDate);

  // Recorrência variável: próxima estimativa com a explicação e os últimos 12 meses de histórico.
  const prediction = rule.isVariable ? predictOccurrence(db, rule, upcoming[0] ?? today) : null;
  const thisMonth = today.slice(0, 7);
  const history = rule.isVariable ? getSeriesHistory(db, rule.seriesId) : [];
  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(thisMonth, -i));
  const monthTotal = (month: string) => {
    const points = history.filter((p) => p.month === month);
    return points.length === 0 ? null : points.reduce((sum, p) => sum + p.amountCents, 0);
  };

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{rule.description}</h1>
        <p className="mt-1 text-sm text-muted">
          {FREQUENCY_LABEL[rule.frequency]} · {rule.accountName} · desde {formatDateBR(rule.startDate)}
          {rule.endDate && ` · até ${formatDateBR(rule.endDate)}`}
        </p>
        {prediction ? (
          <>
            <p className="mt-2 text-2xl font-semibold">
              ≈ <Amount cents={rule.kind === "receita" ? prediction.amountCents : -prediction.amountCents} signed />
            </p>
            <p className="mt-1 text-sm text-muted">{prediction.explanation}</p>
          </>
        ) : (
          <Amount cents={rule.kind === "receita" ? rule.amountCents : -rule.amountCents} signed className="mt-2 block text-2xl font-semibold" />
        )}
      </div>

      {rule.isVariable && (
        <>
          <section className="card">
            <h2 className="mb-2 text-sm font-medium text-muted">Últimos 12 meses</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-1 font-normal">Mês</th>
                  <th className="py-1 text-right font-normal">Realizado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {months.map((m) => {
                  const total = monthTotal(m);
                  return (
                    <tr key={m}>
                      <td className="py-1.5">{m.slice(5)}/{m.slice(0, 4)}</td>
                      <td className="py-1.5 text-right">{total === null ? <span className="text-muted">—</span> : <Amount cents={total} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
          <HistorySeedForm recurrenceId={rule.id} seed={getHistorySeed(db, rule.seriesId)} maxMonth={shiftMonth(thisMonth, -1)} />
        </>
      )}

      <section className="card">
        <h2 className="mb-2 text-sm font-medium text-muted">Próximas ocorrências</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted">{ended ? "Esta recorrência foi encerrada." : "Sem ocorrências futuras."}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            {upcoming.slice(0, 6).map((d) => (
              <li key={d}>{formatDateBR(d)}</li>
            ))}
          </ul>
        )}
      </section>

      {!ended && (
        <>
          <RecurrenceEditForm rule={rule} accounts={listAccounts(db, { includeArchived: true })} categories={listCategories(db)} fromOptions={fromOptions} />
          <form action={stopRecurrence} className="card flex items-center justify-between gap-3">
            <input type="hidden" name="recurrenceId" value={rule.id} />
            <input type="hidden" name="lastDate" value={addDays(today, -1)} />
            <p className="text-sm text-muted">Parar de gerar novas ocorrências a partir de hoje.</p>
            <ConfirmButton message="Encerrar esta recorrência? Ocorrências futuras deixam de existir; o que já foi lançado continua." className="btn btn-danger">
              Encerrar
            </ConfirmButton>
          </form>
        </>
      )}
    </div>
  );
}
