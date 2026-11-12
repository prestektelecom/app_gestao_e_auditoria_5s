// @vitest-environment node
// Exclusão de auditoria (histórico de auditorias): só administrador; apaga a auditoria com tudo que
// depende dela (respostas, fotos, plano 5W2H, histórico, notificações) e os arquivos das fotos.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = await mkdtemp(path.join(tmpdir(), "files-audit-delete-"));
vi.mock("@/server/env.server", () => ({
  getEnv: () => ({ STORAGE_DIR: dir, SESSION_SECRET: "s".repeat(40) }),
}));

const { createTestDatabase, hasTestDb } = await import("@/test/db");
const { makeUser } = await import("@/test/fixtures");
const { asService, createSql, setSqlForTests } = await import("@/server/db.server");
const audits = await import("./audits.functions");

type Ctx = { userId: string; ip: string | null };
type Seed = { auditId: string; number: string; planId: string; file: string; notificationKey: string };

describe.skipIf(!hasTestDb)("excluir auditoria", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let sql: ReturnType<typeof createSql>;
  let admin: Ctx;
  let manager: Ctx;
  let auditorUser: Ctx;
  let ids: { unit: string; sector: string; auditor: string; version: string; question: string };

  beforeAll(async () => {
    db = await createTestDatabase();
    sql = createSql(db.url, { max: 2 });
    setSqlForTests(sql);
    const mk = async (email: string, role: "admin" | "manager" | "auditor") => ({
      userId: await asService((tx) => makeUser(tx, { email, role })),
      ip: null,
    });
    admin = await mk("admin@teste.com", "admin");
    manager = await mk("gestor@teste.com", "manager");
    auditorUser = await mk("auditor@teste.com", "auditor");
    ids = await asService(async (tx) => {
      const [u] = await tx<{ id: string }[]>`insert into public.units (name, code) values ('Matriz', 'MTZ') returning id`;
      const [s] = await tx<{ id: string }[]>`insert into public.sectors (unit_id, name) values (${u!.id}, 'Almoxarifado') returning id`;
      const [a] = await tx<{ id: string }[]>`
        insert into public.auditors (name, cpf, unit_id, sector_id, authorized, active)
        values ('Auditor', '52998224725', ${u!.id}, ${s!.id}, true, true) returning id`;
      const [v] = await tx<{ id: string }[]>`insert into public.checklist_versions (version_number, status) values ('1.0', 'DRAFT') returning id`;
      const [q] = await tx<{ id: string }[]>`
        insert into public.checklist_questions (version_id, sense, position, text)
        values (${v!.id}, 'UTILIZACAO', 1, 'Itens desnecessários foram removidos?') returning id`;
      return { unit: u!.id, sector: s!.id, auditor: a!.id, version: v!.id, question: q!.id };
    });
  }, 60_000);

  afterAll(async () => {
    setSqlForTests(undefined);
    await sql?.end();
    await db?.drop();
    await rm(dir, { recursive: true, force: true });
  });

  /** Auditoria concluída com 1 resposta NC, 1 foto (arquivo em disco), 1 plano 5W2H, 1 log e 1 notificação do plano. */
  async function seed(): Promise<Seed> {
    const s = await asService(async (tx) => {
      const [au] = await tx<{ id: string; audit_number: string }[]>`
        insert into public.audits (unit_id, sector_id, unit_name_snapshot, sector_name_snapshot, auditor_id, auditor_name_snapshot,
          checklist_version_id, checklist_version_snapshot, companion_name, location_status, status, finished_at)
        values (${ids.unit}, ${ids.sector}, 'Matriz', 'Almoxarifado', ${ids.auditor}, 'Auditor', ${ids.version}, '1.0', 'Acompanhante',
          'DENIED', 'COMPLETED', now())
        returning id, audit_number`;
      const [aa] = await tx<{ id: string }[]>`
        insert into public.audit_answers (audit_id, question_id, question_snapshot, sense_snapshot, order_snapshot, answer, observation)
        values (${au!.id}, ${ids.question}, 'Itens desnecessários foram removidos?', 'UTILIZACAO', 1, 'NON_COMPLIANT', 'Caixas no corredor')
        returning id`;
      const evidencePath = `${au!.id}/${aa!.id}/foto.jpg`;
      await tx`insert into public.audit_evidences (audit_id, audit_answer_id, storage_path, source)
               values (${au!.id}, ${aa!.id}, ${evidencePath}, 'CAMERA')`;
      const [plan] = await tx<{ id: string }[]>`
        insert into public.action_plans (audit_id, audit_answer_id, unit_id, sector_id, unit_name, sector_name, sense, question, nc_type)
        values (${au!.id}, ${aa!.id}, ${ids.unit}, ${ids.sector}, 'Matriz', 'Almoxarifado', 'UTILIZACAO', 'Itens desnecessários foram removidos?', 'NC')
        returning id`;
      await tx`insert into public.audit_change_logs (audit_id, changed_by, entity, field, reason)
               values (${au!.id}, ${admin.userId}, 'audit', 'overall_score', 'Revisão do comitê')`;
      const notificationKey = `new:${plan!.id}`;
      await tx`insert into public.notifications (user_id, dedupe_key, type, title, message, link)
               values (${manager.userId}, ${notificationKey}, 'NEW_NC', 'Nova ação pendente', 'Teste', ${`/plano-de-acao/${plan!.id}`})`;
      return { auditId: au!.id, number: au!.audit_number, planId: plan!.id, evidencePath, notificationKey };
    });
    const file = path.join(dir, "audit-evidences", ...s.evidencePath.split("/"));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, Buffer.from([0xff, 0xd8, 0xff]));
    return { auditId: s.auditId, number: s.number, planId: s.planId, file, notificationKey: s.notificationKey };
  }

  const counts = (auditId: string) =>
    asService(async (tx) => {
      const [r] = await tx<Record<string, number>[]>`
        select (select count(*)::int from public.audits where id = ${auditId}) as audits,
               (select count(*)::int from public.audit_answers where audit_id = ${auditId}) as answers,
               (select count(*)::int from public.audit_evidences where audit_id = ${auditId}) as evidences,
               (select count(*)::int from public.action_plans where audit_id = ${auditId}) as plans,
               (select count(*)::int from public.audit_change_logs where audit_id = ${auditId}) as logs`;
      return r;
    });
  const notifications = (key: string) =>
    asService((tx) => tx<{ id: string }[]>`select id from public.notifications where dedupe_key = ${key}`);

  it("gestor e auditor não excluem: nada some, nem as fotos", async () => {
    const a = await seed();
    await expect(audits.deleteAuditCore(manager, a.auditId)).rejects.toThrow("Sem permissão");
    await expect(audits.deleteAuditCore(auditorUser, a.auditId)).rejects.toThrow("Sem permissão");
    expect(await counts(a.auditId)).toEqual({ audits: 1, answers: 1, evidences: 1, plans: 1, logs: 1 });
    expect(existsSync(a.file)).toBe(true);
    expect(await notifications(a.notificationKey)).toHaveLength(1);
  });

  it("administrador exclui a auditoria com tudo que depende dela, apaga as fotos e deixa as outras intactas", async () => {
    const target = await seed();
    const other = await seed();

    await expect(audits.deleteAuditCore(admin, target.auditId)).resolves.toEqual({ ok: true });

    expect(await counts(target.auditId)).toEqual({ audits: 0, answers: 0, evidences: 0, plans: 0, logs: 0 });
    expect(existsSync(target.file)).toBe(false);
    expect(await notifications(target.notificationKey)).toHaveLength(0);

    // A outra auditoria continua completa.
    expect(await counts(other.auditId)).toEqual({ audits: 1, answers: 1, evidences: 1, plans: 1, logs: 1 });
    expect(existsSync(other.file)).toBe(true);
    expect(await notifications(other.notificationKey)).toHaveLength(1);

    // Fica o registro de quem excluiu o quê (o histórico da própria auditoria saiu junto).
    const log = await asService((tx) => tx<{ audit_number: string; deleted_by: string; sector_name: string; audit_status: string }[]>`
      select audit_number, deleted_by, sector_name, audit_status from public.audit_deletion_logs where audit_number = ${target.number}`);
    expect(log).toEqual([{ audit_number: target.number, deleted_by: admin.userId, sector_name: "Almoxarifado", audit_status: "COMPLETED" }]);

    // Excluída uma vez, não existe mais.
    await expect(audits.deleteAuditCore(admin, target.auditId)).rejects.toThrow("Auditoria não encontrada.");
  });

  it("auditoria em andamento também pode ser excluída", async () => {
    const a = await seed();
    await asService((tx) => tx`update public.audits set status = 'IN_PROGRESS', finished_at = null where id = ${a.auditId}`);
    await audits.deleteAuditCore(admin, a.auditId);
    expect(await counts(a.auditId)).toEqual({ audits: 0, answers: 0, evidences: 0, plans: 0, logs: 0 });
  });
});
