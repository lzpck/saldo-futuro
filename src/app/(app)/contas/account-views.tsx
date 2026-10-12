import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/connection";
import { listCategories } from "@/lib/repos/categories";
import { getAccount, isBenefit, isCard, isSavings, isSpendable, listAccounts, type Account } from "@/lib/repos/accounts";
import { favoritesFirst } from "@/lib/account-options";
import { AccountForm } from "./account-form";
import { AdjustBalanceForm } from "./adjust-form";
import { ArchiveAccountButton } from "./archive-button";

/** Conteúdo dos formulários de Conta, compartilhado pela página inteira e pelo modal (rota interceptada). */
type View = { title: string; body: ReactNode };

const benefitCategories = () => listCategories(getDb()).filter((c) => c.kind === "despesa" && c.parentId === null);

export function newAccountView(tipo: string | undefined): View {
  const payers = favoritesFirst(listAccounts(getDb()).filter(isSpendable));
  const initialKind = tipo === "cartao" ? "cartao" : tipo === "caixinha" ? "caixinha" : tipo === "beneficio" ? "beneficio" : "corrente";
  const title = { cartao: "Novo cartão", caixinha: "Nova caixinha", beneficio: "Novo benefício", corrente: "Nova conta" }[initialKind];
  return { title, body: <AccountForm payers={payers} initialKind={initialKind} categories={benefitCategories()} /> };
}

const nounOf = (a: Account) => (isCard(a) ? "cartão" : isSavings(a) ? "caixinha" : isBenefit(a) ? "benefício" : "conta");

export function editAccountView(id: string): View {
  const db = getDb();
  const account = getAccount(db, Number(id));
  if (!account) notFound();
  const noun = nounOf(account);
  return {
    title: `Editar ${noun}`,
    body: (
      <>
        <AccountForm existing={account} payers={favoritesFirst(listAccounts(db).filter(isSpendable))} categories={benefitCategories()} />
        {!account.archived && <ArchiveAccountButton id={account.id} noun={noun} />}
      </>
    ),
  };
}

export function adjustBalanceView(id: string): View {
  const account = getAccount(getDb(), Number(id));
  if (!account || isCard(account)) notFound();
  return { title: `Ajustar saldo de ${account.name}`, body: <AdjustBalanceForm id={account.id} balanceCents={account.balanceCents} /> };
}

/** Moldura da página inteira (acesso direto ou atualização); o modal usa `Modal` no lugar. */
export function AccountPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-lg space-y-5">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}
