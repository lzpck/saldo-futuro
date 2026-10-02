import { getDb } from "@/lib/db/connection";
import { listCategories } from "@/lib/repos/categories";
import { isSpendable, listAccounts } from "@/lib/repos/accounts";
import { favoritesFirst } from "@/lib/account-options";
import { AccountForm } from "../account-form";

type SearchParams = Promise<{ tipo?: string }>;

export default async function NewAccountPage({ searchParams }: { searchParams: SearchParams }) {
  const { tipo } = await searchParams;
  const payers = favoritesFirst(listAccounts(getDb()).filter(isSpendable));
  const initialKind = tipo === "cartao" ? "cartao" : tipo === "caixinha" ? "caixinha" : tipo === "beneficio" ? "beneficio" : "corrente";
  const title = { cartao: "Novo cartão", caixinha: "Nova caixinha", beneficio: "Novo benefício", corrente: "Nova conta" }[initialKind];

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <AccountForm payers={payers} initialKind={initialKind} categories={listCategories(getDb()).filter((c) => c.kind === "despesa" && c.parentId === null)} />
    </div>
  );
}
