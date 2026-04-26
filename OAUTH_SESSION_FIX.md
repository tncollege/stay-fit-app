# OAuth Session Fix Included

This build fixes Google/Apple OAuth returning to the login screen.

## What changed

`src/App.tsx` now listens to Supabase auth state changes using:

```ts
supabase.auth.onAuthStateChange((_event, session) => {
  setLoggedIn(Boolean(session));
  setCheckingAuth(false);
});
```

This ensures that after Google/Apple redirects back to the app, the Supabase session is detected and the user enters the app instead of returning to the login page.

## Supabase URL settings

In Supabase → Authentication → URL Configuration:

Site URL:

```txt
https://stayfitinlife.com
```

Redirect URLs:

```txt
https://stayfitinlife.com
https://www.stayfitinlife.com
```

## Netlify env variables

Keep these in Netlify:

```txt
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_API_URL
SECRETS_SCAN_ENABLED=false
```

Do not put these in Netlify:

```txt
OPENAI_API_KEY
SUPABASE_SERVICE_ROLE_KEY
```
