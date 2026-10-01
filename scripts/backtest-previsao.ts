// Backtest da previsão local de valor (ticket 05b). Somente leitura: trabalha numa CÓPIA do banco.
// Uso: npm run backtest -- [caminho do banco, padrão data/saldo.db]

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { backtestSeries, summarize } from "../src/lib/backtest";
import { openDb } from "../src/lib/db/connection";
import { getSeriesHistory } from "../src/lib/repos/recurrences";

const source = path.resolve(process.argv[2] ?? path.join("data", "saldo.db"));
if (!fs.existsSync(source)) {
  console.error(`Banco não encontrado: ${source}`);
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "backtest-"));
const copy = path.join(tmp, "saldo.db");
for (const ext of ["", "-wal", "-shm"]) if (fs.existsSync(source + ext)) fs.copyFileSync(source + ext, copy + ext);

const db = openDb(copy);
const series = db
  .prepare("SELECT id, description, amount_cents FROM recurrences WHERE is_variable = 1 AND id = series_id ORDER BY description")
  .all() as { id: number; description: string; amount_cents: number }[];

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);
const all: { ape: number }[] = [];

console.log("Backtest da previsão local (cada mês previsto só com os meses anteriores)\n");
for (const s of series) {
  const points = backtestSeries(getSeriesHistory(db, s.id), s.amount_cents);
  const { mape } = summarize(points);
  all.push(...points);
  console.log(`${s.description}  —  ${points.length} mês(es) avaliado(s), MAPE ${pct(mape)}`);
  for (const p of points) {
    const fmt = (c: number) => (c / 100).toFixed(2);
    console.log(`  ${p.month}  previsto ${fmt(p.predictedCents).padStart(9)}  real ${fmt(p.actualCents).padStart(9)}  erro ${pct(p.ape)}`);
  }
}
const total = summarize(all);
console.log(`\nTotal: ${series.length} série(s), ${total.points} previsão(ões), MAPE geral ${pct(total.mape)}`);
console.log(
  total.mape === null
    ? "→ sem dados suficientes: é preciso ao menos 2 meses de histórico numa conta variável."
    : total.mape > 0.15
      ? "→ acima de 15%: vale discutir a IA."
      : "→ até 15%: IA provavelmente não necessária.",
);

db.close();
fs.rmSync(tmp, { recursive: true, force: true });
