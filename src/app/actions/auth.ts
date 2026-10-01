"use server";

import { redirect } from "next/navigation";
import { closeSession, openSession } from "@/lib/auth/dal";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { checkPassword, isPasswordSet, setInitialPassword } from "@/lib/auth/sessions";
import { loginThrottle } from "@/lib/auth/throttle";
import { getDb } from "@/lib/db/connection";
import type { FormState } from "@/lib/forms";

export async function setupPassword(_: FormState, fd: FormData): Promise<FormState> {
  const db = getDb();
  if (isPasswordSet(db)) return { error: "A senha já foi definida. Entre com ela." };

  const password = String(fd.get("password") ?? "");
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Use pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }
  if (password !== String(fd.get("confirm") ?? "")) return { error: "As senhas não conferem." };

  setInitialPassword(db, password);
  await openSession();
  redirect("/");
}

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const throttle = loginThrottle();
  const locked = throttle.lockedFor();
  if (locked > 0) {
    return { error: `Muitas tentativas. Tente novamente em ${Math.ceil(locked / 60000)} min.` };
  }

  if (!checkPassword(getDb(), String(fd.get("password") ?? ""))) {
    throttle.recordFailure();
    return { error: "Senha incorreta." };
  }
  throttle.recordSuccess();
  await openSession();
  redirect("/");
}

export async function logout(): Promise<void> {
  await closeSession();
  redirect("/login");
}
