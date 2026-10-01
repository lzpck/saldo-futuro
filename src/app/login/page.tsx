import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/dal";
import { isPasswordSet, validateSession } from "@/lib/auth/sessions";
import { getDb } from "@/lib/db/connection";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const db = getDb();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (validateSession(db, token)) redirect("/");

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-xl font-bold text-accent-fg">
          S
        </div>
        <h1 className="text-2xl font-semibold">Saldo Futuro</h1>
        <p className="mt-1 text-sm text-muted">
          {isPasswordSet(db) ? "Digite sua senha para entrar." : "Primeiro acesso: crie a senha do app."}
        </p>
      </div>
      <LoginForm firstAccess={!isPasswordSet(db)} />
    </main>
  );
}
