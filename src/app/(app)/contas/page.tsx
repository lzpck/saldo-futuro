import Link from "next/link";
import { toggleAccountArchived, toggleAccountFavorite } from "@/app/actions/accounts";
import { Amount } from "@/components/amount";
import { todayISO, formatDateBR } from "@/lib/dates";
import { getDb } from "@/lib/db/connection";
import { ACCOUNT_KIND_LABEL, isCard, listAccounts, totalBalanceCents } from "@/lib/repos/accounts";
import { favoritesFirst } from "@/lib/account-options";
import { cardInvoices } from "@/lib/repos/cards";
import { listWithOccurrences } from "@/lib/repos/recurrences";
import { addDays } from "@/lib/projection";

function FavoriteStar({ id, favorite }: { id: number; favorite: boolean }) {
  return (
    <form action={toggleAccountFavorite}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="favorite" value={favorite ? "0" : "1"} />
      <button
        className={`px-1 text-xl leading-none ${favorite ? "text-amber-400" : "text-muted"}`}
        aria-label={favorite ? "Remover dos favoritos" : "Marcar como favorita"}
        aria-pressed={favorite}
      >
        {favorite ? "★" : "☆"}
      </button>
    </form>
  );
}

export default function AccountsPage() {
  const db = getDb();
  const today = todayISO();
  const all = listAccounts(db, { includeArchived: true });
  const active = all.filter((a) => !a.archived);
  const accounts = favoritesFirst(active.filter((a) => !isCard(a)));
  const cards = favoritesFirst(active.filter(isCard));
  const archived = all.filter((a) => a.archived);

  // Próxima fatura em aberto de cada cartão.
  const base = cards.length ? listWithOccurrences(db, addDays(today, 400)) : [];
  const nextInvoice = new Map(
    cards.map((c) => [c.id, cardInvoices(db, c, base, today).find((i) => i.remainingCents > 0)]),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Contas</h1>
        <Link href="/contas/nova" className="btn btn-primary">+ Nova</Link>
      </div>

      <div className="card flex items-center justify-between">
        <span className="text-sm text-muted">Saldo total</span>
        <Amount cents={totalBalanceCents(accounts)} className="text-lg font-semibold" />
      </div>

      <ul className="space-y-3">
        {accounts.map((a) => (
          <li key={a.id} className="card flex items-center gap-3">
            <FavoriteStar id={a.id} favorite={a.favorite} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{a.name}</p>
              <p className="text-xs text-muted">{ACCOUNT_KIND_LABEL[a.kind]}</p>
            </div>
            <Amount cents={a.balanceCents} className="font-semibold" />
            <Link href={`/contas/${a.id}`} className="btn px-3 py-1.5 text-xs">Editar</Link>
          </li>
        ))}
      </ul>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Cartões de crédito</h2>
          <Link href="/contas/nova?tipo=cartao" className="btn px-3 py-1.5 text-xs">+ Cartão</Link>
        </div>
        {cards.length === 0 && (
          <p className="card text-sm text-muted">
            Cadastre seu cartão para a projeção descontar a fatura no vencimento, e não a cada compra.
          </p>
        )}
        <ul className="space-y-3">
          {cards.map((c) => {
            const inv = nextInvoice.get(c.id);
            return (
              <li key={c.id} className="card flex items-center gap-3 transition hover:border-muted/50">
                <FavoriteStar id={c.id} favorite={c.favorite} />
                <Link href={`/cartoes/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/15 text-lg" aria-hidden>💳</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="text-xs text-muted">
                      {inv ? `Próxima fatura vence em ${formatDateBR(inv.dueDate)}` : "Nenhuma fatura em aberto"} · fecha dia {c.closingDay}
                    </p>
                  </div>
                  {inv && <Amount cents={inv.remainingCents} className="font-semibold" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {archived.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted">Arquivadas</h2>
          <ul className="space-y-2">
            {archived.map((a) => (
              <li key={a.id} className="card flex items-center gap-3 py-3 opacity-70">
                <span className="flex-1 truncate text-sm">{a.name}</span>
                <form action={toggleAccountArchived}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="archive" value="0" />
                  <button className="btn px-3 py-1.5 text-xs">Restaurar</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
