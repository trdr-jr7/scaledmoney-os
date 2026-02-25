-- ============================================================
-- ScaledMoney|OS™ — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ── EXTENSIONS ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── MEMBER TIERS ────────────────────────────────────────────
-- Stores paid tier for each user.
-- Inserted by stripe-webhook.js on checkout.session.completed.
create table if not exists public.member_tiers (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  tier           text not null default 'free'
                   check (tier in ('free','pro','team')),
  stripe_customer_id     text,
  stripe_subscription_id text,
  current_period_end     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id)
);

-- Auto-create a free tier row when a new user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.member_tiers (user_id, tier)
  values (new.id, 'free')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── SPRINT PLANS ────────────────────────────────────────────
-- One row per saved sprint slot (max 3 per user for Pro tier).
create table if not exists public.sprint_plans (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  slot        smallint not null check (slot between 0 and 2),
  sprint_num  integer,
  sprint_goal text,
  start_date  date,
  end_date    date,
  length_days smallint,
  plan_data   jsonb not null default '{}',
  saved_at    timestamptz not null default now(),
  unique (user_id, slot)
);

-- ── USER PROFILES ───────────────────────────────────────────
-- Optional display name, stored preferences.
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  pay_cadence  text check (pay_cadence in ('weekly','biweekly','semimonthly','monthly')),
  currency     text default 'USD',
  onboarded    boolean default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create or replace function public.handle_new_profile()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.handle_new_profile();

-- ── ROW LEVEL SECURITY ───────────────────────────────────────
-- Every table locked down: users can only see and edit their own rows.

alter table public.member_tiers  enable row level security;
alter table public.sprint_plans  enable row level security;
alter table public.profiles      enable row level security;

-- member_tiers policies
create policy "Users can read own tier"
  on public.member_tiers for select
  using (auth.uid() = user_id);

create policy "Service role can upsert tier"
  on public.member_tiers for all
  using (auth.role() = 'service_role');

-- sprint_plans policies
create policy "Users can read own sprint plans"
  on public.sprint_plans for select
  using (auth.uid() = user_id);

create policy "Users can insert own sprint plans"
  on public.sprint_plans for insert
  with check (auth.uid() = user_id);

create policy "Users can update own sprint plans"
  on public.sprint_plans for update
  using (auth.uid() = user_id);

create policy "Users can delete own sprint plans"
  on public.sprint_plans for delete
  using (auth.uid() = user_id);

-- profiles policies
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- ── INDEXES ──────────────────────────────────────────────────
create index if not exists idx_sprint_plans_user_id
  on public.sprint_plans (user_id);

create index if not exists idx_member_tiers_user_id
  on public.member_tiers (user_id);

create index if not exists idx_member_tiers_stripe_customer
  on public.member_tiers (stripe_customer_id);

-- ── UPDATED_AT AUTO-STAMP ────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_member_tiers_updated_at
  before update on public.member_tiers
  for each row execute procedure public.set_updated_at();

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();
