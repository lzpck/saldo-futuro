"use client";

import { useActionState } from "react";
import { login, setupPassword } from "../actions/auth";

export function LoginForm({ firstAccess }: { firstAccess: boolean }) {
  const [state, action, pending] = useActionState(firstAccess ? setupPassword : login, undefined);

  return (
    <form action={action} className="card space-y-4">
      <div>
        <label htmlFor="password" className="label">
          {firstAccess ? "Nova senha" : "Senha"}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={firstAccess ? "new-password" : "current-password"}
          autoFocus
          required
          className="input"
        />
      </div>
      {firstAccess && (
        <div>
          <label htmlFor="confirm" className="label">
            Confirmar senha
          </label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className="input" />
        </div>
      )}
      {state?.error && <p className="error">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "Entrando…" : firstAccess ? "Criar senha e entrar" : "Entrar"}
      </button>
    </form>
  );
}
