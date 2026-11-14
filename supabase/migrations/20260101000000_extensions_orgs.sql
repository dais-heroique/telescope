-- VIGIE · Migration 1 : extensions, organisations, profils, rôles, RLS
create extension if not exists postgis;
create extension if not exists pg_trgm;
create extension if not exists pgcrypto;

-- ───────────── Organisations (agences) ─────────────
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(name) between 2 and 120),
  logo_url    text,
  created_at  timestamptz not null default now()
);

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  signature   text,                       -- signature utilisée dans les courriers
  module      text not null default 'habitation' check (module in ('habitation','marchands','promoteurs','entreprise')),
  current_org uuid references public.organizations(id) on delete set null,
  is_platform_admin boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.org_members (
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'agent' check (role in ('admin','manager','agent')),
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_members_user_idx on public.org_members(user_id);

-- ───────────── Helpers RLS (SECURITY DEFINER : évitent la récursion de policies) ─────────────
create or replace function public.is_org_member(oid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_members m where m.org_id = oid and m.user_id = auth.uid())
$$;

create or replace function public.org_role(oid uuid) returns text
language sql stable security definer set search_path = public as $$
  select m.role from public.org_members m where m.org_id = oid and m.user_id = auth.uid()
$$;

create or replace function public.is_org_manager(oid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.org_role(oid) in ('admin','manager'), false)
$$;

-- ───────────── Profil créé automatiquement à l'inscription ─────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────── RLS ─────────────
alter table public.organizations enable row level security;
alter table public.profiles      enable row level security;
alter table public.org_members   enable row level security;

create policy "org: members read" on public.organizations for select using (public.is_org_member(id));
create policy "org: admins update" on public.organizations for update using (public.org_role(id) = 'admin');
-- La création d'une organisation passe par la fonction create_organization (ci-dessous).

create policy "profiles: self read" on public.profiles for select using (id = auth.uid());
create policy "profiles: teammates read" on public.profiles for select using (
  exists (select 1 from public.org_members a join public.org_members b on a.org_id = b.org_id
          where a.user_id = auth.uid() and b.user_id = profiles.id)
);
create policy "profiles: self update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy "members: read same org" on public.org_members for select using (public.is_org_member(org_id));
create policy "members: admins manage" on public.org_members for all
  using (public.org_role(org_id) = 'admin') with check (public.org_role(org_id) = 'admin');

-- Création d'une organisation : le créateur en devient admin.
create or replace function public.create_organization(org_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.organizations(name) values (org_name) returning id into new_id;
  insert into public.org_members(org_id, user_id, role) values (new_id, auth.uid(), 'admin');
  update public.profiles set current_org = new_id where id = auth.uid();
  return new_id;
end $$;
revoke all on function public.create_organization(text) from public, anon;
grant execute on function public.create_organization(text) to authenticated;
