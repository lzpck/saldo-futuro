import Link from "next/link";
import { notFound } from "next/navigation";
import type { FormView } from "@/components/form-page";
import { getDb } from "@/lib/db/connection";
import { todayISO } from "@/lib/dates";
import { listAccounts } from "@/lib/repos/accounts";
import { listCategories } from "@/lib/repos/categories";
import { getTransaction } from "@/lib/repos/transactions";
import { TransactionForm } from "./transaction-form";

export function newTransactionView({ repeat, conta }: { repeat?: string; conta?: string }): FormView {
  const db = getDb();
  const accounts = listAccounts(db);
  const initialRepeat = repeat === "recorrente" || repeat === "parcelado" ? repeat : "none";
  const title =
    initialRepeat === "recorrente" ? "Nova recorrência" : initialRepeat === "parcelado" ? "Nova compra parcelada" : "Novo lançamento";

  return {
    title,
    body:
      accounts.length === 0 ? (
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
      ),
  };
}

export function editTransactionView(id: string): FormView {
  const db = getDb();
  const existing = getTransaction(db, Number(id));
  if (!existing) notFound();

  return {
    title: "Editar lançamento",
    body: (
      <TransactionForm
        accounts={listAccounts(db, { includeArchived: true })}
        categories={listCategories(db, { includeArchived: true })}
        defaultDate={todayISO()}
        existing={existing}
      />
    ),
  };
}
