create sequence if not exists public.maintenance_note_seq;

create table public.maintenance_notes (
  id uuid primary key default gen_random_uuid(),
  note_number text not null unique default ('MAN-' || lpad(nextval('public.maintenance_note_seq')::text, 5, '0')),
  note_date date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  note_time time not null default ((now() at time zone 'America/Sao_Paulo')::time),
  requester_name text not null,
  requester_user_id uuid,
  unit_id uuid not null references public.units(id),
  sector_id uuid not null references public.sectors(id),
  unit_name text not null,
  sector_name text not null,
  description text not null,
  source text not null default 'INTERNO' check (source in ('INTERNO','QR')),
  status text not null default 'ABERTA' check (status in ('ABERTA','EM_ANDAMENTO','CONCLUIDA','CANCELADA')),
  priority text not null default 'MEDIA' check (priority in ('BAIXA','MEDIA','ALTA')),
  assignee_name text,
  due_date date,
  resolution text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index maintenance_notes_date_idx on public.maintenance_notes(note_date desc);

create table public.maintenance_note_images (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.maintenance_notes(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);
create index maintenance_note_images_note_idx on public.maintenance_note_images(note_id);

create table public.maintenance_upload_tickets (
  note_id uuid primary key references public.maintenance_notes(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null
);

grant select, update, delete on public.maintenance_notes to authenticated;
grant all on public.maintenance_notes to service_role;
grant select, delete on public.maintenance_note_images to authenticated;
grant all on public.maintenance_note_images to service_role;
grant all on public.maintenance_upload_tickets to service_role;

alter table public.maintenance_notes enable row level security;
alter table public.maintenance_note_images enable row level security;
alter table public.maintenance_upload_tickets enable row level security;

create or replace function public.can_manage_maintenance(_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_active_user(_user_id) and (public.has_role(_user_id, 'admin') or public.has_role(_user_id, 'manager'))
$$;

create policy "maint notes read" on public.maintenance_notes for select to authenticated using (public.is_active_user(auth.uid()));
create policy "maint notes update" on public.maintenance_notes for update to authenticated using (public.can_manage_maintenance(auth.uid())) with check (public.can_manage_maintenance(auth.uid()));
create policy "maint notes delete" on public.maintenance_notes for delete to authenticated using (public.can_manage_maintenance(auth.uid()));
create policy "maint images read" on public.maintenance_note_images for select to authenticated using (public.is_active_user(auth.uid()));
create policy "maint images delete" on public.maintenance_note_images for delete to authenticated using (public.can_manage_maintenance(auth.uid()));

create or replace function public.maintenance_notes_touch() returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.status = 'CONCLUIDA' and old.status <> 'CONCLUIDA' then new.completed_at := now(); end if;
  if new.status <> 'CONCLUIDA' then new.completed_at := null; end if;
  return new;
end $$;
create trigger maintenance_notes_touch before update on public.maintenance_notes for each row execute function public.maintenance_notes_touch();

create or replace function public.maint_sector_info(_token text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('sector_id', s.id, 'sector_name', s.name, 'unit_id', u.id, 'unit_name', u.name)
  from public.sectors s join public.units u on u.id = s.unit_id
  where s.qr_token = _token and s.active and u.active
$$;

create or replace function public.maint_create_note(_token text, _sector_id uuid, _requester text, _date date, _time time, _description text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  s record; uid uuid := auth.uid(); src text; k text; cnt int; nid uuid; num text; tok text;
begin
  if coalesce(length(trim(_requester)),0) < 2 or length(_requester) > 120 then return json_build_object('ok', false, 'error', 'Informe quem está solicitando.'); end if;
  if coalesce(length(trim(_description)),0) < 5 or length(_description) > 3000 then return json_build_object('ok', false, 'error', 'Descreva a necessidade (mínimo 5 caracteres).'); end if;
  if _token is not null and _token <> '' then
    k := 'maint:' || coalesce(public.request_ip(), 'unknown');
    select count(*) into cnt from public.qr_attempts where key = k and created_at > now() - interval '15 minutes';
    if cnt >= 15 then return json_build_object('ok', false, 'error', 'Muitas solicitações. Aguarde alguns minutos.'); end if;
    insert into public.qr_attempts(key, success) values (k, true);
    select s2.id, s2.name, u.id as unit_id, u.name as unit_name into s from public.sectors s2 join public.units u on u.id = s2.unit_id
      where s2.qr_token = _token and s2.active and u.active;
    src := 'QR';
  else
    if uid is null or not public.is_active_user(uid) then return json_build_object('ok', false, 'error', 'Acesso não autorizado.'); end if;
    select s2.id, s2.name, u.id as unit_id, u.name as unit_name into s from public.sectors s2 join public.units u on u.id = s2.unit_id
      where s2.id = _sector_id and s2.active and u.active;
    src := 'INTERNO';
  end if;
  if s.id is null then return json_build_object('ok', false, 'error', 'Setor não encontrado ou inativo.'); end if;
  insert into public.maintenance_notes(note_date, note_time, requester_name, requester_user_id, unit_id, sector_id, unit_name, sector_name, description, source)
  values (coalesce(_date, (now() at time zone 'America/Sao_Paulo')::date), coalesce(_time, (now() at time zone 'America/Sao_Paulo')::time),
    trim(_requester), uid, s.unit_id, s.id, s.unit_name, s.name, trim(_description), src)
  returning id, note_number into nid, num;
  tok := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.maintenance_upload_tickets(note_id, token_hash, expires_at) values (nid, public.sha256_hex(tok), now() + interval '30 minutes');
  return json_build_object('ok', true, 'id', nid, 'number', num, 'upload_token', tok);
end $$;

revoke all on function public.maint_create_note(text, uuid, text, date, time, text) from public;
grant execute on function public.maint_create_note(text, uuid, text, date, time, text) to anon, authenticated;
grant execute on function public.maint_sector_info(text) to anon, authenticated;

create policy "maint storage read" on storage.objects for select to authenticated using (bucket_id = 'maintenance-images' and public.is_active_user(auth.uid()));
create policy "maint storage delete" on storage.objects for delete to authenticated using (bucket_id = 'maintenance-images' and public.can_manage_maintenance(auth.uid()));