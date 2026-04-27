# Clean Supabase Sync Build

This build includes the final fix for the desktop-localStorage to Supabase cloud migration.

## Important deployment steps

1. Upload this source to GitHub.
2. Let Netlify redeploy.
3. Run `supabase_schema.sql` in Supabase SQL Editor once.
4. Open the app on the desktop/browser that already has your old onboarding/profile data.
5. Login with the same Google/Apple account.
6. Wait 5-10 seconds. The console should show:
   `Existing local data uploaded to Supabase ✅`
7. Check Supabase tables: `profiles`, `meals`, `workouts`, `weights`, `steps`.
8. Then open the app on mobile. Mobile should load the cloud profile and skip onboarding.

## What was fixed

- Does not overwrite local profile/meals with empty cloud data.
- If Supabase has no data but localStorage has existing app data, it uploads local data once.
- Uses upsert for meals/workouts to avoid duplicates during migration.
- Keeps normal Supabase loading for future devices.
