import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelPurchaseRemaining, deletePurchase } from "@/app/actions/schedule";
import { Amount } from "@/components/amount";
import { ConfirmButton } from "@/components/confirm-button";
import { TransactionRow } from "@/components/transaction-list";
import { formatDateBR } from "@/lib/dates";
import { getDb } from "@/lib/db/connection";
import { getAccount } from "@/lib/repos/accounts";
import { anticipableAmounts, getPurchase } from "@/lib/repos/installments";
import { listTransactions } from "@/lib/repos/transactions";
import { AnticipateForm } from "./anticipate-form";

export default async function PurchasePage({ params }: PageProps<"/agenda/parcelamentos/[id]">) {
  const { id } = await params;
  const db = getDb();
  const purchase = getPurchase(db, Number(id));
  if (!purchase) notFound();

  const installments = listTransactions(db, { purchaseId: purchase.id }).sort(
    (a, b) => (a.installmentNo ?? 0) - (b.installmentNo ?? 0),
  );
  const totalCents = installments.reduce((s, t) => s + t.amountCents, 0);
  const anticipable = anticipableAmounts(db, purchase.id);
  const onCard = getAccount(db, purchase.accountId)?.kind === "cartao";

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{purchase.description}</h1>
          <p className="mt-1 text-sm text-muted">
            {purchase.totalInstallments}x · {purchase.accountName}
            {purchase.categoryName && ` · ${purchase.categoryName}`}
          </p>
        </div>
        <Link href={`/agenda/parcelamentos/${purchase.id}/editar`} className="btn shrink-0">
          Editar compra
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="card py-3">
          <p className="text-muted">Total</p>
          <Amount cents={totalCents} className="font-semibold" />
        </div>
        <div className="card py-3">
          <p className="text-muted">Pago</p>
          <Amount cents={totalCents - purchase.remainingCents} className="font-semibold text-income" />
        </div>
        <div className="card py-3">
          <p className="text-muted">Falta</p>
          <Amount cents={purchase.remainingCents} className="font-semibold" />
          {purchase.nextDate && <p className="text-xs text-muted">próx. {formatDateBR(purchase.nextDate)}</p>}
        </div>
      </div>

      <section className="card">
        <h2 className="mb-1 text-sm font-medium text-muted">Parcelas</h2>
        <p className="mb-1 text-xs text-muted">Toque em uma parcela para alterar valor ou data só dela.</p>
        <ul className="divide-y divide-line">
          {installments.map((t) => (
            <TransactionRow key={t.id} t={t} actions />
          ))}
        </ul>
      </section>

      {purchase.remainingCount > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {anticipable.length > 0 ? <AnticipateForm purchaseId={purchase.id} amountsCents={anticipable} /> : <div />}
          <form action={cancelPurchaseRemaining} className="card space-y-2">
            <input type="hidden" name="purchaseId" value={purchase.id} />
            <p className="text-sm text-muted">
              Compra cancelada ou devolvida: apaga as parcelas restantes
              {onCard ? " (de Faturas ainda não pagas)" : " ainda previstas"}.
            </p>
            <ConfirmButton message="Cancelar as parcelas restantes? Isso não pode ser desfeito." className="btn btn-danger w-full">
              Cancelar o restante
            </ConfirmButton>
          </form>
        </div>
      )}

      <form action={deletePurchase} className="card space-y-2">
        <input type="hidden" name="purchaseId" value={purchase.id} />
        <p className="text-sm text-muted">Cadastrada por engano: apaga a compra inteira, inclusive as parcelas já pagas.</p>
        <ConfirmButton
          message={`Excluir "${purchase.description}"? Isso apaga ${purchase.paidCount} parcela(s) paga(s) e ${purchase.remainingCount} prevista(s), e não pode ser desfeito.`}
          className="btn btn-danger w-full"
        >
          Excluir compra
        </ConfirmButton>
      </form>
    </div>
  );
}
