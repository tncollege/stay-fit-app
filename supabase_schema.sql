-- STAYFITINLIFE Supabase schema
-- Paste this into Supabase SQL Editor and Run.

create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  age int,
  height numeric,
  current_weight numeric,
  target_weight numeric,
  goal text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,
  name text not null,
  meal_type text,
  calories numeric default 0,
  protein numeric default 0,
  carbs numeric default 0,
  fats numeric default 0,
  quantity numeric default 1,
  unit text default 'portion',
  created_at timestamptz default now()
);

create table if not exists workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,
  name text,
  category text,
  calories_burned numeric default 0,
  duration numeric,
  muscles jsonb default '[]'::jsonb,
  sets jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

create table if not exists weights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,
  weight numeric not null,
  created_at timestamptz default now(),
  unique(user_id, date)
);

create table if not exists steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,
  steps numeric default 0,
  created_at timestamptz default now(),
  unique(user_id, date)
);

alter table profiles enable row level security;
alter table meals enable row level security;
alter table workouts enable row level security;
alter table weights enable row level security;
alter table steps enable row level security;

drop policy if exists "profiles_owner_all" on profiles;
create policy "profiles_owner_all" on profiles
for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "meals_owner_all" on meals;
create policy "meals_owner_all" on meals
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "workouts_owner_all" on workouts;
create policy "workouts_owner_all" on workouts
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "weights_owner_all" on weights;
create policy "weights_owner_all" on weights
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "steps_owner_all" on steps;
create policy "steps_owner_all" on steps
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_meals_user_date on meals(user_id, date);
create index if not exists idx_workouts_user_date on workouts(user_id, date);
create index if not exists idx_weights_user_date on weights(user_id, date);
create index if not exists idx_steps_user_date on steps(user_id, date);
