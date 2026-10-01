import { describe, expect, it } from "vitest";
import {
  dateField,
  idField,
  intField,
  InvalidRequestError,
  parseAccountForm,
  parseBudgetForm,
  parseCategoryForm,
  parseRecurrenceEditForm,
  parseSeedForm,
  parseTransactionForm,
} from "./forms";

const fd = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

const valid = { kind: "despesa", date: "2026-10-01", description: "Mercado", accountId: "1", amount: "1.234,56", categoryId: "3" };

describe("parseTransactionForm", () => {
  it("converte um lançamento válido, com valor em centavos", () => {
    const r = parseTransactionForm(fd(valid));
    expect(r).toEqual({
      ok: true,
      data: { kind: "despesa", status: "efetivado", date: "2026-10-01", description: "Mercado", accountId: 1, amountCents: 123456, toAccountId: null, categoryId: 3 },
      repeat: { type: "none" },
    });
  });

  it("transferência exige destino e descarta categoria", () => {
    expect(parseTransactionForm(fd({ ...valid, kind: "transferencia" }))).toMatchObject({ ok: false, error: /destino/ });
    const r = parseTransactionForm(fd({ ...valid, kind: "transferencia", toAccountId: "2" }));
    expect(r).toMatchObject({ ok: true, data: { toAccountId: 2, categoryId: null } });
  });

  it.each([
    [{ date: "2026-02-30" }, /Data inválida/],
    [{ amount: "0" }, /maior que zero/],
    [{ amount: "abc" }, /maior que zero/],
    [{ description: "" }, /descrição/],
    [{ accountId: "" }, /conta/],
    [{ kind: "outro" }, /tipo/],
  ])("rejeita %j", (override, message) => {
    expect(parseTransactionForm(fd({ ...valid, ...override }))).toMatchObject({ ok: false, error: message });
  });
});

describe("parseTransactionForm — repetição", () => {
  it("recorrente com frequência e término opcional", () => {
    expect(parseTransactionForm(fd({ ...valid, repeat: "recorrente", frequency: "mensal" }))).toMatchObject({
      ok: true,
      repeat: { type: "recorrente", frequency: "mensal", endDate: null },
    });
    expect(parseTransactionForm(fd({ ...valid, repeat: "recorrente", frequency: "anual", endDate: "2030-01-01" }))).toMatchObject({
      repeat: { endDate: "2030-01-01" },
    });
  });

  it("recorrente exige frequência válida e término depois do início", () => {
    expect(parseTransactionForm(fd({ ...valid, repeat: "recorrente" }))).toMatchObject({ ok: false, error: /frequência/ });
    expect(parseTransactionForm(fd({ ...valid, repeat: "recorrente", frequency: "diaria" }))).toMatchObject({ ok: false });
    expect(parseTransactionForm(fd({ ...valid, repeat: "recorrente", frequency: "mensal", endDate: "2026-09-01" }))).toMatchObject({ ok: false, error: /término/ });
  });

  it("parcelado: de 2 a 120 parcelas, valor por parcela ou total", () => {
    expect(parseTransactionForm(fd({ ...valid, repeat: "parcelado", installments: "6" }))).toMatchObject({
      ok: true,
      repeat: { type: "parcelado", installments: 6, mode: "parcela" },
    });
    expect(parseTransactionForm(fd({ ...valid, repeat: "parcelado", installments: "6", amountMode: "total" }))).toMatchObject({
      repeat: { mode: "total" },
    });
    for (const bad of ["1", "121", "abc", "2.5", ""]) {
      expect(parseTransactionForm(fd({ ...valid, repeat: "parcelado", installments: bad }))).toMatchObject({ ok: false });
    }
  });

  it("só despesa parcela, e transferência não repete", () => {
    expect(parseTransactionForm(fd({ ...valid, kind: "receita", repeat: "parcelado", installments: "3" }))).toMatchObject({ ok: false, error: /despesas/ });
    expect(parseTransactionForm(fd({ ...valid, kind: "transferencia", toAccountId: "2", repeat: "recorrente", frequency: "mensal" }))).toMatchObject({ ok: false, error: /Transferências/ });
  });
});

describe("parseAccountForm", () => {
  it("saldo inicial vazio vale zero", () => {
    expect(parseAccountForm(fd({ name: "Nubank", kind: "corrente" }))).toMatchObject({ ok: true, data: { initialBalanceCents: 0 } });
  });

  it("aceita saldo inicial negativo (conta no vermelho)", () => {
    expect(parseAccountForm(fd({ name: "Itaú", kind: "corrente", initialBalance: "-150,00" }))).toMatchObject({ ok: true, data: { initialBalanceCents: -15000 } });
  });

  it("cartão exige fechamento, vencimento e conta de pagamento", () => {
    const card = { name: "Nubank", kind: "cartao", closingDay: "25", dueDay: "5", payAccountId: "1" };
    expect(parseAccountForm(fd(card))).toMatchObject({
      ok: true,
      data: { kind: "cartao", initialBalanceCents: 0, closingDay: 25, dueDay: 5, payAccountId: 1 },
    });
    expect(parseAccountForm(fd({ ...card, closingDay: "" }))).toMatchObject({ ok: false, error: /fechamento/ });
    expect(parseAccountForm(fd({ ...card, dueDay: "32" }))).toMatchObject({ ok: false, error: /vencimento/ });
    expect(parseAccountForm(fd({ ...card, payAccountId: "" }))).toMatchObject({ ok: false, error: /paga a fatura/ });
  });

  it("cartão ignora o saldo inicial informado", () => {
    const r = parseAccountForm(fd({ name: "N", kind: "cartao", closingDay: "1", dueDay: "10", payAccountId: "1", initialBalance: "500,00" }));
    expect(r).toMatchObject({ ok: true, data: { initialBalanceCents: 0 } });
  });

  it("rejeita nome vazio e tipo desconhecido", () => {
    expect(parseAccountForm(fd({ name: "", kind: "corrente" }))).toMatchObject({ ok: false });
    expect(parseAccountForm(fd({ name: "X", kind: "poupanca" }))).toMatchObject({ ok: false });
  });
});

describe("campos de requisição", () => {
  it("intField: vazio vale 0, inteiro passa, lixo lança", () => {
    expect(intField(fd({}), "id")).toBe(0);
    expect(intField(fd({ id: "-4" }), "id")).toBe(-4);
    expect(() => intField(fd({ id: "abc" }), "id")).toThrow(InvalidRequestError);
    expect(() => intField(fd({ id: "1.5" }), "id")).toThrow(InvalidRequestError);
  });

  it("idField exige inteiro positivo", () => {
    expect(idField(fd({ id: "7" }), "id")).toBe(7);
    for (const v of ["", "0", "-1", "x"]) expect(() => idField(fd({ id: v }), "id")).toThrow(InvalidRequestError);
  });

  it("dateField exige data ISO real", () => {
    expect(dateField(fd({ d: "2026-10-01" }), "d")).toBe("2026-10-01");
    for (const v of ["", "2026-02-30", "01/10/2026"]) expect(() => dateField(fd({ d: v }), "d")).toThrow(InvalidRequestError);
  });

  it("ids opcionais inválidos viram erro de formulário, não NaN", () => {
    expect(parseTransactionForm(fd({ ...valid, categoryId: "abc" }))).toMatchObject({ ok: false, error: /Seleção inválida/ });
    expect(parseCategoryForm(fd({ name: "A", kind: "despesa", color: "#aabbcc", icon: "🍔", parentId: "x" }))).toMatchObject({ ok: false });
  });
});

describe("recorrência variável nos formulários", () => {
  const rec = { ...valid, repeat: "recorrente", frequency: "mensal" };

  it("fixa por padrão, sem histórico", () => {
    expect(parseTransactionForm(fd(rec))).toMatchObject({ repeat: { isVariable: false, historySeed: [] } });
  });

  it("variável com meses anteriores opcionais (pares vazios são ignorados)", () => {
    const r = parseTransactionForm(
      fd({ ...rec, isVariable: "on", seedMonth0: "2026-07", seedAmount0: "100,00", seedMonth1: "", seedAmount1: "", seedMonth2: "2026-09", seedAmount2: "1.200,50" }),
    );
    expect(r).toMatchObject({
      ok: true,
      repeat: {
        isVariable: true,
        historySeed: [
          { month: "2026-07", amountCents: 10_000 },
          { month: "2026-09", amountCents: 120_050 },
        ],
      },
    });
  });

  it("o histórico é ignorado quando a conta não é variável", () => {
    expect(parseTransactionForm(fd({ ...rec, seedMonth0: "2026-07", seedAmount0: "100,00" }))).toMatchObject({
      repeat: { isVariable: false, historySeed: [] },
    });
  });

  it.each([
    [{ seedMonth0: "2026-07" }, /valor/i],
    [{ seedAmount0: "100,00" }, /mês/i],
    [{ seedMonth0: "2026-07", seedAmount0: "abc" }, /valor/i],
    [{ seedMonth0: "2026-7", seedAmount0: "10,00" }, /mês/i],
    [{ seedMonth0: "2026-07", seedAmount0: "0" }, /valor/i],
    [{ seedMonth0: "2026-07", seedAmount0: "10,00", seedMonth1: "2026-07", seedAmount1: "20,00" }, /repetido/i],
  ])("rejeita histórico inválido %j", (override, message) => {
    expect(parseTransactionForm(fd({ ...rec, isVariable: "on", ...override }))).toMatchObject({ ok: false, error: message });
  });

  it("parseSeedForm lê os pares e o id da série", () => {
    const r = parseSeedForm(fd({ recurrenceId: "4", seedMonth0: "2026-08", seedAmount0: "55,00" }));
    expect(r).toEqual({ ok: true, data: { recurrenceId: 4, historySeed: [{ month: "2026-08", amountCents: 5_500 }] } });
    expect(parseSeedForm(fd({ recurrenceId: "4", seedMonth0: "2026-08" }))).toMatchObject({ ok: false });
  });

  it("a edição da regra lê a caixa de variável", () => {
    const edit = { recurrenceId: "1", from: "2026-10-01", description: "Luz", accountId: "1", amount: "100,00" };
    expect(parseRecurrenceEditForm(fd(edit))).toMatchObject({ ok: true, data: { isVariable: false } });
    expect(parseRecurrenceEditForm(fd({ ...edit, isVariable: "on" }))).toMatchObject({ ok: true, data: { isVariable: true } });
  });
});

describe("parseBudgetForm", () => {
  const base = { categoryId: "4", month: "2026-10", limit: "600,00" };

  it("converte o limite em centavos", () => {
    expect(parseBudgetForm(fd(base))).toEqual({ ok: true, data: { categoryId: 4, month: "2026-10", amountCents: 60_000 } });
    expect(parseBudgetForm(fd({ ...base, limit: "1.234,5" }))).toMatchObject({ data: { amountCents: 123_450 } });
  });

  it("vazio e 0 removem o limite", () => {
    expect(parseBudgetForm(fd({ ...base, limit: "" }))).toMatchObject({ ok: true, data: { amountCents: 0 } });
    expect(parseBudgetForm(fd({ ...base, limit: "0" }))).toMatchObject({ ok: true, data: { amountCents: 0 } });
  });

  it("rejeita valor inválido ou negativo e mês inválido", () => {
    expect(parseBudgetForm(fd({ ...base, limit: "abc" }))).toMatchObject({ ok: false, error: /limite/i });
    expect(parseBudgetForm(fd({ ...base, limit: "-5" }))).toMatchObject({ ok: false });
    expect(() => parseBudgetForm(fd({ ...base, month: "2026-13" }))).toThrow(InvalidRequestError);
  });
});
