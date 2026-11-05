// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { createTestDatabase, hasTestDb } from "@/test/db";
import { makeUser } from "@/test/fixtures";
import { asService, createSql, setSqlForTests, type Sql } from "./db.server";
import {
  checkCredentials,
  consumePasswordReset,
  createPasswordReset,
  createSession,
  isRateLimited,
  recordAttempt,
  sha256,
  validateSession,
  verifyPassword,
} from "./auth.server";

describe("verifyPassword", () => {
  it("aceita hash $2a$ (formato das senhas importadas) e recusa senha errada", async () => {
    const h2b = await bcrypt.hash("minha-senha", 4);
    const h2a = h2b.replace(/^\$2b\$/, "$2a$");
    expect(h2a.startsWith("$2a$")).toBe(true);
    expect(await verifyPassword("minha-senha", h2a)).toBe(true);
    expect(await verifyPassword("outra", h2a)).toBe(false);
    expect(await verifyPassword("x", null)).toBe(false);
    expect(await verifyPassword("x", "lixo")).toBe(false);
  });
});

describe.skipIf(!hasTestDb)("auth.server com banco", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let sql: Sql;
  let userId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    sql = createSql(db.url, { max: 2 });
    setSqlForTests(sql);
    userId = await asService((tx) => makeUser(tx, { email: "Pessoa@Teste.com", password: "senha-certa-1" }));
  }, 60_000);

  afterAll(async () => {
    setSqlForTests(undefined);
    await sql?.end();
    await db?.drop();
  });

  it("login confere e-mail sem diferenciar maiúsculas e espaços", async () => {
    const u = await asService((tx) => checkCredentials(tx, "  pessoa@teste.COM ", "senha-certa-1"));
    expect(u).toMatchObject({ id: userId });
    expect(await asService((tx) => checkCredentials(tx, "pessoa@teste.com", "errada"))).toBeNull();
    expect(await asService((tx) => checkCredentials(tx, "naoexiste@teste.com", "senha-certa-1"))).toBeNull();
  });

  it("usuário inativo não entra e sessão aberta é derrubada", async () => {
    const { token } = await asService((tx) => createSession(tx, userId));
    expect((await validateSession(token))?.userId).toBe(userId);
    await asService((tx) => tx`update public.profiles set active = false where id = ${userId}`);
    expect(await asService((tx) => checkCredentials(tx, "pessoa@teste.com", "senha-certa-1"))).toBe("inactive");
    expect(await asService((tx) => checkCredentials(tx, "pessoa@teste.com", "errada"))).toBeNull();
    expect(await validateSession(token)).toBeNull();
    await asService((tx) => tx`update public.profiles set active = true where id = ${userId}`);
  });

  it("sessão vencida é recusada; sessão antiga em uso é renovada", async () => {
    const a = await asService((tx) => createSession(tx, userId));
    await asService((tx) => tx`update auth.app_sessions set expires_at = now() - interval '1 second' where token_hash = ${sha256(a.token)}`);
    expect(await validateSession(a.token)).toBeNull();

    const b = await asService((tx) => createSession(tx, userId));
    await asService((tx) => tx`update auth.app_sessions set last_seen_at = now() - interval '2 days', expires_at = now() + interval '1 day' where token_hash = ${sha256(b.token)}`);
    expect((await validateSession(b.token))?.renewed).toBe(true);
    const [row] = await asService((tx) => tx<{ days: number }[]>`select extract(day from expires_at - now())::int as days from auth.app_sessions where token_hash = ${sha256(b.token)}`);
    expect(row!.days).toBeGreaterThanOrEqual(29);
    expect(await validateSession("token-que-nao-existe-123456")).toBeNull();
  });

  it("bloqueia a 6ª tentativa em 15 minutos, por e-mail e por IP", async () => {
    for (let i = 0; i < 5; i++) {
      expect(await asService((tx) => isRateLimited(tx, "login", "alvo@teste.com", "198.51.100.1"))).toBe(false);
      await asService((tx) => recordAttempt(tx, "login", "alvo@teste.com", "198.51.100.1", false));
    }
    expect(await asService((tx) => isRateLimited(tx, "login", "alvo@teste.com", "198.51.100.99"))).toBe(true);
    expect(await asService((tx) => isRateLimited(tx, "login", "outro@teste.com", "198.51.100.1"))).toBe(true);
    expect(await asService((tx) => isRateLimited(tx, "login", "outro@teste.com", "198.51.100.2"))).toBe(false);
    // Depois de 15 minutos volta a aceitar.
    await asService((tx) => tx`update auth.attempts set created_at = now() - interval '16 minutes' where email = 'alvo@teste.com'`);
    expect(await asService((tx) => isRateLimited(tx, "login", "alvo@teste.com", "198.51.100.1"))).toBe(false);
  });

  it("reset: token de uso único, vence em 1 hora e derruba as sessões", async () => {
    const s = await asService((tx) => createSession(tx, userId));
    const r = await asService((tx) => createPasswordReset(tx, "PESSOA@teste.com"));
    expect(r?.userId).toBe(userId);
    expect(await asService((tx) => createPasswordReset(tx, "ninguem@teste.com"))).toBeNull();

    expect(await asService((tx) => consumePasswordReset(tx, r!.token, "nova-senha-123"))).toBe(userId);
    expect(await asService((tx) => consumePasswordReset(tx, r!.token, "outra-senha-123"))).toBeNull();
    expect(await validateSession(s.token)).toBeNull();
    expect(await asService((tx) => checkCredentials(tx, "pessoa@teste.com", "nova-senha-123"))).toMatchObject({ id: userId });

    const old = await asService((tx) => createPasswordReset(tx, "pessoa@teste.com"));
    await asService((tx) => tx`update auth.password_resets set expires_at = now() - interval '1 minute' where token_hash = ${sha256(old!.token)}`);
    expect(await asService((tx) => consumePasswordReset(tx, old!.token, "mais-uma-123"))).toBeNull();
  });
});
