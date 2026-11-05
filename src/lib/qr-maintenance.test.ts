// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = await mkdtemp(path.join(tmpdir(), "files-qr-"));
vi.mock("@/server/env.server", () => ({
  getEnv: () => ({ STORAGE_DIR: dir, SESSION_SECRET: "s".repeat(40), PUBLIC_ORIGIN: "http://localhost", TRUST_PROXY: false }),
  smtpConfigured: () => false,
}));

const { createTestDatabase, hasTestDb } = await import("@/test/db");
const { makeUser } = await import("@/test/fixtures");
const db = await import("@/server/db.server");
const { qrLogic, INVALID_SESSION } = await import("./qr.functions");
const { maintLogic, NO_PERMISSION } = await import("./maintenance.functions");
const { notificationLogic } = await import("./notifications.functions");

const CPF = "52998224725"; // código do QR = 6 primeiros dígitos do CPF
const req = { ip: "203.0.113.10" };
type Json = Record<string, unknown>;

describe.skipIf(!hasTestDb)("fluxos de QR, manutenção e notificações", () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  let sql: ReturnType<typeof db.createSql>;
  let adminId: string;
  let auditorUserId: string;
  let sectorId: string;
  let qrToken: string;

  beforeAll(async () => {
    t = await createTestDatabase();
    sql = db.createSql(t.url, { max: 3 });
    db.setSqlForTests(sql);
    adminId = await db.asService((tx) => makeUser(tx, { email: "admin@teste.com", role: "admin" }));
    auditorUserId = await db.asService((tx) => makeUser(tx, { email: "aud@teste.com", role: "auditor" }));
    await db.asService(async (tx) => {
      const [u] = await tx<{ id: string }[]>`insert into public.units (name, code) values ('Matriz', 'MTZ') returning id`;
      const [s] = await tx<{ id: string; qr_token: string }[]>`
        insert into public.sectors (unit_id, name) values (${u!.id}, 'Almoxarifado') returning id, qr_token`;
      sectorId = s!.id;
      qrToken = s!.qr_token;
      await tx`insert into public.auditors (name, cpf, unit_id, sector_id, authorized, active)
               values ('Auditor QR', ${CPF}, ${u!.id}, ${s!.id}, true, true)`;
      // Checklist publicado (perguntas só podem ser criadas em rascunho).
      const [v] = await tx<{ id: string }[]>`insert into public.checklist_versions (version_number, status) values ('1.0', 'DRAFT') returning id`;
      let pos = 0;
      for (const sense of ["UTILIZACAO", "ORGANIZACAO", "LIMPEZA", "HIGIENE", "DISCIPLINA"]) {
        await tx`insert into public.checklist_questions (version_id, sense, position, text) values (${v!.id}, ${sense}, ${++pos}, ${`Pergunta de ${sense}`})`;
      }
      await tx`update public.checklist_versions set status = 'PUBLISHED', published_at = now() where id = ${v!.id}`;
    });
  }, 60_000);

  afterAll(async () => {
    db.setSqlForTests(undefined);
    await sql?.end();
    await t?.drop();
    await rm(dir, { recursive: true, force: true });
  });

  it("auditoria completa pelo QR, sem login, com nota calculada no banco", async () => {
    const info = (await qrLogic.sectorInfo(req, qrToken)) as Json;
    expect(info).toMatchObject({ active: true, has_checklist: true, sector_name: "Almoxarifado" });

    const bad = (await qrLogic.validateAuditor(req, qrToken, "000000")) as Json;
    expect(bad.ok).toBe(false);
    const v = (await qrLogic.validateAuditor(req, qrToken, CPF.slice(0, 6))) as Json;
    expect(v).toMatchObject({ ok: true, auditor_name: "Auditor QR" });

    const st = (await qrLogic.startAudit(req, {
      ticket: v.ticket as string, companion: "Fulano", lat: null, lng: null, locationStatus: "UNAVAILABLE",
    })) as Json;
    expect(st.ok).toBe(true);
    const auditId = st.audit_id as string;
    const session = st.session as string;

    const audit = (await qrLogic.getAudit(req, auditId, session)) as { answers: { id: string }[] };
    expect(audit.answers.length).toBeGreaterThan(0);
    const [nc, ...rest] = audit.answers;

    // NC com observação e foto; o resto conforme.
    expect(await qrLogic.saveAnswer(req, { auditId, session, answerId: nc!.id, answer: "NON_COMPLIANT", observation: "Caixas no chão" })).toEqual({ ok: true });
    for (const a of rest) await qrLogic.saveAnswer(req, { auditId, session, answerId: a.id, answer: "COMPLIANT", observation: "" });

    const up = await qrLogic.uploadUrl(auditId, session, nc!.id);
    expect(up.path.startsWith(`${auditId}/${nc!.id}/`)).toBe(true);
    expect(up.signedUrl.startsWith("/api/files/upload?t=")).toBe(true);
    const ev = (await qrLogic.addEvidence(req, { auditId, session, answerId: nc!.id, path: up.path, source: "CAMERA" })) as Json;
    expect(ev.ok).toBe(true);

    // Segunda foto, removida em seguida (arquivo também some).
    const up2 = await qrLogic.uploadUrl(auditId, session, nc!.id);
    const ev2 = (await qrLogic.addEvidence(req, { auditId, session, answerId: nc!.id, path: up2.path, source: "GALLERY" })) as Json;
    const file2 = path.join(dir, "audit-evidences", ...up2.path.split("/"));
    await mkdir(path.dirname(file2), { recursive: true });
    await writeFile(file2, Buffer.from([0xff, 0xd8, 0xff]));
    expect(await qrLogic.removeEvidence(auditId, session, ev2.id as string)).toEqual({ ok: true });
    expect(existsSync(file2)).toBe(false);

    const urls = await qrLogic.evidenceUrls(auditId, session, [up.path, "outra-auditoria/x/y.jpg"]);
    expect(Object.keys(urls)).toEqual([up.path]);

    const fin = (await qrLogic.finalize(req, auditId, session)) as Json;
    expect(fin.ok).toBe(true);
    expect(typeof fin.overall_score).toBe("number");
    expect(fin.overall_score as number).toBeLessThan(100);

    const [plan] = await db.asService((tx) => tx<{ nc_type: string }[]>`select nc_type from public.action_plans where audit_id = ${auditId}`);
    expect(plan?.nc_type).toBe("NC");
    await expect(qrLogic.uploadUrl(auditId, session, nc!.id)).rejects.toThrow("Auditoria já finalizada.");
  });

  it("sessão errada é recusada", async () => {
    const fake = "f".repeat(64);
    const someId = "00000000-0000-4000-8000-000000000000";
    await expect(qrLogic.uploadUrl(someId, fake, someId)).rejects.toThrow(INVALID_SESSION);
    await expect(qrLogic.evidenceUrls(someId, fake, [])).rejects.toThrow(INVALID_SESSION);
    await expect(qrLogic.removeEvidence(someId, fake, someId)).rejects.toThrow(INVALID_SESSION);
    expect(await qrLogic.getAudit(req, someId, fake)).toBeNull();
  });

  it("funções qr_* rodam como anon (sem identidade de usuário)", async () => {
    const r = await db.asAnon((tx) => tx<{ role: string }[]>`select current_user as role`, req);
    expect(r[0]!.role).toBe("anon");
  });

  it("nota de manutenção: abertura interna e pelo QR, URLs de envio e listagem com imagens", async () => {
    const ctx = { userId: auditorUserId, ip: null };
    const r = await maintLogic.createInternal(ctx, sectorId, { requester: "Pessoa", date: null, time: null, description: "Lâmpada queimada" });
    expect(r).toMatchObject({ ok: true });
    expect(r!.upload_token).toBeTruthy();

    await expect(maintLogic.uploadUrls(r!.id!, "x".repeat(48), 1)).rejects.toThrow("Prazo para envio das imagens expirou.");
    const urls = await maintLogic.uploadUrls(r!.id!, r!.upload_token!, 2);
    expect(urls).toHaveLength(2);
    expect(urls[0]!.signedUrl.startsWith("/api/files/upload?t=")).toBe(true);
    await expect(maintLogic.uploadUrls(r!.id!, r!.upload_token!, 5)).rejects.toThrow("Máximo de 6 imagens por nota.");

    const q = await maintLogic.createFromQr(req, qrToken, { requester: "Visitante", date: null, time: null, description: "Porta emperrada" });
    expect(q).toMatchObject({ ok: true });

    const notes = await maintLogic.listNotes({ userId: adminId, ip: null });
    const mine = notes.find((n) => n.id === r!.id)!;
    expect(mine.maintenance_note_images.map((i) => i.storage_path).sort()).toEqual(urls.map((u) => u.path).sort());
    expect(notes.find((n) => n.id === q!.id)?.source).toBe("QR");

    const links = await maintLogic.imageUrls(ctx, [urls[0]!.path, "nao/existe.jpg"]);
    expect(Object.keys(links)).toEqual([urls[0]!.path]);
  });

  it("sem can_manage_maintenance não remove fotos nem apaga nota; admin apaga nota e arquivos", async () => {
    const ctx = { userId: auditorUserId, ip: null };
    const r = await maintLogic.createInternal(ctx, sectorId, { requester: "Pessoa", date: null, time: null, description: "Torneira pingando" });
    const [u] = await maintLogic.uploadUrls(r!.id!, r!.upload_token!, 1);
    const file = path.join(dir, "maintenance-images", ...u!.path.split("/"));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, Buffer.from([0xff, 0xd8, 0xff]));
    const [img] = await db.asService((tx) => tx<{ id: string }[]>`select id from public.maintenance_note_images where note_id = ${r!.id!}`);

    const notes = await maintLogic.listNotes(ctx);
    const n = notes.find((x) => x.id === r!.id)!;
    const update = {
      id: n.id, note_date: n.note_date, note_time: n.note_time, requester_name: n.requester_name, unit_id: n.unit_id, sector_id: n.sector_id,
      description: n.description, status: "EM_ANDAMENTO" as const, priority: "ALTA" as const, assignee_name: null, due_date: null, resolution: null,
      removedImageIds: [img!.id],
    };
    await expect(maintLogic.updateNote(ctx, update)).rejects.toThrow(NO_PERMISSION);
    await expect(maintLogic.deleteNote(ctx, n.id)).rejects.toThrow(NO_PERMISSION);
    expect(existsSync(file)).toBe(true);

    const admin = { userId: adminId, ip: null };
    await maintLogic.updateNote(admin, update);
    expect(existsSync(file)).toBe(false);
    const [after] = await db.asService((tx) => tx<{ status: string; n: number }[]>`
      select status, (select count(*)::int from public.maintenance_note_images where note_id = ${n.id}) as n
      from public.maintenance_notes where id = ${n.id}`);
    expect(after).toEqual({ status: "EM_ANDAMENTO", n: 0 });

    await maintLogic.deleteNote(admin, n.id);
    const left = await db.asService((tx) => tx`select 1 from public.maintenance_notes where id = ${n.id}`);
    expect(left.count).toBe(0);
  });

  it("notificações: gera, lista só as do usuário e marca como lidas", async () => {
    const admin = { userId: adminId, ip: null };
    await db.asService((tx) => tx`
      insert into public.notifications (user_id, type, title, message, dedupe_key)
      values (${adminId}, 'PENDING', 'Teste 1', 'Mensagem 1', 'k1'), (${adminId}, 'PENDING', 'Teste 2', 'Mensagem 2', 'k2'),
             (${auditorUserId}, 'PENDING', 'De outro', 'Mensagem', 'k3')`);
    const list = await notificationLogic.list(admin);
    expect(list.some((n) => n.title === "De outro")).toBe(false);
    const t1 = list.find((n) => n.title === "Teste 1")!;
    await notificationLogic.markRead(admin, t1.id);
    let after = await notificationLogic.list(admin);
    expect(after.find((n) => n.id === t1.id)?.read_at).toBeTruthy();
    expect(after.find((n) => n.title === "Teste 2")?.read_at).toBeNull();
    await notificationLogic.markAll(admin);
    after = await notificationLogic.list(admin);
    expect(after.every((n) => n.read_at)).toBe(true);
    const other = await notificationLogic.list({ userId: auditorUserId, ip: null });
    expect(other.find((n) => n.title === "De outro")?.read_at).toBeNull();
  });
});
