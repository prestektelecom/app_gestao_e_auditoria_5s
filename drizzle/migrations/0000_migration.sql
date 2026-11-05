create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum ('admin','auditor','manager','director');

-- updated_at helper
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

-- PROFILES (users of the system)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null unique,
  system_access boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

-- ROLES
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  role app_role not null
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_active_user(_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = _user_id and active and system_access)
$$;

create or replace function public.is_admin(_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role(_user_id,'admin') and public.is_active_user(_user_id)
$$;

create or replace function public.has_any_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where role = 'admin')
$$;
grant execute on function public.has_any_admin() to anon, authenticated;

create policy "profiles self or admin read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin(auth.uid()));
create policy "profiles admin update" on public.profiles for update to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "roles self or admin read" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

-- New auth user -> profile; first user becomes admin
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare _role app_role;
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)), lower(new.email))
  on conflict (id) do nothing;
  if not exists (select 1 from public.user_roles where role = 'admin') then
    _role := 'admin';
  else
    _role := 'auditor';
  end if;
  insert into public.user_roles (user_id, role) values (new.id, _role) on conflict (user_id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- UNITS
create table public.units (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  address text,
  city text,
  state text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint units_state_chk check (state is null or state ~ '^[A-Z]{2}$')
);
create unique index units_code_uniq on public.units (lower(code)) where code is not null and code <> '';
grant select, insert, update on public.units to authenticated;
grant all on public.units to service_role;
alter table public.units enable row level security;
create trigger units_touch before update on public.units for each row execute function public.touch_updated_at();
create policy "units read active users" on public.units for select to authenticated using (public.is_active_user(auth.uid()));
create policy "units admin insert" on public.units for insert to authenticated with check (public.is_admin(auth.uid()));
create policy "units admin update" on public.units for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- SECTORS
create table public.sectors (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete restrict,
  name text not null,
  description text,
  active boolean not null default true,
  qr_token text not null unique default encode(extensions.gen_random_bytes(18),'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, unit_id)
);
create index sectors_unit_idx on public.sectors(unit_id);
grant select, insert, update on public.sectors to authenticated;
grant all on public.sectors to service_role;
alter table public.sectors enable row level security;
create trigger sectors_touch before update on public.sectors for each row execute function public.touch_updated_at();
create or replace function public.sectors_protect_token() returns trigger language plpgsql set search_path = public as $$
begin new.qr_token = old.qr_token; return new; end $$;
create trigger sectors_token_immutable before update on public.sectors for each row execute function public.sectors_protect_token();
create policy "sectors read active users" on public.sectors for select to authenticated using (public.is_active_user(auth.uid()));
create policy "sectors admin insert" on public.sectors for insert to authenticated with check (public.is_admin(auth.uid()));
create policy "sectors admin update" on public.sectors for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- CPF validation
create or replace function public.is_valid_cpf(_cpf text) returns boolean language plpgsql immutable as $$
declare s int; d1 int; d2 int; i int;
begin
  if _cpf is null or _cpf !~ '^\d{11}$' or _cpf ~ '^(\d)\1{10}$' then return false; end if;
  s := 0; for i in 1..9 loop s := s + substr(_cpf,i,1)::int * (11-i); end loop;
  d1 := (s*10) % 11; if d1 = 10 then d1 := 0; end if;
  if d1 <> substr(_cpf,10,1)::int then return false; end if;
  s := 0; for i in 1..10 loop s := s + substr(_cpf,i,1)::int * (12-i); end loop;
  d2 := (s*10) % 11; if d2 = 10 then d2 := 0; end if;
  return d2 = substr(_cpf,11,1)::int;
end $$;

-- AUDITORS
create table public.auditors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles(id) on delete set null,
  name text not null,
  cpf text not null unique,
  admission_date date,
  job_title text,
  unit_id uuid not null references public.units(id) on delete restrict,
  sector_id uuid not null,
  custom_pin_hash text,
  authorized boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auditors_cpf_valid check (public.is_valid_cpf(cpf)),
  constraint auditors_sector_fk foreign key (sector_id, unit_id) references public.sectors(id, unit_id) on delete restrict
);
grant select, insert, update on public.auditors to authenticated;
grant all on public.auditors to service_role;
alter table public.auditors enable row level security;
create trigger auditors_touch before update on public.auditors for each row execute function public.touch_updated_at();
-- PIN hash column never readable by clients
revoke select (custom_pin_hash) on public.auditors from authenticated;
revoke update (custom_pin_hash) on public.auditors from authenticated;
revoke insert (custom_pin_hash) on public.auditors from authenticated;
create policy "auditors admin or self read" on public.auditors for select to authenticated
  using (public.is_admin(auth.uid()) or (user_id = auth.uid() and public.is_active_user(auth.uid())));
create policy "auditors admin insert" on public.auditors for insert to authenticated with check (public.is_admin(auth.uid()));
create policy "auditors admin update" on public.auditors for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create or replace function public.set_auditor_pin(_auditor_id uuid, _pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Sem permissão'; end if;
  if _pin is null or _pin = '' then
    update public.auditors set custom_pin_hash = null where id = _auditor_id;
  elsif _pin !~ '^\d{4,8}$' then
    raise exception 'PIN deve ter de 4 a 8 dígitos';
  else
    update public.auditors set custom_pin_hash = extensions.crypt(_pin, extensions.gen_salt('bf')) where id = _auditor_id;
  end if;
end $$;
grant execute on function public.set_auditor_pin(uuid, text) to authenticated;

create or replace function public.auditor_has_pin(_auditor_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin(auth.uid()) and exists (select 1 from public.auditors where id = _auditor_id and custom_pin_hash is not null)
$$;
grant execute on function public.auditor_has_pin(uuid) to authenticated;

-- SETTINGS
create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
grant select, insert, update on public.settings to authenticated;
grant all on public.settings to service_role;
alter table public.settings enable row level security;
create trigger settings_touch before update on public.settings for each row execute function public.touch_updated_at();
create policy "settings read" on public.settings for select to authenticated using (public.is_active_user(auth.uid()));
create policy "settings admin insert" on public.settings for insert to authenticated with check (public.is_admin(auth.uid()));
create policy "settings admin update" on public.settings for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

insert into public.settings (key, value) values
  ('audit_periodicity', '"monthly"'::jsonb),
  ('scoring', '{"conforme":100,"nc_parcial":50,"nao_conforme":0,"nao_se_aplica":"excluded"}'::jsonb),
  ('medals', '{"gold_min":90,"silver_min":80,"bronze_min":70}'::jsonb);

-- DASHBOARD counts
create or replace function public.dashboard_counts() returns json
language sql stable security definer set search_path = public as $$
  select case when public.is_active_user(auth.uid()) then json_build_object(
    'units', (select count(*) from public.units where active),
    'sectors', (select count(*) from public.sectors s join public.units u on u.id = s.unit_id where s.active and u.active),
    'auditors', (select count(*) from public.auditors where active),
    'users', (select count(*) from public.profiles where active and system_access)
  ) else null end
$$;
grant execute on function public.dashboard_counts() to authenticated;