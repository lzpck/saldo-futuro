import Link from "next/link";
import { Amount } from "@/components/amount";
import { formatDateBR, todayISO } from "@/lib/dates";
import { getDb } from "@/lib/db/connection";
import { addDays } from "@/lib/projection";
import { FREQUENCY_LABEL } from "@/lib/recurrence";
import { listPurchases } from "@/lib/repos/installments";
import { listRecurrences, listVirtualOccurrences } from "@/lib/repos/recurrences";

export default function AgendaPage() {
  const db = getDb();
  const today = todayISO();
  // Próxima ocorrência ainda em aberto: pula as que já foram efetivadas ou puladas.
  const open = listVirtualOccurrences(db, addDays(today, 400)).filter((t) => t.date >= today);
  const recurrences = listRecurrences(db).map((r) => {
    const nextOccurrence = open.filter((t) => t.recurrenceId === r.id).sort((a, b) => a.date.localeCompare(b.date))[0];
    return { r, next: nextOccurrence?.date ?? null, nextAmount: nextOccurrence?.amountCents ?? r.amountCents };
  });
  const ended = recurrences.filter((x) => x.next === null && x.r.endDate !== null && x.r.endDate < today);
  const active = recurrences.filter((x) => !ended.includes(x));
  const purchases = listPurchases(db);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Agenda</h1>
        <p className="mt-1 text-sm text-muted">Contas que se repetem e compras parceladas.</p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Recorrências</h2>
          <Link href="/lancamentos/novo?repeat=recorrente" className="btn btn-primary">+ Nova</Link>
        </div>
        {active.length === 0 && (
          <p className="card text-sm text-muted">
            Nenhuma recorrência ativa. Cadastre aluguel, salário, assinaturas e outras contas de valor fixo para a
            projeção contar com elas.
          </p>
        )}
        <ul className="space-y-3">
          {active.map(({ r, next, nextAmount }) => (
            <li key={r.id}>
              <Link href={`/agenda/recorrencias/${r.id}`} className="card flex items-center gap-3 transition hover:border-muted/50">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl text-lg" style={{ backgroundColor: `${r.categoryColor ?? "#64748b"}26` }} aria-hidden>
                  {r.categoryIcon ?? "↻"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5">
                    <span className="truncate font-medium">{r.description}</span>
                    {r.isVariable && (
                      <span className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted">Variável</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {FREQUENCY_LABEL[r.frequency]} · {r.accountName} · {next ? `próxima em ${formatDateBR(next)}` : "sem próximas em aberto"}
                  </p>
                </div>
                <span className="font-semibold">
                  {r.isVariable && "≈ "}
                  <Amount cents={r.kind === "receita" ? nextAmount : -nextAmount} signed />
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {ended.length > 0 && (
          <details className="text-sm text-muted">
            <summary className="cursor-pointer">Encerradas ({ended.length})</summary>
            <ul className="mt-2 space-y-2">
              {ended.map(({ r }) => (
                <li key={r.id}>
                  <Link href={`/agenda/recorrencias/${r.id}`} className="card flex justify-between py-3 opacity-70">
                    <span>{r.description}</span>
                    <span>até {formatDateBR(r.endDate ?? r.startDate)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Compras parceladas</h2>
          <Link href="/lancamentos/novo?repeat=parcelado" className="btn btn-primary">+ Nova</Link>
        </div>
        {purchases.length === 0 && <p className="card text-sm text-muted">Nenhuma compra parcelada.</p>}
        <ul className="space-y-3">
          {purchases.map((p) => (
            <li key={p.id}>
              <Link href={`/agenda/parcelamentos/${p.id}`} className={`card block transition hover:border-muted/50 ${p.remainingCount === 0 ? "opacity-60" : ""}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate font-medium">{p.description}</p>
                  <span className="shrink-0 text-xs text-muted">
                    {p.paidCount}/{p.totalInstallments} pagas
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={p.totalInstallments} aria-valuenow={p.paidCount} aria-label={`${p.paidCount} de ${p.totalInstallments} parcelas pagas`}>
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(p.paidCount / p.totalInstallments) * 100}%` }} />
                </div>
                <p className="mt-2 text-xs text-muted">
                  {p.remainingCount === 0 ? (
                    "Quitada"
                  ) : (
                    <>
                      Falta <Amount cents={p.remainingCents} /> · próxima em {formatDateBR(p.nextDate!)}
                    </>
                  )}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
