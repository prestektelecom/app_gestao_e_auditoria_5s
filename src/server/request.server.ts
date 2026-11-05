// Dados da requisição HTTP atual: cookie de sessão e IP do cliente.
// Só funciona dentro de handlers de servidor (server functions, middleware, rotas de servidor).
import { deleteCookie, getCookie, getRequestIP, setCookie } from "@tanstack/react-start/server";
import { getEnv } from "./env.server";

export const SESSION_COOKIE = "session";

export function readSessionToken() {
  return getCookie(SESSION_COOKIE);
}

export function writeSessionCookie(token: string, maxAgeSeconds: number) {
  setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: getEnv().PUBLIC_ORIGIN.startsWith("https://"),
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export function clearSessionCookie() {
  deleteCookie(SESSION_COOKIE, { path: "/" });
}

export function clientIp(): string | null {
  try {
    return getRequestIP({ xForwardedFor: getEnv().TRUST_PROXY }) ?? null;
  } catch {
    return null;
  }
}
