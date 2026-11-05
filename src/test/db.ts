// Banco de teste descartável para os testes que precisam de Postgres.
//
// TEST_DATABASE_URL aponta para um Postgres 17+ com um usuário que pode criar
// bancos (ex.: postgres://postgres@localhost:5432/postgres). Cada arquivo de
// teste cria um banco novo, aplica o schema e apaga no fim.
// Sem TEST_DATABASE_URL, use `describe.skipIf(!hasTestDb)`.
import postgres from "postgres";
import { randomBytes } from "node:crypto";
import { setupDatabase } from "../../scripts/db-setup.ts";

export const testDbUrl = process.env["TEST_DATABASE_URL"] ?? "";
export const hasTestDb = testDbUrl !== "";

export async function createTestDatabase() {
  const name = `app_t_${randomBytes(4).toString("hex")}`;
  const admin = postgres(testDbUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe(`create database ${name}`);
  await admin.end();
  const url = new URL(testDbUrl);
  url.pathname = `/${name}`;
  await setupDatabase(url.toString(), () => {});
  return {
    url: url.toString(),
    async drop() {
      const a = postgres(testDbUrl, { max: 1, onnotice: () => {} });
      await a.unsafe(`drop database if exists ${name} with (force)`);
      await a.end();
    },
  };
}
