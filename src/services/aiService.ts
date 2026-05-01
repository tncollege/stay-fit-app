/**
 * STAYFITINLIFE AI Service (Client-Side Proxy)
 * Proxies all AI requests to local /api/ai endpoints to protect secrets.
 */

import { ApiClientError, postJson } from "./apiClient";
import type { AppData, Profile } from "../lib/types";

interface AiChatResponse {
  content: string;
}

type UnknownRecord = Record<string, unknown>;

async function callServerAi(prompt: string, jsonMode = false) {
  const data = await postJson<AiChatResponse, { prompt: string; jsonMode: boolean }>("/api/ai/chat", {
    prompt,
    jsonMode,
  });

  return data.content;
}

function getErrorCode(error: unknown) {
  return error instanceof ApiClientError ? error.code || "" : "";
}

function safeJsonParse<TFallback extends UnknownRecord>(value: string | null | undefined, fallback: TFallback): TFallback | UnknownRecord {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as UnknownRecord;
  } catch {
    return fallback;
  }
}

export async function askAiCoach(question: string, context: Pick<AppData, "profile" | "recovery"> & UnknownRecord) {
  const coachContext = (context.coachContext || {}) as UnknownRecord;

  const prompt = `You are Gym-E V2, the AI coach inside STAYFITINLIFE.

USER PROFILE:
${JSON.stringify(context.profile)}

LIVE APP CONTEXT:
${JSON.stringify({
  todayMeals: context.today,
  recovery: context.recovery,
  consumed: context.consumed,
  targets: context.targets,
  workouts: context.workouts,
  weeklyLoad: context.weeklyLoad,
  workoutsThisWeek: context.workoutsThisWeek,
  fatigueStatus: context.fatigueStatus,
  recoveryScore: context.recoveryScore,
  coachMode: context.coachMode,
  lastWorkout: context.lastWorkout,
  coachContext,
})}

USER QUESTION:
"${question}"

RESPONSE RULES:
1. Use the live app context. Do not answer generically.
2. If recoveryScore is low or fatigueStatus is High Fatigue, prioritize recovery and controlled training.
3. If protein or calories are low, give one practical food fix.
4. If workouts exist, reference the most relevant recent training pattern.
5. Use a confident coach tone, but keep it safe.
6. Keep it concise: max 6 bullets or 2 short paragraphs.
7. End with one clear next action.
8. Add a short note that you are an AI coach and not a medical professional when giving health/supplement/medical advice.`;

  try {
    const result = await callServerAi(prompt);
    return result || "I'm sorry, I couldn't process that right now. Please try again.";
  } catch (error: unknown) {
    console.error("Gym-E Chat Error:", error);
    const code = getErrorCode(error);
    if (code === "API_KEY_MISSING") return "KEY MISSING: Your OPENAI_API_KEY is not set in secrets.";
    if (code === "INVALID_API_KEY") return "INVALID KEY: Your OPENAI_API_KEY is rejected by the server.";
    if (code === "QUOTA_EXCEEDED") return "QUOTA EXCEEDED: Your OpenAI API key has reached its limit.";
    return `ERROR (Brain Link): ${error instanceof Error ? error.message : "I'm having trouble connecting to my central brain."}`;
  }
}

export async function analyzeGoal(profile: Partial<Profile>) {
  const prompt = `You are a fitness goal evaluator. 
Analyze the following fitness goal:
Current Weight: ${profile.currentWeight} ${profile.unitsSystem === 'metric' ? 'kg' : 'lbs'}
Target Weight: ${profile.targetWeight} ${profile.unitsSystem === 'metric' ? 'kg' : 'lbs'}
Current Body Fat (Estimated): ${profile.currentBodyFat || '24'}%
Target Body Fat: ${profile.targetBodyFat}%
Timeline: ${profile.timelineWeeks} weeks
Goal: ${profile.goal}

Return ONLY a JSON object:
{
  "status": "Realistic" | "Aggressive" | "Unsafe",
  "analysis": "2-3 sentence justification",
  "revisedTargetWeight": number | null,
  "revisedTargetBodyFat": number | null,
  "revisedTimelineWeeks": number | null
}`;

  try {
    const result = await callServerAi(prompt, true);
    return safeJsonParse(result, {});
  } catch (error: unknown) {
    console.error("Goal Analysis Error:", error);
    const code = getErrorCode(error);
    const message = error instanceof Error ? error.message : "Unable to analyze goal.";
    return {
      status: "Unknown",
      analysis: code ? `Unable to analyze goal (${code}: ${message})` : `Unable to analyze goal (${message})`,
      revisedTargetWeight: null,
      revisedTargetBodyFat: null,
      revisedTimelineWeeks: null
    };
  }
}

export async function generateDailyInsight(data: UnknownRecord) {
  const recovery = data.recovery as any;
  const consumed = data.consumed as any;
  const targets = data.targets as any;
  const workouts = (data.workouts as any[]) || [];
  const waterTotal = data.waterTotal as number;

  const prompt = `
You are Gym-E, an elite AI fitness coach.

User Data:
- Recovery Score: ${recovery?.score ?? 0} (${recovery?.status ?? "Unknown"})
- Calories: ${consumed?.calories ?? 0}/${targets?.calories ?? 0}
- Protein: ${consumed?.protein ?? 0}/${targets?.protein ?? 0}
- Water: ${waterTotal ?? 0}L
- Workouts Done: ${workouts.length}

STRICT RULES:
1. Recovery status is the MOST IMPORTANT factor.
2. If recovery is LOW → recommend rest, hydration, mobility. DO NOT suggest hard training.
3. If recovery is MODERATE → suggest controlled or moderate training.
4. If recovery is HIGH → suggest pushing intensity.
5. Only mention nutrition IF it is critically low.
6. Keep response SHORT (max 2 lines).
7. Be direct like a coach, NOT generic.

Output must feel like a real coach decision.
`;

  try {
    const result = await callServerAi(prompt);
    return result || "Continue metabolic stabilization.";
  } catch {
    return "Insights unavailable. Sync required.";
  }
}

export async function searchFoodNutrition(query: string) {
  const prompt = `Find nutritional data for: "${query}". 1 standard serving.
Return valid JSON:
{
  "name": "Exact Name",
  "calories": number,
  "protein": number,
  "carbs": number,
  "fats": number,
  "unit": "bowl/piece/capsule/100g/etc",
  "portion": "serving size description",
  "main": "Category",
  "sub": "Subcategory",
  "micronutrients": {
    "vitaminD": number,
    "vitaminC": number,
    "vitaminB12": number,
    "calcium": number,
    "iron": number,
    "magnesium": number,
    "zinc": number,
    "omega3": number
  }
}
For branded supplements, estimate the most likely micronutrient label values per serving. Use 0 for unknown fields.`;

  try {
    const result = await callServerAi(prompt, true);
    return safeJsonParse(result, {});
  } catch {
    return null;
  }
}

export async function searchExerciseInfo(query: string) {
  const prompt = `Provide exercise data for: "${query}".
Return valid JSON:
{
  "name": "Exercise Name",
  "met": number,
  "bodyPart": "Chest/Back/Legs/Arms/Shoulders/Cardio/Core",
  "intensity": "Low/Medium/High",
  "caloriesPerMinuteStandard": number
}`;

  try {
    const result = await callServerAi(prompt, true);
    return safeJsonParse(result, {});
  } catch {
    return null;
  }
}

export async function calculateRecoveryTime(exercise: string, weight: string, reps: string) {
  const prompt = `Rest time (seconds) for: ${exercise} (${weight} for ${reps} reps).
JSON:
{
  "seconds": number,
  "reason": "Brief reason"
}`;

  try {
    const result = await callServerAi(prompt, true);
    return safeJsonParse(result, {});
  } catch {
    return { seconds: 60, reason: "Baseline recovery interval." };
  }
}

export async function generateWorkoutPlan(profile: Partial<Profile>) {
  if (!profile || !profile.goal) {
    return "ERROR: Patient profile incomplete. Please configure your bio-metrics in Settings first.";
  }

  const prompt = `Generate a 7-day workout plan for:
Goal: ${profile.goal}
Experience Level: ${profile.mode || 'Intermediate'}
Bio-metrics: ${profile.currentWeight || 70}kg, ${profile.height || 170}cm, ${profile.age || 30}yo.

Personalize the volume, exercise selection, and intensity based strictly on the user's ${profile.mode || 'Intermediate'} level. 
Use Markdown. Focus on metabolic adaptation and structural integrity.`;

  try {
    const result = await callServerAi(prompt);
    return result || "Workout plan generation failed.";
  } catch (error: unknown) {
    console.error("AI Generation Critical Error:", error);
    const code = getErrorCode(error);
    if (code === "API_KEY_MISSING") return "KEY MISSING: Your OPENAI_API_KEY is not set in the application secrets.";
    if (code === "QUOTA_EXCEEDED") return "QUOTA EXCEEDED: Your AI training cycles are restricted. Check your OpenAI billing.";
    if (code === "INVALID_API_KEY") return "INVALID KEY: Your OPENAI_API_KEY is rejected.";
    return `ERROR: ${error instanceof Error ? error.message : "Unable to synchronize workout protocol."}`;
  }
}

export async function generateMealPlan(profile: Partial<Profile>) {
  if (!profile || !profile.goal) {
    return "ERROR: Nutritional profile incomplete. Bio-metric sync required.";
  }

  const prompt = `Generate a 7-day meal plan for:
Goal: ${profile.goal}
Cuisine Preference: ${profile.cuisine || 'Global'}
Dietary Preference: ${profile.diet || 'Balanced'}
Experience Level: ${profile.mode || 'Intermediate'} 
Bio-metrics: ${profile.currentWeight || 70}kg, ${profile.activity || 'Moderate'} activity.

Tailor macro-nutrient ratios, meal frequency, and specific meal choices based on their ${profile.cuisine || 'Global'} cuisine preference and ${profile.mode || 'Intermediate'} level.
Use Markdown. Focus on macro-nutrient distribution for ${profile.goal}.
Include a brief mention of recommended timing (e.g., pre/post workout).`;

  try {
    const result = await callServerAi(prompt);
    return result || "Meal plan generation failed.";
  } catch (error: unknown) {
    console.error("Meal Plan Critical Error:", error);
    const code = getErrorCode(error);
    if (code === "API_KEY_MISSING") return "KEY MISSING: Your OPENAI_API_KEY is missing.";
    if (code === "QUOTA_EXCEEDED") return "QUOTA EXCEEDED: Your nutritional intelligence cycles are restricted.";
    if (code === "INVALID_API_KEY") return "INVALID KEY: Your OPENAI_API_KEY is rejected.";
    return `ERROR: ${error instanceof Error ? error.message : "Unable to stabilize nutritional matrix."}`;
  }
}

export async function generateSupplementPlan(profile: Partial<Profile>) {
  if (!profile || !profile.goal) {
    return "ERROR: Biometric profile incomplete. Supplement optimization requires full sync.";
  }

  const prompt = `Generate a personalized supplement protocol for:
Goal: ${profile.goal}
Dietary Preference: ${profile.diet || 'Balanced'}
Activity Level: ${profile.activity || 'Moderate'}
Weight: ${profile.currentWeight} ${profile.unitsSystem === 'metric' ? 'kg' : 'lbs'}
Fitness Level: ${profile.mode}

Provide a list of recommended supplements (e.g., Protein, Creatine, Vitamins, Omega-3, etc.).
For each, include:
1. Why it's recommended for this specific goal.
2. Recommended dosage range.
3. Optimal timing (e.g., morning, pre-workout, before bed).

Use Markdown. Focus on evidence-based foundational supplements.
Always include a strong medical disclaimer that they should consult a doctor before starting any supplement.`;

  try {
    const result = await callServerAi(prompt);
    return result || "Supplement plan generation failed.";
  } catch (error: unknown) {
    console.error("Supplement Plan Error:", error);
    return "Unable to generate supplement protocol. Please check your network connection or API credits.";
  }
}
