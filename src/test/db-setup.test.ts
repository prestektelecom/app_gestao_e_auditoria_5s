// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { createTestDatabase, hasTestDb } from "./db";
import { setupDatabase } from "../../scripts/db-setup.ts";

describe.skipIf(!hasTestDb)("db:setup", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let sql: postgres.Sql;

  beforeAll(async () => {
    db = await createTestDatabase();
    sql = postgres(db.url, { max: 1, onnotice: () => {} });
  }, 60_000);

  afterAll(async () => {
    await sql?.end();
    await db?.drop();
  });

  it("cria todas as tabelas do app em um banco vazio", async () => {
    const rows = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`;
    const names = rows.map((r) => r.table_name);
    for (const t of ["profiles", "user_roles", "units", "sectors", "auditors", "audits", "audit_answers", "settings", "meetings", "maintenance_notes"]) {
      expect(names).toContain(t);
    }
    expect(names).toHaveLength(23);
    const n = (await sql<{ n: number }[]>`select count(*)::int n from app_meta.migrations`)[0]!.n;
    expect(n).toBe(7);
  });

  it("rodar de novo não altera nada", async () => {
    const before = await sql`select name, applied_at from app_meta.migrations order by name`;
    const logs: string[] = [];
    await setupDatabase(db.url, (m) => logs.push(m));
    const after = await sql`select name, applied_at from app_meta.migrations order by name`;
    expect(after).toEqual(before);
    expect(logs).toContain("schema já estava atualizado");
  }, 60_000);

  it("o primeiro admin pode ser criado (sem admin, has_any_admin é falso)", async () => {
    const has = (await sql<{ has: boolean }[]>`select public.has_any_admin() as has`)[0]!.has;
    expect(has).toBe(false);
  });
});
