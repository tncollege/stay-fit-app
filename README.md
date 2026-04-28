# StayFitInLife / Gym-E

AI-powered fitness, nutrition, workout, and progress tracking app with Supabase auth, cloud database sync, and a Render-hosted AI backend.

## Features

- Email/password login
- Google login
- Apple login
- Password reset flow
- Gym-E AI coach
- Nutrition logging with macros
- Workout logging
- Weight and steps tracking
- Supabase cloud sync for user data
- Netlify-ready frontend
- Render-ready backend for AI calls
- PWA manifest and app icons

## Tech Stack

- React + Vite + TypeScript
- Tailwind-style utility classes
- Supabase Auth + Postgres
- OpenAI API via Express backend
- Netlify frontend deployment
- Render backend deployment

## Required Environment Variables

### Netlify frontend

Add these in Netlify → Site configuration → Environment variables:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_API_URL=https://your-render-backend.onrender.com
SECRETS_SCAN_ENABLED=false
```

### Render backend

Add these in Render → Environment:

```env
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini
NODE_ENV=production
```

Do not put `OPENAI_API_KEY` in Netlify.

## Supabase Setup

1. Open Supabase SQL Editor.
2. Paste and run `supabase_schema.sql` from this repository.
3. Go to Authentication → Providers.
4. Enable Email, Google, and Apple as needed.
5. Go to Authentication → URL Configuration.
6. Set Site URL:

```txt
https://stayfitinlife.com
```

7. Add Redirect URLs:

```txt
https://stayfitinlife.com
https://www.stayfitinlife.com
http://localhost:5173
http://localhost:5173/reset-password
```

## Local Development

```bash
npm install
npm run dev
```

Create a local `.env` file from `.env.example`.

## Build

```bash
npm run build
```

## Netlify Deploy

Netlify settings:

```txt
Build command: npm run build
Publish directory: dist
```

The repository includes `netlify.toml` with SPA redirects and secret scan disabled for public Vite variables.

## Render Deploy

Render settings:

```txt
Build command: npm install && npm run build
Start command: npm start
```

If your `package.json` start script is `tsx server.ts`, use:

```txt
npm run start
```

or set the Render start command to:

```txt
npx tsx server.ts
```

## Important Notes

- `VITE_SUPABASE_ANON_KEY` is public by design for browser apps.
- Supabase Row Level Security policies in `supabase_schema.sql` ensure each user can only access their own data.
- The AI backend requires CORS for `https://stayfitinlife.com` and `https://www.stayfitinlife.com`, already included in `server.ts`.

## Mobile profile sync note
This build loads profile/onboarding data from Supabase before showing onboarding, so users who complete onboarding on desktop should not be asked again on mobile after logging in.

If you already ran an older schema, run the latest `supabase_schema.sql` again. It safely adds missing profile columns with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.

## Weekly Workout Plan Feature

This build adds a Supabase-backed weekly workout plan system:

- Set a workout name for each weekday, for example Push, Pull, Legs, Upper Body.
- Add exercise names and body parts to each day.
- The app suggests sets based on profile goal and experience level.
- The app suggests rep ranges dynamically instead of storing reps in the plan.
- Today’s workout plan appears in the Workout screen.
- AI-searched exercises are saved into the user’s custom exercise library and become selectable in plans.

After deploying, run `supabase_schema.sql` in Supabase SQL Editor to create/update:

- `workout_plans`
- `custom_exercises`

