import { getDb } from "@/lib/db/connection";
import { isSpendable, listAccounts } from "@/lib/repos/accounts";
import { favoritesFirst } from "@/lib/account-options";
import { AccountForm } from "../account-form";

type SearchParams = Promise<{ tipo?: string }>;

export default async function NewAccountPage({ searchParams }: { searchParams: SearchParams }) {
  const { tipo } = await searchParams;
  const payers = favoritesFirst(listAccounts(getDb()).filter(isSpendable));
  const initialKind = tipo === "cartao" ? "cartao" : tipo === "caixinha" ? "caixinha" : "corrente";
  const title = { cartao: "Novo cartão", caixinha: "Nova caixinha", corrente: "Nova conta" }[initialKind];

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <AccountForm payers={payers} initialKind={initialKind} />
    </div>
  );
}
