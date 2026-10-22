import Image from "next/image";
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
        <Image src="/logo/empilhado-cor-escuro.svg" alt="Saldo Futuro" width={180} height={100} priority className="mx-auto" />
        <p className="mt-3 text-sm text-muted">
          {isPasswordSet(db) ? "Digite sua senha para entrar." : "Primeiro acesso: crie a senha do app."}
        </p>
      </div>
      <LoginForm firstAccess={!isPasswordSet(db)} />
    </main>
  );
}
