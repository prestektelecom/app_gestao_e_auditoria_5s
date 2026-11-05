ALTER TABLE public.action_plans
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS origin_changed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS origin_note text;
ALTER TABLE public.action_plans DROP CONSTRAINT IF EXISTS action_plans_audit_answer_id_key;
DROP INDEX IF EXISTS public.action_plans_audit_answer_id_key;

INSERT INTO public.settings(key, value) VALUES ('deadline_alert_days', '3'::jsonb) ON CONFLICT (key) DO NOTHING;

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  dedupe_key text NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, dedupe_key)
);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif own read" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notif own update" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX ON public.notifications(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.update_action_plan(_id uuid, _what text, _why text, _where text, _who text, _when date, _how text, _how_much numeric, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare p record; uname text; tag text;
begin
  if not public.is_active_user(auth.uid()) or not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager')) then
    raise exception 'Sem permissão para alterar o Plano de Ação.'; end if;
  if _status not in ('PENDENTE','EM_ANDAMENTO','CONCLUIDO','CANCELADO') then raise exception 'Status inválido.'; end if;
  if _how_much is not null and _how_much < 0 then raise exception 'Valor inválido.'; end if;
  select * into p from public.action_plans where id = _id for update;
  if not found then raise exception 'Ação não encontrada.'; end if;
  select name into uname from public.profiles where id = auth.uid();
  tag := 'action_plan:' || left(_id::text, 8);
  insert into public.audit_change_logs (audit_id, changed_by, changed_by_name, entity, field, previous_value, new_value, reason)
  select p.audit_id, auth.uid(), uname, tag, f, o, n, 'Atualização do 5W2H'
  from (values ('what', p.what, nullif(btrim(_what),'')), ('why', p.why, nullif(btrim(_why),'')), ('where', p.where_text, nullif(btrim(_where),'')),
    ('who', p.who, nullif(btrim(_who),'')), ('when', p.when_date::text, _when::text), ('how', p.how, nullif(btrim(_how),'')),
    ('how_much', p.how_much::text, _how_much::text), ('status', p.status, _status)) v(f, o, n)
  where o is distinct from n;
  update public.action_plans set what = nullif(btrim(_what),''), why = nullif(btrim(_why),''), where_text = nullif(btrim(_where),''),
    who = nullif(btrim(_who),''), when_date = _when, how = nullif(btrim(_how),''), how_much = _how_much, status = _status,
    completed_at = case when _status = 'CONCLUIDO' then coalesce(p.completed_at, now()) else null end, updated_at = now()
  where id = _id;
end $$;
REVOKE ALL ON FUNCTION public.update_action_plan(uuid,text,text,text,text,date,text,numeric,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_action_plan(uuid,text,text,text,text,date,text,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_answer(_answer_id uuid, _answer text, _observation text, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare aa record; au record; uname text; obs text; plan record; bad boolean;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Sem permissão'; end if;
  if _reason is null or length(btrim(_reason)) < 5 then raise exception 'Informe o motivo da alteração (mínimo 5 caracteres).'; end if;
  if _answer not in ('COMPLIANT','PARTIALLY_NON_COMPLIANT','NON_COMPLIANT','NOT_APPLICABLE') then raise exception 'Resposta inválida.'; end if;
  select * into aa from public.audit_answers where id = _answer_id;
  if not found then raise exception 'Resposta não encontrada.'; end if;
  select * into au from public.audits where id = aa.audit_id;
  if au.status <> 'COMPLETED' then raise exception 'Somente auditorias concluídas podem ser alteradas pelo administrador.'; end if;
  obs := nullif(btrim(coalesce(_observation, '')), '');
  bad := _answer in ('NON_COMPLIANT','PARTIALLY_NON_COMPLIANT');
  if bad and obs is null then raise exception 'NC/NCP exige observação.'; end if;
  select name into uname from public.profiles where id = auth.uid();

  if aa.answer is distinct from _answer then
    insert into public.audit_change_logs (audit_id, changed_by, changed_by_name, entity, field, previous_value, new_value, reason)
      values (au.id, auth.uid(), uname, 'audit_answer:' || aa.order_snapshot, 'answer', aa.answer, _answer, btrim(_reason));
  end if;
  if aa.observation is distinct from obs then
    insert into public.audit_change_logs (audit_id, changed_by, changed_by_name, entity, field, previous_value, new_value, reason)
      values (au.id, auth.uid(), uname, 'audit_answer:' || aa.order_snapshot, 'observation', aa.observation, obs, btrim(_reason));
  end if;

  update public.audit_answers set answer = _answer, observation = obs where id = _answer_id;
  perform public.recalc_audit(au.id);

  if (select overall_score from public.audits where id = au.id) is distinct from au.overall_score then
    insert into public.audit_change_logs (audit_id, changed_by, changed_by_name, entity, field, previous_value, new_value, reason)
      select au.id, auth.uid(), uname, 'audit', 'overall_score/classification',
        coalesce(au.overall_score::text, '—') || ' / ' || coalesce(au.classification, '—'),
        coalesce(a.overall_score::text, '—') || ' / ' || coalesce(a.classification, '—'), btrim(_reason)
      from public.audits a where a.id = au.id;
  end if;

  select * into plan from public.action_plans where audit_answer_id = _answer_id and not origin_changed order by created_at desc limit 1;
  if bad then
    if plan.id is null then
      insert into public.action_plans (audit_id, audit_answer_id, unit_id, sector_id, unit_name, sector_name, sense, question, nc_type, occurrence, where_text)
        values (au.id, _answer_id, au.unit_id, au.sector_id, au.unit_name_snapshot, au.sector_name_snapshot, aa.sense_snapshot, aa.question_snapshot,
          case _answer when 'NON_COMPLIANT' then 'NC' else 'NCP' end, obs, au.unit_name_snapshot || ' / ' || au.sector_name_snapshot)
        returning * into plan;
      insert into public.audit_change_logs (audit_id, changed_by, changed_by_name, entity, field, previous_value, new_value, reason)
        values (au.id, auth.uid(), uname, 'action_plan:' || left(plan.id::text, 8), 'created', null, plan.nc_type, btrim(_reason));
    else
      update public.action_plans set nc_type = case _answer when 'NON_COMPLIANT' then 'NC' else 'NCP' end, occurrence = obs, updated_at = now() where id = plan.id;
    end if;
  elsif plan.id is not null then
    update public.action_plans set origin_changed = true, updated_at = now(),
      origin_note = 'Origem alterada administrativamente em ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || ': ' || btrim(_reason)
      where id = plan.id;
    insert into public.audit_change_logs (audit_id, changed_by, changed_by_name, entity, field, previous_value, new_value, reason)
      values (au.id, auth.uid(), uname, 'action_plan:' || left(plan.id::text, 8), 'origin_changed', 'false', 'true', btrim(_reason));
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.refresh_my_notifications()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare uid uuid := auth.uid(); r public.app_role; days int; per date; pend int; total int;
begin
  if not public.is_active_user(uid) then return 0; end if;
  select role into r from public.user_roles where user_id = uid limit 1;
  days := coalesce((select (value #>> '{}')::int from public.settings where key = 'deadline_alert_days'), 3);
  per := public.current_period_start()::date;

  if r = 'admin' then
    insert into public.notifications(user_id, dedupe_key, type, title, message, link)
    select uid, 'new:' || p.id, 'NEW_NC', 'Nova ação pendente',
      'Auditoria ' || a.audit_number || ' gerou uma nova ' || case p.nc_type when 'NC' then 'Não Conformidade' else 'Não Conformidade Parcial' end || ' em ' || p.sector_name || '.',
      '/plano-de-acao/' || p.id
    from public.action_plans p join public.audits a on a.id = p.audit_id
    where p.created_at > now() - interval '7 days' and p.status = 'PENDENTE'
    on conflict do nothing;
  end if;

  if r in ('admin','manager','director') then
    insert into public.notifications(user_id, dedupe_key, type, title, message, link)
    select uid, 'overdue:' || p.id, 'OVERDUE', 'Ação vencida',
      'A ação do setor ' || p.sector_name || ' (' || p.unit_name || ') está vencida desde ' || to_char(p.when_date, 'DD/MM/YYYY') || '.',
      '/plano-de-acao/' || p.id
    from public.action_plans p
    where p.when_date < current_date and p.status in ('PENDENTE','EM_ANDAMENTO') and not p.origin_changed
      and (r <> 'director' or p.nc_type = 'NC')
    on conflict do nothing;
  end if;

  if r = 'manager' then
    insert into public.notifications(user_id, dedupe_key, type, title, message, link)
    select uid, 'due:' || p.id || ':' || p.when_date, 'DUE_SOON', 'Ação próxima do prazo',
      'A ação do setor ' || p.sector_name || ' vence em ' || to_char(p.when_date, 'DD/MM/YYYY') || '.', '/plano-de-acao/' || p.id
    from public.action_plans p
    where p.when_date between current_date and current_date + days and p.status in ('PENDENTE','EM_ANDAMENTO') and not p.origin_changed
    on conflict do nothing;
    insert into public.notifications(user_id, dedupe_key, type, title, message, link)
    select uid, 'pending:' || p.id, 'PENDING', 'Ação pendente',
      'Nova ação do setor ' || p.sector_name || ' aguardando preenchimento do 5W2H.', '/plano-de-acao/' || p.id
    from public.action_plans p
    where p.created_at > now() - interval '7 days' and p.status = 'PENDENTE' and not p.origin_changed
    on conflict do nothing;
  end if;

  if r in ('admin','auditor') then
    insert into public.notifications(user_id, dedupe_key, type, title, message, link)
    select uid, 'sector:' || s.sector_id || ':' || per, 'PENDING_AUDIT', 'Auditoria pendente',
      'O setor ' || s.sector_name || ' (' || s.unit_name || ') ainda não foi auditado neste período.', '/analise/setor/' || s.sector_id
    from public.sectors_pending_audit() s
    on conflict do nothing;
  end if;

  if r = 'director' then
    select count(*) into pend from public.sectors_pending_audit();
    select count(*) into total from public.sectors s join public.units u on u.id = s.unit_id where s.active and u.active;
    if pend > 0 then
      insert into public.notifications(user_id, dedupe_key, type, title, message, link)
      values (uid, 'coverage:' || per, 'COVERAGE', 'Cobertura incompleta',
        (total - pend) || ' de ' || total || ' setores auditados neste período.', '/dashboard')
      on conflict do nothing;
    end if;
  end if;
  return (select count(*) from public.notifications where user_id = uid and read_at is null);
end $$;
REVOKE ALL ON FUNCTION public.refresh_my_notifications() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.refresh_my_notifications() TO authenticated;