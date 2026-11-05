create sequence if not exists public.audit_number_seq;

create or replace function public.sense_rank(_s text) returns int language sql immutable as $$
  select case _s when 'UTILIZACAO' then 1 when 'ORGANIZACAO' then 2 when 'LIMPEZA' then 3
    when 'HIGIENE' then 4 when 'DISCIPLINA' then 5 when 'COLETA' then 6 else 9 end
$$;

-- CHECKLIST VERSIONS
create table public.checklist_versions (
  id uuid primary key default gen_random_uuid(),
  version_number text not null unique,
  status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','ARCHIVED')),
  description text,
  created_by uuid,
  created_at timestamptz not null default now(),
  published_at timestamptz
);
create unique index checklist_one_published on public.checklist_versions ((true)) where status = 'PUBLISHED';
create unique index checklist_one_draft on public.checklist_versions ((true)) where status = 'DRAFT';
grant select on public.checklist_versions to authenticated;
grant all on public.checklist_versions to service_role;
alter table public.checklist_versions enable row level security;
create policy "versions read" on public.checklist_versions for select to authenticated using (public.is_active_user(auth.uid()));

-- CHECKLIST QUESTIONS
create table public.checklist_questions (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.checklist_versions(id) on delete restrict,
  sense text not null check (sense in ('UTILIZACAO','ORGANIZACAO','LIMPEZA','HIGIENE','DISCIPLINA','COLETA')),
  position int not null,
  text text not null check (length(btrim(text)) between 5 and 1000),
  active boolean not null default true,
  source_question_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index checklist_questions_version_idx on public.checklist_questions(version_id, position);
grant select, insert, update, delete on public.checklist_questions to authenticated;
grant all on public.checklist_questions to service_role;
alter table public.checklist_questions enable row level security;
create trigger checklist_questions_touch before update on public.checklist_questions for each row execute function public.touch_updated_at();
create policy "questions read" on public.checklist_questions for select to authenticated using (public.is_active_user(auth.uid()));
create policy "questions admin insert" on public.checklist_questions for insert to authenticated with check (public.is_admin(auth.uid()));
create policy "questions admin update" on public.checklist_questions for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "questions admin delete" on public.checklist_questions for delete to authenticated using (public.is_admin(auth.uid()));

create or replace function public.checklist_questions_draft_only() returns trigger language plpgsql set search_path = public as $$
declare st text;
begin
  if tg_op = 'UPDATE' and new.version_id <> old.version_id then
    raise exception 'Não é permitido mover perguntas entre versões.';
  end if;
  select status into st from public.checklist_versions where id = coalesce(new.version_id, old.version_id);
  if st is distinct from 'DRAFT' then
    raise exception 'Somente perguntas de versões em rascunho podem ser alteradas.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger checklist_questions_draft_guard before insert or update or delete on public.checklist_questions
  for each row execute function public.checklist_questions_draft_only();

-- CHANGE REQUESTS
create table public.checklist_change_requests (
  id uuid primary key default gen_random_uuid(),
  question_id uuid references public.checklist_questions(id) on delete set null,
  question_text_snapshot text,
  kind text not null check (kind in ('EDIT','NEW')),
  proposal text not null check (length(btrim(proposal)) between 5 and 2000),
  justification text not null check (length(btrim(justification)) between 5 and 2000),
  author_id uuid not null default auth.uid(),
  author_name text,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED','INCORPORATED')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.checklist_change_requests to authenticated;
grant all on public.checklist_change_requests to service_role;
alter table public.checklist_change_requests enable row level security;
create policy "cr read" on public.checklist_change_requests for select to authenticated
  using (public.is_admin(auth.uid()) or (author_id = auth.uid() and public.is_active_user(auth.uid())));
create policy "cr insert" on public.checklist_change_requests for insert to authenticated
  with check (author_id = auth.uid() and status = 'PENDING' and public.is_active_user(auth.uid())
    and (public.has_role(auth.uid(),'auditor') or public.has_role(auth.uid(),'admin')));
create policy "cr admin update" on public.checklist_change_requests for update to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- AUDITS
create table public.audits (
  id uuid primary key default gen_random_uuid(),
  audit_number text not null unique default ('AUD-' || lpad(nextval('public.audit_number_seq')::text, 6, '0')),
  unit_id uuid not null references public.units(id) on delete restrict,
  sector_id uuid not null references public.sectors(id) on delete restrict,
  unit_name_snapshot text not null,
  sector_name_snapshot text not null,
  auditor_id uuid not null references public.auditors(id) on delete restrict,
  auditor_name_snapshot text not null,
  checklist_version_id uuid not null references public.checklist_versions(id) on delete restrict,
  checklist_version_snapshot text not null,
  companion_name text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  latitude double precision,
  longitude double precision,
  location_status text not null check (location_status in ('REGISTERED','DENIED','UNAVAILABLE')),
  overall_score numeric(6,3),
  classification text check (classification in ('OURO','PRATA','BRONZE','SEM_INDICE')),
  sense_scores jsonb not null default '{}'::jsonb,
  compliant_count int not null default 0,
  ncp_count int not null default 0,
  nc_count int not null default 0,
  na_count int not null default 0,
  status text not null default 'IN_PROGRESS' check (status in ('IN_PROGRESS','COMPLETED')),
  session_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index audits_sector_idx on public.audits(sector_id, finished_at desc);
create index audits_started_idx on public.audits(started_at desc);
create trigger audits_touch before update on public.audits for each row execute function public.touch_updated_at();
grant select (id, audit_number, unit_id, sector_id, unit_name_snapshot, sector_name_snapshot, auditor_id, auditor_name_snapshot,
  checklist_version_id, checklist_version_snapshot, companion_name, started_at, finished_at, latitude, longitude, location_status,
  overall_score, classification, sense_scores, compliant_count, ncp_count, nc_count, na_count, status, created_at, updated_at)
  on public.audits to authenticated;
grant all on public.audits to service_role;
alter table public.audits enable row level security;
create policy "audits read" on public.audits for select to authenticated using (public.is_active_user(auth.uid()));

create table public.audit_answers (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete restrict,
  question_id uuid not null references public.checklist_questions(id) on delete restrict,
  question_snapshot text not null,
  sense_snapshot text not null,
  order_snapshot int not null,
  answer text check (answer in ('COMPLIANT','PARTIALLY_NON_COMPLIANT','NON_COMPLIANT','NOT_APPLICABLE')),
  score_percentage numeric(6,3),
  observation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (audit_id, question_id)
);
create index audit_answers_audit_idx on public.audit_answers(audit_id, order_snapshot);
create trigger audit_answers_touch before update on public.audit_answers for each row execute function public.touch_updated_at();
grant select on public.audit_answers to authenticated;
grant all on public.audit_answers to service_role;
alter table public.audit_answers enable row level security;
create policy "answers read" on public.audit_answers for select to authenticated using (public.is_active_user(auth.uid()));

create table public.audit_evidences (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete restrict,
  audit_answer_id uuid not null references public.audit_answers(id) on delete restrict,
  storage_path text not null unique,
  source text not null check (source in ('CAMERA','GALLERY')),
  created_at timestamptz not null default now()
);
create index audit_evidences_answer_idx on public.audit_evidences(audit_answer_id);
grant select on public.audit_evidences to authenticated;
grant all on public.audit_evidences to service_role;
alter table public.audit_evidences enable row level security;
create policy "evidences read" on public.audit_evidences for select to authenticated using (public.is_active_user(auth.uid()));

-- ACTION PLANS (5W2H structure; managed in PRD 3)
create table public.action_plans (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete restrict,
  audit_answer_id uuid not null unique references public.audit_answers(id) on delete restrict,
  unit_id uuid not null references public.units(id),
  sector_id uuid not null references public.sectors(id),
  unit_name text not null,
  sector_name text not null,
  sense text not null,
  question text not null,
  nc_type text not null check (nc_type in ('NC','NCP')),
  occurrence text,
  what text, why text, where_text text, who text, when_date date, how text, how_much numeric(12,2),
  status text not null default 'PENDENTE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger action_plans_touch before update on public.action_plans for each row execute function public.touch_updated_at();
grant select on public.action_plans to authenticated;
grant all on public.action_plans to service_role;
alter table public.action_plans enable row level security;
create policy "action plans read" on public.action_plans for select to authenticated using (public.is_active_user(auth.uid()));

-- CHANGE LOGS
create table public.audit_change_logs (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete restrict,
  changed_by uuid not null,
  changed_by_name text,
  entity text not null,
  field text not null,
  previous_value text,
  new_value text,
  reason text not null,
  changed_at timestamptz not null default now()
);
create index audit_change_logs_audit_idx on public.audit_change_logs(audit_id, changed_at);
grant select on public.audit_change_logs to authenticated;
grant all on public.audit_change_logs to service_role;
alter table public.audit_change_logs enable row level security;
create policy "logs read" on public.audit_change_logs for select to authenticated
  using (public.is_active_user(auth.uid()) and (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'director') or public.has_role(auth.uid(),'auditor')));

-- QR internal tables (no client access)
create table public.qr_validation_tickets (
  token_hash text primary key,
  auditor_id uuid not null references public.auditors(id),
  sector_id uuid not null references public.sectors(id),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
grant all on public.qr_validation_tickets to service_role;
alter table public.qr_validation_tickets enable row level security;

create table public.qr_attempts (
  id bigserial primary key,
  key text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index qr_attempts_key_idx on public.qr_attempts(key, created_at desc);
grant all on public.qr_attempts to service_role;
alter table public.qr_attempts enable row level security;

-- HELPERS
create or replace function public.sha256_hex(_v text) returns text language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest(_v, 'sha256'), 'hex')
$$;

create or replace function public.request_ip() returns text language sql stable as $$
  select nullif(btrim(split_part(coalesce((nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for'), ''), ',', 1)), '')
$$;

create or replace function public.recalc_audit(_audit_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare sc jsonb; md jsonb; c numeric; p numeric; n numeric; ov numeric; cls text; g numeric; s numeric; b numeric;
begin
  select value into sc from public.settings where key = 'scoring';
  select value into md from public.settings where key = 'medals';
  c := coalesce((sc->>'conforme')::numeric, 100);
  p := coalesce((sc->>'nc_parcial')::numeric, 50);
  n := coalesce((sc->>'nao_conforme')::numeric, 0);
  g := coalesce((md->>'gold_min')::numeric, 90);
  s := coalesce((md->>'silver_min')::numeric, 80);
  b := greatest(coalesce((md->>'bronze_min')::numeric, 70), 70);

  update public.audit_answers set score_percentage = case answer
    when 'COMPLIANT' then c when 'PARTIALLY_NON_COMPLIANT' then p when 'NON_COMPLIANT' then n else null end
  where audit_id = _audit_id;

  select avg(score_percentage) into ov from public.audit_answers where audit_id = _audit_id and score_percentage is not null;
  cls := case when ov is null then 'SEM_INDICE' when ov >= g then 'OURO' when ov >= s then 'PRATA' when ov >= b then 'BRONZE' else 'SEM_INDICE' end;

  update public.audits a set
    overall_score = round(ov, 3),
    classification = cls,
    sense_scores = coalesce((select jsonb_object_agg(x.sense_snapshot, x.v) from (
        select sense_snapshot, round(avg(score_percentage), 3) v from public.audit_answers where audit_id = _audit_id group by sense_snapshot) x), '{}'::jsonb),
    compliant_count = (select count(*) from public.audit_answers where audit_id = _audit_id and answer = 'COMPLIANT'),
    ncp_count = (select count(*) from public.audit_answers where audit_id = _audit_id and answer = 'PARTIALLY_NON_COMPLIANT'),
    nc_count = (select count(*) from public.audit_answers where audit_id = _audit_id and answer = 'NON_COMPLIANT'),
    na_count = (select count(*) from public.audit_answers where audit_id = _audit_id and answer = 'NOT_APPLICABLE')
  where a.id = _audit_id;
end $$;
revoke execute on function public.recalc_audit(uuid) from public, anon, authenticated;

create or replace function public.qr_session_ok(_audit_id uuid, _session text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.audits where id = _audit_id and session_hash is not null and session_hash = public.sha256_hex(coalesce(_session,'')))
$$;
revoke execute on function public.qr_session_ok(uuid, text) from public, anon, authenticated;
grant execute on function public.qr_session_ok(uuid, text) to service_role;

-- PUBLIC QR FLOW
create or replace function public.qr_sector_info(_token text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('sector_name', s.name, 'unit_name', u.name, 'active', s.active and u.active,
    'has_checklist', exists (select 1 from public.checklist_versions where status = 'PUBLISHED'))
  from public.sectors s join public.units u on u.id = s.unit_id where s.qr_token = _token
$$;

create or replace function public.qr_validate_auditor(_token text, _code text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare k text; cnt int; sec record; aud record; matches int; tok text;
  generic constant text := 'Código inválido ou auditor não autorizado.';
begin
  k := coalesce(public.request_ip(), 'unknown') || ':' || coalesce(_token, '');
  select count(*) into cnt from public.qr_attempts where key = k and not success and created_at > now() - interval '15 minutes';
  if cnt >= 5 then
    return json_build_object('ok', false, 'error', 'Muitas tentativas inválidas. Aguarde 15 minutos e tente novamente.');
  end if;

  select s.id, s.unit_id into sec from public.sectors s join public.units u on u.id = s.unit_id
    where s.qr_token = _token and s.active and u.active;
  if not found then
    return json_build_object('ok', false, 'error', 'QR Code inválido ou setor inativo.');
  end if;

  if _code is null or _code !~ '^\d{6}$' then
    insert into public.qr_attempts(key, success) values (k, false);
    return json_build_object('ok', false, 'error', generic);
  end if;

  select count(*) into matches from public.auditors
    where active and authorized and (left(cpf, 6) = _code
      or (custom_pin_hash is not null and custom_pin_hash = extensions.crypt(_code, custom_pin_hash)));
  if matches <> 1 then
    insert into public.qr_attempts(key, success) values (k, false);
    return json_build_object('ok', false, 'error', generic);
  end if;

  select id, name into aud from public.auditors
    where active and authorized and (left(cpf, 6) = _code
      or (custom_pin_hash is not null and custom_pin_hash = extensions.crypt(_code, custom_pin_hash)));

  insert into public.qr_attempts(key, success) values (k, true);
  tok := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.qr_validation_tickets(token_hash, auditor_id, sector_id, expires_at)
    values (public.sha256_hex(tok), aud.id, sec.id, now() + interval '30 minutes');
  return json_build_object('ok', true, 'auditor_name', aud.name, 'ticket', tok, 'server_now', now());
end $$;

create or replace function public.qr_start_audit(_ticket text, _companion text, _lat double precision, _lng double precision, _location_status text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare t record; a record; s record; u record; v record; sess text; new_id uuid; num text; loc text;
begin
  select * into t from public.qr_validation_tickets
    where token_hash = public.sha256_hex(coalesce(_ticket,'')) and used_at is null and expires_at > now();
  if not found then return json_build_object('ok', false, 'error', 'Validação expirada. Valide o código novamente.'); end if;
  if _companion is null or length(btrim(_companion)) < 2 or length(_companion) > 120 then
    return json_build_object('ok', false, 'error', 'Informe a pessoa que acompanhou a auditoria.');
  end if;
  loc := case when _location_status in ('REGISTERED','DENIED','UNAVAILABLE') then _location_status else 'UNAVAILABLE' end;
  if loc = 'REGISTERED' and (_lat is null or _lng is null or _lat not between -90 and 90 or _lng not between -180 and 180) then
    loc := 'UNAVAILABLE';
  end if;

  select id, name into a from public.auditors where id = t.auditor_id and active and authorized;
  if not found then return json_build_object('ok', false, 'error', 'Código inválido ou auditor não autorizado.'); end if;
  select id, name, unit_id into s from public.sectors where id = t.sector_id and active;
  select id, name into u from public.units where id = s.unit_id and active;
  if s.id is null or u.id is null then return json_build_object('ok', false, 'error', 'Setor inativo.'); end if;
  select id, version_number into v from public.checklist_versions where status = 'PUBLISHED';
  if not found then return json_build_object('ok', false, 'error', 'Nenhum checklist publicado.'); end if;

  sess := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.audits (unit_id, sector_id, unit_name_snapshot, sector_name_snapshot, auditor_id, auditor_name_snapshot,
      checklist_version_id, checklist_version_snapshot, companion_name, latitude, longitude, location_status, session_hash)
    values (u.id, s.id, u.name, s.name, a.id, a.name, v.id, v.version_number, btrim(_companion),
      case when loc = 'REGISTERED' then _lat end, case when loc = 'REGISTERED' then _lng end, loc, public.sha256_hex(sess))
    returning id, audit_number into new_id, num;

  insert into public.audit_answers (audit_id, question_id, question_snapshot, sense_snapshot, order_snapshot)
    select new_id, q.id, q.text, q.sense, row_number() over (order by public.sense_rank(q.sense), q.position)
    from public.checklist_questions q where q.version_id = v.id and q.active;

  update public.qr_validation_tickets set used_at = now() where token_hash = t.token_hash;
  return json_build_object('ok', true, 'audit_id', new_id, 'audit_number', num, 'session', sess);
end $$;

create or replace function public.qr_get_audit(_audit_id uuid, _session text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.qr_session_ok(_audit_id, _session) then return null; end if;
  return (select json_build_object(
    'audit', (select json_build_object('id', id, 'audit_number', audit_number, 'unit_name', unit_name_snapshot, 'sector_name', sector_name_snapshot,
       'auditor_name', auditor_name_snapshot, 'version', checklist_version_snapshot, 'companion_name', companion_name, 'started_at', started_at,
       'finished_at', finished_at, 'location_status', location_status, 'status', status, 'overall_score', overall_score,
       'classification', classification, 'sense_scores', sense_scores) from public.audits where id = _audit_id),
    'answers', coalesce((select json_agg(json_build_object('id', id, 'question', question_snapshot, 'sense', sense_snapshot,
       'order', order_snapshot, 'answer', answer, 'observation', observation) order by order_snapshot)
       from public.audit_answers where audit_id = _audit_id), '[]'::json),
    'evidences', coalesce((select json_agg(json_build_object('id', id, 'answer_id', audit_answer_id, 'path', storage_path, 'source', source) order by created_at)
       from public.audit_evidences where audit_id = _audit_id), '[]'::json),
    'settings', json_build_object('scoring', (select value from public.settings where key = 'scoring'),
       'medals', (select value from public.settings where key = 'medals'))
  ));
end $$;

create or replace function public.qr_save_answer(_audit_id uuid, _session text, _answer_id uuid, _answer text, _observation text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not public.qr_session_ok(_audit_id, _session) then return json_build_object('ok', false, 'error', 'Sessão inválida.'); end if;
  if not exists (select 1 from public.audits where id = _audit_id and status = 'IN_PROGRESS') then
    return json_build_object('ok', false, 'error', 'Auditoria já finalizada.');
  end if;
  if _answer is not null and _answer not in ('COMPLIANT','PARTIALLY_NON_COMPLIANT','NON_COMPLIANT','NOT_APPLICABLE') then
    return json_build_object('ok', false, 'error', 'Resposta inválida.');
  end if;
  if length(coalesce(_observation, '')) > 2000 then return json_build_object('ok', false, 'error', 'Observação muito longa.'); end if;
  update public.audit_answers set answer = _answer, observation = nullif(btrim(coalesce(_observation, '')), '')
    where id = _answer_id and audit_id = _audit_id;
  if not found then return json_build_object('ok', false, 'error', 'Pergunta não encontrada.'); end if;
  return json_build_object('ok', true);
end $$;

create or replace function public.qr_add_evidence(_audit_id uuid, _session text, _answer_id uuid, _path text, _source text)
returns json language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not public.qr_session_ok(_audit_id, _session) then return json_build_object('ok', false, 'error', 'Sessão inválida.'); end if;
  if not exists (select 1 from public.audits where id = _audit_id and status = 'IN_PROGRESS') then
    return json_build_object('ok', false, 'error', 'Auditoria já finalizada.');
  end if;
  if not exists (select 1 from public.audit_answers where id = _answer_id and audit_id = _audit_id) then
    return json_build_object('ok', false, 'error', 'Pergunta não encontrada.');
  end if;
  if _path not like (_audit_id::text || '/' || _answer_id::text || '/%') or _source not in ('CAMERA','GALLERY') then
    return json_build_object('ok', false, 'error', 'Evidência inválida.');
  end if;
  insert into public.audit_evidences (audit_id, audit_answer_id, storage_path, source) values (_audit_id, _answer_id, _path, _source)
    on conflict (storage_path) do update set source = excluded.source returning id into new_id;
  return json_build_object('ok', true, 'id', new_id);
end $$;

create or replace function public.qr_remove_evidence(_audit_id uuid, _session text, _evidence_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare p text;
begin
  if not public.qr_session_ok(_audit_id, _session) then return json_build_object('ok', false, 'error', 'Sessão inválida.'); end if;
  if not exists (select 1 from public.audits where id = _audit_id and status = 'IN_PROGRESS') then
    return json_build_object('ok', false, 'error', 'Auditoria já finalizada.');
  end if;
  delete from public.audit_evidences where id = _evidence_id and audit_id = _audit_id returning storage_path into p;
  return json_build_object('ok', p is not null, 'path', p);
end $$;
revoke execute on function public.qr_remove_evidence(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.qr_remove_evidence(uuid, text, uuid) to service_role;

create or replace function public.qr_finalize(_audit_id uuid, _session text) returns json
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not public.qr_session_ok(_audit_id, _session) then return json_build_object('ok', false, 'error', 'Sessão inválida.'); end if;
  if not exists (select 1 from public.audits where id = _audit_id and status = 'IN_PROGRESS') then
    return json_build_object('ok', false, 'error', 'Auditoria já finalizada.');
  end if;
  if exists (select 1 from public.audit_answers where audit_id = _audit_id and answer is null) then
    return json_build_object('ok', false, 'error', 'Existem perguntas sem resposta.');
  end if;
  if exists (select 1 from public.audit_answers where audit_id = _audit_id and answer in ('NON_COMPLIANT','PARTIALLY_NON_COMPLIANT') and coalesce(btrim(observation), '') = '') then
    return json_build_object('ok', false, 'error', 'Existem NC/NCP sem observação.');
  end if;
  if exists (select 1 from public.audit_answers aa where aa.audit_id = _audit_id and aa.answer in ('NON_COMPLIANT','PARTIALLY_NON_COMPLIANT')
      and not exists (select 1 from public.audit_evidences e where e.audit_answer_id = aa.id)) then
    return json_build_object('ok', false, 'error', 'Existem NC/NCP sem foto.');
  end if;

  perform public.recalc_audit(_audit_id);
  update public.audits set status = 'COMPLETED', finished_at = now() where id = _audit_id;

  insert into public.action_plans (audit_id, audit_answer_id, unit_id, sector_id, unit_name, sector_name, sense, question, nc_type, occurrence, where_text)
    select a.id, aa.id, a.unit_id, a.sector_id, a.unit_name_snapshot, a.sector_name_snapshot, aa.sense_snapshot, aa.question_snapshot,
      case aa.answer when 'NON_COMPLIANT' then 'NC' else 'NCP' end, aa.observation,
      a.unit_name_snapshot || ' — ' || a.sector_name_snapshot
    from public.audits a join public.audit_answers aa on aa.audit_id = a.id
    where a.id = _audit_id and aa.answer in ('NON_COMPLIANT','PARTIALLY_NON_COMPLIANT')
    on conflict (audit_answer_id) do nothing;

  select audit_number, overall_score, classification, finished_at into r from public.audits where id = _audit_id;
  return json_build_object('ok', true, 'audit_number', r.audit_number, 'overall_score', r.overall_score,
    'classification', r.classification, 'finished_at', r.finished_at);
end $$;

grant execute on function public.qr_sector_info(text) to anon, authenticated;
grant execute on function public.qr_validate_auditor(text, text) to anon, authenticated;
grant execute on function public.qr_start_audit(text, text, double precision, double precision, text) to anon, authenticated;
grant execute on function public.qr_get_audit(uuid, text) to anon, authenticated;
grant execute on function public.qr_save_answer(uuid, text, uuid, text, text) to anon, authenticated;
grant execute on function public.qr_add_evidence(uuid, text, uuid, text, text) to anon, authenticated;
grant execute on function public.qr_finalize(uuid, text) to anon, authenticated;

-- ADMIN CHECKLIST RPCs
create or replace function public.create_checklist_draft(_description text) returns uuid
language plpgsql security definer set search_path = public as $$
declare p record; nv text; new_id uuid; mj int; mn int;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Sem permissão'; end if;
  if exists (select 1 from public.checklist_versions where status = 'DRAFT') then raise exception 'Já existe uma versão em rascunho.'; end if;
  select * into p from public.checklist_versions where status = 'PUBLISHED';
  select max(split_part(version_number, '.', 1)::int) into mj from public.checklist_versions;
  select max(split_part(version_number, '.', 2)::int) into mn from public.checklist_versions where split_part(version_number, '.', 1)::int = mj;
  nv := case when mj is null then '1.0' else mj || '.' || (coalesce(mn, 0) + 1) end;
  insert into public.checklist_versions (version_number, status, description, created_by)
    values (nv, 'DRAFT', nullif(btrim(coalesce(_description, '')), ''), auth.uid()) returning id into new_id;
  if p.id is not null then
    insert into public.checklist_questions (version_id, sense, position, text, active, source_question_id)
      select new_id, sense, position, text, active, id from public.checklist_questions where version_id = p.id;
  end if;
  return new_id;
end $$;

create or replace function public.publish_checklist_version(_version_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Sem permissão'; end if;
  if not exists (select 1 from public.checklist_versions where id = _version_id and status = 'DRAFT') then
    raise exception 'Somente versões em rascunho podem ser publicadas.';
  end if;
  if not exists (select 1 from public.checklist_questions where version_id = _version_id and active) then
    raise exception 'A versão precisa ter ao menos uma pergunta ativa.';
  end if;
  update public.checklist_versions set status = 'ARCHIVED' where status = 'PUBLISHED';
  update public.checklist_versions set status = 'PUBLISHED', published_at = now() where id = _version_id;
end $$;

create or replace function public.discard_checklist_draft(_version_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Sem permissão'; end if;
  if not exists (select 1 from public.checklist_versions where id = _version_id and status = 'DRAFT') then
    raise exception 'Somente rascunhos podem ser descartados.';
  end if;
  update public.checklist_change_requests set question_id = null where question_id in (select id from public.checklist_questions where version_id = _version_id);
  delete from public.checklist_questions where version_id = _version_id;
  delete from public.checklist_versions where id = _version_id;
end $$;
grant execute on function public.create_checklist_draft(text) to authenticated;
grant execute on function public.publish_checklist_version(uuid) to authenticated;
grant execute on function public.discard_checklist_draft(uuid) to authenticated;

-- ADMIN EDIT OF A COMPLETED AUDIT
create or replace function public.admin_update_answer(_answer_id uuid, _answer text, _observation text, _reason text) returns void
language plpgsql security definer set search_path = public as $$
declare aa record; au record; uname text; obs text; plan record;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Sem permissão'; end if;
  if _reason is null or length(btrim(_reason)) < 5 then raise exception 'Informe o motivo da alteração (mínimo 5 caracteres).'; end if;
  if _answer not in ('COMPLIANT','PARTIALLY_NON_COMPLIANT','NON_COMPLIANT','NOT_APPLICABLE') then raise exception 'Resposta inválida.'; end if;
  select * into aa from public.audit_answers where id = _answer_id;
  if not found then raise exception 'Resposta não encontrada.'; end if;
  select * into au from public.audits where id = aa.audit_id;
  if au.status <> 'COMPLETED' then raise exception 'Somente auditorias concluídas podem ser alteradas pelo administrador.'; end if;
  obs := nullif(btrim(coalesce(_observation, '')), '');
  if _answer in ('NON_COMPLIANT','PARTIALLY_NON_COMPLIANT') and obs is null then raise exception 'NC/NCP exige observação.'; end if;
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

  select * into plan from public.action_plans where audit_answer_id = _answer_id;
  if _answer in ('NON_COMPLIANT','PARTIALLY_NON_COMPLIANT') then
    if plan.id is null then
      insert into public.action_plans (audit_id, audit_answer_id, unit_id, sector_id, unit_name, sector_name, sense, question, nc_type, occurrence, where_text)
        values (au.id, _answer_id, au.unit_id, au.sector_id, au.unit_name_snapshot, au.sector_name_snapshot, aa.sense_snapshot, aa.question_snapshot,
          case _answer when 'NON_COMPLIANT' then 'NC' else 'NCP' end, obs, au.unit_name_snapshot || ' — ' || au.sector_name_snapshot);
    else
      update public.action_plans set nc_type = case _answer when 'NON_COMPLIANT' then 'NC' else 'NCP' end, occurrence = obs,
        status = case when status = 'CANCELADO' then 'PENDENTE' else status end where id = plan.id;
    end if;
  elsif plan.id is not null and plan.status <> 'CANCELADO' then
    update public.action_plans set status = 'CANCELADO' where id = plan.id;
    insert into public.audit_change_logs (audit_id, changed_by, changed_by_name, entity, field, previous_value, new_value, reason)
      values (au.id, auth.uid(), uname, 'action_plan', 'status', plan.status, 'CANCELADO', btrim(_reason));
  end if;
end $$;
grant execute on function public.admin_update_answer(uuid, text, text, text) to authenticated;

-- PERIOD / COVERAGE HELPERS (used by PRD 3 dashboard)
create or replace function public.current_period_start() returns timestamptz
language sql stable security definer set search_path = public as $$
  select case coalesce((select value #>> '{}' from public.settings where key = 'audit_periodicity'), 'monthly')
    when 'weekly' then date_trunc('week', now())
    when 'biweekly' then case when extract(day from now()) >= 16 then date_trunc('month', now()) + interval '15 days' else date_trunc('month', now()) end
    else date_trunc('month', now()) end
$$;

create or replace function public.latest_completed_audits()
returns table (sector_id uuid, audit_id uuid, audit_number text, finished_at timestamptz, overall_score numeric, classification text)
language sql stable security definer set search_path = public as $$
  select distinct on (a.sector_id) a.sector_id, a.id, a.audit_number, a.finished_at, a.overall_score, a.classification
  from public.audits a
  where a.status = 'COMPLETED' and public.is_active_user(auth.uid())
  order by a.sector_id, a.finished_at desc
$$;

create or replace function public.sectors_pending_audit()
returns table (sector_id uuid, sector_name text, unit_id uuid, unit_name text)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, u.id, u.name
  from public.sectors s join public.units u on u.id = s.unit_id
  where public.is_active_user(auth.uid()) and s.active and u.active
    and not exists (select 1 from public.audits a where a.sector_id = s.id and a.status = 'COMPLETED' and a.finished_at >= public.current_period_start())
  order by u.name, s.name
$$;
grant execute on function public.current_period_start() to authenticated;
grant execute on function public.latest_completed_audits() to authenticated;
grant execute on function public.sectors_pending_audit() to authenticated;

-- STORAGE read policy for evidence photos (bucket created separately)
create policy "audit evidences read" on storage.objects for select to authenticated
  using (bucket_id = 'audit-evidences' and public.is_active_user(auth.uid()));