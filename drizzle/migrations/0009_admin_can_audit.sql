-- Administradores podem auditar pelo QR Code mesmo sem cadastro de auditor.
--
-- Toda auditoria aponta para um registro em public.auditors. Quando um administrador
-- entra pelo QR Code e não tem auditor ligado ao usuário, qr_issue_ticket cria um para
-- ele (nome do perfil, unidade e setor do QR, sem CPF). Um administrador também audita
-- mesmo que o cadastro de auditor dele esteja inativo ou não autorizado.
--
-- O CPF deixa de ser obrigatório: não é mais usado para entrar no QR Code (0008), e o
-- auditor criado para o administrador não tem um. Se informado, continua validado.

alter table public.auditors alter column cpf drop not null;
alter table public.auditors drop constraint auditors_cpf_valid;
alter table public.auditors add constraint auditors_cpf_valid check (cpf is null or public.is_valid_cpf(cpf));

create or replace function public.qr_issue_ticket(_token text, _user_id uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare sec record; aud record; tok text; adm boolean;
begin
  select s.id, s.unit_id into sec from public.sectors s join public.units u on u.id = s.unit_id
    where s.qr_token = _token and s.active and u.active;
  if not found then
    return json_build_object('ok', false, 'error', 'QR Code inválido ou setor inativo.');
  end if;

  adm := coalesce(public.is_admin(_user_id), false);
  select id, name into aud from public.auditors where user_id = _user_id and ((active and authorized) or adm);
  if not found and adm and not exists (select 1 from public.auditors where user_id = _user_id) then
    insert into public.auditors (user_id, name, cpf, unit_id, sector_id, authorized, active)
      select _user_id, p.name, null, sec.unit_id, sec.id, true, true from public.profiles p where p.id = _user_id
      returning id, name into aud;
  end if;
  if aud.id is null then
    return json_build_object('ok', false, 'error',
      'Seu usuário não está ligado a um auditor ativo e autorizado. Procure o administrador.');
  end if;

  tok := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.qr_validation_tickets(token_hash, auditor_id, sector_id, expires_at)
    values (public.sha256_hex(tok), aud.id, sec.id, now() + interval '30 minutes');
  return json_build_object('ok', true, 'auditor_name', aud.name, 'ticket', tok, 'server_now', now());
end $$;
revoke execute on function public.qr_issue_ticket(text, uuid) from public, anon, authenticated;
grant execute on function public.qr_issue_ticket(text, uuid) to service_role;

-- Igual à versão de 0002, mas aceita o auditor de um administrador mesmo inativo ou
-- não autorizado, e a mensagem de validação vencida fala em entrar de novo (não há mais código).
create or replace function public.qr_start_audit(_ticket text, _companion text, _lat double precision, _lng double precision, _location_status text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare t record; a record; s record; u record; v record; sess text; new_id uuid; num text; loc text;
begin
  select * into t from public.qr_validation_tickets
    where token_hash = public.sha256_hex(coalesce(_ticket,'')) and used_at is null and expires_at > now();
  if not found then return json_build_object('ok', false, 'error', 'Validação expirada. Entre novamente com seu e-mail e senha.'); end if;
  if _companion is null or length(btrim(_companion)) < 2 or length(_companion) > 120 then
    return json_build_object('ok', false, 'error', 'Informe a pessoa que acompanhou a auditoria.');
  end if;
  loc := case when _location_status in ('REGISTERED','DENIED','UNAVAILABLE') then _location_status else 'UNAVAILABLE' end;
  if loc = 'REGISTERED' and (_lat is null or _lng is null or _lat not between -90 and 90 or _lng not between -180 and 180) then
    loc := 'UNAVAILABLE';
  end if;

  select id, name into a from public.auditors
    where id = t.auditor_id and ((active and authorized) or (user_id is not null and coalesce(public.is_admin(user_id), false)));
  if not found then return json_build_object('ok', false, 'error', 'Auditor não autorizado.'); end if;
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
