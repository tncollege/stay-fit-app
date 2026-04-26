# STAYFITINLIFE — Simple GitHub + Netlify + Render Deploy

Use this folder as the single source for GitHub, Netlify, and Render.

## 1) Upload to GitHub
Upload everything in this folder except:

- `.env`
- `node_modules/`
- `dist/`

`.gitignore` already excludes those.

## 2) Netlify frontend
Connect the GitHub repo to Netlify.

Build command:

```bash
npm run build
```

Publish directory:

```txt
dist
```

Add these Netlify environment variables:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_API_URL=https://your-render-backend-url.onrender.com
SECRETS_SCAN_OMIT_KEYS=VITE_SUPABASE_URL,VITE_SUPABASE_ANON_KEY
```

Do not put `OPENAI_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` in Netlify.

## 3) Render backend
Create a Render Web Service from the same GitHub repo.

Build command:

```bash
npm install
```

Start command:

```bash
npm run dev
```

Add this Render environment variable:

```env
OPENAI_API_KEY=your_openai_api_key
```

## 4) AI endpoint check
Your app calls:

```txt
https://your-render-backend-url.onrender.com/api/ai/chat
```

So `VITE_API_URL` should be only the base Render URL, with no `/api` and no `/chat`.

Correct:

```env
VITE_API_URL=https://your-render-backend-url.onrender.com
```

Wrong:

```env
VITE_API_URL=https://your-render-backend-url.onrender.com/api
VITE_API_URL=https://your-render-backend-url.onrender.com/api/ai
VITE_API_URL=https://your-render-backend-url.onrender.com/chat
```
