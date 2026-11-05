// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = await mkdtemp(path.join(tmpdir(), "files-"));
vi.mock("./env.server", () => ({
  getEnv: () => ({ STORAGE_DIR: dir, SESSION_SECRET: "s".repeat(40) }),
}));

const storage = await import("./storage.server");
const { createTestDatabase, hasTestDb } = await import("@/test/db");
const db = await import("./db.server");

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

describe("caminhos e assinaturas", () => {
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it.each(["../x.jpg", "/etc/passwd", "a/../../b.jpg", "a\\b.jpg", "a/\u0001.jpg", "", "a//b.jpg", ".hidden/x.jpg"])("recusa %j", (p) => {
    expect(() => storage.assertSafePath(p)).toThrow(/inválido/);
  });

  it("aceita os caminhos usados pelo app", () => {
    expect(() => storage.assertSafePath("376a5964-8c3d/6f435f7e-ba8e/fabfd84b.jpg")).not.toThrow();
  });

  it("link de leitura válido, adulterado e vencido", () => {
    const url = new URL(storage.createReadUrl("audit-evidences", "a/b/c.jpg"), "http://x");
    const exp = url.searchParams.get("exp");
    const sig = url.searchParams.get("sig");
    expect(url.pathname).toBe("/api/files/audit-evidences/a/b/c.jpg");
    expect(storage.verifyReadUrl("audit-evidences", "a/b/c.jpg", exp, sig)).toBe(true);
    expect(storage.verifyReadUrl("audit-evidences", "a/b/d.jpg", exp, sig)).toBe(false);
    expect(storage.verifyReadUrl("maintenance-images", "a/b/c.jpg", exp, sig)).toBe(false);
    expect(storage.verifyReadUrl("audit-evidences", "a/b/c.jpg", String(Number(exp) + 10), sig)).toBe(false);
    expect(storage.verifyReadUrl("audit-evidences", "a/b/c.jpg", exp, `${sig}x`)).toBe(false);
    const old = new URL(storage.createReadUrl("audit-evidences", "a/b/c.jpg", -5), "http://x");
    expect(storage.verifyReadUrl("audit-evidences", "a/b/c.jpg", old.searchParams.get("exp"), old.searchParams.get("sig"))).toBe(false);
  });

  it("identifica imagens pelos primeiros bytes", () => {
    expect(storage.sniffImage(JPEG)).toBe("image/jpeg");
    expect(storage.sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(storage.sniffImage(new TextEncoder().encode("RIFF____WEBPVP8 "))).toBe("image/webp");
    expect(storage.sniffImage(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
  });

  it("grava, recusa não imagem e arquivo grande, e remove", async () => {
    await storage.saveFile("maintenance-images", "n1/f1.jpg", JPEG);
    const full = path.join(dir, "maintenance-images", "n1", "f1.jpg");
    expect(Array.from(await readFile(full))).toEqual(Array.from(JPEG));
    await expect(storage.saveFile("maintenance-images", "n1/f2.jpg", new TextEncoder().encode("%PDF-1.7"))).rejects.toMatchObject({ status: 415 });
    const big = new Uint8Array(storage.MAX_UPLOAD_BYTES + 1);
    big.set(JPEG);
    await expect(storage.saveFile("maintenance-images", "n1/f3.jpg", big)).rejects.toMatchObject({ status: 413 });
    await storage.removeFiles("maintenance-images", ["n1/f1.jpg", "../fora.jpg"]);
    expect(existsSync(full)).toBe(false);
  });
});

describe.skipIf(!hasTestDb)("token de envio (uso único)", () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  let sql: ReturnType<typeof db.createSql>;
  beforeAll(async () => {
    t = await createTestDatabase();
    sql = db.createSql(t.url, { max: 1 });
    db.setSqlForTests(sql);
  }, 60_000);
  afterAll(async () => {
    db.setSqlForTests(undefined);
    await sql?.end();
    await t?.drop();
  });

  const tokenOf = (url: string) => new URL(url, "http://x").searchParams.get("t");

  it("aceita uma vez e recusa o reuso", async () => {
    const tok = tokenOf(storage.createUploadUrl("audit-evidences", "a1/r1/f.jpg"));
    expect(await db.asService((tx) => storage.consumeUploadToken(tx, tok))).toEqual({ bucket: "audit-evidences", path: "a1/r1/f.jpg" });
    await expect(db.asService((tx) => storage.consumeUploadToken(tx, tok))).rejects.toThrow(/já utilizada/);
  });

  it("recusa token adulterado ou vencido", async () => {
    const tok = tokenOf(storage.createUploadUrl("audit-evidences", "a1/r1/g.jpg"))!;
    const [body, sig] = tok.split(".");
    const forged = Buffer.from(Buffer.from(body!, "base64url").toString().replace("g.jpg", "h.jpg")).toString("base64url");
    await expect(db.asService((tx) => storage.consumeUploadToken(tx, `${forged}.${sig}`))).rejects.toThrow(/inválida/);
    const old = tokenOf(storage.createUploadUrl("audit-evidences", "a1/r1/i.jpg", -10));
    await expect(db.asService((tx) => storage.consumeUploadToken(tx, old))).rejects.toThrow(/expirada/);
    await expect(db.asService((tx) => storage.consumeUploadToken(tx, null))).rejects.toThrow(/inválida/);
  });
});
