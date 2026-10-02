import { z } from "zod";
import { isISODate, isYearMonth } from "./dates";
import { parseBRL } from "./money";
import { ACCOUNT_KINDS } from "./repos/accounts";
import type { TransactionInput } from "./repos/transactions";
import { FREQUENCIES, type Frequency } from "./recurrence";
import { MAX_INSTALLMENTS } from "./repos/installments";
import type { HistorySeedEntry } from "./repos/recurrences";

export type FormState = { error?: string } | undefined;

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
const optionalId = (v: FormDataEntryValue | null) => {
  const s = text(v);
  return s === "" ? null : Number(s);
};

const optionalIdSchema = z
  .number("Seleção inválida.")
  .int("Seleção inválida.")
  .positive("Seleção inválida.")
  .nullable();

/** Erro de requisição malformada (campos ocultos adulterados): não é culpa do preenchimento do usuário. */
export class InvalidRequestError extends Error {
  constructor(field: string) {
    super(`Requisição inválida (${field}).`);
  }
}

const requestInt = z.coerce.number().int();

/** Inteiro de um campo oculto; vazio vale 0 (ausente), lixo lança InvalidRequestError. */
export function intField(fd: FormData, name: string): number {
  const r = requestInt.safeParse(text(fd.get(name)));
  if (!r.success) throw new InvalidRequestError(name);
  return r.data;
}

/** Id positivo obrigatório de um campo oculto. */
export function idField(fd: FormData, name: string): number {
  const n = intField(fd, name);
  if (n <= 0) throw new InvalidRequestError(name);
  return n;
}

/** Data ISO obrigatória de um campo oculto. */
export function dateField(fd: FormData, name: string): string {
  const v = text(fd.get(name));
  if (!isISODate(v)) throw new InvalidRequestError(name);
  return v;
}

/** Data ISO opcional: vazio vira null, lixo lança. */
export function optionalDateField(fd: FormData, name: string): string | null {
  return text(fd.get(name)) === "" ? null : dateField(fd, name);
}

const descriptionSchema = z.string().min(1, "Informe uma descrição.").max(120, "Descrição muito longa.");
const accountIdSchema = z.number("Escolha a conta.").int().positive("Escolha a conta.");
const isoDateSchema = (message: string) => z.string().refine(isISODate, message);

const AMOUNT_ERROR = "Informe um valor maior que zero (ex.: 1.234,56).";
/** Valor digitado em centavos, estritamente positivo; null se vazio, inválido ou <= 0. */
function parseAmount(fd: FormData): number | null {
  const cents = parseBRL(text(fd.get("amount")));
  return cents === null || cents <= 0 ? null : cents;
}

/** Data de término opcional (vazio = sem fim); `notBefore` impõe que não preceda o início. */
function parseEndDate(fd: FormData, notBefore?: string): { ok: true; endDate: string | null } | { ok: false; error: string } {
  const raw = text(fd.get("endDate"));
  if (raw === "") return { ok: true, endDate: null };
  if (!isISODate(raw)) return { ok: false, error: "Data de término inválida." };
  if (notBefore !== undefined && raw < notBefore) return { ok: false, error: "O término não pode ser antes do início." };
  return { ok: true, endDate: raw };
}

const nameSchema = z.string().min(1, "Informe um nome.").max(60, "Nome muito longo (máx. 60).");

/** Quantos pares mês/valor do histórico inicial (campos seedMonthN/seedAmountN) um formulário aceita. */
export const SEED_SLOTS = 12;

function parseSeedEntries(fd: FormData): { ok: true; seed: HistorySeedEntry[] } | { ok: false; error: string } {
  const seed: HistorySeedEntry[] = [];
  const months = new Set<string>();
  for (let i = 0; i < SEED_SLOTS; i++) {
    const month = text(fd.get(`seedMonth${i}`));
    const raw = text(fd.get(`seedAmount${i}`));
    if (month === "" && raw === "") continue;
    if (month === "") return { ok: false, error: "Informe o mês de cada valor do histórico." };
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, error: "Mês inválido no histórico." };
    const amountCents = raw === "" ? null : parseBRL(raw);
    if (amountCents === null || amountCents <= 0) {
      return { ok: false, error: "Informe o valor de cada mês do histórico (maior que zero, ex.: 123,45)." };
    }
    if (months.has(month)) return { ok: false, error: "Mês repetido no histórico." };
    months.add(month);
    seed.push({ month, amountCents });
  }
  return { ok: true, seed };
}

/** Edição do histórico inicial na página da recorrência. */
export function parseSeedForm(fd: FormData) {
  const id = optionalId(fd.get("recurrenceId"));
  if (id === null || !Number.isInteger(id) || id <= 0) throw new InvalidRequestError("recurrenceId");
  const parsed = parseSeedEntries(fd);
  if (!parsed.ok) return parsed;
  return { ok: true, data: { recurrenceId: id, historySeed: parsed.seed } } as const;
}

/** O que fazer com o lançamento além de gravá-lo: repetir (Recorrência) ou parcelar. */
export type RepeatSpec =
  | { type: "none" }
  | { type: "recorrente"; frequency: Frequency; endDate: string | null; isVariable: boolean; historySeed: HistorySeedEntry[] }
  | { type: "parcelado"; installments: number; mode: "parcela" | "total" };

export function parseTransactionForm(
  fd: FormData,
): { ok: true; data: TransactionInput; repeat: RepeatSpec } | { ok: false; error: string } {
  const schema = z.object({
    kind: z.enum(["receita", "despesa", "transferencia"], "Escolha o tipo."),
    status: z.enum(["previsto", "efetivado"]),
    date: isoDateSchema("Data inválida."),
    description: descriptionSchema,
    accountId: accountIdSchema,
    toAccountId: optionalIdSchema,
    categoryId: optionalIdSchema,
  });
  const base = schema.safeParse({
    kind: text(fd.get("kind")),
    status: text(fd.get("status")) || "efetivado",
    date: text(fd.get("date")),
    description: text(fd.get("description")),
    accountId: optionalId(fd.get("accountId")),
    toAccountId: optionalId(fd.get("toAccountId")),
    categoryId: optionalId(fd.get("categoryId")),
  });
  if (!base.success) return { ok: false, error: base.error.issues[0].message };

  const amountCents = parseAmount(fd);
  if (amountCents === null) return { ok: false, error: AMOUNT_ERROR };

  const { kind, toAccountId, categoryId } = base.data;
  if (kind === "transferencia" && toAccountId === null) {
    return { ok: false, error: "Escolha a conta de destino." };
  }

  const repeat = parseRepeat(fd, kind, base.data.date);
  if (!repeat.ok) return repeat;

  return {
    ok: true,
    data: {
      ...base.data,
      amountCents,
      toAccountId: kind === "transferencia" ? toAccountId : null,
      categoryId: kind === "transferencia" ? null : categoryId,
    },
    repeat: repeat.repeat,
  };
}

function parseRepeat(
  fd: FormData,
  kind: string,
  startDate: string,
): { ok: true; repeat: RepeatSpec } | { ok: false; error: string } {
  const type = text(fd.get("repeat")) || "none";
  if (type === "none") return { ok: true, repeat: { type: "none" } };
  if (kind === "transferencia") return { ok: false, error: "Transferências não se repetem nem se parcelam." };

  if (type === "recorrente") {
    const frequency = text(fd.get("frequency"));
    if (!(FREQUENCIES as readonly string[]).includes(frequency)) {
      return { ok: false, error: "Escolha a frequência da recorrência." };
    }
    const end = parseEndDate(fd, startDate);
    if (!end.ok) return end;
    const isVariable = fd.get("isVariable") !== null;
    const seed = isVariable ? parseSeedEntries(fd) : { ok: true as const, seed: [] };
    if (!seed.ok) return seed;
    return {
      ok: true,
      repeat: { type: "recorrente", frequency: frequency as Frequency, endDate: end.endDate, isVariable, historySeed: seed.seed },
    };
  }

  if (type === "parcelado") {
    if (kind !== "despesa") return { ok: false, error: "Só despesas podem ser parceladas." };
    const installments = Number(text(fd.get("installments")));
    if (!Number.isInteger(installments) || installments < 2 || installments > MAX_INSTALLMENTS) {
      return { ok: false, error: `Informe de 2 a ${MAX_INSTALLMENTS} parcelas.` };
    }
    const mode = text(fd.get("amountMode")) === "total" ? "total" : "parcela";
    return { ok: true, repeat: { type: "parcelado", installments, mode } };
  }

  return { ok: false, error: "Opção de repetição inválida." };
}

export function parseAccountForm(fd: FormData) {
  const schema = z.object({
    name: nameSchema,
    kind: z.enum(ACCOUNT_KINDS, "Escolha o tipo da conta."),
  });
  const base = schema.safeParse({ name: text(fd.get("name")), kind: text(fd.get("kind")) });
  if (!base.success) return { ok: false, error: base.error.issues[0].message } as const;

  const favorite = fd.get("favorite") === "on";
  const raw = text(fd.get("initialBalance"));
  const initialBalanceCents = raw === "" ? 0 : parseBRL(raw);
  if (initialBalanceCents === null) {
    return { ok: false, error: "Saldo inicial inválido (ex.: 1.234,56)." } as const;
  }

  if (base.data.kind !== "cartao") {
    const acceptedCategoryIds = fd.getAll("acceptedCategoryIds").map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
    return { ok: true, data: { ...base.data, initialBalanceCents, favorite, acceptedCategoryIds } } as const;
  }

  const closingDay = optionalId(fd.get("closingDay"));
  const dueDay = optionalId(fd.get("dueDay"));
  const inRange = (d: number | null) => d !== null && Number.isInteger(d) && d >= 1 && d <= 31;
  if (!inRange(closingDay)) return { ok: false, error: "Informe o dia de fechamento da fatura (1 a 31)." } as const;
  if (!inRange(dueDay)) return { ok: false, error: "Informe o dia de vencimento da fatura (1 a 31)." } as const;
  const pay = optionalIdSchema.safeParse(optionalId(fd.get("payAccountId")));
  if (!pay.success) return { ok: false, error: pay.error.issues[0].message } as const;
  const payAccountId = pay.data;
  if (payAccountId === null) return { ok: false, error: "Escolha a conta que paga a fatura." } as const;
  return { ok: true, data: { ...base.data, initialBalanceCents: 0, closingDay, dueDay, payAccountId, favorite } } as const;
}

export function parseCategoryForm(fd: FormData) {
  const schema = z.object({
    name: nameSchema,
    kind: z.enum(["despesa", "receita"]),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida."),
    icon: z.string().min(1, "Escolha um ícone (emoji).").max(8),
    parentId: optionalIdSchema,
  });
  const base = schema.safeParse({
    name: text(fd.get("name")),
    kind: text(fd.get("kind")),
    color: text(fd.get("color")),
    icon: text(fd.get("icon")),
    parentId: optionalId(fd.get("parentId")),
  });
  if (!base.success) return { ok: false, error: base.error.issues[0].message } as const;
  return { ok: true, data: base.data } as const;
}

export function parseRecurrenceEditForm(fd: FormData) {
  const schema = z.object({
    recurrenceId: z.number().int().positive(),
    from: isoDateSchema("Escolha a partir de qual ocorrência vale."),
    description: descriptionSchema,
    accountId: accountIdSchema,
    categoryId: optionalIdSchema,
  });
  const base = schema.safeParse({
    recurrenceId: optionalId(fd.get("recurrenceId")),
    from: text(fd.get("from")),
    description: text(fd.get("description")),
    accountId: optionalId(fd.get("accountId")),
    categoryId: optionalId(fd.get("categoryId")),
  });
  if (!base.success) return { ok: false, error: base.error.issues[0].message } as const;

  const amountCents = parseAmount(fd);
  if (amountCents === null) return { ok: false, error: AMOUNT_ERROR } as const;
  const end = parseEndDate(fd);
  if (!end.ok) return { ok: false, error: end.error } as const;

  return {
    ok: true,
    data: {
      ...base.data,
      amountCents,
      endDate: end.endDate,
      isVariable: fd.get("isVariable") !== null,
    },
  } as const;
}

/** Limite de orçamento de uma categoria a partir de um mês; vazio ou 0 remove o limite. */
export function parseBudgetForm(fd: FormData) {
  const month = text(fd.get("month"));
  if (!isYearMonth(month)) throw new InvalidRequestError("month");
  const raw = text(fd.get("limit"));
  const cents = raw === "" ? 0 : parseBRL(raw);
  if (cents === null || cents < 0) return { ok: false, error: "Informe um limite válido (ex.: 600,00). Use 0 para remover." } as const;
  return { ok: true, data: { categoryId: idField(fd, "categoryId"), month, amountCents: cents } } as const;
}
