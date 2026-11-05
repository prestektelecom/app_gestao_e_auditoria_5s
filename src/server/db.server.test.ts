// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, hasTestDb } from "@/test/db";
import { makeUser } from "@/test/fixtures";
import { asAnon, asService, asUser, createSql, rpc, rpcRows, setSqlForTests, type Sql } from "./db.server";

describe.skipIf(!hasTestDb)("db.server", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let sql: Sql;
  let adminId: string;
  let userId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    sql = createSql(db.url, { max: 1 }); // 1 conexão: prova que nada vaza entre transações
    setSqlForTests(sql);
    adminId = await asService((tx) => makeUser(tx, { email: "admin@teste.com", role: "admin" }));
    userId = await asService((tx) => makeUser(tx, { email: "auditor@teste.com", role: "auditor" }));
  }, 60_000);

  afterAll(async () => {
    setSqlForTests(undefined);
    await sql?.end();
    await db?.drop();
  });

  it("auth.uid() devolve o usuário dentro de asUser", async () => {
    const r = await asUser(userId, (tx) => tx<{ uid: string }[]>`select auth.uid() as uid`);
    expect(r[0]!.uid).toBe(userId);
  });

  it("auth.uid() é nulo em asAnon e o papel é anon", async () => {
    const r = await asAnon((tx) => tx<{ uid: string | null; role: string }[]>`select auth.uid() as uid, current_user as role`);
    expect(r[0]).toEqual({ uid: null, role: "anon" });
  });

  it("a identidade não vaza para a transação seguinte na mesma conexão", async () => {
    await asUser(adminId, (tx) => tx`select 1`);
    const r = await sql<{ uid: string | null; role: string; ip: string | null }[]>`
      select auth.uid() as uid, current_user as role, public.request_ip() as ip`;
    expect(r[0]!.uid).toBeNull();
    expect(r[0]!.role).not.toBe("authenticated");
    expect(r[0]!.ip).toBeNull();
  });

  it("não admin não cria nem altera unidades", async () => {
    await expect(
      asUser(userId, (tx) => tx`insert into public.units (code, name) values ('X1', 'Unidade X')`),
    ).rejects.toThrow("Você não tem permissão para esta ação.");

    const [unit] = await asService((tx) => tx<{ id: string }[]>`insert into public.units (code, name) values ('U1', 'Unidade 1') returning id`);
    const updated = await asUser(userId, (tx) => tx`update public.units set name = 'Hack' where id = ${unit!.id}`);
    expect(updated.count).toBe(0);
    const ok = await asUser(adminId, (tx) => tx`update public.units set name = 'Unidade 1b' where id = ${unit!.id}`);
    expect(ok.count).toBe(1);
  });

  it("usuário logado não lê auditors.custom_pin_hash", async () => {
    await expect(asUser(adminId, (tx) => tx`select custom_pin_hash from public.auditors`)).rejects.toThrow("Você não tem permissão para esta ação.");
  });

  it("request_ip() recebe o IP da requisição", async () => {
    const r = await asAnon((tx) => tx<{ ip: string }[]>`select public.request_ip() as ip`, { ip: "203.0.113.7" });
    expect(r[0]!.ip).toBe("203.0.113.7");
  });

  it("rpc e rpcRows chamam funções com argumentos nomeados", async () => {
    expect(await asAnon((tx) => rpc(tx, "has_any_admin"))).toBe(true);
    expect(await asUser(adminId, (tx) => rpc(tx, "is_admin", { _user_id: adminId }))).toBe(true);
    const people = await asUser(adminId, (tx) => rpcRows(tx, "meeting_people"));
    expect(Array.isArray(people)).toBe(true);
  });

  it("erro do banco chega em português, sem nome de tabela ou constraint", async () => {
    await asService((tx) => tx`insert into public.units (code, name) values ('DUP', 'Unidade A')`);
    const err = await asUser(adminId, (tx) => tx`insert into public.units (code, name) values ('dup', 'Unidade B')`).catch((e: Error) => e);
    expect((err as Error).message).toBe("Já existe uma unidade com este código.");
    expect((err as Error).message).not.toMatch(/units|constraint|duplicate/);
    const bad = await asUser(adminId, (tx) => tx`select * from public.units where id = ${"nao-e-uuid"}`).catch((e: Error) => e);
    expect((bad as Error).message).toBe("Dados inválidos. Verifique os campos.");
  });

  it("datas saem como texto ISO e contagens como número, como no PostgREST", async () => {
    const r = await asService((tx) => tx<{ c: number; t: string; d: string; n: number }[]>`
      select count(*) as c, timestamptz '2026-10-15 13:14:45.37595+00' as t, date '2026-11-05' as d, 7.5::numeric as n from public.profiles`);
    expect(r[0]).toEqual({ c: 2, t: "2026-10-15T13:14:45.37595+00:00", d: "2026-11-05", n: 7.5 });
  });
});
