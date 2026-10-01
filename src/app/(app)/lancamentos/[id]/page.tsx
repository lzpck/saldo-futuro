import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/connection";
import { todayISO } from "@/lib/dates";
import { listAccounts } from "@/lib/repos/accounts";
import { listCategories } from "@/lib/repos/categories";
import { getTransaction } from "@/lib/repos/transactions";
import { TransactionForm } from "../transaction-form";

export default async function EditTransactionPage({ params }: PageProps<"/lancamentos/[id]">) {
  const { id } = await params;
  const db = getDb();
  const existing = getTransaction(db, Number(id));
  if (!existing) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <h1 className="text-2xl font-semibold">Editar lançamento</h1>
      <TransactionForm
        accounts={listAccounts(db, { includeArchived: true })}
        categories={listCategories(db, { includeArchived: true })}
        defaultDate={todayISO()}
        existing={existing}
      />
    </div>
  );
}
