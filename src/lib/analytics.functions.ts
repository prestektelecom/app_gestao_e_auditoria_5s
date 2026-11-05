// Dados do painel, análises e relatórios (tarefa 5.4).
// Mesmas consultas, filtros, ordem e limites que src/lib/analytics.ts fazia pelo PostgREST,
// com os relacionamentos embutidos ("audits: {...}") montados por JOIN.
// Cada consulta é uma função de transação (testável) + a server function que a expõe.
import { createServerFn } from "@tanstack/react-start";
import { requireUser } from "./middleware";
import { rows, userTx } from "./server-fn";
import type { ActionPlan, AuditLite, NcAnswer } from "./analytics";
import type { Tx } from "@/server/db.server";

export type InProgressAudit = {
  id: string;
  unit_id: string;
  sector_id: string;
  auditor_id: string;
  started_at: string;
};
export type ChangeLog = {
  id: string;
  audit_id: string;
  changed_by: string;
  changed_by_name: string | null;
  entity: string;
  field: string;
  previous_value: string | null;
  new_value: string | null;
  reason: string;
  changed_at: string;
  audits: { audit_number: string } | null;
};

export async function completedAuditsTx(tx: Tx) {
  const done = await tx<AuditLite[]>`
    select id, audit_number, unit_id, sector_id, unit_name_snapshot, sector_name_snapshot, auditor_id,
           auditor_name_snapshot, started_at, finished_at, overall_score, classification, sense_scores,
           nc_count, ncp_count, status
    from public.audits where status = 'COMPLETED'
    order by finished_at desc limit 10000`;
  const prog = await tx<InProgressAudit[]>`
    select id, unit_id, sector_id, auditor_id, started_at from public.audits where status = 'IN_PROGRESS' limit 1000`;
  return { audits: rows(done), inProgress: rows(prog) };
}

/** Respostas NC/NCP de auditorias concluídas (o antigo audits!inner(status) virou JOIN). */
export async function ncAnswersTx(tx: Tx) {
  return rows(
    await tx<NcAnswer[]>`
      select a.id, a.audit_id, a.question_id, a.question_snapshot, a.sense_snapshot, a.order_snapshot, a.answer, a.observation
      from public.audit_answers a join public.audits au on au.id = a.audit_id
      where a.answer in ('NON_COMPLIANT', 'PARTIALLY_NON_COMPLIANT') and au.status = 'COMPLETED'
      limit 20000`,
  );
}

export async function actionPlansTx(tx: Tx) {
  return rows(
    await tx<ActionPlan[]>`
      select p.*,
             case when au.id is null then null else
               json_build_object('audit_number', au.audit_number, 'finished_at', au.finished_at,
                                 'auditor_name_snapshot', au.auditor_name_snapshot) end as audits
      from public.action_plans p left join public.audits au on au.id = p.audit_id
      order by p.created_at desc limit 10000`,
  );
}

export async function changeLogsTx(tx: Tx) {
  return rows(
    await tx<ChangeLog[]>`
      select l.*, case when au.id is null then null else json_build_object('audit_number', au.audit_number) end as audits
      from public.audit_change_logs l left join public.audits au on au.id = l.audit_id
      order by l.changed_at desc limit 1000`,
  );
}

export const listCompletedAudits = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(({ context }) => userTx(context, completedAuditsTx));

export const listNcAnswers = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(({ context }) => userTx(context, ncAnswersTx));

export const listActionPlans = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(({ context }) => userTx(context, actionPlansTx));

export const listChangeLogs = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(({ context }) => userTx(context, changeLogsTx));
