-- Configuração: exigir (ou não) foto e observação nas respostas NC/NCP da auditoria pelo QR Code.
--
-- public.settings, chave nc_requirements = {"photo": bool, "observation": bool}. O padrão
-- mantém o comportamento anterior (as duas obrigatórias); o administrador muda em Configurações.
-- qr_get_audit envia a configuração para a tela do QR, e qr_finalize só cobra o que estiver ligado.

insert into public.settings (key, value) values ('nc_requirements', '{"photo": true, "observation": true}'::jsonb)
  on conflict (key) do nothing;

create or replace function public.nc_requirement(_what text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (value ->> _what)::boolean from public.settings where key = 'nc_requirements'), true)
$$;

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
       'medals', (select value from public.settings where key = 'medals'),
       'nc_requirements', json_build_object('photo', public.nc_requirement('photo'), 'observation', public.nc_requirement('observation')))
  ));
end $$;

CREATE OR REPLACE FUNCTION public.qr_finalize(_audit_id uuid, _session text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare r record;
begin
  if not public.qr_session_ok(_audit_id, _session) then return json_build_object('ok', false, 'error', 'Sessão inválida.'); end if;
  if not exists (select 1 from public.audits where id = _audit_id and status = 'IN_PROGRESS') then
    return json_build_object('ok', false, 'error', 'Auditoria já finalizada.');
  end if;
  if exists (select 1 from public.audit_answers where audit_id = _audit_id and answer is null) then
    return json_build_object('ok', false, 'error', 'Existem perguntas sem resposta.');
  end if;
  if public.nc_requirement('observation') and exists (select 1 from public.audit_answers where audit_id = _audit_id
      and answer in ('NON_COMPLIANT','PARTIALLY_NON_COMPLIANT') and coalesce(btrim(observation), '') = '') then
    return json_build_object('ok', false, 'error', 'Existem NC/NCP sem observação.');
  end if;
  if public.nc_requirement('photo') and exists (select 1 from public.audit_answers aa where aa.audit_id = _audit_id
      and aa.answer in ('NON_COMPLIANT','PARTIALLY_NON_COMPLIANT')
      and not exists (select 1 from public.audit_evidences e where e.audit_answer_id = aa.id)) then
    return json_build_object('ok', false, 'error', 'Existem NC/NCP sem foto.');
  end if;

  perform public.recalc_audit(_audit_id);
  update public.audits set status = 'COMPLETED', finished_at = now() where id = _audit_id;

  insert into public.action_plans (audit_id, audit_answer_id, unit_id, sector_id, unit_name, sector_name, sense, question, nc_type, occurrence, where_text)
    select a.id, aa.id, a.unit_id, a.sector_id, a.unit_name_snapshot, a.sector_name_snapshot, aa.sense_snapshot, aa.question_snapshot,
      case aa.answer when 'NON_COMPLIANT' then 'NC' else 'NCP' end, aa.observation,
      a.unit_name_snapshot || ' / ' || a.sector_name_snapshot
    from public.audits a join public.audit_answers aa on aa.audit_id = a.id
    where a.id = _audit_id and aa.answer in ('NON_COMPLIANT','PARTIALLY_NON_COMPLIANT')
      and not exists (select 1 from public.action_plans p where p.audit_answer_id = aa.id);

  select audit_number, overall_score, classification, finished_at into r from public.audits where id = _audit_id;
  return json_build_object('ok', true, 'audit_number', r.audit_number, 'overall_score', r.overall_score,
    'classification', r.classification, 'finished_at', r.finished_at);
end $function$;
