// Copia os dados do Supabase (backup restaurado num banco de staging) para o banco novo.
//
//   npm run db:migrate-from-supabase            # banco novo precisa estar vazio
//   npm run db:migrate-from-supabase -- --replace   # apaga os dados do banco novo antes (ensaio repetido)
//
// Antes:
//   1. createdb supabase_dump && pg_restore --no-owner --no-privileges -d supabase_dump backup.backup
//      (pg_restore 18 com zstd; erros de extensões/papéis do Supabase são esperados)
//   2. npm run db:setup   (schema no banco novo)
//
// Variáveis: SOURCE_DATABASE_URL (staging) e DATABASE_URL (banco novo), do ambiente ou do .env.
//
// O que faz (design D6): numa única transação no banco novo, desliga os triggers de
// usuário (handle_new_user, versão do checklist, imutabilidade do token do setor...),
// copia auth.users (só as colunas que o app usa) e cada tabela de public na ordem das
// FKs, acerta as sequences, religa os triggers e confere a contagem de cada tabela.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const AUTH_USER_COLUMNS = [
  "id", "email", "encrypted_password", "raw_user_meta_data", "email_confirmed_at",
  "banned_until", "last_sign_in_at", "created_at", "updated_at",
];

type Report = { table: string; source: number; target: number }[];

const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`;

/** Tabelas de public em ordem que respeita as FKs (pais antes dos filhos). */
async function tablesInFkOrder(sql: postgres.Sql) {
  const tables = (await sql<{ t: string }[]>`
    select c.relname as t from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by 1`).map((r) => r.t);
  const edges = await sql<{ child: string; parent: string }[]>`
    select c.relname as child, p.relname as parent
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid and c.relnamespace = 'public'::regnamespace
    join pg_class p on p.oid = k.confrelid and p.relnamespace = 'public'::regnamespace
    where k.contype = 'f' and c.oid <> p.oid`;
  const deps = new Map(tables.map((t) => [t, new Set<string>()]));
  for (const e of edges) deps.get(e.child)?.add(e.parent);
  const out: string[] = [];
  const done = new Set<string>();
  while (out.length < tables.length) {
    const ready = tables.filter((t) => !done.has(t) && [...deps.get(t)!].every((p) => done.has(p)));
    if (!ready.length) throw new Error("Ciclo de FKs entre as tabelas de public.");
    for (const t of ready) {
      done.add(t);
      out.push(t);
    }
  }
  return out;
}

async function columnsOf(sql: postgres.Sql, schema: string, table: string) {
  return (await sql<{ c: string }[]>`
    select a.attname as c from pg_attribute a
    join pg_class t on t.oid = a.attrelid join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = ${schema} and t.relname = ${table} and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
    order by a.attnum`).map((r) => r.c);
}

async function count(sql: postgres.Sql | postgres.TransactionSql, schema: string, table: string) {
  const [r] = await sql.unsafe<{ n: number }[]>(`select count(*)::int as n from ${q(schema)}.${q(table)}`);
  return r!.n;
}

/**
 * Copia uma tabela: o staging gera o JSON das linhas e o banco novo insere com
 * json_populate_recordset, que converte cada campo para o tipo da coluna
 * (datas com fuso, numeric, arrays e jsonb saem exatos). As tabelas do app são
 * pequenas (milhares de linhas), então uma passada por tabela basta.
 */
async function copyTable(
  source: postgres.Sql,
  tx: postgres.TransactionSql,
  schema: string,
  table: string,
  columns: string[],
) {
  const cols = columns.map(q).join(", ");
  const [r] = await source.unsafe<{ j: string }[]>(
    `select coalesce(json_agg(x), '[]')::text as j from (select ${cols} from ${q(schema)}.${q(table)}) x`,
  );
  // ::text::json: o parâmetro vai como texto puro (sem o driver codificar de novo).
  await tx.unsafe(
    `insert into ${q(schema)}.${q(table)} (${cols})
     select ${cols} from json_populate_recordset(null::${q(schema)}.${q(table)}, $1::text::json)`,
    [r!.j],
  );
}

export async function migrateFromSupabase(
  sourceUrl: string,
  targetUrl: string,
  opts: { replace?: boolean; log?: (m: string) => void } = {},
): Promise<Report> {
  const log = opts.log ?? console.log;
  const source = postgres(sourceUrl, { max: 1, onnotice: () => {} });
  const target = postgres(targetUrl, { max: 1, onnotice: () => {} });
  try {
    const [{ ok } = { ok: false }] = await target<{ ok: boolean }[]>`select to_regclass('app_meta.migrations') is not null as ok`;
    if (!ok) throw new Error("O banco novo não tem o schema. Rode `npm run db:setup` antes.");

    const tables = await tablesInFkOrder(target);
    const sourceTables = new Set(
      (await source<{ t: string }[]>`select relname as t from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'`).map((r) => r.t),
    );
    const missing = tables.filter((t) => !sourceTables.has(t));
    if (missing.length) throw new Error(`O staging não tem as tabelas: ${missing.join(", ")}. O backup foi restaurado?`);

    // Banco novo sem usuários, a menos que --replace. (As migrations já inserem os
    // parâmetros padrão em settings; eles são substituídos pelos do backup.)
    const existing = await count(target, "auth", "users");
    if (existing > 0 && !opts.replace) {
      throw new Error(`O banco novo já tem ${existing} usuário(s). Use --replace para apagar e importar de novo.`);
    }

    const report: Report = [];
    await target.begin(async (tx) => {
      if (existing > 0) log("apagando os dados atuais do banco novo (--replace)...");
      await tx.unsafe(`truncate ${["auth.users", ...tables.map((t) => `public.${q(t)}`)].join(", ")} cascade`);
      const all = [{ schema: "auth", table: "users" }, ...tables.map((t) => ({ schema: "public", table: t }))];
      for (const { schema, table } of all) await tx.unsafe(`alter table ${q(schema)}.${q(table)} disable trigger user`);

      const srcUserCols = new Set(await columnsOf(source, "auth", "users"));
      await copyTable(source, tx, "auth", "users", AUTH_USER_COLUMNS.filter((c) => srcUserCols.has(c)));
      report.push({ table: "auth.users", source: await count(source, "auth", "users"), target: await count(tx, "auth", "users") });

      for (const t of tables) {
        const srcCols = new Set(await columnsOf(source, "public", t));
        const cols = (await columnsOf(tx as unknown as postgres.Sql, "public", t)).filter((c) => srcCols.has(c));
        await copyTable(source, tx, "public", t, cols);
        report.push({ table: `public.${t}`, source: await count(source, "public", t), target: await count(tx, "public", t) });
      }

      // Sequences de public: mesmo valor do staging (números de auditoria, nota, reunião, ids).
      const seqs = await source<{ name: string; last_value: string | null; is_called: boolean }[]>`
        select s.sequencename as name, s.last_value::text, (s.last_value is not null) as is_called
        from pg_sequences s where s.schemaname = 'public'`;
      for (const s of seqs) {
        const [exists] = await tx`select 1 from pg_sequences where schemaname = 'public' and sequencename = ${s.name}`;
        if (!exists) continue;
        if (s.last_value === null) await tx`select setval(${`public.${q(s.name)}`}, 1, false)`;
        else await tx`select setval(${`public.${q(s.name)}`}, ${s.last_value}::bigint, true)`;
      }
      log(`${seqs.length} sequence(s) ajustada(s)`);

      for (const { schema, table } of all) await tx.unsafe(`alter table ${q(schema)}.${q(table)} enable trigger user`);

      const bad = report.filter((r) => r.source !== r.target);
      if (bad.length) throw new Error(`Contagem diferente em: ${bad.map((b) => `${b.table} (${b.source} -> ${b.target})`).join(", ")}`);
    });
    return report;
  } finally {
    await source.end();
    await target.end();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (existsSync(path.join(root, ".env"))) process.loadEnvFile(path.join(root, ".env"));
  const src = process.env.SOURCE_DATABASE_URL;
  const dst = process.env.DATABASE_URL;
  if (!src || !dst) {
    console.error("Defina SOURCE_DATABASE_URL (staging com o backup) e DATABASE_URL (banco novo).");
    process.exit(1);
  }
  migrateFromSupabase(src, dst, { replace: process.argv.includes("--replace") })
    .then((report) => {
      const w = Math.max(...report.map((r) => r.table.length));
      console.log("\nTabela".padEnd(w + 2) + "staging  novo");
      for (const r of report) console.log(`${r.table.padEnd(w + 1)} ${String(r.source).padStart(7)}  ${String(r.target).padStart(4)}  ok`);
      console.log(`\nImportação concluída: ${report.length} tabelas, todas as contagens batem.`);
    })
    .catch((err) => {
      console.error("Falha na importação:", err.message ?? err);
      process.exit(1);
    });
}
