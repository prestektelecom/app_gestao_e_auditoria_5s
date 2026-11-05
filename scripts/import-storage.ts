// Copia as fotos do Supabase de origem para STORAGE_DIR (spec file-storage).
//
//   npm run storage:import              # baixa o que falta
//   npm run storage:import -- --dry-run # só lista o que seria baixado
//
// Só baixa arquivos que algum registro usa: audit_evidences.storage_path e
// maintenance_note_images.storage_path (os 19 arquivos sem dono do backup ficam de fora).
// Arquivos que já existem na pasta são pulados, então pode rodar de novo.
//
// Variáveis: DATABASE_URL (banco novo, já migrado), STORAGE_DIR,
// SOURCE_SUPABASE_URL e SOURCE_SUPABASE_SERVICE_KEY (chave de serviço do projeto antigo).
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Mesma regra de src/server/storage.server.ts#assertSafePath.
function safe(p: string) {
  // eslint-disable-next-line no-control-regex -- recusa caracteres de controle de propósito
  if (!p || p.length > 300 || p.startsWith("/") || p.includes("\\") || p.includes("..") || /[\x00-\x1f\x7f]/.test(p)) return false;
  return p.split("/").every((seg) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(seg));
}

export type ImportResult = { copied: string[]; skipped: string[]; failed: { file: string; reason: string }[] };

export async function importStorage(opts: {
  databaseUrl: string;
  storageDir: string;
  sourceUrl: string;
  serviceKey: string;
  dryRun?: boolean;
  log?: (m: string) => void;
}): Promise<ImportResult> {
  const log = opts.log ?? console.log;
  const sql = postgres(opts.databaseUrl, { max: 1, onnotice: () => {} });
  const result: ImportResult = { copied: [], skipped: [], failed: [] };
  try {
    const files = await sql<{ bucket: string; path: string }[]>`
      select 'audit-evidences' as bucket, storage_path as path from public.audit_evidences
      union select 'maintenance-images', storage_path from public.maintenance_note_images
      order by 1, 2`;
    log(`${files.length} arquivo(s) referenciado(s) no banco`);
    const base = opts.sourceUrl.replace(/\/+$/, "");
    for (const f of files) {
      const id = `${f.bucket}/${f.path}`;
      if (!safe(f.path)) {
        result.failed.push({ file: id, reason: "caminho inválido" });
        continue;
      }
      const dest = path.join(path.resolve(opts.storageDir), f.bucket, ...f.path.split("/"));
      if (existsSync(dest)) {
        result.skipped.push(id);
        continue;
      }
      if (opts.dryRun) {
        log(`baixaria: ${id}`);
        continue;
      }
      try {
        const url = `${base}/storage/v1/object/${f.bucket}/${f.path.split("/").map(encodeURIComponent).join("/")}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${opts.serviceKey}`, apikey: opts.serviceKey } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = new Uint8Array(await res.arrayBuffer());
        await mkdir(path.dirname(dest), { recursive: true });
        await writeFile(dest, data);
        result.copied.push(id);
        log(`ok: ${id} (${Math.round(data.byteLength / 1024)} KB)`);
      } catch (err) {
        result.failed.push({ file: id, reason: (err as Error).message });
      }
    }
    return result;
  } finally {
    await sql.end();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (existsSync(path.join(root, ".env"))) process.loadEnvFile(path.join(root, ".env"));
  const env = process.env;
  const missing = ["DATABASE_URL", "STORAGE_DIR", "SOURCE_SUPABASE_URL", "SOURCE_SUPABASE_SERVICE_KEY"].filter((k) => !env[k]);
  if (missing.length) {
    console.error(`Defina: ${missing.join(", ")}`);
    process.exit(1);
  }
  importStorage({
    databaseUrl: env.DATABASE_URL!,
    storageDir: env.STORAGE_DIR!,
    sourceUrl: env.SOURCE_SUPABASE_URL!,
    serviceKey: env.SOURCE_SUPABASE_SERVICE_KEY!,
    dryRun: process.argv.includes("--dry-run"),
  })
    .then((r) => {
      console.log(`\nCopiados: ${r.copied.length} | já existiam: ${r.skipped.length} | falharam: ${r.failed.length}`);
      for (const f of r.failed) console.log(`  FALHOU ${f.file}: ${f.reason}`);
      if (r.failed.length) process.exitCode = 2;
    })
    .catch((err) => {
      console.error("Falha na importação de fotos:", err.message ?? err);
      process.exit(1);
    });
}
