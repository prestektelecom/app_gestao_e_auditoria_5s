// @vitest-environment node
// Tarefas 5.4 (dados de análises/relatórios) e 5.5 (atas) contra um Postgres real.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, hasTestDb } from "@/test/db";
import { makeUser } from "@/test/fixtures";
import { asService, asUser, createSql, setSqlForTests, type Sql } from "@/server/db.server";
import { actionPlansTx, changeLogsTx, completedAuditsTx, ncAnswersTx } from "./analytics.functions";
import { saveMeetingActionTx, saveMeetingTx, saveSchema, type SaveMeetingInput } from "./meetings.functions";

describe.skipIf(!hasTestDb)("analytics e atas com banco", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let sql: Sql;
  let adminId: string;
  let directorId: string;
  let ids: { unit: string; sector: string; auditor: string; done: string; prog: string; ncAnswer: string; okAnswer: string };

  beforeAll(async () => {
    db = await createTestDatabase();
    sql = createSql(db.url, { max: 2 });
    setSqlForTests(sql);
    adminId = await asService((tx) => makeUser(tx, { email: "admin@teste.com", name: "Admin", role: "admin" }));
    directorId = await asService((tx) => makeUser(tx, { email: "dir@teste.com", name: "Diretor", role: "director" }));
    ids = await asService(async (tx) => {
      const [u] = await tx<{ id: string }[]>`insert into public.units (name, code) values ('Matriz', 'MTZ') returning id`;
      const [s] = await tx<{ id: string }[]>`insert into public.sectors (unit_id, name) values (${u!.id}, 'Almox') returning id`;
      const [a] = await tx<{ id: string }[]>`insert into public.auditors (name, cpf, unit_id, sector_id) values ('Aud', '52998224725', ${u!.id}, ${s!.id}) returning id`;
      const [v] = await tx<{ id: string }[]>`insert into public.checklist_versions (version_number, status) values ('v1', 'DRAFT') returning id`;
      const [q] = await tx<{ id: string }[]>`insert into public.checklist_questions (version_id, sense, position, text) values (${v!.id}, 'LIMPEZA', 1, 'O setor está limpo?') returning id`;
      const [q2] = await tx<{ id: string }[]>`insert into public.checklist_questions (version_id, sense, position, text) values (${v!.id}, 'LIMPEZA', 2, 'O piso está seco?') returning id`;
      await tx`update public.checklist_versions set status = 'PUBLISHED' where id = ${v!.id}`;
      const audit = (status: string) => tx<{ id: string }[]>`
        insert into public.audits (unit_id, sector_id, unit_name_snapshot, sector_name_snapshot, auditor_id, auditor_name_snapshot,
          checklist_version_id, checklist_version_snapshot, companion_name, location_status, status, finished_at, overall_score, sense_scores)
        values (${u!.id}, ${s!.id}, 'Matriz', 'Almox', ${a!.id}, 'Aud', ${v!.id}, 'v1', 'Fulano', 'DENIED', ${status},
          ${status === "COMPLETED" ? new Date("2026-10-20T12:00:00Z") : null}, ${status === "COMPLETED" ? 87.5 : null}, ${tx.json({ LIMPEZA: 87.5 })})
        returning id`;
      const [done] = await audit("COMPLETED");
      const [prog] = await audit("IN_PROGRESS");
      const ans = (auditId: string, answer: string, qid = q!.id) => tx<{ id: string }[]>`
        insert into public.audit_answers (audit_id, question_id, question_snapshot, sense_snapshot, order_snapshot, answer)
        values (${auditId}, ${qid}, 'O setor está limpo?', 'LIMPEZA', 1, ${answer}) returning id`;
      const [nc] = await ans(done!.id, "NON_COMPLIANT");
      const [ok] = await ans(done!.id, "COMPLIANT", q2!.id);
      await ans(prog!.id, "NON_COMPLIANT");
      await tx`insert into public.action_plans (audit_id, audit_answer_id, unit_id, sector_id, unit_name, sector_name, sense, question, nc_type, how_much)
               values (${done!.id}, ${nc!.id}, ${u!.id}, ${s!.id}, 'Matriz', 'Almox', 'LIMPEZA', 'O setor está limpo?', 'NC', 150.5)`;
      await tx`insert into public.audit_change_logs (audit_id, changed_by, entity, field, reason) values (${done!.id}, ${adminId}, 'answer', 'answer', 'ajuste')`;
      return { unit: u!.id, sector: s!.id, auditor: a!.id, done: done!.id, prog: prog!.id, ncAnswer: nc!.id, okAnswer: ok!.id };
    });
  }, 60_000);

  afterAll(async () => {
    setSqlForTests(undefined);
    await sql?.end();
    await db?.drop();
  });

  // ------------------------------------------------------------- 5.4
  it("auditorias concluídas e em andamento, com números e jsonb", async () => {
    const r = await asUser(directorId, completedAuditsTx);
    expect(r.audits.map((a) => a.id)).toEqual([ids.done]);
    expect(r.audits[0]).toMatchObject({ overall_score: 87.5, sense_scores: { LIMPEZA: 87.5 }, status: "COMPLETED", finished_at: "2026-10-20T12:00:00+00:00" });
    expect(r.inProgress.map((a) => a.id)).toEqual([ids.prog]);
  });

  it("respostas NC só de auditorias concluídas", async () => {
    const r = await asUser(directorId, ncAnswersTx);
    expect(r.map((a) => a.id)).toEqual([ids.ncAnswer]);
    expect(r[0]).not.toHaveProperty("audits");
  });

  it("planos de ação com a auditoria embutida", async () => {
    const [p] = await asUser(directorId, actionPlansTx);
    expect(p).toMatchObject({ audit_id: ids.done, how_much: 150.5, audits: { auditor_name_snapshot: "Aud", finished_at: "2026-10-20T12:00:00+00:00" } });
    expect(p!.audits!.audit_number).toMatch(/^AUD-/);
  });

  it("histórico de alterações com o número da auditoria", async () => {
    const [l] = await asUser(adminId, changeLogsTx);
    expect(l).toMatchObject({ reason: "ajuste", audits: { audit_number: expect.stringMatching(/^AUD-/) } });
  });

  // ------------------------------------------------------------- 5.5
  const meeting = (over: Partial<SaveMeetingInput["meeting"]> = {}): SaveMeetingInput["meeting"] => ({
    title: "Reunião do Comitê 5S", meeting_type: "ORDINARIA", topics: ["Auditorias"], meeting_date: "2026-11-05",
    start_time: "09:00", end_time: null, location: null, unit_id: null, facilitator_name: null, secretary_name: null,
    objective: null, agenda: null, discussion: null, previous_followup: null, notes: null, next_meeting_date: null,
    status: "RASCUNHO", ...over,
  });
  const action = (what: string, id?: string) => ({
    ...(id ? { id } : {}), topic: null, what, why: null, where_text: null, who_name: "Fulano", who_kind: null, who_id: null,
    when_date: "2026-12-01", how: null, how_much: null, status: "PENDENTE" as const,
  });
  const part = (name: string) => ({ person_kind: "external", person_id: null, name, role_in_meeting: "Membro do Comitê", present: true });
  const load = (id: string) =>
    asService(async (tx) => ({
      m: (await tx`select * from public.meetings where id = ${id}`)[0],
      p: [...(await tx<{ name: string }[]>`select name from public.meeting_participants where meeting_id = ${id} order by name`)].map((r) => r.name),
      a: [...(await tx<{ id: string; what: string }[]>`select id, what from public.meeting_actions where meeting_id = ${id} order by what`)],
    }));

  it("cria ata com participantes e ações; edição substitui participantes e apaga ações removidas", async () => {
    const input = saveSchema.parse({ meeting: meeting(), participants: [part("Ana"), part("Bia")], actions: [action("Ação A"), action("Ação B")], removedActionIds: [] });
    const { id } = await asUser(adminId, (tx) => saveMeetingTx(tx, input));
    let st = await load(id);
    expect(st.m).toMatchObject({ topics: ["Auditorias"], start_time: "09:00:00", created_by: adminId });
    expect(st.m!.meeting_number).toMatch(/^REU-/);
    expect(st.p).toEqual(["Ana", "Bia"]);
    expect(st.a.map((x) => x.what)).toEqual(["Ação A", "Ação B"]);

    const [a, b] = st.a;
    const edit = saveSchema.parse({
      id, meeting: meeting({ title: "Editada" }), participants: [part("Caio")],
      actions: [action("Ação A2", a!.id), action("Ação C")], removedActionIds: [b!.id],
    });
    await asUser(adminId, (tx) => saveMeetingTx(tx, edit));
    st = await load(id);
    expect(st.m!.title).toBe("Editada");
    expect(st.p).toEqual(["Caio"]);
    expect(st.a.map((x) => x.what)).toEqual(["Ação A2", "Ação C"]);
    expect(st.a.find((x) => x.what === "Ação A2")!.id).toBe(a!.id);
  });

  it("a gravação é atômica: se uma parte falha, nada é salvo", async () => {
    const before = (await asService((tx) => tx<{ n: number }[]>`select count(*)::int as n from public.meetings`))[0]!.n;
    const bad = saveSchema.parse({ meeting: meeting(), participants: [part("Ana")], actions: [action("Ok")], removedActionIds: [] });
    // unit_id inexistente faz o INSERT da reunião passar, mas a FK falha no fim da instrução; força erro depois das ações:
    bad.actions.push({ ...action("Quebra"), id: "00000000-0000-0000-0000-000000000000" });
    await expect(asUser(adminId, (tx) => saveMeetingTx(tx, bad))).rejects.toThrow("Você não tem permissão para esta ação.");
    const after = (await asService((tx) => tx<{ n: number }[]>`select count(*)::int as n from public.meetings`))[0]!.n;
    expect(after).toBe(before);
  });

  it("finalizar sem participantes é recusado", async () => {
    const input = saveSchema.parse({ meeting: meeting({ status: "FINALIZADA" }), participants: [], actions: [], removedActionIds: [] });
    await expect(asUser(adminId, (tx) => saveMeetingTx(tx, input))).rejects.toThrow("Inclua ao menos um participante antes de finalizar.");
  });

  it("diretor (sem can_manage_meetings) não cria nem apaga ata", async () => {
    const input = saveSchema.parse({ meeting: meeting(), participants: [], actions: [], removedActionIds: [] });
    await expect(asUser(directorId, (tx) => saveMeetingTx(tx, input))).rejects.toThrow("Você não tem permissão para esta ação.");
    const { id } = await asUser(adminId, (tx) => saveMeetingTx(tx, input));
    const del = await asUser(directorId, (tx) => tx`delete from public.meetings where id = ${id}`);
    expect(del.count).toBe(0);
    // Diretor lê (is_active_user), mas não grava ação avulsa.
    expect((await asUser(directorId, (tx) => tx`select id from public.meetings where id = ${id}`)).length).toBe(1);
    await expect(asUser(directorId, (tx) => saveMeetingActionTx(tx, { ...action("X"), meeting_id: id }))).rejects.toThrow("Você não tem permissão para esta ação.");
  });

  it("admin apaga ata e as ações vão junto", async () => {
    const input = saveSchema.parse({ meeting: meeting(), participants: [part("Ana")], actions: [action("Some")], removedActionIds: [] });
    const { id } = await asUser(adminId, (tx) => saveMeetingTx(tx, input));
    const del = await asUser(adminId, (tx) => tx`delete from public.meetings where id = ${id}`);
    expect(del.count).toBe(1);
    expect((await load(id)).a).toEqual([]);
  });

  it("ação avulsa: cria e edita", async () => {
    const input = saveSchema.parse({ meeting: meeting(), participants: [], actions: [], removedActionIds: [] });
    const { id } = await asUser(adminId, (tx) => saveMeetingTx(tx, input));
    await asUser(adminId, (tx) => saveMeetingActionTx(tx, { ...action("Avulsa"), meeting_id: id }));
    const [a] = (await load(id)).a;
    await asUser(adminId, (tx) => saveMeetingActionTx(tx, { ...action("Avulsa editada"), id: a!.id, meeting_id: id, status: "CONCLUIDO" as never }));
    const rows = await asService((tx) => tx<{ what: string; completed_at: string | null }[]>`select what, completed_at from public.meeting_actions where id = ${a!.id}`);
    expect(rows[0]!.what).toBe("Avulsa editada");
    expect(rows[0]!.completed_at).not.toBeNull();
  });
});
