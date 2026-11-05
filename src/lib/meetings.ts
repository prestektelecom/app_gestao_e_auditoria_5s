import { queryOptions } from "@tanstack/react-query";
import { getMeeting, listMeetingActions, listMeetingPeople, listMeetings } from "./meetings.functions";

export const MEETING_TOPICS = ["Auditorias", "Checklist de Auditoria", "Planos de Ação", "Rankings e Resultados", "Treinamentos 5S", "Outros assuntos 5S"];
export const MEETING_TYPES: Record<string, string> = { ORDINARIA: "Ordinária", EXTRAORDINARIA: "Extraordinária" };
export const MEETING_STATUS: Record<string, string> = { RASCUNHO: "Rascunho", FINALIZADA: "Finalizada" };
export const PARTICIPANT_ROLES = ["Coordenador", "Secretário", "Membro do Comitê", "Auditor", "Gestor da Área", "Convidado"];
export const ACTION_STATUS: Record<string, string> = { PENDENTE: "Pendente", EM_ANDAMENTO: "Em andamento", CONCLUIDO: "Concluído", CANCELADO: "Cancelado" };

export type Meeting = {
  id: string; meeting_number: string; title: string; meeting_type: string; topics: string[]; meeting_date: string;
  start_time: string | null; end_time: string | null; location: string | null; unit_id: string | null;
  facilitator_name: string | null; secretary_name: string | null; objective: string | null; agenda: string | null;
  discussion: string | null; previous_followup: string | null; notes: string | null; next_meeting_date: string | null;
  status: string; created_at: string; updated_at: string;
};
export type Participant = { id?: string; person_kind: string; person_id: string | null; name: string; role_in_meeting: string | null; present: boolean };
export type MeetingAction = {
  id?: string; meeting_id?: string; topic: string | null; what: string; why: string | null; where_text: string | null;
  who_name: string | null; who_kind: string | null; who_id: string | null; when_date: string | null; how: string | null;
  how_much: number | null; status: string; completed_at?: string | null;
};
export type Person = { kind: string; id: string; name: string; detail: string };

export const personKey = (kind: string | null, id: string | null) => (kind && id ? `${kind}:${id}` : "");

export const meetingsQuery = queryOptions({
  queryKey: ["meetings"],
  queryFn: () => listMeetings(),
});

export const meetingQuery = (id: string) => queryOptions({
  queryKey: ["meeting", id],
  queryFn: () => getMeeting({ data: { id } }),
});

export const meetingActionsQuery = queryOptions({
  queryKey: ["meeting-actions"],
  queryFn: () => listMeetingActions(),
});

export const peopleQuery = queryOptions({
  queryKey: ["meeting-people"],
  queryFn: () => listMeetingPeople(),
});

export const emptyAction = (): MeetingAction => ({
  topic: null, what: "", why: null, where_text: null, who_name: null, who_kind: null, who_id: null,
  when_date: null, how: null, how_much: null, status: "PENDENTE",
});
