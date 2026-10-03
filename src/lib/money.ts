// Valores monetários são sempre inteiros em centavos (ADR 0001).

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatBRL(cents: number): string {
  return brl.format(cents / 100);
}

/** Converte texto digitado ("1.234,56", "12,5", "12") em centavos. Retorna null se inválido. */
export function parseBRL(input: string): number | null {
  const cleaned = input.replace(/R\$|\s/g, "");
  if (!/^-?(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/.test(cleaned)) return null;
  const negative = cleaned.startsWith("-");
  const [intPart, decPart = ""] = cleaned.replace("-", "").split(",");
  const reais = Number(intPart.replace(/\./g, ""));
  const centavos = Number(decPart.padEnd(2, "0"));
  const cents = reais * 100 + centavos;
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

/** Centavos no formato de campo de formulário ("1234,56"), só com aritmética inteira. */
export function centsToInput(cents: number): string {
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

// --- Máscara de campo de dinheiro (digitação em centavos) ---

const MAX_DIGITS = 12;

export type MoneyMaskOptions = { allowNegative?: boolean };

/** Centavos como texto de campo mascarado ("1.234,56"), com sinal e separador de milhar. */
export function formatMoneyField(cents: number): string {
  const abs = Math.abs(cents);
  const reais = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+$)/g, ".");
  return `${cents < 0 ? "-" : ""}${reais},${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Texto cru do campo (após uma tecla) → texto mascarado. Só os dígitos contam: o valor
 * "sobe" da direita (1 → 0,01; 12 → 0,12). Sem dígitos significativos o campo fica vazio.
 * Com `allowNegative`, cada "-" digitado alterna o sinal.
 */
export function maskMoney(raw: string, { allowNegative = false }: MoneyMaskOptions = {}): string {
  const digits = raw.replace(/\D/g, "").slice(0, MAX_DIGITS).replace(/^0+/, "");
  const negative = allowNegative && (raw.match(/-/g)?.length ?? 0) % 2 === 1;
  if (!digits) return negative ? "-" : "";
  return formatMoneyField(negative ? -Number(digits) : Number(digits));
}

/** Texto colado: valor em pt-BR válido é respeitado; senão, só os dígitos entram na máscara. */
export function pasteMoney(text: string, options: MoneyMaskOptions = {}): string {
  const cents = parseBRL(text);
  if (cents !== null && Math.abs(cents) < 10 ** MAX_DIGITS && (cents >= 0 || options.allowNegative)) {
    return formatMoneyField(cents);
  }
  return maskMoney(text.replace(/-/g, ""), options);
}
