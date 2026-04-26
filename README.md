# STAYFITINLIFE

STAYFITINLIFE is an AI-powered fitness, nutrition, workout, progress, and recovery tracking app. It includes Supabase authentication, Gym-E AI guidance, workout logging, nutrition tracking, progress charts, and a mobile-friendly interface.

## Features

- Email/password signup and login with Supabase Auth
- Forgot password and reset password flow
- Google login and Apple login hooks through Supabase OAuth
- Gym-E AI assistant for goal analysis, daily insights, meal help, workout plans, and supplement guidance
- Workout logging with strength, cardio, sports, and yoga flows
- Nutrition and water tracking
- Weight and steps progress charts
- Mobile and desktop app icons with web manifest
- Netlify frontend deployment support
- Render backend deployment support for AI requests

## Tech Stack

- React + Vite
- TypeScript
- Tailwind CSS utility classes
- Supabase Auth
- OpenAI API through an Express backend
- Netlify for frontend hosting
- Render for backend hosting

## Required Environment Variables

### Frontend: Netlify

Add these to Netlify environment variables:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_API_URL=https://your-render-backend.onrender.com
SECRETS_SCAN_ENABLED=false
```

Do not add backend secrets to Netlify.

### Backend: Render

Add this to Render environment variables:

```env
OPENAI_API_KEY=your_openai_api_key
```

Optional if you later add admin backend operations:

```env
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

Never expose the service role key in frontend code.

## Supabase Setup

### 1. Enable Email Auth

Supabase Dashboard → Authentication → Providers → Email.

For testing, you may disable email confirmation. For production, enable email confirmation.

### 2. Password Reset Redirect URL

Supabase Dashboard → Authentication → URL Configuration.

Add these redirect URLs:

```txt
https://your-domain.com/reset-password
https://your-netlify-site.netlify.app/reset-password
http://localhost:5173/reset-password
```

### 3. Google Login

Supabase Dashboard → Authentication → Providers → Google.

Enable Google and add the Google OAuth client ID/secret from Google Cloud Console. Also add Supabase's callback URL to Google OAuth redirect URIs.

### 4. Apple Login

Supabase Dashboard → Authentication → Providers → Apple.

Enable Apple and add the required Apple Services ID, Team ID, Key ID, and private key. Apple login requires Apple Developer account configuration.

## Local Development

Install dependencies:

```bash
npm install
```

Create `.env` in the project root:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_API_URL=http://localhost:3000
OPENAI_API_KEY=your_openai_api_key
```

Run backend:

```bash
npm run dev
```

Run frontend in another terminal:

```bash
npm run client
```

Open:

```txt
http://localhost:5173
```

## Deploy Frontend on Netlify

Build command:

```bash
npm run build
```

Publish directory:

```txt
dist
```

Add Netlify environment variables listed above.

## Deploy Backend on Render

Create a Render Web Service connected to this GitHub repo.

Build command:

```bash
npm install
```

Start command:

```bash
npm run dev
```

Add `OPENAI_API_KEY` in Render environment variables.

Health check:

```txt
https://your-render-backend.onrender.com/api/health
```

Expected response:

```json
{
  "status": "ok",
  "openai_configured": true
}
```

## Important Security Notes

- `VITE_*` variables are public in the browser.
- Keep `OPENAI_API_KEY` only on Render.
- Keep `SUPABASE_SERVICE_ROLE_KEY` only on a trusted backend.
- Use Supabase Row Level Security for user-owned database tables.

## App Naming

The AI coaching area is branded as **Gym-E**.
