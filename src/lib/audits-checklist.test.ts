// @vitest-environment node
// Tarefas 5.2 e 5.3: checklist (rascunho -> editar -> publicar), parâmetros de pontuação,
// alteração de resposta pelo admin (recalcula a nota) e 5W2H (grava audit_change_logs).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/server/env.server", () => ({
  getEnv: () => ({ STORAGE_DIR: "/tmp/nao-usado", SESSION_SECRET: "s".repeat(40) }),
}));

const { createTestDatabase, hasTestDb } = await import("@/test/db");
const { makeUser } = await import("@/test/fixtures");
const { asService, createSql, setSqlForTests } = await import("@/server/db.server");
const checklist = await import("./checklist.functions");
const audits = await import("./audits.functions");

type Ctx = { userId: string; ip: string | null };

describe.skipIf(!hasTestDb)("checklist, parâmetros, auditorias e plano de ação", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let sql: ReturnType<typeof createSql>;
  let admin: Ctx;
  let manager: Ctx;
  let auditorUser: Ctx;
  let inactive: Ctx;

  beforeAll(async () => {
    db = await createTestDatabase();
    sql = createSql(db.url, { max: 2 });
    setSqlForTests(sql);
    const mk = async (email: string, role: "admin" | "manager" | "auditor", active = true) => ({
      userId: await asService((tx) => makeUser(tx, { email, role, active })),
      ip: null,
    });
    admin = await mk("admin@teste.com", "admin");
    manager = await mk("gestor@teste.com", "manager");
    auditorUser = await mk("auditor@teste.com", "auditor");
    inactive = await mk("inativo@teste.com", "manager", false);
  }, 60_000);

  afterAll(async () => {
    setSqlForTests(undefined);
    await sql?.end();
    await db?.drop();
  });

  let versionId: string;

  it("checklist: cria rascunho, adiciona pergunta e publica", async () => {
    await expect(checklist.createDraftCore(auditorUser, "x")).rejects.toThrow("Sem permissão");
    versionId = (await checklist.createDraftCore(admin, "Primeira versão")) as string;
    await checklist.saveQuestionCore(admin, { versionId, text: "Itens desnecessários foram removidos?", sense: "UTILIZACAO", active: true, position: 1 });
    await checklist.saveQuestionCore(admin, { versionId, text: "Cada item tem lugar identificado?", sense: "ORGANIZACAO", active: true, position: 1 });
    const qs = await checklist.listQuestionsCore(admin, versionId);
    expect(qs).toHaveLength(2);
    const q = qs.find((x) => x.sense === "UTILIZACAO")!;
    await checklist.saveQuestionCore(admin, { id: q.id, versionId, text: "Itens desnecessários foram descartados?", sense: "UTILIZACAO", active: true });
    expect((await checklist.listQuestionsCore(admin, versionId)).find((x) => x.id === q.id)!.text).toBe("Itens desnecessários foram descartados?");

    await checklist.publishCore(admin, versionId);
    const [v] = await asService((tx) => tx<{ status: string }[]>`select status from public.checklist_versions where id = ${versionId}`);
    expect(v!.status).toBe("PUBLISHED");
    // Versão publicada não aceita mais edição (trigger do banco).
    await expect(
      checklist.saveQuestionCore(admin, { id: q.id, versionId, text: "Tentativa depois de publicar", sense: "UTILIZACAO", active: true }),
    ).rejects.toThrow("Somente perguntas de versões em rascunho podem ser alteradas.");
  });

  it("parâmetros: admin altera a pontuação; outros perfis não", async () => {
    const scoring = { conforme: 100, nc_parcial: 40, nao_conforme: 0, nao_se_aplica: "excluded" };
    await checklist.saveSettingCore(admin, { key: "scoring", value: scoring });
    const [s] = await asService((tx) => tx<{ value: unknown; updated_by: string }[]>`select value, updated_by from public.settings where key = 'scoring'`);
    expect(s).toEqual({ value: scoring, updated_by: admin.userId });
    await expect(checklist.saveSettingCore(manager, { key: "scoring", value: scoring })).rejects.toThrow("Você não tem permissão para esta ação.");
  });

  let auditId: string;
  let answers: { id: string; order_snapshot: number }[];

  it("admin_update_answer recalcula a nota com os parâmetros atuais", async () => {
    auditId = await asService(async (tx) => {
      const [u] = await tx<{ id: string }[]>`insert into public.units (name, code) values ('Matriz', 'MTZ') returning id`;
      const [s] = await tx<{ id: string }[]>`insert into public.sectors (unit_id, name) values (${u!.id}, 'Almoxarifado') returning id`;
      const [a] = await tx<{ id: string }[]>`
        insert into public.auditors (name, cpf, unit_id, sector_id, authorized, active)
        values ('Auditor', '52998224725', ${u!.id}, ${s!.id}, true, true) returning id`;
      const [au] = await tx<{ id: string }[]>`
        insert into public.audits (unit_id, sector_id, unit_name_snapshot, sector_name_snapshot, auditor_id, auditor_name_snapshot,
          checklist_version_id, checklist_version_snapshot, companion_name, location_status, status, finished_at)
        values (${u!.id}, ${s!.id}, 'Matriz', 'Almoxarifado', ${a!.id}, 'Auditor', ${versionId}, '1.0', 'Acompanhante', 'DENIED', 'COMPLETED', now())
        returning id`;
      const qs = await tx<{ id: string; sense: string; text: string; position: number }[]>`
        select id, sense, text, position from public.checklist_questions where version_id = ${versionId} order by public.sense_rank(sense)`;
      let i = 0;
      for (const q of qs) {
        i++;
        await tx`insert into public.audit_answers (audit_id, question_id, question_snapshot, sense_snapshot, order_snapshot, answer, observation)
                 values (${au!.id}, ${q.id}, ${q.text}, ${q.sense}, ${i}, ${i === 1 ? "NON_COMPLIANT" : "COMPLIANT"}, ${i === 1 ? "Caixas no corredor" : null})`;
      }
      await tx`select public.recalc_audit(${au!.id})`;
      return au!.id;
    });
    const before = await audits.getActionPlanCore(admin, "00000000-0000-0000-0000-000000000000");
    expect(before).toBeNull();

    const [a0] = await asService((tx) => tx<{ overall_score: number }[]>`select overall_score from public.audits where id = ${auditId}`);
    expect(a0!.overall_score).toBe(50); // (0 + 100) / 2

    answers = await asService((tx) => tx<{ id: string; order_snapshot: number }[]>`
      select id, order_snapshot from public.audit_answers where audit_id = ${auditId} order by order_snapshot`);
    await expect(
      audits.adminUpdateAnswerCore(manager, { answerId: answers[0]!.id, answer: "COMPLIANT", observation: "", reason: "Revisão do comitê" }),
    ).rejects.toThrow("Sem permissão");

    // NC -> NCP: com nc_parcial = 40 (parâmetro salvo acima), nota = (40 + 100) / 2 = 70.
    await audits.adminUpdateAnswerCore(admin, {
      answerId: answers[0]!.id, answer: "PARTIALLY_NON_COMPLIANT", observation: "Parcialmente organizado", reason: "Revisão do comitê",
    });
    const [a1] = await asService((tx) => tx<{ overall_score: number; classification: string }[]>`
      select overall_score, classification from public.audits where id = ${auditId}`);
    expect(a1).toEqual({ overall_score: 70, classification: "BRONZE" });
    const logs = await asService((tx) => tx<{ field: string }[]>`select field from public.audit_change_logs where audit_id = ${auditId}`);
    expect(logs.map((l) => l.field)).toEqual(expect.arrayContaining(["answer", "observation", "overall_score/classification"]));
  });

  it("update_action_plan grava cada mudança em audit_change_logs; getActionPlan traz audits aninhado", async () => {
    const [plan] = await asService((tx) => tx<{ id: string }[]>`
      select id from public.action_plans where audit_id = ${auditId} and status <> 'CANCELADO' order by created_at desc limit 1`);
    expect(plan).toBeTruthy();
    const base = { id: plan!.id, what: "Retirar caixas", why: "Bloqueiam a passagem", where: "Corredor", who: "Equipe", when: "2026-12-01", how: "Mutirão", howMuch: 150.5 };
    await expect(audits.updateActionPlanCore(auditorUser, { ...base, status: "EM_ANDAMENTO" })).rejects.toThrow("Sem permissão para alterar o Plano de Ação.");
    await audits.updateActionPlanCore(manager, { ...base, status: "EM_ANDAMENTO" });

    // Gestor edita, mas o histórico só é visível para admin/diretor/auditor (RLS de audit_change_logs).
    expect((await audits.getActionPlanCore(manager, plan!.id))!.logs).toEqual([]);
    const detail = await audits.getActionPlanCore(admin, plan!.id);
    expect(detail!.plan["what"]).toBe("Retirar caixas");
    expect(Number(detail!.plan["how_much"])).toBe(150.5);
    expect(detail!.plan["audits"]).toMatchObject({ audit_number: expect.stringMatching(/^AUD-/), auditor_name_snapshot: "Auditor" });
    expect(typeof (detail!.plan["audits"] as { finished_at: string }).finished_at).toBe("string");
    const mine = detail!.logs.filter((l) => l.changed_by === manager.userId);
    expect(mine.map((l) => l.field).sort()).toEqual(["how", "how_much", "status", "what", "when", "where", "who", "why"].sort());
    expect(mine.every((l) => l.entity === `action_plan:${plan!.id.slice(0, 8)}` && l.reason === "Atualização do 5W2H")).toBe(true);
    expect(detail!.answer).toMatchObject({ answer: "PARTIALLY_NON_COMPLIANT", order_snapshot: 1 });
  });

  it("links de evidência só para usuário ativo", async () => {
    const urls = await audits.evidenceUrlsCore(manager, ["a1/r1/foto.jpg", "../fora.jpg"]);
    expect(Object.keys(urls)).toEqual(["a1/r1/foto.jpg"]);
    expect(urls["a1/r1/foto.jpg"]).toMatch(/^\/api\/files\/audit-evidences\/a1\/r1\/foto\.jpg\?exp=\d+&sig=/);
    await expect(audits.evidenceUrlsCore(inactive, ["a1/r1/foto.jpg"])).rejects.toThrow("Você não tem permissão para esta ação.");
  });
});
