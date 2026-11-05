// Atas do Comitê 5S: reuniões, participantes e plano de ação (tarefa 5.5).
// As permissões vêm das policies de 0005_meetings.sql (can_manage_meetings para gravar).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "./middleware";
import { assertTouched, rows, userTx } from "./server-fn";
import type { Meeting, MeetingAction, Participant, Person } from "./meetings";
import type { Tx } from "@/server/db.server";

const uuid = z.string().uuid();
const text = (max = 5000) => z.string().max(max).nullable();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Hora inválida.");

export type MeetingListRow = Meeting & { participants: number; actions: number };
export type MeetingActionRow = MeetingAction & {
  id: string;
  meeting_id: string;
  meetings: { meeting_number: string; title: string; meeting_date: string } | null;
};

export const listMeetings = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(({ context }) =>
    userTx(context, async (tx) =>
      rows(
        await tx<MeetingListRow[]>`
          select m.*,
                 (select count(*) from public.meeting_participants p where p.meeting_id = m.id)::int as participants,
                 (select count(*) from public.meeting_actions a where a.meeting_id = m.id)::int as actions
          from public.meetings m order by m.meeting_date desc`,
      ),
    ),
  );

export const getMeeting = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(({ data, context }) =>
    userTx(context, async (tx) => {
      const [meeting] = await tx<Meeting[]>`select * from public.meetings where id = ${data.id}`;
      const participants = await tx<
        Participant[]
      >`select * from public.meeting_participants where meeting_id = ${data.id} order by created_at`;
      const actions = await tx<
        MeetingAction[]
      >`select * from public.meeting_actions where meeting_id = ${data.id} order by created_at`;
      return { meeting: meeting ?? null, participants: rows(participants), actions: rows(actions) };
    }),
  );

export const listMeetingActions = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(({ context }) =>
    userTx(context, async (tx) =>
      rows(
        await tx<MeetingActionRow[]>`
          select a.*,
                 case when m.id is null then null else
                   json_build_object('meeting_number', m.meeting_number, 'title', m.title, 'meeting_date', m.meeting_date) end as meetings
          from public.meeting_actions a left join public.meetings m on m.id = a.meeting_id
          order by a.when_date asc nulls last`,
      ),
    ),
  );

export const listMeetingPeople = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const { rpcRows } = await import("@/server/db.server");
    return userTx(context, async (tx) => rows((await rpcRows(tx, "meeting_people")) as Person[]));
  });

// ---------------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------------
const meetingSchema = z.object({
  title: z.string().trim().min(1, "Informe o título da reunião.").max(200),
  meeting_type: z.enum(["ORDINARIA", "EXTRAORDINARIA"]),
  topics: z.array(z.string().max(200)).max(50),
  meeting_date: date,
  start_time: time.nullable(),
  end_time: time.nullable(),
  location: text(300),
  unit_id: uuid.nullable(),
  facilitator_name: text(200),
  secretary_name: text(200),
  objective: text(),
  agenda: text(),
  discussion: text(20000),
  previous_followup: text(),
  notes: text(),
  next_meeting_date: date.nullable(),
  status: z.enum(["RASCUNHO", "FINALIZADA"]),
});
const MEETING_FIELDS = Object.keys(meetingSchema.shape) as (keyof z.infer<typeof meetingSchema>)[];

const participantSchema = z.object({
  person_kind: z.string().min(1).max(40),
  person_id: uuid.nullable(),
  name: z.string().trim().min(1).max(200),
  role_in_meeting: text(100),
  present: z.boolean(),
});

export const actionSchema = z.object({
  id: uuid.optional(),
  topic: text(200),
  what: z.string().trim().min(1, "Toda deliberação precisa descrever o que será feito.").max(5000),
  why: text(),
  where_text: text(500),
  who_name: text(200),
  who_kind: z.string().max(40).nullable(),
  who_id: uuid.nullable(),
  when_date: date.nullable(),
  how: text(),
  how_much: z.number().nonnegative().nullable(),
  status: z.enum(["PENDENTE", "EM_ANDAMENTO", "CONCLUIDO", "CANCELADO"]),
});
const ACTION_FIELDS = [
  "topic",
  "what",
  "why",
  "where_text",
  "who_name",
  "who_kind",
  "who_id",
  "when_date",
  "how",
  "how_much",
  "status",
] as const;

export const saveSchema = z.object({
  id: uuid.optional(),
  meeting: meetingSchema,
  participants: z.array(participantSchema).max(200),
  actions: z.array(actionSchema).max(500),
  removedActionIds: z.array(uuid).max(500),
});

export type SaveMeetingInput = z.infer<typeof saveSchema>;
export type MeetingActionInput = z.infer<typeof actionSchema> & { meeting_id: string };

/** Salva a ata inteira numa transação: reunião, participantes (substituídos) e deliberações. */
export async function saveMeetingTx(tx: Tx, data: SaveMeetingInput) {
  if (data.meeting.status === "FINALIZADA" && data.participants.length === 0) {
    throw new Error("Inclua ao menos um participante antes de finalizar.");
  }
  let mid = data.id;
  if (mid) {
    assertTouched(
      await tx`update public.meetings set ${tx(data.meeting, ...MEETING_FIELDS)} where id = ${mid}`,
    );
  } else {
    const [ins] = await tx<
      { id: string }[]
    >`insert into public.meetings ${tx(data.meeting, ...MEETING_FIELDS)} returning id`;
    mid = ins!.id;
  }
  await tx`delete from public.meeting_participants where meeting_id = ${mid}`;
  if (data.participants.length) {
    const list = data.participants.map((p) => ({ ...p, meeting_id: mid! }));
    await tx`insert into public.meeting_participants ${tx(list, "meeting_id", "person_kind", "person_id", "name", "role_in_meeting", "present")}`;
  }
  if (data.removedActionIds.length) {
    await tx`delete from public.meeting_actions where meeting_id = ${mid} and id = any(${data.removedActionIds}::uuid[])`;
  }
  for (const a of data.actions) {
    const { id: aid, ...row } = a;
    if (aid) {
      assertTouched(
        await tx`update public.meeting_actions set ${tx(row, ...ACTION_FIELDS)} where id = ${aid} and meeting_id = ${mid}`,
      );
    } else {
      await tx`insert into public.meeting_actions ${tx({ ...row, meeting_id: mid! }, "meeting_id", ...ACTION_FIELDS)}`;
    }
  }
  return { id: mid! };
}

export const saveMeeting = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d) => saveSchema.parse(d))
  .handler(({ data, context }) => userTx(context, (tx) => saveMeetingTx(tx, data)));

export const deleteMeeting = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(({ data, context }) =>
    userTx(context, async (tx) => {
      assertTouched(await tx`delete from public.meetings where id = ${data.id}`);
      return { ok: true };
    }),
  );

/** Cria ou edita uma ação avulsa do plano de ação das reuniões. */
export async function saveMeetingActionTx(tx: Tx, data: MeetingActionInput) {
  const { id, ...row } = data;
  if (id) {
    assertTouched(
      await tx`update public.meeting_actions set ${tx(row, "meeting_id", ...ACTION_FIELDS)} where id = ${id}`,
    );
  } else {
    await tx`insert into public.meeting_actions ${tx(row, "meeting_id", ...ACTION_FIELDS)}`;
  }
  return { ok: true };
}

export const saveMeetingAction = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d) => actionSchema.extend({ meeting_id: uuid }).parse(d))
  .handler(({ data, context }) => userTx(context, (tx) => saveMeetingActionTx(tx, data)));

export const deleteMeetingAction = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(({ data, context }) =>
    userTx(context, async (tx) => {
      assertTouched(await tx`delete from public.meeting_actions where id = ${data.id}`);
      return { ok: true };
    }),
  );
