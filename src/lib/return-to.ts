/** Nome do parâmetro de URL que guarda a tela de onde o formulário de lançamento foi aberto. */
export const RETURN_PARAM = "voltar";

const FALLBACK = "/lancamentos";
// As próprias telas do formulário nunca servem de destino (a origem pode ter sido salva ou excluída).
const FORM_PAGES = ["/lancamentos/", "/agenda/ocorrencia/"];

function parseReturnTo(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return null;
  // Barra invertida e caracteres de controle (tab, quebra de linha) viram "//" no navegador: open redirect.
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return null;
  if (FORM_PAGES.some((p) => value.startsWith(p))) return null;
  return value;
}

/** Aceita só caminhos internos do app; qualquer outra coisa cai na lista de Lançamentos. */
export function safeReturnTo(value: unknown): string {
  return parseReturnTo(value) ?? FALLBACK;
}

/** Anexa a origem a um link que abre o formulário. */
export function withReturnTo(href: string, origin: string): string {
  return `${href}${href.includes("?") ? "&" : "?"}${new URLSearchParams({ [RETURN_PARAM]: origin })}`;
}

/**
 * Destino após salvar: a origem, ou a lista de Lançamentos no mês do lançamento quando não há origem válida.
 * O aviso de orçamento opcional substitui um que a origem já trouxesse.
 */
export function afterSaveUrl(origin: unknown, month: string, budgetNotice?: string): string {
  const valid = parseReturnTo(origin);
  const url = new URL(valid ?? `${FALLBACK}?${new URLSearchParams({ mes: month })}`, "http://app");
  url.searchParams.delete("orcamento");
  if (budgetNotice) url.searchParams.set("orcamento", budgetNotice);
  return `${url.pathname}${url.search}${url.hash}`;
}
