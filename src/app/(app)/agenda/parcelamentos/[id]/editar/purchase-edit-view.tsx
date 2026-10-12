import { notFound } from "next/navigation";
import type { FormView } from "@/components/form-page";
import { todayISO } from "@/lib/dates";
import { getDb } from "@/lib/db/connection";
import { listAccounts } from "@/lib/repos/accounts";
import { listCategories } from "@/lib/repos/categories";
import { getPurchase, purchaseEditDefaults } from "@/lib/repos/installments";
import { PurchaseEditForm } from "./edit-form";

export function purchaseEditView(id: string): FormView {
  const db = getDb();
  const purchase = getPurchase(db, Number(id));
  if (!purchase) notFound();
  const defaults = purchaseEditDefaults(db, purchase.id);

  return {
    title: "Editar compra parcelada",
    body: (
      <PurchaseEditForm
        purchase={purchase}
        defaults={{ ...defaults, firstDate: defaults.firstDate ?? todayISO() }}
        accounts={listAccounts(db, { includeArchived: true })}
        categories={listCategories(db).filter((c) => c.kind === "despesa")}
      />
    ),
  };
}
