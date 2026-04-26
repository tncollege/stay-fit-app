# StayFitInLife Deployment + Supabase Setup

## 1. Create `.env`
Copy `.env.example` to `.env` in the project root and fill in your real keys:

```env
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini
PORT=3000
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_public_key
```

Do not commit or upload your real `.env` file.

## 2. Supabase SQL
Run this in Supabase SQL Editor:

```sql
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  age int,
  weight float,
  height float,
  goal text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table profiles enable row level security;

drop policy if exists "Users can manage their own profile" on profiles;
create policy "Users can manage their own profile"
on profiles
for all
using (auth.uid() = id)
with check (auth.uid() = id);

create table if not exists workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  date date,
  workout text,
  duration int,
  calories int,
  created_at timestamptz default now()
);

alter table workout_logs enable row level security;

drop policy if exists "Insert own workout" on workout_logs;
drop policy if exists "View own workouts" on workout_logs;
create policy "Insert own workout"
on workout_logs
for insert
with check (auth.uid() = user_id);
create policy "View own workouts"
on workout_logs
for select
using (auth.uid() = user_id);

create table if not exists nutrition_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  date date,
  meal text,
  calories int,
  protein int,
  carbs int,
  fats int,
  created_at timestamptz default now()
);

alter table nutrition_logs enable row level security;

drop policy if exists "Insert own nutrition" on nutrition_logs;
drop policy if exists "View own nutrition" on nutrition_logs;
create policy "Insert own nutrition"
on nutrition_logs
for insert
with check (auth.uid() = user_id);
create policy "View own nutrition"
on nutrition_logs
for select
using (auth.uid() = user_id);
```

## 3. Local run
Open two terminals:

Terminal 1, backend:
```bash
npm install
npm run dev
```

Terminal 2, frontend:
```bash
npx vite
```

Open the frontend URL shown by Vite, usually `http://localhost:5173`.

## 4. Notes
- This package does not include your `.env` secrets.
- AI uses the backend on `localhost:3000`; Vite proxies `/api` to the backend.
- Workout and Nutrition UI now save to Supabase when a user is logged in.
- The app still keeps local UI state for instant feedback; Supabase is wired for persistence.
