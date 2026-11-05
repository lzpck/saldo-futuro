import { describe, expect, it } from "vitest";
import {
  accountOutlooks,
  creditUsage,
  monthsCovered,
  netWorthCents,
  sortByNextDue,
  splitByBalance,
  SHORTFALL_HORIZON_DAYS,
} from "./account-overview";
import { addDays, type DayBalance } from "./projection";

const inv = (payAccountId: number, dueDate: string, remainingCents: number) => ({ payAccountId, dueDate, remainingCents });

describe("accountOutlooks (falta para pagar as faturas, com a projeção)", () => {
  const today = "2026-10-11";
  // Saldo de fim de dia de cada conta, de hoje até o horizonte; cada `changes` vale a partir do dia dado.
  const days = (start: Record<number, number>, changes: [string, Record<number, number>][] = []): DayBalance[] =>
    Array.from({ length: SHORTFALL_HORIZON_DAYS + 1 }, (_, n) => {
      const date = addDays(today, n);
      const byAccount = { ...start };
      for (const [from, values] of changes) if (date >= from) Object.assign(byAccount, values);
      return { date, phase: n === 0 ? "hoje" : "futuro", endBalanceCents: 0, byAccount };
    });

  it("lê o saldo projetado no vencimento e fica com o pior", () => {
    // Pagamentos previstos já estão no saldo: 07/11 deixa -1.000,00 e 10/11 deixa -1.046,10.
    const d = days({ 1: 66_431 }, [["2026-11-07", { 1: -100_000 }], ["2026-11-10", { 1: -104_610 }]]);
    const o = accountOutlooks([{ id: 1, balanceCents: 66_431 }], [inv(1, "2026-11-07", 100_000), inv(1, "2026-11-10", 71_041)], d, today).get(1)!;
    expect(o.dueCents).toBe(171_041);
    expect(o.lowestCents).toBe(-104_610);
    expect(o.shortfallCents).toBe(104_610);
    expect(o.shortfallDate).toBe("2026-11-10");
  });

  it("salário que cai antes do vencimento cobre a fatura: sem falta", () => {
    // Saldo 66,43; salário em 05/11; faturas pagas em 10/11 deixam 8.000,00.
    const d = days({ 1: 6_643 }, [["2026-11-05", { 1: 900_000 }], ["2026-11-10", { 1: 800_000 }]]);
    const o = accountOutlooks([{ id: 1, balanceCents: 6_643 }], [inv(1, "2026-11-10", 100_000)], d, today).get(1)!;
    expect(o.lowestCents).toBe(800_000);
    expect(o.shortfallCents).toBe(0);
  });

  it("salário depois do vencimento não salva: a falta aparece", () => {
    const d = days({ 1: 6_643 }, [["2026-11-10", { 1: -93_357 }], ["2026-11-20", { 1: 900_000 }]]);
    const o = accountOutlooks([{ id: 1, balanceCents: 6_643 }], [inv(1, "2026-11-10", 100_000)], d, today).get(1)!;
    expect(o.shortfallCents).toBe(93_357);
    expect(o.shortfallDate).toBe("2026-11-10");
  });

  it("ignora faturas depois do horizonte e de outras contas", () => {
    const d = days({ 1: 5_000, 2: 0 }, [["2026-10-20", { 2: -1_000 }]]);
    const o = accountOutlooks(
      [{ id: 1, balanceCents: 5_000 }, { id: 2, balanceCents: 0 }],
      [inv(1, "2027-03-01", 99_900), inv(2, "2026-10-20", 1_000)],
      d,
      today,
    );
    expect(o.get(1)).toMatchObject({ dueCents: 0, lowestCents: null, shortfallCents: 0, shortfallDate: null });
    expect(o.get(2)).toMatchObject({ dueCents: 1_000, shortfallCents: 1_000 });
  });

  it("fatura vencida e não paga pesa hoje", () => {
    const d = days({ 1: -500 });
    const o = accountOutlooks([{ id: 1, balanceCents: 0 }], [inv(1, "2026-10-01", 500)], d, today).get(1)!;
    expect(o.dueCents).toBe(500);
    expect(o.shortfallDate).toBe(today);
  });

  it("o horizonte padrão é de 30 dias", () => {
    expect(SHORTFALL_HORIZON_DAYS).toBe(30);
    const edge = accountOutlooks([{ id: 1, balanceCents: 0 }], [inv(1, "2026-11-10", 1), inv(1, "2026-11-11", 1)], days({ 1: 0 }), today).get(1)!;
    expect(edge.dueCents).toBe(1); // 11/11 está a 31 dias
  });
});

describe("netWorthCents", () => {
  it("soma disponível, benefício e guardado e tira as faturas", () => {
    expect(netWorthCents({ availableCents: 66_431, benefitCents: 5_000, savedCents: 784_790, invoicesCents: 171_041 })).toBe(
      66_431 + 5_000 + 784_790 - 171_041,
    );
  });
});

describe("monthsCovered", () => {
  it("divide o guardado pela despesa média mensal, com uma casa", () => {
    expect(monthsCovered(784_790, 200_000)).toBe(3.9);
  });
  it("sem despesa no período não há cobertura calculável", () => {
    expect(monthsCovered(784_790, 0)).toBeNull();
  });
});

describe("splitByBalance", () => {
  it("separa as contas zeradas das com saldo", () => {
    const { withBalance, empty } = splitByBalance([
      { id: 1, balanceCents: 0 },
      { id: 2, balanceCents: 1 },
      { id: 3, balanceCents: -5 },
    ]);
    expect(withBalance.map((a) => a.id)).toEqual([2, 3]);
    expect(empty.map((a) => a.id)).toEqual([1]);
  });
});

describe("sortByNextDue", () => {
  it("ordena pelo vencimento mais próximo; sem fatura vai para o fim", () => {
    const sorted = sortByNextDue([
      { name: "PicPay", dueDate: "2026-11-10" },
      { name: "Zero", dueDate: null },
      { name: "Nubank", dueDate: "2026-11-07" },
      { name: "Alfa", dueDate: null },
    ]);
    expect(sorted.map((c) => c.name)).toEqual(["Nubank", "PicPay", "Alfa", "Zero"]);
  });
});

describe("creditUsage", () => {
  it("calcula usado, disponível e percentual", () => {
    expect(creditUsage(100_000, 25_000)).toEqual({ usedCents: 25_000, availableCents: 75_000, percent: 25 });
  });
  it("estouro do limite trava a barra em 100% e o disponível em zero", () => {
    expect(creditUsage(100_000, 130_000)).toEqual({ usedCents: 130_000, availableCents: 0, percent: 100 });
  });
  it("sem limite informado, não há uso a mostrar", () => {
    expect(creditUsage(null, 25_000)).toBeNull();
  });
});

describe("apresentação", () => {
  it("accountHue é estável e fica entre 0 e 359", async () => {
    const { accountHue } = await import("./account-overview");
    expect(accountHue("Nubank")).toBe(accountHue("Nubank"));
    expect(accountHue("Nubank")).not.toBe(accountHue("PicPay"));
    expect(accountHue("Qualquer coisa")).toBeLessThan(360);
  });

  it("closingText", async () => {
    const { closingText } = await import("./account-overview");
    expect([0, 1, 5].map(closingText)).toEqual(["fecha hoje", "fecha amanhã", "fecha em 5 dias"]);
  });
});
