import { getDb } from "@/lib/db/connection";
import { isCard, listAccounts } from "@/lib/repos/accounts";
import { AccountForm } from "../account-form";

type SearchParams = Promise<{ tipo?: string }>;

export default async function NewAccountPage({ searchParams }: { searchParams: SearchParams }) {
  const { tipo } = await searchParams;
  const payers = listAccounts(getDb()).filter((a) => !isCard(a));
  const initialKind = tipo === "cartao" ? "cartao" : "corrente";

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <h1 className="text-2xl font-semibold">{initialKind === "cartao" ? "Novo cartão" : "Nova conta"}</h1>
      <AccountForm payers={payers} initialKind={initialKind} />
    </div>
  );
}
