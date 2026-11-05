-- Camada de compatibilidade com o Supabase (design D1).
--
-- As migrations em drizzle/migrations/ foram escritas para o Supabase e usam
-- objetos que um Postgres comum não tem: os papéis anon/authenticated/service_role,
-- o schema auth (auth.users, auth.uid()), o schema extensions com pgcrypto e a
-- tabela storage.objects. Este arquivo cria só o necessário para elas rodarem
-- iguais, e as tabelas novas do login e das fotos feitos pelo próprio app.
--
-- Roda antes das migrations, a cada `npm run db:setup`, e precisa ser idempotente.
-- Quem executa é o dono do banco (o usuário do DATABASE_URL), que precisa de
-- CREATEROLE na primeira execução.

-- Papéis usados pelas policies e grants. NOLOGIN: o app entra como o dono do banco
-- e troca de papel por transação (SET LOCAL ROLE).
-- service_role fica sem BYPASSRLS: criar com esse atributo exige superusuário, e o app
-- não precisa dele (as operações internas rodam como dono das tabelas).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

do $$
begin
  execute format('grant anon, authenticated, service_role to %I', current_user);
end $$;

-- Igual ao Supabase: tabelas, sequences e funções novas em public já nascem com
-- permissão para os três papéis. Quem restringe o acesso é o RLS e os REVOKE das
-- migrations.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- pgcrypto em "extensions", como no Supabase (as funções usam extensions.crypt etc.).
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- auth: usuários, identidade da requisição, sessões, reset de senha e tentativas
-- ---------------------------------------------------------------------------
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

-- Só as colunas que o app usa. Os nomes são os do Supabase, para a importação do
-- backup ser uma cópia direta.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  encrypted_password text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Nenhum papel da aplicação lê auth.users: os hashes de senha ficam só com o servidor.
revoke all on auth.users from public, anon, authenticated;

-- Mesma regra do Supabase: lê o id do usuário que o servidor define em cada transação.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Sessões de login: guarda só o sha256 do token do cookie.
create table if not exists auth.app_sessions (
  token_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists app_sessions_user_idx on auth.app_sessions(user_id);
revoke all on auth.app_sessions from public, anon, authenticated;

-- Links de reset de senha: sha256 do token, uso único, validade curta.
create table if not exists auth.password_resets (
  token_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
revoke all on auth.password_resets from public, anon, authenticated;

-- Tentativas de login e de pedido de reset, para o limite por e-mail e por IP.
create table if not exists auth.attempts (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('login', 'reset')),
  email text,
  ip text,
  success boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists attempts_email_idx on auth.attempts(kind, email, created_at);
create index if not exists attempts_ip_idx on auth.attempts(kind, ip, created_at);
revoke all on auth.attempts from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- storage: só o mínimo para as policies das migrations 0002 e 0006 serem criadas.
-- As fotos ficam em disco e o acesso é checado pelo servidor (design D5).
-- ---------------------------------------------------------------------------
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table storage.objects enable row level security;

-- Autorizações de envio de foto já usadas (uso único).
create table if not exists storage.upload_nonces (
  nonce text primary key,
  used_at timestamptz not null default now(),
  expires_at timestamptz not null
);
revoke all on storage.upload_nonces from public, anon, authenticated;

-- Controle das migrations aplicadas pelo db:setup.
create schema if not exists app_meta;
create table if not exists app_meta.migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);
revoke all on schema app_meta from public;
