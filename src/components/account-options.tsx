import { accountLabel, groupAccountOptions } from "@/lib/account-options";
import type { Account } from "@/lib/repos/accounts";

/** `<option>`s de um seletor de Conta, em grupos Contas / Cartões / Arquivadas e favoritas primeiro. */
export function AccountOptions({ accounts }: { accounts: Account[] }) {
  return groupAccountOptions(accounts).map((g) => (
    <optgroup key={g.label} label={g.label}>
      {g.accounts.map((a) => (
        <option key={a.id} value={a.id}>{accountLabel(a)}</option>
      ))}
    </optgroup>
  ));
}
