import { isCard, type Account } from "./repos/accounts";

export type AccountGroup<T extends Account> = { label: string; accounts: T[] };

/** Favoritas primeiro; dentro de cada bloco, ordem alfabética. */
export function favoritesFirst<T extends Account>(accounts: T[]): T[] {
  return [...accounts].sort(
    (a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name, "pt-BR"),
  );
}

/** Grupos do seletor de Conta: Contas, Cartões e Arquivadas (grupos vazios ficam de fora). */
export function groupAccountOptions<T extends Account>(accounts: T[]): AccountGroup<T>[] {
  const groups: AccountGroup<T>[] = [
    { label: "Contas", accounts: favoritesFirst(accounts.filter((a) => !a.archived && !isCard(a))) },
    { label: "Cartões", accounts: favoritesFirst(accounts.filter((a) => !a.archived && isCard(a))) },
    { label: "Arquivadas", accounts: favoritesFirst(accounts.filter((a) => a.archived)) },
  ];
  return groups.filter((g) => g.accounts.length > 0);
}

/** Conta pré-selecionada num novo Lançamento: a primeira favorita na ordem exibida, senão a primeira que não é cartão. */
export function defaultAccountId(accounts: Account[]): number | undefined {
  const shown = groupAccountOptions(accounts).flatMap((g) => g.accounts).filter((a) => !a.archived);
  return (shown.find((a) => a.favorite) ?? shown.find((a) => !isCard(a)) ?? shown[0])?.id;
}

/** Nome no seletor: favoritas levam ★. */
export const accountLabel = (a: Pick<Account, "name" | "favorite">) => (a.favorite ? `★ ${a.name}` : a.name);
