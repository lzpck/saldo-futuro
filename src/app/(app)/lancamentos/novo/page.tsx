import Link from "next/link";
import { getDb } from "@/lib/db/connection";
import { todayISO } from "@/lib/dates";
import { listAccounts } from "@/lib/repos/accounts";
import { listCategories } from "@/lib/repos/categories";
import { TransactionForm } from "../transaction-form";

type SearchParams = Promise<{ repeat?: string; conta?: string }>;

export default async function NewTransactionPage({ searchParams }: { searchParams: SearchParams }) {
  const { repeat, conta } = await searchParams;
  const db = getDb();
  const accounts = listAccounts(db);
  const initialRepeat = repeat === "recorrente" || repeat === "parcelado" ? repeat : "none";
  const title =
    initialRepeat === "recorrente" ? "Nova recorrência" : initialRepeat === "parcelado" ? "Nova compra parcelada" : "Novo lançamento";

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {accounts.length === 0 ? (
        <div className="card text-sm text-muted">
          Cadastre uma conta antes de lançar.{" "}
          <Link href="/contas/nova" className="text-accent">Criar conta</Link>
        </div>
      ) : (
        <TransactionForm
          accounts={accounts}
          categories={listCategories(db)}
          defaultDate={todayISO()}
          initialRepeat={initialRepeat}
          initialAccountId={conta ? Number(conta) : undefined}
        />
      )}
    </div>
  );
}
