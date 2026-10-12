import Link from "next/link";
import type { ReactNode } from "react";
import { toggleAccountArchived, toggleAccountFavorite } from "@/app/actions/accounts";
import { Amount } from "@/components/amount";
import { PageHeader, PageShell, PANEL, PRIMARY_ACTION } from "@/components/page-shell";
import {
  accountHue,
  accountOutlooks,
  closingText,
  creditUsage,
  monthsCovered,
  netWorthCents,
  sortByNextDue,
  splitByBalance,
  type AccountOutlook,
  type InvoiceDue,
} from "@/lib/account-overview";
import { favoritesFirst } from "@/lib/account-options";
import { closingDateFor, cycleStart } from "@/lib/cards";
import { daysBetween, formatDateBR, monthLabel, todayISO } from "@/lib/dates";
import { getDb } from "@/lib/db/connection";
import { formatBRL } from "@/lib/money";
import { addDays } from "@/lib/projection";
import {
  ACCOUNT_KIND_LABEL,
  averageMonthlyExpenseCents,
  benefitBalanceCents,
  isBenefit,
  isCard,
  isSavings,
  isSpendable,
  listAccounts,
  monthIncomeByAccount,
  savedBalanceCents,
  totalBalanceCents,
  type AccountKind,
  type AccountWithBalance,
} from "@/lib/repos/accounts";
import { cardInvoices } from "@/lib/repos/cards";
import { listCategories } from "@/lib/repos/categories";
import { listWithOccurrences } from "@/lib/repos/recurrences";

const icon = "material-symbols-outlined";
const SECONDARY = "text-body-sm font-body-sm text-on-surface-variant";
const SECTION_ACTION =
  "rounded-lg bg-surface-container-low px-3 py-1.5 font-label-md text-label-md text-primary transition-colors hover:bg-surface-container-high";
const ROW_ACTION =
  "rounded-lg px-2.5 py-1.5 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container-highest hover:text-on-surface";

const KIND_ICON: Record<AccountKind, string> = {
  corrente: "account_balance",
  carteira: "wallet",
  beneficio: "restaurant",
  caixinha: "savings",
  cartao: "credit_card",
};

const SAVINGS_GOAL_MONTHS = 6;

function FavoriteStar({ id, favorite }: { id: number; favorite: boolean }) {
  return (
    <form action={toggleAccountFavorite}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="favorite" value={favorite ? "0" : "1"} />
      <button
        className={`px-1 text-xl leading-none ${favorite ? "text-amber-400" : "text-on-surface-variant"}`}
        aria-label={favorite ? "Remover dos favoritos" : "Marcar como favorita"}
        aria-pressed={favorite}
        title={favorite ? "Favorita: aparece primeiro nos seletores. Clique para remover." : "Marcar como favorita: aparece primeiro nos seletores e vem pré-selecionada em novos lançamentos."}
      >
        {favorite ? "★" : "☆"}
      </button>
    </form>
  );
}

function KindIcon({ name, kind }: { name: string; kind: AccountKind }) {
  const hue = accountHue(name);
  return (
    <span
      aria-hidden
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
      style={{ backgroundColor: `hsl(${hue} 55% 50% / 0.18)`, color: `hsl(${hue} 80% 75%)` }}
    >
      <span className={`${icon} text-[22px]`}>{KIND_ICON[kind]}</span>
    </span>
  );
}

/** Linha de conta ou cartão: estrela, bloco clicável (abre o extrato) e ações iguais para os dois tipos. */
function Row({
  account,
  href,
  subtitle,
  value,
  footer,
  actions,
}: {
  account: AccountWithBalance;
  href: string;
  subtitle: ReactNode;
  value?: ReactNode;
  footer?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <li className="space-y-3 rounded-xl bg-surface-container-low p-3 transition-colors hover:bg-surface-container-high">
      <div className="flex items-center gap-3">
        <FavoriteStar id={account.id} favorite={account.favorite} />
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-3" title={isCard(account) ? "Abrir as faturas" : "Abrir o extrato em Lançamentos"}>
          <KindIcon name={account.name} kind={account.kind} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-body-md text-body-md font-semibold">{account.name}</p>
            <p className={SECONDARY}>{subtitle}</p>
          </div>
          {value && <div className="text-right">{value}</div>}
        </Link>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          <Link href={`/contas/${account.id}`} className={ROW_ACTION}>Editar</Link>
        </div>
      </div>
      {footer}
    </li>
  );
}

function Section({ title, hint, action, children }: { title: string; hint?: ReactNode; action: ReactNode; children: ReactNode }) {
  return (
    <section className={`${PANEL} space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-headline-md text-headline-md">{title}</h2>
          {hint && <p className={SECONDARY}>{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, note, strong }: { label: string; value: ReactNode; note?: string; strong?: boolean }) {
  return (
    <div className={`rounded-lg p-4 ${strong ? "bg-surface-container-high" : "bg-surface-container-low"}`}>
      <p className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">{label}</p>
      <p className={`mt-1 ${strong ? "text-headline-lg font-headline-lg text-primary" : "text-headline-md font-headline-md"}`}>{value}</p>
      {note && <p className="mt-1 text-xs text-on-surface-variant">{note}</p>}
    </div>
  );
}

function Bar({ percent, tone }: { percent: number; tone: "ok" | "warn" | "bad" }) {
  const color = { ok: "bg-primary", warn: "bg-amber-400", bad: "bg-error" }[tone];
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-surface-container-highest" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${percent}%` }} />
    </div>
  );
}

function BalanceCell({ account, outlook }: { account: AccountWithBalance; outlook?: AccountOutlook }) {
  return (
    <>
      <Amount cents={account.balanceCents} className="font-semibold" />
      {outlook && outlook.dueCents > 0 && (
        <p className={`text-xs ${outlook.projectedCents < 0 ? "text-error" : "text-on-surface-variant"}`}>
          Após faturas: <Amount cents={outlook.projectedCents} />
        </p>
      )}
    </>
  );
}

export default function AccountsPage() {
  const db = getDb();
  const today = todayISO();
  const all = listAccounts(db, { includeArchived: true });
  const active = all.filter((a) => !a.archived);
  const spendable = favoritesFirst(active.filter(isSpendable));
  const benefits = favoritesFirst(active.filter(isBenefit));
  const savings = favoritesFirst(active.filter(isSavings));
  const cards = active.filter(isCard);
  const archived = all.filter((a) => a.archived);
  const categoryName = new Map(listCategories(db).map((c) => [c.id, c.name]));

  // Faturas de cada cartão: base de tudo que a tela diz sobre cartões e sobre quem os paga.
  const base = cards.length ? listWithOccurrences(db, addDays(today, 400)) : [];
  const cardRows = cards.map((c) => {
    const unpaid = cardInvoices(db, c, base, today).filter((i) => i.remainingCents > 0);
    return { card: c, unpaid, next: unpaid[0] };
  });
  const invoicesDue: InvoiceDue[] = cardRows.flatMap(({ card, unpaid }) =>
    unpaid.map((i) => ({ payAccountId: card.payAccountId!, dueDate: i.dueDate, remainingCents: i.remainingCents })),
  );
  const outlooks = accountOutlooks(spendable, invoicesDue, today);
  const shortfalls = spendable
    .map((a) => ({ account: a, outlook: outlooks.get(a.id)! }))
    .filter((x) => x.outlook.shortfallCents > 0);

  // Faturas já iniciadas (aberta, fechada ou vencida): é o que o cartão deve de fato hoje.
  const invoicesCents = cardRows.reduce(
    (sum, { card, unpaid }) =>
      sum + unpaid.filter((i) => cycleStart(i.closingDate, card.closingDay!) <= today).reduce((s, i) => s + i.remainingCents, 0),
    0,
  );
  const availableCents = totalBalanceCents(spendable);
  const benefitCents = benefitBalanceCents(benefits);
  const savedCents = savedBalanceCents(savings);
  const netCents = netWorthCents({ availableCents, benefitCents, savedCents, invoicesCents });

  const { withBalance, empty } = splitByBalance(spendable);
  const sortedCards = sortByNextDue(cardRows.map((r) => ({ ...r, name: r.card.name, dueDate: r.next?.dueDate ?? null })));

  const monthlyExpense = savings.length ? averageMonthlyExpenseCents(db, today) : 0;
  const yields = monthIncomeByAccount(db, today.slice(0, 7));

  const spendableRow = (a: AccountWithBalance) => (
    <Row
      key={a.id}
      account={a}
      href={`/lancamentos?conta=${a.id}`}
      subtitle={<>{ACCOUNT_KIND_LABEL[a.kind]} · {reconciledText(a.reconciledAt)}</>}
      value={<BalanceCell account={a} outlook={outlooks.get(a.id)} />}
      actions={<Link href={`/contas/${a.id}#ajustar`} className={ROW_ACTION}>Ajustar saldo</Link>}
    />
  );

  return (
    <PageShell>
      <PageHeader
        title="Contas Bancárias"
        subtitle="Onde está o seu dinheiro, o que as faturas vão levar e quanto sobra depois."
        actions={
          <Link href="/contas/nova" className={PRIMARY_ACTION}>
            <span aria-hidden className={`${icon} text-[18px]`}>add_circle</span>
            <span>+ Conta</span>
          </Link>
        }
      />

      {shortfalls.length > 0 && (
        <div role="alert" className="space-y-1 rounded-xl bg-error-container/40 p-4 text-error shadow-sm">
          {shortfalls.map(({ account, outlook }) => (
            <p key={account.id} className="flex items-start gap-2 font-body-md text-body-md font-semibold">
              <span aria-hidden className={`${icon} text-[20px]`}>warning</span>
              <span>
                {account.name}: faltam {formatBRL(outlook.shortfallCents)} para cobrir as faturas até {formatDateBR(outlook.coveredUntil!).slice(0, 5)}
              </span>
            </p>
          ))}
        </div>
      )}

      <section className={PANEL} aria-label="Resumo do patrimônio">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Saldo total" value={<Amount cents={availableCents} />} note="Só contas do dia a dia, sem benefício nem guardado" />
          <Stat label="Benefício" value={<Amount cents={benefitCents} />} note="Uso restrito" />
          <Stat label="Guardado" value={<Amount cents={savedCents} />} note="Caixinhas" />
          <Stat label="Faturas" value={<Amount cents={invoicesCents} />} note="Cartões, a pagar" />
          <div className="col-span-2 lg:col-span-1">
            <Stat strong label="Patrimônio líquido" value={<Amount cents={netCents} />} note="Disponível + benefício + guardado − faturas" />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-7">
      <Section
        title="Contas correntes"
        hint="Dinheiro disponível: compõe o Saldo total e a Projeção."
        action={<Link href="/contas/nova" className={SECTION_ACTION}>+ Conta</Link>}
      >
        {spendable.length === 0 && <p className={SECONDARY}>Nenhuma conta cadastrada ainda.</p>}
        <ul className="space-y-3">{withBalance.map(spendableRow)}</ul>
        {empty.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer list-none font-label-md text-label-md text-primary">
              <span className="group-open:hidden">Mostrar contas sem saldo ({empty.length})</span>
              <span className="hidden group-open:inline">Ocultar contas sem saldo</span>
            </summary>
            <ul className="mt-3 space-y-3">{empty.map(spendableRow)}</ul>
          </details>
        )}
      </Section>

      <Section
        title="Benefícios"
        hint="Dinheiro com uso restrito, fora do Saldo total e da Projeção."
        action={<Link href="/contas/nova?tipo=beneficio" className={SECTION_ACTION}>+ Benefício</Link>}
      >
        {benefits.length === 0 && <p className={SECONDARY}>Vale-alimentação e similares aparecem aqui.</p>}
        <ul className="space-y-3">
          {benefits.map((a) => {
            const names = a.acceptedCategoryIds.map((id) => categoryName.get(id)).filter(Boolean);
            return (
              <Row
                key={a.id}
                account={a}
                href={`/lancamentos?conta=${a.id}`}
                subtitle={
                  names.length > 0 ? <>Só para: {names.join(", ")}</> : <>Sem restrição de categoria (use Editar para escolher)</>
                }
                value={<Amount cents={a.balanceCents} className="font-semibold" />}
                actions={<Link href={`/contas/${a.id}#ajustar`} className={ROW_ACTION}>Ajustar saldo</Link>}
              />
            );
          })}
        </ul>
      </Section>

      <Section
        title="Caixinhas"
        hint="Dinheiro guardado que continua seu, mas fica fora do Saldo total e da Projeção."
        action={<Link href="/contas/nova?tipo=caixinha" className={SECTION_ACTION}>+ Caixinha</Link>}
      >
        {savings.length === 0 && <p className={SECONDARY}>Reserva de emergência e objetivos aparecem aqui.</p>}
        <ul className="space-y-3">
          {savings.map((a) => {
            const months = monthsCovered(a.balanceCents, monthlyExpense);
            const earned = yields.get(a.id) ?? 0;
            return (
              <Row
                key={a.id}
                account={a}
                href={`/lancamentos?conta=${a.id}`}
                subtitle={
                  <>
                    {months !== null ? `Cobre ${String(months).replace(".", ",")} meses de despesas` : "Sem despesas recentes para comparar"}
                    {earned > 0 && <> · rendeu <Amount cents={earned} signed /> em {monthLabel(today.slice(0, 7))}</>}
                  </>
                }
                value={<Amount cents={a.balanceCents} className="font-semibold" />}
                actions={<Link href={`/contas/${a.id}#ajustar`} className={ROW_ACTION}>Ajustar saldo</Link>}
                footer={
                  months !== null && (
                    <div className="space-y-1 pl-9">
                      <Bar percent={Math.min(Math.round((months / SAVINGS_GOAL_MONTHS) * 100), 100)} tone={months >= SAVINGS_GOAL_MONTHS ? "ok" : months >= 3 ? "warn" : "bad"} />
                      <p className="text-xs text-on-surface-variant">Meta sugerida: {SAVINGS_GOAL_MONTHS} meses de despesas (média dos últimos 90 dias: {formatBRL(monthlyExpense)}/mês)</p>
                    </div>
                  )
                }
              />
            );
          })}
        </ul>
      </Section>

      </div>
      <div className="space-y-6 lg:col-span-5">
      <Section
        title="Cartões de crédito"
        hint={
          cards.length > 0 ? (
            <>Faturas a pagar: <Amount cents={invoicesCents} className="font-semibold text-on-surface" />, em ordem de vencimento.</>
          ) : (
            "Cadastre o cartão para a projeção descontar a fatura no vencimento, e não a cada compra."
          )
        }
        action={<Link href="/contas/nova?tipo=cartao" className={SECTION_ACTION}>+ Cartão</Link>}
      >
        <ul className="space-y-3">
          {sortedCards.map(({ card: c, unpaid, next }) => {
            const closesIn = daysBetween(today, closingDateFor(today, c.closingDay!));
            const usage = creditUsage(c.creditLimitCents, Math.max(-c.balanceCents, 0));
            const closed = unpaid.filter((i) => i.status === "fechada").reduce((s, i) => s + i.remainingCents, 0);
            const open = unpaid.filter((i) => i.status === "aberta").reduce((s, i) => s + i.remainingCents, 0);
            return (
              <Row
                key={c.id}
                account={c}
                href={`/cartoes/${c.id}`}
                subtitle={
                  <>
                    {next ? `Vence em ${formatDateBR(next.dueDate)}` : "Nenhuma fatura em aberto"} · {closingText(closesIn)} (dia {c.closingDay})
                  </>
                }
                value={
                  next && (
                    <>
                      <p className="text-xs text-on-surface-variant">Fatura atual</p>
                      <Amount cents={next.remainingCents} className="font-semibold" />
                    </>
                  )
                }
                footer={
                  (usage || (closed > 0 && open > 0)) && (
                    <div className="space-y-2 pl-9">
                      {closed > 0 && open > 0 && (
                        <p className="text-xs text-on-surface-variant">
                          Fechada <Amount cents={closed} className="font-semibold text-on-surface" /> · Aberta <Amount cents={open} className="font-semibold text-on-surface" />
                        </p>
                      )}
                      {usage && (
                        <>
                          <Bar percent={usage.percent} tone={usage.percent >= 90 ? "bad" : usage.percent >= 70 ? "warn" : "ok"} />
                          <p className="text-xs text-on-surface-variant">
                            Limite {formatBRL(c.creditLimitCents!)} · usado {usage.percent}% ({formatBRL(usage.usedCents)}) · disponível {formatBRL(usage.availableCents)}
                          </p>
                        </>
                      )}
                    </div>
                  )
                }
              />
            );
          })}
        </ul>
      </Section>

      {archived.length > 0 && (
        <details className={`${PANEL} group`}>
          <summary className="cursor-pointer list-none font-headline-md text-headline-md">
            Arquivadas <span className={SECONDARY}>({archived.length})</span>
          </summary>
          <ul className="mt-4 space-y-2">
            {archived.map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-xl bg-surface-container-low p-3 opacity-80">
                <KindIcon name={a.name} kind={a.kind} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-body-md text-body-md">{a.name}</p>
                  <p className={SECONDARY}>{ACCOUNT_KIND_LABEL[a.kind]}</p>
                </div>
                <form action={toggleAccountArchived}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="archive" value="0" />
                  <button className="btn px-3 py-1.5 text-xs">Restaurar</button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}
      </div>
      </div>
    </PageShell>
  );
}

function reconciledText(date: string | null): string {
  return date ? `conferido em ${formatDateBR(date).slice(0, 5)}` : "saldo nunca conferido";
}
