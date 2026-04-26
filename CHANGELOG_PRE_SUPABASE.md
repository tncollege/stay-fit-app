# Pre-Supabase hardening changes

## Backend

- Removed environment variable name exposure from `/api/health`.
- Added Express JSON body limit.
- Added AI request validation for `prompt` and `jsonMode`.
- Added max prompt length guard.
- Added basic per-IP rate limiting for `/api/ai/chat`.
- Added server-side AI system instruction to avoid medical diagnosis, unsafe diet guidance, and unsafe supplement recommendations.
- Moved OpenAI model to configurable `OPENAI_MODEL`, defaulting to `gpt-4o-mini`.
- Improved server error responses so raw internal errors are not exposed unnecessarily.

## Frontend/services

- Added `src/services/apiClient.ts` for centralized API POST/error handling.
- Updated `src/services/aiService.ts` to use the API client.
- Added safer JSON parsing for AI JSON-mode responses.
- Reduced `any` usage in AI service and shared types.
- Added `src/services/storage.ts` storage adapter. Current adapter uses localStorage; Supabase can replace this adapter later.
- Updated `App.tsx` to use the storage adapter instead of direct localStorage calls.

## Types

- Added `WorkoutSet` and `ExerciseInfo` interfaces.
- Added optional `currentBodyFat` to `Profile` because the goal analyzer already references it.
- Replaced some broad `any[]` fields with typed arrays.

## Docs/config

- Fixed README setup instructions from Gemini to OpenAI.
- Updated `.env.example` with `OPENAI_API_KEY`, `OPENAI_MODEL`, and `PORT`.
- Renamed package to `stayfitinlife`.
- Removed unused `@google/genai` dependency from `package.json`.


## Supabase Auth Test Setup

- Added `src/services/supabaseClient.ts` for the Supabase browser client.
- Added `src/services/authService.ts` with signup, signin, signout, and current-user helpers.
- Added a guarded `testAuth()` effect in `App.tsx`. It only runs when `VITE_RUN_AUTH_TEST=true` in development.
- Added `@supabase/supabase-js` to `package.json`.
- Updated `.env.example` with Supabase and temporary auth-test variables.
