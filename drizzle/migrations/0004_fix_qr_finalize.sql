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
      a.unit_name_snapshot || ' / ' || a.sector_name_snapshot
    from public.audits a join public.audit_answers aa on aa.audit_id = a.id
    where a.id = _audit_id and aa.answer in ('NON_COMPLIANT','PARTIALLY_NON_COMPLIANT')
      and not exists (select 1 from public.action_plans p where p.audit_answer_id = aa.id);

  select audit_number, overall_score, classification, finished_at into r from public.audits where id = _audit_id;
  return json_build_object('ok', true, 'audit_number', r.audit_number, 'overall_score', r.overall_score,
    'classification', r.classification, 'finished_at', r.finished_at);
end $function$;