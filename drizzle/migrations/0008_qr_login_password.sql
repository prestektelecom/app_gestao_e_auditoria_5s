-- QR Code do setor: o auditor se identifica com o e-mail e a senha do login,
-- e não mais com os 6 primeiros dígitos do CPF ou com um PIN.
--
-- A senha é conferida no servidor (bcrypt, com o mesmo limite de tentativas do login);
-- só depois disso o servidor chama qr_issue_ticket com o id do usuário. Por isso a
-- função não fica disponível para anon/authenticated: quem chamasse direto poderia
-- emitir um ticket para qualquer usuário.
drop function if exists public.qr_validate_auditor(text, text);

create or replace function public.qr_issue_ticket(_token text, _user_id uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare sec record; aud record; tok text;
begin
  select s.id into sec from public.sectors s join public.units u on u.id = s.unit_id
    where s.qr_token = _token and s.active and u.active;
  if not found then
    return json_build_object('ok', false, 'error', 'QR Code inválido ou setor inativo.');
  end if;

  select id, name into aud from public.auditors where user_id = _user_id and active and authorized;
  if not found then
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
