// Autenticação própria (design D4): senhas bcrypt, sessões opacas e limite de tentativas.
// Funções puras de banco: recebem a transação, não leem cookies nem a requisição.
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { asService, type Tx } from "./db.server";

export const SESSION_DAYS = 30;
export const SESSION_RENEW_AFTER_MS = 24 * 60 * 60 * 1000;
export const RESET_TTL_MINUTES = 60;
export const ATTEMPT_WINDOW_MINUTES = 15;
export const ATTEMPT_LIMIT = 5;
const BCRYPT_COST = 12;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");

export function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_COST);
}

/** Aceita hashes $2a$/$2b$ (inclusive os importados do sistema antigo). */
export async function verifyPassword(password: string, hash: string | null | undefined) {
  if (!hash) return false;
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

// Hash de uma senha qualquer, para comparar quando o e-mail não existe e
// a resposta levar o mesmo tempo (não revela se o e-mail está cadastrado).
const DUMMY_HASH = bcrypt.hashSync("senha-que-ninguem-usa", BCRYPT_COST);

export type AuthUser = { id: string; email: string; name: string };

/** Usuário pode entrar: ativo, com acesso ao sistema e sem bloqueio. */
const CAN_SIGN_IN = `p.active and p.system_access and (u.banned_until is null or u.banned_until <= now())`;

/**
 * Confere e-mail e senha. Devolve o usuário, "inactive" (senha certa, mas sem acesso)
 * ou null (e-mail inexistente ou senha errada: mesma resposta para os dois).
 */
export async function checkCredentials(tx: Tx, email: string, password: string): Promise<AuthUser | "inactive" | null> {
  const rows = await tx<{ id: string; email: string; name: string; encrypted_password: string | null; can: boolean }[]>`
    select u.id, u.email, p.name, u.encrypted_password, (${tx.unsafe(CAN_SIGN_IN)}) as can
    from auth.users u join public.profiles p on p.id = u.id
    where lower(u.email) = ${normalizeEmail(email)}`;
  const row = rows[0];
  const ok = await verifyPassword(password, row?.encrypted_password ?? DUMMY_HASH);
  if (!row || !ok) return null;
  if (!row.can) return "inactive";
  return { id: row.id, email: row.email, name: row.name };
}

// ---------------------------------------------------------------------------
// Sessões
// ---------------------------------------------------------------------------

/** Cria uma sessão e devolve o token que vai no cookie. No banco fica só o sha256. */
export async function createSession(tx: Tx, userId: string) {
  const token = newToken();
  await tx`insert into auth.app_sessions (token_hash, user_id, expires_at)
           values (${sha256(token)}, ${userId}, now() + make_interval(days => ${SESSION_DAYS}))`;
  await tx`update auth.users set last_sign_in_at = now() where id = ${userId}`;
  return { token, maxAgeSeconds: SESSION_DAYS * 24 * 60 * 60 };
}

/**
 * Valida o token do cookie. Devolve o id do usuário, ou null se a sessão não existe,
 * venceu ou o usuário não pode mais entrar (nesse caso a sessão é apagada).
 * Renova a validade se o último uso passou de 1 dia.
 */
export async function validateSession(token: string | undefined | null): Promise<{ userId: string; renewed: boolean } | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const hash = sha256(token);
  return asService(async (tx) => {
    const rows = await tx<{ user_id: string; expired: boolean; can: boolean; stale: boolean }[]>`
      select s.user_id, s.expires_at <= now() as expired, (${tx.unsafe(CAN_SIGN_IN)}) as can,
             s.last_seen_at < now() - make_interval(secs => ${SESSION_RENEW_AFTER_MS / 1000}) as stale
      from auth.app_sessions s
      join auth.users u on u.id = s.user_id
      join public.profiles p on p.id = s.user_id
      where s.token_hash = ${hash}`;
    const s = rows[0];
    if (!s) return null;
    if (s.expired || !s.can) {
      await tx`delete from auth.app_sessions where token_hash = ${hash}`;
      return null;
    }
    if (s.stale) {
      await tx`update auth.app_sessions set last_seen_at = now(),
                 expires_at = now() + make_interval(days => ${SESSION_DAYS}) where token_hash = ${hash}`;
    }
    return { userId: s.user_id, renewed: s.stale };
  });
}

export async function deleteSession(tx: Tx, token: string) {
  await tx`delete from auth.app_sessions where token_hash = ${sha256(token)}`;
}

/** Encerra as sessões de um usuário (ex.: inativado, senha trocada). Pode manter a atual. */
export async function deleteUserSessions(tx: Tx, userId: string, exceptToken?: string) {
  if (exceptToken) {
    await tx`delete from auth.app_sessions where user_id = ${userId} and token_hash <> ${sha256(exceptToken)}`;
  } else {
    await tx`delete from auth.app_sessions where user_id = ${userId}`;
  }
}

// ---------------------------------------------------------------------------
// Limite de tentativas: 5 falhas (login) ou 5 pedidos (reset) por e-mail ou IP em 15 min.
// ---------------------------------------------------------------------------
export type AttemptKind = "login" | "reset";

export async function isRateLimited(tx: Tx, kind: AttemptKind, email: string, ip: string | null) {
  const e = normalizeEmail(email);
  const onlyFailures = kind === "login";
  const [r] = await tx<{ by_email: number; by_ip: number }[]>`
    select
      count(*) filter (where email = ${e})::int as by_email,
      count(*) filter (where ${ip}::text is not null and ip = ${ip})::int as by_ip
    from auth.attempts
    where kind = ${kind}
      and created_at > now() - make_interval(mins => ${ATTEMPT_WINDOW_MINUTES})
      and (${!onlyFailures} or not success)
      and (email = ${e} or ip = ${ip})`;
  return (r?.by_email ?? 0) >= ATTEMPT_LIMIT || (r?.by_ip ?? 0) >= ATTEMPT_LIMIT;
}

export async function recordAttempt(tx: Tx, kind: AttemptKind, email: string, ip: string | null, success: boolean) {
  await tx`insert into auth.attempts (kind, email, ip, success) values (${kind}, ${normalizeEmail(email)}, ${ip}, ${success})`;
  // Limpeza simples: tentativas antigas não servem para nada.
  await tx`delete from auth.attempts where created_at < now() - interval '1 day'`;
}

// ---------------------------------------------------------------------------
// Reset de senha
// ---------------------------------------------------------------------------

/** Cria um token de reset (1 hora, uso único) para o e-mail, se ele existir e puder entrar. */
export async function createPasswordReset(tx: Tx, email: string): Promise<{ token: string; userId: string; name: string } | null> {
  const rows = await tx<{ id: string; name: string }[]>`
    select u.id, p.name from auth.users u join public.profiles p on p.id = u.id
    where lower(u.email) = ${normalizeEmail(email)} and ${tx.unsafe(CAN_SIGN_IN)}`;
  const u = rows[0];
  if (!u) return null;
  const token = newToken();
  await tx`insert into auth.password_resets (token_hash, user_id, expires_at)
           values (${sha256(token)}, ${u.id}, now() + make_interval(mins => ${RESET_TTL_MINUTES}))`;
  return { token, userId: u.id, name: u.name };
}

/** Troca a senha com um token válido. Invalida o token e encerra as sessões do usuário. */
export async function consumePasswordReset(tx: Tx, token: string, newPassword: string): Promise<string | null> {
  const rows = await tx<{ user_id: string }[]>`
    update auth.password_resets set used_at = now()
    where token_hash = ${sha256(token)} and used_at is null and expires_at > now()
    returning user_id`;
  const r = rows[0];
  if (!r) return null;
  await tx`update auth.users set encrypted_password = ${await hashPassword(newPassword)}, updated_at = now() where id = ${r.user_id}`;
  await tx`delete from auth.password_resets where user_id = ${r.user_id} and used_at is null`;
  await deleteUserSessions(tx, r.user_id);
  return r.user_id;
}
