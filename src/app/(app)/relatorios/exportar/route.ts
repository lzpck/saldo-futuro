import { verifySession } from "@/lib/auth/dal";
import { getDb } from "@/lib/db/connection";
import { todayISO } from "@/lib/dates";
import { buildReport, parseReportParams } from "@/lib/report-view";

export const dynamic = "force-dynamic";

const brl = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
/** Nomes de categoria vêm do usuário: o prefixo "'" impede que o Excel leia "=..." como fórmula. */
const cell = (v: string) => {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[;"\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** CSV da tabela por categoria (separador ";" e vírgula decimal, para abrir direto no Excel em português). */
export async function GET(request: Request) {
  await verifySession();
  const q = Object.fromEntries(new URL(request.url).searchParams);
  const p = parseReportParams(q, todayISO());
  const r = buildReport(getDb(), p, todayISO());

  const lines = [["Categoria", "Subcategoria", "Realizado", "Previsto", "Total", "% do total"].join(";")];
  for (const row of r.rows) {
    const pct = (cents: number) => (r.total > 0 ? ((cents / r.total) * 100).toFixed(1).replace(".", ",") : "");
    lines.push([cell(row.name), "", brl(row.realizedCents), brl(row.plannedCents), brl(row.totalCents), pct(row.totalCents)].join(";"));
    for (const c of row.children) {
      lines.push(["", cell(c.name), brl(c.realizedCents), brl(c.plannedCents), brl(c.totalCents), pct(c.totalCents)].join(";"));
    }
  }
  lines.push(["Total", "", brl(r.realized), brl(r.planned), brl(r.total), r.total > 0 ? "100,0" : ""].join(";"));

  const name = `relatorio-${p.kind === "despesa" ? "despesas" : "receitas"}-${r.range.from.slice(0, 7)}-${p.period}.csv`;
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
