// @vitest-environment node
// Finalização forçada de auditoria em andamento: só administrador, com motivo; conclui sem cobrar
// respostas/fotos, calcula a nota só com as respondidas, gera os planos das NC/NCP e registra no histórico.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const { createTestDatabase, hasTestDb } = await import("@/test/db");
const { makeUser } = await import("@/test/fixtures");
const { asService, createSql, setSqlForTests } = await import("@/server/db.server");
const audits = await import("./audits.functions");

type Ctx = { userId: string; ip: string | null };

describe.skipIf(!hasTestDb)("forçar finalização de auditoria", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let sql: ReturnType<typeof createSql>;
  let admin: Ctx;
  let manager: Ctx;
  let ids: { unit: string; sector: string; auditor: string; version: string; question: string };

  beforeAll(async () => {
    db = await createTestDatabase();
    sql = createSql(db.url, { max: 2 });
    setSqlForTests(sql);
    const mk = async (email: string, role: "admin" | "manager") => ({ userId: await asService((tx) => makeUser(tx, { email, role })), ip: null });
    admin = await mk("admin@teste.com", "admin");
    manager = await mk("gestor@teste.com", "manager");
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
  });

  /** Auditoria em andamento: 1 conforme, 1 NC sem observação nem foto e 1 sem resposta. */
  const seed = () =>
    asService(async (tx) => {
      const [au] = await tx<{ id: string }[]>`
        insert into public.audits (unit_id, sector_id, unit_name_snapshot, sector_name_snapshot, auditor_id, auditor_name_snapshot,
          checklist_version_id, checklist_version_snapshot, companion_name, location_status, status)
        values (${ids.unit}, ${ids.sector}, 'Matriz', 'Almoxarifado', ${ids.auditor}, 'Auditor', ${ids.version}, '1.0', 'Acompanhante',
          'DENIED', 'IN_PROGRESS')
        returning id`;
      for (const [order, answer] of [[1, "COMPLIANT"], [2, "NON_COMPLIANT"], [3, null]] as const) {
        await tx`insert into public.audit_answers (audit_id, question_id, question_snapshot, sense_snapshot, order_snapshot, answer)
                 values (${au!.id}, ${ids.question}, 'Pergunta', 'UTILIZACAO', ${order}, ${answer})`;
      }
      return au!.id;
    });

  const state = (auditId: string) =>
    asService(async (tx) => {
      const [r] = await tx<{ status: string; overall_score: string | null; finished: boolean; plans: number; logs: number }[]>`
        select status, overall_score::text, finished_at is not null as finished,
               (select count(*)::int from public.action_plans where audit_id = a.id) as plans,
               (select count(*)::int from public.audit_change_logs where audit_id = a.id and field = 'status') as logs
        from public.audits a where id = ${auditId}`;
      return r;
    });

  it("gestor não força a finalização", async () => {
    const id = await seed();
    await expect(audits.forceFinalizeAuditCore(manager, id, "Auditor saiu")).rejects.toThrow("Sem permissão");
    expect(await state(id)).toMatchObject({ status: "IN_PROGRESS", finished: false, plans: 0, logs: 0 });
  });

  it("exige motivo", async () => {
    const id = await seed();
    await expect(audits.forceFinalizeAuditCore(admin, id, "  ")).rejects.toThrow("motivo");
    expect((await state(id))!.status).toBe("IN_PROGRESS");
  });

  it("administrador conclui com pendências: nota só das respondidas, plano da NC e histórico", async () => {
    const id = await seed();
    const r = await audits.forceFinalizeAuditCore(admin, id, "Auditor abandonou a auditoria");
    expect(r).toMatchObject({ ok: true, unanswered: 1 });
    // (100 + 0) / 2 = 50: a pergunta sem resposta não entra na média.
    expect(await state(id)).toEqual({ status: "COMPLETED", overall_score: "50.000", finished: true, plans: 1, logs: 1 });
    await expect(audits.forceFinalizeAuditCore(admin, id, "De novo, por engano")).rejects.toThrow("Auditoria já finalizada.");
  });
});
