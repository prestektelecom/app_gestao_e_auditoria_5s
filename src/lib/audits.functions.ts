// Auditorias, respostas, evidências, histórico de alterações e Plano de Ação (5W2H).
// Substitui as consultas que as telas de auditoria e de plano de ação faziam direto ao banco.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser, type UserContext } from "./middleware";
import { rows, userTx } from "./server-fn";
import type { Json } from "@/server/db-types";

const uuid = z.string().uuid();

// Colunas de audits que o papel "authenticated" pode ler (session_hash fica de fora).
// Lista explícita no lugar de "*" para a sessão do QR nunca sair do servidor.
export type AuditRow = {
  id: string; audit_number: string; unit_id: string; sector_id: string; unit_name_snapshot: string; sector_name_snapshot: string;
  auditor_id: string; auditor_name_snapshot: string; checklist_version_id: string; checklist_version_snapshot: string;
  companion_name: string; started_at: string; finished_at: string | null; latitude: number | null; longitude: number | null;
  location_status: string; overall_score: number | null; classification: string | null; sense_scores: Json;
  compliant_count: number; ncp_count: number; nc_count: number; na_count: number; status: string; created_at: string; updated_at: string;
};
export type AnswerRow = {
  id: string; question_snapshot: string; sense_snapshot: string; order_snapshot: number; answer: string | null; observation: string | null;
};
export type EvidenceRow = { id: string; audit_answer_id: string; storage_path: string };
export type ChangeLogRow = {
  id: string; audit_id: string; changed_by: string; changed_by_name: string | null; entity: string; field: string;
  previous_value: string | null; new_value: string | null; reason: string; changed_at: string;
};

const auditCols = (tx: import("@/server/db.server").Tx, alias = "a") =>
  tx.unsafe(
    [
      "id", "audit_number", "unit_id", "sector_id", "unit_name_snapshot", "sector_name_snapshot", "auditor_id", "auditor_name_snapshot",
      "checklist_version_id", "checklist_version_snapshot", "companion_name", "started_at", "finished_at", "latitude", "longitude",
      "location_status", "overall_score", "classification", "sense_scores", "compliant_count", "ncp_count", "nc_count", "na_count",
      "status", "created_at", "updated_at",
    ].map((c) => `${alias}.${c}`).join(", "),
  );

/** Lista de auditorias (as 1000 mais recentes), para a tela Auditorias. */
export const listAudits = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(({ context }) =>
    userTx(context, async (tx) =>
      rows(
        await tx`
          select a.id, a.audit_number, a.unit_id, a.sector_id, a.unit_name_snapshot, a.sector_name_snapshot, a.auditor_id,
                 a.auditor_name_snapshot, a.companion_name, a.started_at, a.finished_at, a.location_status, a.overall_score,
                 a.classification, a.nc_count, a.ncp_count, a.status
          from public.audits a order by a.started_at desc limit 1000`,
      ),
    ),
  );

async function auditBundle(tx: import("@/server/db.server").Tx, id: string) {
  const [audit] = await tx<AuditRow[]>`select ${auditCols(tx)} from public.audits a where a.id = ${id}`;
  const answers = await tx<AnswerRow[]>`
    select id, question_snapshot, sense_snapshot, order_snapshot, answer, observation
    from public.audit_answers where audit_id = ${id} order by order_snapshot`;
  const evidences = await tx<EvidenceRow[]>`
    select id, audit_answer_id, storage_path from public.audit_evidences where audit_id = ${id} order by created_at`;
  return { audit: audit ?? null, answers: rows(answers), evidences: rows(evidences) };
}

/** Auditoria com respostas e evidências (tela de detalhe). */
export const getAudit = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(({ data, context }) => userTx(context, (tx) => auditBundle(tx, data.id)));

/** Auditoria completa para impressão: inclui os planos de ação. */
export const getAuditForPrint = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(({ data, context }) =>
    userTx(context, async (tx) => {
      const bundle = await auditBundle(tx, data.id);
      const plans = await tx`
        select id, audit_answer_id, question, nc_type, sense, status, who, when_date, what, origin_changed
        from public.action_plans where audit_id = ${data.id} order by created_at`;
      return { ...bundle, plans: rows(plans) };
    }),
  );

export const listAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .inputValidator((d) => z.object({ auditId: uuid }).parse(d))
  .handler(({ data, context }) =>
    userTx(context, async (tx) =>
      rows(await tx<ChangeLogRow[]>`select * from public.audit_change_logs where audit_id = ${data.auditId} order by changed_at desc`),
    ),
  );

export const listAuditPlans = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .inputValidator((d) => z.object({ auditId: uuid }).parse(d))
  .handler(({ data, context }) =>
    userTx(context, async (tx) =>
      rows(
        await tx`select id, question, nc_type, status, who, when_date, origin_changed
                 from public.action_plans where audit_id = ${data.auditId} order by created_at`,
      ),
    ),
  );

export const adminUpdateAnswer = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d) =>
    z.object({
      answerId: uuid,
      answer: z.enum(["COMPLIANT", "PARTIALLY_NON_COMPLIANT", "NON_COMPLIANT", "NOT_APPLICABLE"]),
      observation: z.string().max(2000),
      reason: z.string().max(2000),
    }).parse(d),
  )
  .handler(({ data, context }) => adminUpdateAnswerCore(context, data));

export async function adminUpdateAnswerCore(
  ctx: UserContext,
  data: { answerId: string; answer: "COMPLIANT" | "PARTIALLY_NON_COMPLIANT" | "NON_COMPLIANT" | "NOT_APPLICABLE"; observation: string; reason: string },
) {
  const { rpc } = await import("@/server/db.server");
  await userTx(ctx, (tx) =>
    rpc(tx, "admin_update_answer", { _answer_id: data.answerId, _answer: data.answer, _observation: data.observation, _reason: data.reason }),
  );
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Plano de Ação
// ---------------------------------------------------------------------------

/** Ação 5W2H com a auditoria de origem, a resposta, as fotos e o histórico. */
export const getActionPlan = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(({ data, context }) => getActionPlanCore(context, data.id));

export async function getActionPlanCore(ctx: UserContext, id: string) {
  const data = { id };
  const { readUrlMap } = await import("@/server/storage.server");
  return userTx(ctx, async (tx) => {
      // Mesmo formato do select("*,audits(audit_number,finished_at,auditor_name_snapshot)") do PostgREST.
      const [p] = await tx<Record<string, Json>[]>`
        select p.*, case when a.id is null then null else
                 json_build_object('audit_number', a.audit_number, 'finished_at', a.finished_at,
                                   'auditor_name_snapshot', a.auditor_name_snapshot) end as audits
        from public.action_plans p left join public.audits a on a.id = p.audit_id
        where p.id = ${data.id}`;
      if (!p) return null;
      const answerId = p["audit_answer_id"] as string;
      const [answer] = await tx<{ answer: string | null; observation: string | null; order_snapshot: number }[]>`
        select answer, observation, order_snapshot from public.audit_answers where id = ${answerId}`;
      const ev = await tx<{ id: string; storage_path: string }[]>`
        select id, storage_path from public.audit_evidences where audit_answer_id = ${answerId}`;
      const logs = await tx<ChangeLogRow[]>`
        select * from public.audit_change_logs
        where audit_id = ${p["audit_id"] as string} and entity like ${`action_plan:${data.id.slice(0, 8)}%`}
        order by changed_at desc`;
      const urls = readUrlMap("audit-evidences", ev.map((e) => e.storage_path));
      return { plan: { ...p }, answer: answer ?? null, photos: ev.map((e) => urls[e.storage_path]).filter(Boolean) as string[], logs: rows(logs) };
  });
}

const planSchema = z.object({
      id: uuid,
      what: z.string().max(2000), why: z.string().max(2000), where: z.string().max(2000), who: z.string().max(2000),
      when: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), how: z.string().max(2000),
      howMuch: z.number().min(0).nullable(),
      status: z.enum(["PENDENTE", "EM_ANDAMENTO", "CONCLUIDO", "CANCELADO"]),
});

export async function updateActionPlanCore(ctx: UserContext, data: z.infer<typeof planSchema>) {
  const { rpc } = await import("@/server/db.server");
  await userTx(ctx, (tx) =>
    rpc(tx, "update_action_plan", {
      _id: data.id, _what: data.what, _why: data.why, _where: data.where, _who: data.who,
      _when: data.when as string, _how: data.how, _how_much: data.howMuch as number, _status: data.status,
    }),
  );
  return { ok: true };
}

export const updateActionPlan = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d) => planSchema.parse(d))
  .handler(({ data, context }) => updateActionPlanCore(context, data));

// ---------------------------------------------------------------------------
// Fotos de evidência
// ---------------------------------------------------------------------------

/** Links assinados (1 h) das fotos de evidência, só para usuário ativo. Formato { caminho: url }. */
export const getEvidenceUrls = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d) => z.object({ paths: z.array(z.string().max(300)).max(500) }).parse(d))
  .handler(({ data, context }) => evidenceUrlsCore(context, data.paths));

export async function evidenceUrlsCore(ctx: UserContext, paths: string[]) {
  const { rpc } = await import("@/server/db.server");
  const { readUrlMap } = await import("@/server/storage.server");
  const active = await userTx(ctx, (tx) => rpc(tx, "is_active_user", { _user_id: ctx.userId }));
  if (!active) throw new Error("Você não tem permissão para esta ação.");
  return readUrlMap("audit-evidences", paths);
}
