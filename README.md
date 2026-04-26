# STAYFITINLIFE

AI-powered fitness, nutrition, workout, progress, and coaching app built with React, TypeScript, Vite, Express, and OpenAI.

## Prerequisites

- Node.js 20+
- npm
- OpenAI API key

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Create a local environment file:

```bash
cp .env.example .env.local
```

3. Add your OpenAI key to `.env.local`:

```bash
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini
```

4. Start the app:

```bash
npm run dev
```

The app runs at `http://localhost:3000`.

## Current storage

The app currently stores user data in browser `localStorage`. This is intentional for the pre-Supabase version. The next step is to replace the local storage adapter with Supabase auth and database tables.

## Security notes

- Never expose `OPENAI_API_KEY` in frontend code.
- AI requests are proxied through `server.ts`.
- `/api/ai/chat` includes request validation, prompt length limits, and basic rate limiting.
- `/api/health` does not expose environment variable names or secret values.

## Useful scripts

```bash
npm run dev      # start Express + Vite dev server
npm run build    # production build
npm run preview  # preview Vite build
npm run lint     # TypeScript check
```
