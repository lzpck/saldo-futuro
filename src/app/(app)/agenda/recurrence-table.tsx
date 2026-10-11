"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatBRL } from "@/lib/money";

export type RecurrenceRowData = {
  id: number;
  description: string;
  kind: "receita" | "despesa";
  category: string | null;
  icon: string | null;
  cadence: string;
  frequencyLabel: string;
  accountName: string;
  nextLabel: string | null;
  inDays: number | null;
  amountCents: number;
  isVariable: boolean;
};

const iconCls = "material-symbols-outlined";
type Tab = "todas" | "despesa" | "receita";

const inDays = (n: number) =>
  n === 0 ? "hoje" : n < 0 ? `atraso ${-n} ${n === -1 ? "dia" : "dias"}` : `em ${n} ${n === 1 ? "dia" : "dias"}`;

/** Tabela de recorrências do template da Agenda: abas, busca e filtro por conta. */
export function RecurrenceTable({ rows }: { rows: RecurrenceRowData[] }) {
  const [tab, setTab] = useState<Tab>("todas");
  const [query, setQuery] = useState("");
  const [account, setAccount] = useState("");

  const accounts = useMemo(() => [...new Set(rows.map((r) => r.accountName))].sort((a, b) => a.localeCompare(b)), [rows]);
  const expenses = rows.filter((r) => r.kind === "despesa").length;
  const incomes = rows.length - expenses;
  const q = query.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      (tab === "todas" || r.kind === tab) &&
      (account === "" || r.accountName === account) &&
      (q === "" || `${r.description} ${r.accountName} ${r.category ?? ""}`.toLowerCase().includes(q)),
  );

  const tabBtn = (id: Tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`rounded-lg px-3 py-1.5 transition-colors ${tab === id ? "bg-surface-container font-semibold text-on-surface shadow-sm" : "hover:text-on-surface"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-headline-lg text-headline-lg tracking-tight text-on-surface">Recorrências</h2>
          <p className="font-body-sm text-body-sm text-secondary">Assinaturas, contratos de telecom e receitas automáticas fixadas.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-surface-container-low p-1 font-label-md text-label-md text-secondary">
            {tabBtn("todas", `Todas (${rows.length})`)}
            {tabBtn("despesa", `Despesas (${expenses})`)}
            {tabBtn("receita", `Receitas (${incomes})`)}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl bg-surface-container shadow-sm">
        <div className="flex flex-col items-center justify-between gap-3 bg-surface-container-low p-4 md:flex-row">
          <div className="relative w-full md:w-80">
            <span aria-hidden className={`${iconCls} absolute left-3 top-2.5 text-[18px] text-secondary`}>search</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por serviço ou conta..."
              aria-label="Buscar recorrência"
              className="w-full rounded-xl bg-surface-container py-2 pl-9 pr-4 font-body-sm text-body-sm text-on-surface shadow-inner placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex w-full items-center justify-end gap-2 md:w-auto">
            <label htmlFor="agenda-conta" className="font-label-sm text-label-sm text-secondary">Filtrar conta:</label>
            <select
              id="agenda-conta"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              className="rounded-xl bg-surface-container px-3 py-1.5 font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Todos os métodos</option>
              {accounts.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
        </div>

        {shown.length === 0 && <p className="px-5 py-6 font-body-sm text-body-sm text-secondary">Nenhuma recorrência encontrada.</p>}
        {shown.map((r) => {
          const income = r.kind === "receita";
          return (
            <div
              key={r.id}
              className={`flex items-center justify-between gap-4 px-5 py-3.5 transition-colors ${income ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-surface-container-high"}`}
            >
              <Link href={`/agenda/recorrencias/${r.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3.5">
                <div
                  aria-hidden
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${income ? "bg-primary-container/20 text-primary" : "bg-secondary-container/50 text-on-surface"}`}
                >
                  {r.icon ?? "↻"}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`truncate font-body-md text-body-md text-on-surface ${income ? "font-bold" : "font-semibold"}`}>{r.description}</span>
                    {income ? (
                      <span className="rounded bg-primary-container px-2 py-0.5 text-[10px] font-semibold text-on-primary">Entrada Recorrente</span>
                    ) : (
                      <span className="rounded bg-surface-container-highest px-2 py-0.5 text-[10px] font-semibold text-secondary">{r.category ?? "Sem categoria"}</span>
                    )}
                    {r.isVariable && <span className="rounded bg-surface-container-highest px-2 py-0.5 text-[10px] font-semibold text-secondary">Valor estimado</span>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 font-label-sm text-label-sm text-secondary">
                    <span className={income ? "font-medium text-primary" : ""}>{r.cadence}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1 font-medium text-on-surface-variant">
                      <span className={`h-2 w-2 rounded-full ${income ? "bg-primary" : "bg-secondary"}`} /> {r.accountName}
                    </span>
                    <span>·</span>
                    {r.nextLabel ? (
                      <>
                        <span className={r.inDays !== null && r.inDays <= 7 && !income ? "font-medium text-tertiary" : ""}>Próxima em {r.nextLabel}</span>
                        {r.inDays !== null && <span className={income ? "font-medium text-primary" : r.inDays <= 7 ? "text-tertiary" : ""}>({inDays(r.inDays)})</span>}
                      </>
                    ) : (
                      <span>sem próximas em aberto</span>
                    )}
                  </div>
                </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`font-headline-md text-headline-md font-bold ${income ? "text-primary" : "text-tertiary"}`}>
                    {r.isVariable && "≈ "}
                    {income ? "+" : "-"}
                    {formatBRL(r.amountCents)}
                  </div>
                  <span className={`font-label-sm text-label-sm ${income ? "text-primary" : "text-secondary"}`}>{income ? "Crédito programado" : r.frequencyLabel}</span>
                </div>
              </Link>
              <Link
                  href={`/agenda/recorrencias/${r.id}`}
                  title="Editar, ajustar valor ou encerrar"
                  aria-label="Mais opções"
                  className="rounded-lg p-1.5 text-secondary transition-colors hover:bg-surface-container-highest hover:text-on-surface"
                >
                  <span aria-hidden className={`${iconCls} text-[18px]`}>more_vert</span>
                </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
