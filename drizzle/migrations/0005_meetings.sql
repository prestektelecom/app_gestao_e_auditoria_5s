CREATE SEQUENCE IF NOT EXISTS public.meeting_number_seq;

CREATE OR REPLACE FUNCTION public.can_manage_meetings(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select public.is_active_user(_user_id) and exists (
    select 1 from public.user_roles where user_id = _user_id and role in ('admin','manager','auditor'))
$$;

CREATE TABLE public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_number text NOT NULL DEFAULT ('REU-' || lpad(nextval('public.meeting_number_seq')::text, 5, '0')),
  title text NOT NULL,
  meeting_type text NOT NULL DEFAULT 'ORDINARIA',
  topics text[] NOT NULL DEFAULT '{}',
  meeting_date date NOT NULL DEFAULT current_date,
  start_time time,
  end_time time,
  location text,
  unit_id uuid REFERENCES public.units(id),
  facilitator_name text,
  secretary_name text,
  objective text,
  agenda text,
  discussion text,
  previous_followup text,
  notes text,
  next_meeting_date date,
  status text NOT NULL DEFAULT 'RASCUNHO',
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.meeting_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  person_kind text NOT NULL,
  person_id uuid,
  name text NOT NULL,
  role_in_meeting text,
  present boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.meeting_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  topic text,
  what text NOT NULL,
  why text,
  where_text text,
  who_name text,
  who_kind text,
  who_id uuid,
  when_date date,
  how text,
  how_much numeric,
  status text NOT NULL DEFAULT 'PENDENTE',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.meeting_participants(meeting_id);
CREATE INDEX ON public.meeting_actions(meeting_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meetings, public.meeting_participants, public.meeting_actions TO authenticated;
GRANT ALL ON public.meetings, public.meeting_participants, public.meeting_actions TO service_role;
GRANT USAGE ON SEQUENCE public.meeting_number_seq TO authenticated;

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meetings read" ON public.meetings FOR SELECT TO authenticated USING (public.is_active_user(auth.uid()));
CREATE POLICY "meetings insert" ON public.meetings FOR INSERT TO authenticated WITH CHECK (public.can_manage_meetings(auth.uid()));
CREATE POLICY "meetings update" ON public.meetings FOR UPDATE TO authenticated USING (public.can_manage_meetings(auth.uid())) WITH CHECK (public.can_manage_meetings(auth.uid()));
CREATE POLICY "meetings delete" ON public.meetings FOR DELETE TO authenticated USING (public.can_manage_meetings(auth.uid()));
CREATE POLICY "mp read" ON public.meeting_participants FOR SELECT TO authenticated USING (public.is_active_user(auth.uid()));
CREATE POLICY "mp insert" ON public.meeting_participants FOR INSERT TO authenticated WITH CHECK (public.can_manage_meetings(auth.uid()));
CREATE POLICY "mp update" ON public.meeting_participants FOR UPDATE TO authenticated USING (public.can_manage_meetings(auth.uid())) WITH CHECK (public.can_manage_meetings(auth.uid()));
CREATE POLICY "mp delete" ON public.meeting_participants FOR DELETE TO authenticated USING (public.can_manage_meetings(auth.uid()));
CREATE POLICY "ma read" ON public.meeting_actions FOR SELECT TO authenticated USING (public.is_active_user(auth.uid()));
CREATE POLICY "ma insert" ON public.meeting_actions FOR INSERT TO authenticated WITH CHECK (public.can_manage_meetings(auth.uid()));
CREATE POLICY "ma update" ON public.meeting_actions FOR UPDATE TO authenticated USING (public.can_manage_meetings(auth.uid())) WITH CHECK (public.can_manage_meetings(auth.uid()));
CREATE POLICY "ma delete" ON public.meeting_actions FOR DELETE TO authenticated USING (public.can_manage_meetings(auth.uid()));

CREATE TRIGGER meetings_touch BEFORE UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER meeting_actions_touch BEFORE UPDATE ON public.meeting_actions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.meeting_actions_completed() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
begin
  if new.status not in ('PENDENTE','EM_ANDAMENTO','CONCLUIDO','CANCELADO') then raise exception 'Status inválido'; end if;
  if new.status = 'CONCLUIDO' and new.completed_at is null then new.completed_at := now(); end if;
  if new.status <> 'CONCLUIDO' then new.completed_at := null; end if;
  return new;
end $$;
CREATE TRIGGER meeting_actions_status BEFORE INSERT OR UPDATE ON public.meeting_actions FOR EACH ROW EXECUTE FUNCTION public.meeting_actions_completed();

CREATE OR REPLACE FUNCTION public.meeting_people() RETURNS TABLE(kind text, id uuid, name text, detail text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select 'user'::text, p.id, p.name, coalesce(r.role::text, '') from public.profiles p
    left join public.user_roles r on r.user_id = p.id
    where p.active and public.is_active_user(auth.uid())
  union all
  select 'auditor'::text, a.id, a.name, coalesce(a.job_title, 'Auditor') from public.auditors a
    where a.active and public.is_active_user(auth.uid())
  order by 3
$$;
REVOKE ALL ON FUNCTION public.meeting_people() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.meeting_people() TO authenticated;