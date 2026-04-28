# Production build notes

This package consolidates the latest fixes:

- Weekly Workout Plan with workout name + exercise selection.
- Save Weekly Plan now shows Saving state and success/error toast.
- Workout submit shows Saving state and success/error toast.
- Custom/AI exercises save to Supabase custom exercise library.
- Workout add/delete sync uses Supabase.
- Nutrition save persistence and quantity input fixes.
- Progress steps/weight sync and user-friendly messages.
- Dashboard opens on today and supports water logging.
- Supabase schema updated for meals, water, steps, weights, workout plans, and custom exercises.

Before testing after deploy, run `supabase_schema.sql` in Supabase SQL Editor.
