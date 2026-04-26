# Clean UI Netlify Build

This package removes the faint onboarding step number background so the form appears clean on desktop and mobile.

## Deploy on Netlify

Build command:

```bash
npm run build
```

Publish directory:

```txt
dist
```

Environment variables needed on Netlify:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Do not add backend secrets to Netlify frontend deploys:

```env
OPENAI_API_KEY
SUPABASE_SERVICE_ROLE_KEY
```

The included `netlify.toml` already omits the expected public Supabase frontend keys from Netlify secret scanning.
