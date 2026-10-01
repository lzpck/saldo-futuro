import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Checagem otimista: só olha se há cookie de sessão. A validação de verdade (banco,
// inatividade) acontece em verifySession(), próximo dos dados.
export function proxy(request: NextRequest) {
  const hasCookie = request.cookies.has("sf_session");
  const isLogin = request.nextUrl.pathname === "/login";
  if (!hasCookie && !isLogin) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico)$).*)"],
};
