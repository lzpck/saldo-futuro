import { describe, expect, it } from "vitest";
import { allocatePayments, closingDateFor, computeInvoices, cycleStart, dueDateFor, type CardTx } from "./cards";

describe("closingDateFor", () => {
  it("compra antes do fechamento cai na fatura do mês", () => {
    expect(closingDateFor("2026-10-10", 25)).toBe("2026-10-25");
    expect(closingDateFor("2026-10-01", 25)).toBe("2026-10-25");
  });

  it("no dia do fechamento ainda entra na fatura que fecha naquele dia", () => {
    expect(closingDateFor("2026-10-25", 25)).toBe("2026-10-25");
  });

  it("no dia seguinte ao fechamento já é a fatura seguinte", () => {
    expect(closingDateFor("2026-10-26", 25)).toBe("2026-11-25");
  });

  it("vira o ano", () => {
    expect(closingDateFor("2026-12-28", 25)).toBe("2027-01-25");
    expect(closingDateFor("2026-12-20", 25)).toBe("2026-12-25");
  });

  it("fechamento no dia 31 recua em meses curtos", () => {
    expect(closingDateFor("2026-02-10", 31)).toBe("2026-02-28");
    expect(closingDateFor("2026-02-28", 31)).toBe("2026-02-28");
    expect(closingDateFor("2026-03-01", 31)).toBe("2026-03-31");
    expect(closingDateFor("2028-02-29", 31)).toBe("2028-02-29");
  });
});

describe("dueDateFor", () => {
  it("vencimento depois do fechamento fica no mesmo mês", () => {
    expect(dueDateFor("2026-10-05", { closingDay: 5, dueDay: 15 })).toBe("2026-10-15");
  });

  it("vencimento antes do fechamento vai para o mês seguinte", () => {
    expect(dueDateFor("2026-10-25", { closingDay: 25, dueDay: 5 })).toBe("2026-11-05");
    expect(dueDateFor("2026-12-25", { closingDay: 25, dueDay: 5 })).toBe("2027-01-05");
  });

  it("mesmo dia de fechamento e vencimento vence no mês seguinte", () => {
    expect(dueDateFor("2026-10-10", { closingDay: 10, dueDay: 10 })).toBe("2026-11-10");
  });

  it("vencimento 31 recua em meses curtos", () => {
    expect(dueDateFor("2026-01-20", { closingDay: 20, dueDay: 31 })).toBe("2026-01-31");
    expect(dueDateFor("2026-02-20", { closingDay: 20, dueDay: 31 })).toBe("2026-02-28");
    expect(dueDateFor("2026-01-31", { closingDay: 31, dueDay: 10 })).toBe("2026-02-10");
  });
});

describe("cycleStart", () => {
  it("é o dia seguinte ao fechamento anterior", () => {
    expect(cycleStart("2026-10-25", 25)).toBe("2026-09-26");
    expect(cycleStart("2027-01-25", 25)).toBe("2026-12-26");
    expect(cycleStart("2026-03-31", 31)).toBe("2026-03-01"); // fechamento anterior: 28/fev
  });
});

describe("computeInvoices", () => {
  const terms = { closingDay: 25, dueDay: 5 };
  const buy = (date: string, amountCents: number, kind: CardTx["kind"] = "despesa"): CardTx => ({ kind, date, amountCents });

  it("agrupa por ciclo, em ordem, com vencimento e total", () => {
    const inv = computeInvoices([buy("2026-11-02", 3_000), buy("2026-10-10", 10_000), buy("2026-10-25", 500), buy("2026-10-26", 700)], terms);
    expect(inv).toEqual([
      { closingDate: "2026-10-25", dueDate: "2026-11-05", totalCents: 10_500, itemCount: 2 },
      { closingDate: "2026-11-25", dueDate: "2026-12-05", totalCents: 3_700, itemCount: 2 },
    ]);
  });

  it("estorno abate a fatura e pagamentos (transferências) não contam como compra", () => {
    const inv = computeInvoices([buy("2026-10-10", 10_000), buy("2026-10-12", 2_500, "receita"), buy("2026-10-20", 99_999, "transferencia")], terms);
    expect(inv).toEqual([{ closingDate: "2026-10-25", dueDate: "2026-11-05", totalCents: 7_500, itemCount: 2 }]);
  });

  it("sem lançamentos não há faturas", () => {
    expect(computeInvoices([], terms)).toEqual([]);
  });
});

describe("allocatePayments", () => {
  const inv = (closingDate: string, totalCents: number) => ({ closingDate, dueDate: closingDate, totalCents, itemCount: 1 });
  const TODAY = "2026-10-15";

  it("sem pagamentos, tudo em aberto; status depende do fechamento", () => {
    const r = allocatePayments([inv("2026-10-05", 100), inv("2026-10-25", 200)], 0, TODAY);
    expect(r.map((x) => [x.remainingCents, x.status])).toEqual([[100, "fechada"], [200, "aberta"]]);
  });

  it("abate da mais antiga para a mais nova", () => {
    const r = allocatePayments([inv("2026-09-05", 100), inv("2026-10-05", 200), inv("2026-11-05", 300)], 250, TODAY);
    expect(r.map((x) => [x.paidCents, x.remainingCents, x.status])).toEqual([
      [100, 0, "paga"],
      [150, 50, "fechada"],
      [0, 300, "aberta"],
    ]);
  });

  it("pagamento a mais vira crédito para as faturas seguintes", () => {
    const r = allocatePayments([inv("2026-09-05", 100), inv("2026-11-05", 300)], 250, TODAY);
    expect(r.map((x) => x.remainingCents)).toEqual([0, 150]);
  });

  it("fatura só de estornos vira crédito e não gera pagamento", () => {
    const r = allocatePayments([inv("2026-09-05", -80), inv("2026-10-05", 200)], 0, TODAY);
    expect(r.map((x) => x.remainingCents)).toEqual([0, 120]);
  });

  it("a soma paga + em aberto nunca passa do total", () => {
    const r = allocatePayments([inv("2026-09-05", 100), inv("2026-10-05", 200)], 1_000, TODAY);
    for (const x of r) expect(x.paidCents + x.remainingCents).toBe(x.totalCents);
  });
});
