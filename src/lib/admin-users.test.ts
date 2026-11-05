// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, hasTestDb } from "@/test/db";
import { makeUser } from "@/test/fixtures";
import { asService, createSql, setSqlForTests, type Sql } from "@/server/db.server";
import { checkCredentials, createSession, validateSession } from "@/server/auth.server";
import { createUserAs, EMAIL_IN_USE, NOT_ADMIN, SELF_LOCKOUT, updateUserAs } from "./admin-users.functions";

describe.skipIf(!hasTestDb)("gestão de usuários pelo admin", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let sql: Sql;
  let adminId: string;
  let auditorId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    sql = createSql(db.url, { max: 2 });
    setSqlForTests(sql);
    adminId = await asService((tx) => makeUser(tx, { email: "admin@teste.com", role: "admin" }));
    auditorId = await asService((tx) => makeUser(tx, { email: "auditor@teste.com", role: "auditor" }));
  }, 60_000);

  afterAll(async () => {
    setSqlForTests(undefined);
    await sql?.end();
    await db?.drop();
  });

  const base = { name: "Nova Pessoa", password: "senha-nova-123", role: "manager" as const, system_access: true, active: true };

  it("admin cria usuário que consegue entrar", async () => {
    const { id } = await createUserAs(adminId, { ...base, email: "nova@teste.com" });
    const row = await asService((tx) => tx`select p.name, r.role from public.profiles p join public.user_roles r on r.user_id = p.id where p.id = ${id}`);
    expect(row[0]).toEqual({ name: "Nova Pessoa", role: "manager" });
    // raw_user_meta_data é um objeto jsonb (não uma string JSON).
    const meta = await asService((tx) => tx`select jsonb_typeof(raw_user_meta_data) as t, raw_user_meta_data->>'name' as n from auth.users where id = ${id}`);
    expect(meta[0]).toEqual({ t: "object", n: "Nova Pessoa" });
    expect(await asService((tx) => checkCredentials(tx, "nova@teste.com", "senha-nova-123"))).toMatchObject({ id });
  });

  it("usuário criado inativo não entra", async () => {
    await createUserAs(adminId, { ...base, email: "inativa@teste.com", active: false });
    expect(await asService((tx) => checkCredentials(tx, "inativa@teste.com", "senha-nova-123"))).toBe("inactive");
  });

  it("recusa e-mail repetido ao criar e ao editar", async () => {
    await expect(createUserAs(adminId, { ...base, email: "AUDITOR@teste.com" })).rejects.toThrow(EMAIL_IN_USE);
    await expect(
      updateUserAs(adminId, { id: auditorId, name: "Auditor", email: "admin@teste.com", role: "auditor", system_access: true, active: true }),
    ).rejects.toThrow(EMAIL_IN_USE);
  });

  it("não admin não gerencia usuários", async () => {
    await expect(createUserAs(auditorId, { ...base, email: "x@teste.com" })).rejects.toThrow(NOT_ADMIN);
    await expect(
      updateUserAs(auditorId, { id: auditorId, name: "Auditor", email: "auditor@teste.com", role: "admin", system_access: true, active: true }),
    ).rejects.toThrow(NOT_ADMIN);
  });

  it("admin não remove o próprio acesso", async () => {
    for (const change of [{ active: false }, { system_access: false }, { role: "manager" as const }]) {
      await expect(
        updateUserAs(adminId, { id: adminId, name: "Admin", email: "admin@teste.com", role: "admin", system_access: true, active: true, ...change }),
      ).rejects.toThrow(SELF_LOCKOUT);
    }
  });

  it("inativar encerra as sessões; reativar libera o login", async () => {
    const s = await asService((tx) => createSession(tx, auditorId));
    const edit = { id: auditorId, name: "Auditor", email: "auditor@teste.com", role: "auditor" as const, system_access: true };
    await updateUserAs(adminId, { ...edit, active: false });
    expect(await validateSession(s.token)).toBeNull();
    expect(await asService((tx) => tx`select count(*)::int as n from auth.app_sessions where user_id = ${auditorId}`)).toEqual([{ n: 0 }]);
    await updateUserAs(adminId, { ...edit, active: true, password: "trocada-pelo-admin" });
    const meta = await asService((tx) => tx`select jsonb_typeof(raw_user_meta_data) as t from auth.users where id = ${auditorId}`);
    expect(meta[0]).toEqual({ t: "object" });
    expect(await asService((tx) => checkCredentials(tx, "auditor@teste.com", "trocada-pelo-admin"))).toMatchObject({ id: auditorId });
  });
});
