import { notFound } from "next/navigation";
import { toggleAccountArchived } from "@/app/actions/accounts";
import { getDb } from "@/lib/db/connection";
import { getAccount, isCard, isSavings, isSpendable, listAccounts } from "@/lib/repos/accounts";
import { favoritesFirst } from "@/lib/account-options";
import { AccountForm } from "../account-form";

export default async function EditAccountPage({ params }: PageProps<"/contas/[id]">) {
  const { id } = await params;
  const db = getDb();
  const account = getAccount(db, Number(id));
  if (!account) notFound();
  const payers = favoritesFirst(listAccounts(db).filter(isSpendable));
  const noun = isCard(account) ? "cartão" : isSavings(account) ? "caixinha" : "conta";

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <h1 className="text-2xl font-semibold">Editar {noun}</h1>
      <AccountForm existing={account} payers={payers} />
      {!account.archived && (
        <form action={toggleAccountArchived}>
          <input type="hidden" name="id" value={account.id} />
          <input type="hidden" name="archive" value="1" />
          <button className="btn btn-danger w-full">Arquivar {noun}</button>
          <p className="mt-2 text-xs text-muted">
            Some das listas, mas os lançamentos e o histórico continuam guardados.
          </p>
        </form>
      )}
    </div>
  );
}
