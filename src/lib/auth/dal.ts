import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "../db/connection";
import { createSession, destroySession, validateSession, MAX_SESSION_MS } from "./sessions";

export const SESSION_COOKIE = "sf_session";

/** Checagem segura (consulta o banco). Use em toda página e Server Action protegida. */
export const verifySession = cache(async (): Promise<void> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!validateSession(getDb(), token)) redirect("/login");
});

export async function openSession(): Promise<void> {
  const token = createSession(getDb());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.COOKIE_SECURE === "1", // padrão http: o servidor só escuta em 127.0.0.1
    path: "/",
    maxAge: MAX_SESSION_MS / 1000,
  });
}

export async function closeSession(): Promise<void> {
  const store = await cookies();
  destroySession(getDb(), store.get(SESSION_COOKIE)?.value);
  store.delete(SESSION_COOKIE);
}
