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
