# STAYFITINLIFE Final Production Setup

Netlify environment variables:
- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY
- RESEND_API_KEY
- SUPABASE_SERVICE_ROLE_KEY (for feedback function)

Run `supabase_schema.sql` once in Supabase SQL Editor.

Resend sender:
STAYFITINLIFE <no-reply@stayfitinlife.com>

Welcome email function:
POST /.netlify/functions/send-welcome
Body: { "email": "user@example.com" }

Feedback function:
POST /.netlify/functions/submit-feedback
