-- Exclusão definitiva de uma auditoria, só para administrador.
--
-- As tabelas filhas (respostas, fotos, planos 5W2H, histórico de alterações) usam
-- ON DELETE RESTRICT, então a função apaga cada uma na ordem certa. O histórico de
-- alterações da auditoria sai junto; por isso fica um registro mínimo do que foi
-- excluído e por quem, em audit_deletion_logs.

create table public.audit_deletion_logs (
  id uuid primary key default gen_random_uuid(),
  audit_number text not null,
  unit_name text not null,
  sector_name text not null,
  auditor_name text not null,
  audit_status text not null,
  overall_score numeric(6,3),
  classification text,
  started_at timestamptz not null,
  deleted_by uuid not null,
  deleted_by_name text,
  deleted_at timestamptz not null default now()
);
create index audit_deletion_logs_deleted_idx on public.audit_deletion_logs(deleted_at desc);
grant select on public.audit_deletion_logs to authenticated;
grant all on public.audit_deletion_logs to service_role;
alter table public.audit_deletion_logs enable row level security;
create policy "audit deletion logs admin read" on public.audit_deletion_logs for select to authenticated
  using (public.is_admin(auth.uid()));

-- Devolve (em json) a lista de caminhos das fotos do bucket audit-evidences, para o servidor
-- apagar os arquivos depois do commit.
create or replace function public.admin_delete_audit(_audit_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare au record; uname text; paths text[];
begin
  if not public.is_admin(auth.uid()) then raise exception 'Sem permissão'; end if;
  select * into au from public.audits where id = _audit_id for update;
  if not found then raise exception 'Auditoria não encontrada.'; end if;

  select coalesce(array_agg(storage_path), '{}') into paths from public.audit_evidences where audit_id = _audit_id;
  select name into uname from public.profiles where id = auth.uid();

  insert into public.audit_deletion_logs
    (audit_number, unit_name, sector_name, auditor_name, audit_status, overall_score, classification, started_at, deleted_by, deleted_by_name)
  values
    (au.audit_number, au.unit_name_snapshot, au.sector_name_snapshot, au.auditor_name_snapshot, au.status, au.overall_score, au.classification,
     au.started_at, auth.uid(), uname);

  -- Notificações que apontam para os planos de ação que vão sair (o link ficaria quebrado).
  delete from public.notifications n using public.action_plans p
    where p.audit_id = _audit_id and n.link = '/plano-de-acao/' || p.id;

  delete from public.audit_evidences where audit_id = _audit_id;
  delete from public.action_plans where audit_id = _audit_id;
  delete from public.audit_change_logs where audit_id = _audit_id;
  delete from public.audit_answers where audit_id = _audit_id;
  delete from public.audits where id = _audit_id;

  return to_json(paths);
end $$;

revoke all on function public.admin_delete_audit(uuid) from public, anon;
grant execute on function public.admin_delete_audit(uuid) to authenticated;
