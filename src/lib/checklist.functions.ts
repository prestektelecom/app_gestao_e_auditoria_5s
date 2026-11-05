// Checklist 5S (versões, perguntas, propostas do Comitê) e parâmetros do programa.
// Substitui as consultas que checklist.tsx e configuracoes.tsx faziam direto ao banco.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser, type UserContext } from "./middleware";
import { assertTouched, rows, userTx } from "./server-fn";
import type { Json } from "@/server/db-types";

const uuid = z.string().uuid();
const SENSE = z.enum(["UTILIZACAO", "ORGANIZACAO", "LIMPEZA", "HIGIENE", "DISCIPLINA", "COLETA"]);

export type ChecklistVersion = {
  id: string; version_number: string; status: string; description: string | null;
  created_by: string | null; created_at: string; published_at: string | null;
};
export type ChecklistQuestion = {
  id: string; version_id: string; sense: string; position: number; text: string; active: boolean;
  source_question_id: string | null; created_at: string; updated_at: string;
};
export type ChangeRequest = {
  id: string; question_id: string | null; question_text_snapshot: string | null; kind: string; proposal: string;
  justification: string; author_id: string; author_name: string | null; status: string;
  reviewed_by: string | null; reviewed_at: string | null; created_at: string;
};

export const listChecklistVersions = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(({ context }) =>
    userTx(context, async (tx) =>
      rows(
        await tx<ChecklistVersion[]>`
          select id, version_number, status, description, created_by, created_at, published_at
          from public.checklist_versions order by created_at desc`,
      ),
    ),
  );

export const listChecklistQuestions = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .inputValidator((d) => z.object({ versionId: uuid }).parse(d))
  .handler(({ data, context }) => listQuestionsCore(context, data.versionId));

export function listQuestionsCore(ctx: UserContext, versionId: string) {
  return userTx(ctx, async (tx) =>
    rows(
      await tx<ChecklistQuestion[]>`
        select id, version_id, sense, position, text, active, source_question_id, created_at, updated_at
        from public.checklist_questions where version_id = ${versionId}`,
    ),
  );
}

export const createChecklistDraft = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d) => z.object({ description: z.string().max(500) }).parse(d))
  .handler(({ data, context }) => createDraftCore(context, data.description));

export async function createDraftCore(ctx: UserContext, description: string) {
  const { rpc } = await import("@/server/db.server");
  return userTx(ctx, (tx) => rpc(tx, "create_checklist_draft", { _description: description }));
}

export const discardChecklistDraft = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d) => z.object({ versionId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { rpc } = await import("@/server/db.server");
    await userTx(context, (tx) => rpc(tx, "discard_checklist_draft", { _version_id: data.versionId }));
    return { ok: true };
  });

export const publishChecklistVersion = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d) => z.object({ versionId: uuid }).parse(d))
  .handler(({ data, context }) => publishCore(context, data.versionId));

export async function publishCore(ctx: UserContext, versionId: string) {
  const { rpc } = await import("@/server/db.server");
  await userTx(ctx, (tx) => rpc(tx, "publish_checklist_version", { _version_id: versionId }));
  return { ok: true };
}

const questionSchema = z.object({
  id: uuid.optional(),
  versionId: uuid,
  text: z.string().trim().min(5).max(1000),
  sense: SENSE,
  active: z.boolean(),
  /** Nova posição (ao criar, ou ao mudar de senso). Omitido mantém a atual. */
  position: z.number().int().min(0).optional(),
});

export const saveChecklistQuestion = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d) => questionSchema.parse(d))
  .handler(({ data, context }) => saveQuestionCore(context, data));

export function saveQuestionCore(ctx: UserContext, data: z.infer<typeof questionSchema>) {
  return userTx(ctx, async (tx) => {
      if (data.id) {
        const v = { text: data.text, sense: data.sense, active: data.active, ...(data.position !== undefined ? { position: data.position } : {}) };
        assertTouched(await tx`update public.checklist_questions set ${tx(v)} where id = ${data.id} and version_id = ${data.versionId}`);
      } else {
        await tx`insert into public.checklist_questions (version_id, text, sense, active, position)
                 values (${data.versionId}, ${data.text}, ${data.sense}, ${data.active}, ${data.position ?? 1})`;
      }
      return { ok: true };
  });
}

/** Troca a posição de duas perguntas (mover para cima/baixo), na mesma transação. */
export const swapChecklistQuestions = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d) => z.object({ a: z.object({ id: uuid, position: z.number().int() }), b: z.object({ id: uuid, position: z.number().int() }) }).parse(d))
  .handler(({ data, context }) =>
    userTx(context, async (tx) => {
      assertTouched(await tx`update public.checklist_questions set position = ${data.b.position} where id = ${data.a.id}`);
      assertTouched(await tx`update public.checklist_questions set position = ${data.a.position} where id = ${data.b.id}`);
      return { ok: true };
    }),
  );

export const deleteChecklistQuestion = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(({ data, context }) =>
    userTx(context, async (tx) => {
      assertTouched(await tx`delete from public.checklist_questions where id = ${data.id}`);
      return { ok: true };
    }),
  );

// ---------------------------------------------------------------------------
// Propostas do Comitê
// ---------------------------------------------------------------------------
export const listChangeRequests = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(({ context }) =>
    userTx(context, async (tx) =>
      rows(
        await tx<ChangeRequest[]>`
          select id, question_id, question_text_snapshot, kind, proposal, justification, author_id, author_name,
                 status, reviewed_by, reviewed_at, created_at
          from public.checklist_change_requests order by created_at desc`,
      ),
    ),
  );

export const createChangeRequest = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d) =>
    z.object({
      questionId: uuid.nullable(),
      questionText: z.string().max(1000).nullable(),
      proposal: z.string().trim().min(5).max(2000),
      justification: z.string().trim().min(5).max(2000),
    }).parse(d),
  )
  .handler(({ data, context }) =>
    userTx(context, async (tx) => {
      // Autor e nome vêm da sessão, nunca do navegador.
      await tx`insert into public.checklist_change_requests
                 (question_id, question_text_snapshot, kind, proposal, justification, author_id, author_name)
               values (${data.questionId}, ${data.questionText}, ${data.questionId ? "EDIT" : "NEW"}, ${data.proposal},
                       ${data.justification}, ${context.userId},
                       (select name from public.profiles where id = ${context.userId}))`;
      return { ok: true };
    }),
  );

export const reviewChangeRequest = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d) => z.object({ id: uuid, status: z.enum(["PENDING", "APPROVED", "REJECTED", "INCORPORATED"]) }).parse(d))
  .handler(({ data, context }) =>
    userTx(context, async (tx) => {
      assertTouched(
        await tx`update public.checklist_change_requests
                 set status = ${data.status}, reviewed_by = ${context.userId}, reviewed_at = now() where id = ${data.id}`,
      );
      return { ok: true };
    }),
  );

// ---------------------------------------------------------------------------
// Parâmetros do programa (public.settings)
// ---------------------------------------------------------------------------
const settingSchema = z.object({
  key: z.enum(["audit_periodicity", "scoring", "medals", "deadline_alert_days"]),
  value: z.custom<Json>((v) => v !== undefined),
});

export function saveSettingCore(ctx: UserContext, data: z.infer<typeof settingSchema>) {
  return userTx(ctx, async (tx) => {
    await tx`insert into public.settings (key, value, updated_by)
             values (${data.key}, ${tx.json(data.value as never)}, ${ctx.userId})
             on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by`;
    return { ok: true };
  });
}

export const saveSetting = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d) => settingSchema.parse(d))
  .handler(({ data, context }) => saveSettingCore(context, data));
