-- MixLens Supabase Schema
-- Run this in Supabase SQL Editor (Database > SQL Editor)

-- Enable UUID extension (enabled by default on Supabase)
extension if not exists "uuid-ossp";

-- ─── user_settings ───────────────────────────────────────────────────────────
create table if not exists public.user_settings (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  anthropic_api_key text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "user_settings: own row only"
  on public.user_settings
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── projects ────────────────────────────────────────────────────────────────
create table if not exists public.projects (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

alter table public.projects enable row level security;

create policy "projects: own rows only"
  on public.projects
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists projects_user_id_idx on public.projects (user_id);

-- ─── analyses ────────────────────────────────────────────────────────────────
create table if not exists public.analyses (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  project_id   uuid not null references public.projects (id) on delete cascade,
  file_name    text not null,
  analysed_at  timestamptz not null default now(),
  lean_result  jsonb not null default '{}'
);

alter table public.analyses enable row level security;

create policy "analyses: own rows only"
  on public.analyses
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists analyses_user_project_idx on public.analyses (user_id, project_id);
create index if not exists analyses_project_idx on public.analyses (project_id);
