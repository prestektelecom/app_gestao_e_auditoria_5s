-- Finalização forçada de uma auditoria em andamento, só para administrador.
--
-- Serve para auditorias abandonadas em campo (auditor saiu, celular sem bateria etc.). Diferente
-- de qr_finalize, não cobra respostas, observações nem fotos: perguntas sem resposta ficam sem
-- resposta e não entram na nota (recalc_audit só considera as respondidas). Depois de concluída, o
-- administrador pode completar as respostas pela tela de detalhe (admin_update_answer).
-- O motivo é obrigatório e fica no histórico de alterações da auditoria.

create or replace function public.admin_force_finalize_audit(_audit_id uuid, _reason text) returns json
language plpgsql security definer set search_path = public as $$
declare au record; uname text; pending int; r record;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Sem permissão'; end if;
  if _reason is null or length(btrim(_reason)) < 5 then raise exception 'Informe o motivo da finalização (mínimo 5 caracteres).'; end if;
  select * into au from public.audits where id = _audit_id for update;
  if not found then raise exception 'Auditoria não encontrada.'; end if;
  if au.status <> 'IN_PROGRESS' then raise exception 'Auditoria já finalizada.'; end if;

  select name into uname from public.profiles where id = auth.uid();
  select count(*) into pending from public.audit_answers where audit_id = _audit_id and answer is null;

  perform public.recalc_audit(_audit_id);
  -- A sessão do QR continua valendo só para leitura: as funções qr_* de gravação exigem IN_PROGRESS,
  -- então o celular em campo passa a ver a auditoria concluída e não consegue mais alterar nada.
  update public.audits set status = 'COMPLETED', finished_at = now() where id = _audit_id;

  insert into public.action_plans (audit_id, audit_answer_id, unit_id, sector_id, unit_name, sector_name, sense, question, nc_type, occurrence, where_text)
    select a.id, aa.id, a.unit_id, a.sector_id, a.unit_name_snapshot, a.sector_name_snapshot, aa.sense_snapshot, aa.question_snapshot,
      case aa.answer when 'NON_COMPLIANT' then 'NC' else 'NCP' end, aa.observation,
      a.unit_name_snapshot || ' / ' || a.sector_name_snapshot
    from public.audits a join public.audit_answers aa on aa.audit_id = a.id
    where a.id = _audit_id and aa.answer in ('NON_COMPLIANT','PARTIALLY_NON_COMPLIANT')
      and not exists (select 1 from public.action_plans p where p.audit_answer_id = aa.id);

  insert into public.audit_change_logs (audit_id, changed_by, changed_by_name, entity, field, previous_value, new_value, reason)
    values (_audit_id, auth.uid(), uname, 'audit', 'status', 'IN_PROGRESS', 'COMPLETED',
      'Finalização forçada pelo administrador' || case when pending > 0 then ' (' || pending || ' pergunta(s) sem resposta)' else '' end
        || ': ' || btrim(_reason));

  select audit_number, overall_score, classification, finished_at into r from public.audits where id = _audit_id;
  return json_build_object('ok', true, 'audit_number', r.audit_number, 'overall_score', r.overall_score,
    'classification', r.classification, 'finished_at', r.finished_at, 'unanswered', pending);
end $$;

revoke all on function public.admin_force_finalize_audit(uuid, text) from public, anon;
grant execute on function public.admin_force_finalize_audit(uuid, text) to authenticated;
