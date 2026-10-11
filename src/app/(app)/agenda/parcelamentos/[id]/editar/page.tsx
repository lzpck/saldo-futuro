import { notFound } from "next/navigation";
import { todayISO } from "@/lib/dates";
import { getDb } from "@/lib/db/connection";
import { listAccounts } from "@/lib/repos/accounts";
import { listCategories } from "@/lib/repos/categories";
import { getPurchase, purchaseEditDefaults } from "@/lib/repos/installments";
import { PurchaseEditForm } from "./edit-form";

export default async function EditPurchasePage({ params }: PageProps<"/agenda/parcelamentos/[id]/editar">) {
  const { id } = await params;
  const db = getDb();
  const purchase = getPurchase(db, Number(id));
  if (!purchase) notFound();
  const defaults = purchaseEditDefaults(db, purchase.id);

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <h1 className="text-2xl font-semibold">Editar compra parcelada</h1>
      <PurchaseEditForm
        purchase={purchase}
        defaults={{ ...defaults, firstDate: defaults.firstDate ?? todayISO() }}
        accounts={listAccounts(db, { includeArchived: true })}
        categories={listCategories(db).filter((c) => c.kind === "despesa")}
      />
    </div>
  );
}
