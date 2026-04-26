# StayFitInLife UI Fix + Deploy Notes

## What changed

- Fixed the onboarding background step number (`01` / `02`) so it stays behind the form instead of bleeding over inputs.
- Added safer layering with `isolate`, lower opacity, and `z-0` decorative background.
- Added `netlify.toml` for Netlify deploys.
- Added `.npmrc` to force the public npm registry and avoid internal registry timeout errors.
- Updated the API client to support `VITE_API_URL` for deployed AI backend calls.

## Local run

```bash
npm install
npm run dev
```

In another terminal:

```bash
npx vite
```

## Netlify frontend deploy

1. Add these env variables in Netlify:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_API_URL=https://your-backend-url.onrender.com
```

2. Build command:

```bash
npm run build
```

3. Publish directory:

```txt
dist
```

## Backend deploy

Deploy `server.ts` separately on Render/Railway/Fly.io.
Set this backend env var:

```env
OPENAI_API_KEY=your_openai_key
```

Then copy the backend URL into Netlify as `VITE_API_URL`.
