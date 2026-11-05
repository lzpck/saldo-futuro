import { describe, expect, it } from "vitest";
import { monthlyOutlook } from "./month-outlook";
import type { ProjectionTx } from "./projection";

let nextId = 1;
const tx = (o: Partial<ProjectionTx> & Pick<ProjectionTx, "date" | "amountCents">): ProjectionTx => ({
  id: nextId++,
  kind: "despesa",
  status: "previsto",
  accountId: 1,
  toAccountId: null,
  ...o,
});

const SAVINGS = 4;
const CARD = 3;
const TODAY = "2026-11-10";
const base = { accounts: [{ id: 1, initialBalanceCents: 100_000 }], today: TODAY, scope: new Set([1]), cardIds: new Set([CARD]) };

describe("monthlyOutlook (tira de 6 meses)", () => {
  const transactions = [
    tx({ kind: "receita", status: "efetivado", date: "2026-11-05", amountCents: 500_000 }),
    tx({ status: "efetivado", date: "2026-11-08", amountCents: 100_000 }),
    tx({ date: "2026-11-20", amountCents: 200_000 }),
    tx({ kind: "receita", date: "2026-12-05", amountCents: 300_000 }),
    tx({ date: "2026-12-10", amountCents: 450_000 }),
    tx({ kind: "transferencia", date: "2026-12-15", amountCents: 50_000, toAccountId: SAVINGS }), // aplicar na Caixinha
    tx({ date: "2027-01-10", amountCents: 70_000 }),
  ];
  const rows = monthlyOutlook({ ...base, transactions });

  it("devolve 6 meses a partir do corrente", () => {
    expect(rows.map((r) => r.month)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04"]);
  });

  it("soma Efetivado e Previsto do mês inteiro, inclusive o que já passou", () => {
    expect(rows[0]).toMatchObject({ entrouCents: 500_000, saiuCents: 300_000, sobraCents: 200_000, percent: 40 });
  });

  it("sobra negativa dá percentual negativo; o dinheiro guardado não é Saída", () => {
    expect(rows[1]).toMatchObject({ entrouCents: 300_000, saiuCents: 450_000, sobraCents: -150_000, percent: -50 });
  });

  it("saldo final é a projeção no último dia do mês, com o Movimento fora do saldo", () => {
    // 1.000 + 5.000 - 1.000 - 2.000 = 3.000 em nov; dez: 3.000 + 3.000 - 4.500 - 500 = 1.000.
    expect(rows[0].endBalanceCents).toBe(300_000);
    expect(rows[1].endBalanceCents).toBe(100_000);
  });

  it("mês sem entrada não tem percentual", () => {
    expect(rows[2]).toMatchObject({ entrouCents: 0, saiuCents: 70_000, percent: null });
  });

  it("marca como estimados só os meses mais distantes", () => {
    expect(rows.map((r) => r.estimated)).toEqual([false, false, true, true, true, true]);
  });
});
