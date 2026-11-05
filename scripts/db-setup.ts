// Cria (ou atualiza) o schema do app em um PostgreSQL comum.
//
//   npm run db:setup
//
// 1. Aplica drizzle/compat/supabase_compat.sql (idempotente, roda sempre).
// 2. Aplica as migrations de drizzle/migrations/ na ordem do _journal.json,
//    pulando as já registradas em app_meta.migrations.
//
// Usa DATABASE_URL (lido do ambiente ou do .env). O usuário precisa ser o dono
// do banco e ter CREATEROLE na primeira execução.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function setupDatabase(databaseUrl: string, log: (msg: string) => void = console.log) {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await sql.unsafe(readFileSync(path.join(root, "drizzle/compat/supabase_compat.sql"), "utf8"));
    log("compatibilidade aplicada");

    const journal = JSON.parse(readFileSync(path.join(root, "drizzle/migrations/meta/_journal.json"), "utf8")) as {
      entries: { tag: string }[];
    };
    const applied = new Set((await sql<{ name: string }[]>`select name from app_meta.migrations`).map((r) => r.name));

    let count = 0;
    for (const { tag } of journal.entries) {
      if (applied.has(tag)) continue;
      const file = readFileSync(path.join(root, "drizzle/migrations", `${tag}.sql`), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(file);
        await tx`insert into app_meta.migrations (name) values (${tag})`;
      });
      log(`migration aplicada: ${tag}`);
      count++;
    }
    log(count ? `${count} migration(s) aplicada(s)` : "schema já estava atualizado");
  } finally {
    await sql.end();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (existsSync(path.join(root, ".env"))) process.loadEnvFile(path.join(root, ".env"));
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Falta a variável DATABASE_URL.");
    process.exit(1);
  }
  setupDatabase(url).catch((err) => {
    console.error("Falha no setup do banco:", err.message ?? err);
    process.exit(1);
  });
}
