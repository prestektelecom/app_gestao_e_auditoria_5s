revoke select, insert, update on public.auditors from authenticated;
grant select (id, user_id, name, cpf, admission_date, job_title, unit_id, sector_id, authorized, active, created_at, updated_at) on public.auditors to authenticated;
grant insert (user_id, name, cpf, admission_date, job_title, unit_id, sector_id, authorized, active) on public.auditors to authenticated;
grant update (user_id, name, cpf, admission_date, job_title, unit_id, sector_id, authorized, active) on public.auditors to authenticated;