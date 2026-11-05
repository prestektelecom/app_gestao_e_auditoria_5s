// Server functions de login, sessão, primeiro admin e reset de senha (spec user-auth).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withRequestInfo } from "./middleware";

export const INVALID_CREDENTIALS = "E-mail ou senha inválidos.";
export const INACTIVE_ACCOUNT = "Seu acesso está inativo. Procure o administrador.";
export const TOO_MANY_ATTEMPTS = "Muitas tentativas. Aguarde alguns minutos.";
export const RESET_INVALID = "Link inválido ou expirado. Solicite um novo.";

const emailSchema = z.string().trim().toLowerCase().email("E-mail inválido").max(255);
const passwordSchema = z.string().min(8, "A senha deve ter ao menos 8 caracteres.").max(72, "A senha pode ter no máximo 72 caracteres.");

export type Me = {
  user: { id: string; email: string };
  profile: { id: string; name: string; email: string; system_access: boolean; active: boolean } | null;
  role: "admin" | "auditor" | "manager" | "director" | null;
};

/** Usuário logado (ou null). Não lança erro sem sessão: é o que a tela de login consulta. */
export const getMe = createServerFn({ method: "GET" }).handler(async (): Promise<Me | null> => {
  const { readSessionToken, writeSessionCookie } = await import("@/server/request.server");
  const { validateSession, SESSION_DAYS } = await import("@/server/auth.server");
  const { asUser } = await import("@/server/db.server");
  const token = readSessionToken();
  const s = await validateSession(token);
  if (!s) return null;
  if (s.renewed && token) writeSessionCookie(token, SESSION_DAYS * 24 * 60 * 60);
  return asUser(s.userId, async (tx) => {
    const [profile] = await tx<NonNullable<Me["profile"]>[]>`
      select id, name, email, system_access, active from public.profiles where id = ${s.userId}`;
    const [role] = await tx<{ role: Me["role"] }[]>`select role from public.user_roles where user_id = ${s.userId}`;
    return { user: { id: s.userId, email: profile?.email ?? "" }, profile: profile ?? null, role: role?.role ?? null };
  });
});

export const login = createServerFn({ method: "POST" })
  .middleware([withRequestInfo])
  .inputValidator((d) => z.object({ email: z.string().max(255), password: z.string().max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { asService } = await import("@/server/db.server");
    const auth = await import("@/server/auth.server");
    const { writeSessionCookie } = await import("@/server/request.server");
    const result = await asService(async (tx) => {
      if (await auth.isRateLimited(tx, "login", data.email, context.ip)) return { error: TOO_MANY_ATTEMPTS } as const;
      const user = await auth.checkCredentials(tx, data.email, data.password);
      await auth.recordAttempt(tx, "login", data.email, context.ip, typeof user === "object" && user !== null);
      if (user === null) return { error: INVALID_CREDENTIALS } as const;
      if (user === "inactive") return { error: INACTIVE_ACCOUNT } as const;
      return { session: await auth.createSession(tx, user.id) } as const;
    });
    if ("error" in result) throw new Error(result.error);
    writeSessionCookie(result.session.token, result.session.maxAgeSeconds);
    return { ok: true };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const { readSessionToken, clearSessionCookie } = await import("@/server/request.server");
  const { deleteSession } = await import("@/server/auth.server");
  const { asService } = await import("@/server/db.server");
  const token = readSessionToken();
  if (token) await asService((tx) => deleteSession(tx, token));
  clearSessionCookie();
  return { ok: true };
});

export const hasAnyAdmin = createServerFn({ method: "GET" }).handler(async () => {
  const { asAnon, rpc } = await import("@/server/db.server");
  return asAnon((tx) => rpc(tx, "has_any_admin"));
});

/** Cadastro pela tela de login: só enquanto não existe nenhum admin. A conta nasce admin e já entra. */
export const bootstrapAdmin = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ name: z.string().trim().min(2, "Nome obrigatório").max(120), email: emailSchema, password: passwordSchema }).parse(d),
  )
  .handler(async ({ data }) => {
    const { asService } = await import("@/server/db.server");
    const auth = await import("@/server/auth.server");
    const { writeSessionCookie } = await import("@/server/request.server");
    const session = await asService(async (tx) => {
      // Serializa cadastros simultâneos: só o primeiro vê "sem admin".
      await tx`lock table public.user_roles in share row exclusive mode`;
      const [{ exists } = { exists: true }] = await tx<{ exists: boolean }[]>`select exists (select 1 from public.user_roles where role = 'admin') as exists`;
      if (exists) throw new Error("Já existe um administrador. Peça a ele para criar o seu acesso.");
      const [dup] = await tx`select 1 from auth.users where lower(email) = ${data.email}`;
      if (dup) throw new Error("Este e-mail já está em uso.");
      const hash = await auth.hashPassword(data.password);
      const [u] = await tx<{ id: string }[]>`
        insert into auth.users (email, encrypted_password, raw_user_meta_data, email_confirmed_at)
        values (${data.email}, ${hash}, ${tx.json({ name: data.name })}, now()) returning id`;
      // O trigger handle_new_user cria o perfil e, sem admin, o papel admin. Garante mesmo assim.
      await tx`insert into public.user_roles (user_id, role) values (${u!.id}, 'admin')
               on conflict (user_id) do update set role = 'admin'`;
      return auth.createSession(tx, u!.id);
    });
    writeSessionCookie(session.token, session.maxAgeSeconds);
    return { ok: true };
  });

export const requestPasswordReset = createServerFn({ method: "POST" })
  .middleware([withRequestInfo])
  .inputValidator((d) => z.object({ email: z.string().max(255) }).parse(d))
  .handler(async ({ data, context }) => {
    const { asService } = await import("@/server/db.server");
    const auth = await import("@/server/auth.server");
    const { getEnv, smtpConfigured } = await import("@/server/env.server");
    const { sendPasswordResetEmail, MAIL_NOT_CONFIGURED } = await import("@/server/mail.server");
    const env = getEnv();
    if (!smtpConfigured(env)) {
      console.warn("[reset de senha] SMTP não configurado (SMTP_HOST/SMTP_FROM); e-mail não enviado.");
      throw new Error(MAIL_NOT_CONFIGURED);
    }
    const reset = await asService(async (tx) => {
      if (await auth.isRateLimited(tx, "reset", data.email, context.ip)) return "limited" as const;
      await auth.recordAttempt(tx, "reset", data.email, context.ip, true);
      return auth.createPasswordReset(tx, data.email);
    });
    if (reset === "limited") throw new Error(TOO_MANY_ATTEMPTS);
    if (reset) {
      const link = `${env.PUBLIC_ORIGIN}/reset-password?token=${encodeURIComponent(reset.token)}`;
      try {
        await sendPasswordResetEmail(auth.normalizeEmail(data.email), reset.name, link);
      } catch (err) {
        console.error("[reset de senha] falha no envio:", err);
        throw new Error("Não foi possível enviar o e-mail agora. Tente novamente mais tarde.");
      }
    }
    // Mesma resposta para e-mail cadastrado ou não.
    return { ok: true };
  });

export const resetPassword = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().min(20).max(200), password: passwordSchema }).parse(d))
  .handler(async ({ data }) => {
    const { asService } = await import("@/server/db.server");
    const { consumePasswordReset } = await import("@/server/auth.server");
    const { clearSessionCookie } = await import("@/server/request.server");
    const userId = await asService((tx) => consumePasswordReset(tx, data.token, data.password));
    if (!userId) throw new Error(RESET_INVALID);
    clearSessionCookie();
    return { ok: true };
  });
