// Middleware das server functions da área logada.
//
// Este arquivo é importado por *.functions.ts, que também vão para o bundle do
// navegador. Por isso o código de servidor fica em import() dentro de .server():
// o compilador do TanStack Start remove esse trecho do bundle do cliente.
import { createMiddleware } from "@tanstack/react-start";

export const UNAUTHORIZED = "Não autorizado: faça login novamente.";

export type UserContext = { userId: string; ip: string | null };

/** Exige sessão válida de um usuário ativo. Coloca userId e ip no contexto. */
export const requireUser = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { readSessionToken, writeSessionCookie, clientIp } = await import("@/server/request.server");
  const { validateSession, SESSION_DAYS } = await import("@/server/auth.server");
  const token = readSessionToken();
  const session = await validateSession(token);
  if (!session) throw new Error(UNAUTHORIZED);
  if (session.renewed && token) writeSessionCookie(token, SESSION_DAYS * 24 * 60 * 60);
  return next({ context: { userId: session.userId, ip: clientIp() } satisfies UserContext });
});

/** Fluxos públicos (QR): só coloca o ip no contexto. */
export const withRequestInfo = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { clientIp } = await import("@/server/request.server");
  return next({ context: { ip: clientIp() } });
});
