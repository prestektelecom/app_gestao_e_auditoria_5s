// Fotos em disco com links assinados (design D5, spec file-storage).
//
//   STORAGE_DIR/<bucket>/<storage_path>
//
// Envio: PUT /api/files/upload?t=<token>   (token HMAC de uso único, até 2 h)
// Leitura: GET /api/files/<bucket>/<path>?exp=<unix>&sig=<hmac>   (1 h)
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getEnv } from "./env.server";
import type { Tx } from "./db.server";

export const BUCKETS = ["audit-evidences", "maintenance-images"] as const;
export type Bucket = (typeof BUCKETS)[number];
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const UPLOAD_TTL_SECONDS = 2 * 60 * 60;
export const READ_TTL_SECONDS = 60 * 60;

export class StorageError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export function isBucket(b: string): b is Bucket {
  return (BUCKETS as readonly string[]).includes(b);
}

/** Recusa caminhos que poderiam sair da pasta do bucket. */
export function assertSafePath(p: string) {
  if (!p || p.length > 300) throw new StorageError("Caminho de arquivo inválido.");
  // eslint-disable-next-line no-control-regex -- recusa caracteres de controle de propósito
  if (p.startsWith("/") || p.includes("\\") || p.includes("..") || /[\x00-\x1f\x7f]/.test(p)) {
    throw new StorageError("Caminho de arquivo inválido.");
  }
  for (const seg of p.split("/")) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(seg)) throw new StorageError("Caminho de arquivo inválido.");
  }
}

function rootDir() {
  return path.resolve(getEnv().STORAGE_DIR);
}

export function filePath(bucket: Bucket, p: string) {
  assertSafePath(p);
  const base = path.join(rootDir(), bucket);
  const full = path.resolve(base, ...p.split("/"));
  if (!full.startsWith(base + path.sep)) throw new StorageError("Caminho de arquivo inválido.");
  return full;
}

/** Na inicialização: a pasta existe (ou é criada) e aceita escrita. */
export async function assertStorageWritable() {
  const dir = rootDir();
  try {
    await mkdir(dir, { recursive: true });
    for (const b of BUCKETS) await mkdir(path.join(dir, b), { recursive: true });
    await access(dir, constants.W_OK);
  } catch (err) {
    throw new Error(`STORAGE_DIR (${dir}) não existe ou não aceita escrita: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Assinaturas
// ---------------------------------------------------------------------------
const b64 = (s: string) => Buffer.from(s).toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString("utf8");

function hmac(value: string) {
  return createHmac("sha256", getEnv().SESSION_SECRET).update(value).digest("base64url");
}

function sameSig(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const nowSec = () => Math.floor(Date.now() / 1000);

type UploadPayload = { b: Bucket; p: string; e: number; n: string };

/** Autorização de envio para um caminho. Devolve a URL relativa que o navegador usa no PUT. */
export function createUploadUrl(bucket: Bucket, p: string, ttlSeconds = UPLOAD_TTL_SECONDS) {
  assertSafePath(p);
  const payload: UploadPayload = { b: bucket, p, e: nowSec() + Math.min(ttlSeconds, UPLOAD_TTL_SECONDS), n: randomBytes(12).toString("base64url") };
  const body = b64(JSON.stringify(payload));
  return `/api/files/upload?t=${body}.${hmac(`upload|${body}`)}`;
}

/** Valida o token de envio e marca o nonce como usado (no mesmo commit do upload). */
export async function consumeUploadToken(tx: Tx, token: string | null): Promise<{ bucket: Bucket; path: string }> {
  const [body, sig] = (token ?? "").split(".");
  if (!body || !sig || !sameSig(sig, hmac(`upload|${body}`))) throw new StorageError("Autorização de envio inválida.", 403);
  let payload: UploadPayload;
  try {
    payload = JSON.parse(unb64(body)) as UploadPayload;
  } catch {
    throw new StorageError("Autorização de envio inválida.", 403);
  }
  if (!isBucket(payload.b) || typeof payload.p !== "string" || typeof payload.n !== "string") {
    throw new StorageError("Autorização de envio inválida.", 403);
  }
  if (payload.e < nowSec()) throw new StorageError("Autorização de envio expirada.", 403);
  assertSafePath(payload.p);
  const used = await tx`insert into storage.upload_nonces (nonce, expires_at)
                        values (${payload.n}, to_timestamp(${payload.e}))
                        on conflict (nonce) do nothing`;
  if (used.count === 0) throw new StorageError("Autorização de envio já utilizada.", 403);
  await tx`delete from storage.upload_nonces where expires_at < now() - interval '1 day'`;
  return { bucket: payload.b, path: payload.p };
}

/** Link de leitura com validade. */
export function createReadUrl(bucket: Bucket, p: string, ttlSeconds = READ_TTL_SECONDS) {
  assertSafePath(p);
  const exp = nowSec() + ttlSeconds;
  const sig = hmac(`read|${bucket}|${p}|${exp}`);
  return `/api/files/${bucket}/${p.split("/").map(encodeURIComponent).join("/")}?exp=${exp}&sig=${sig}`;
}

export function verifyReadUrl(bucket: string, p: string, exp: string | null, sig: string | null) {
  if (!isBucket(bucket)) return false;
  try {
    assertSafePath(p);
  } catch {
    return false;
  }
  const e = Number(exp);
  if (!Number.isInteger(e) || e < nowSec() || !sig) return false;
  return sameSig(sig, hmac(`read|${bucket}|${p}|${e}`));
}

/** Monta { caminho: url } no formato que as telas já usavam. */
export function readUrlMap(bucket: Bucket, paths: string[]) {
  const out: Record<string, string> = {};
  for (const p of paths) {
    try {
      out[p] = createReadUrl(bucket, p);
    } catch {
      // caminho inválido: fica de fora, a tela mostra a foto como indisponível
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Arquivos
// ---------------------------------------------------------------------------

/** Tipo pelos primeiros bytes: só JPEG, PNG e WebP. */
export function sniffImage(buf: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => buf[i] === b)) return "image/png";
  if (buf.length >= 12 && Buffer.from(buf.subarray(0, 4)).toString("latin1") === "RIFF" && Buffer.from(buf.subarray(8, 12)).toString("latin1") === "WEBP") {
    return "image/webp";
  }
  return null;
}

export function contentTypeFor(p: string) {
  const ext = p.toLowerCase().split(".").pop();
  return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
}

export async function saveFile(bucket: Bucket, p: string, data: Uint8Array) {
  if (data.byteLength > MAX_UPLOAD_BYTES) throw new StorageError("A foto passa de 10 MB.", 413);
  if (!sniffImage(data)) throw new StorageError("O arquivo não é uma imagem JPEG, PNG ou WebP.", 415);
  const full = filePath(bucket, p);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
}

export async function removeFiles(bucket: Bucket, paths: string[]) {
  for (const p of paths) {
    try {
      await rm(filePath(bucket, p), { force: true });
    } catch {
      // caminho inválido: nada a apagar
    }
  }
}
