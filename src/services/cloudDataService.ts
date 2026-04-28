import { supabase } from './supabaseClient';
import type { AppData, Meal, Workout, WaterLog } from '../lib/types';

export async function getUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user?.id || null;
}

function groupMeals(rows: any[]): Record<string, Meal[]> {
  return rows.reduce((acc: Record<string, Meal[]>, row) => {
    if (!acc[row.date]) acc[row.date] = [];
    acc[row.date].push({
      id: row.id,
      name: row.name,
      meal: row.meal_type || 'Meal',
      calories: Number(row.calories || 0),
      protein: Number(row.protein || 0),
      carbs: Number(row.carbs || 0),
      fats: Number(row.fats || 0),
      qty: row.quantity ?? 1,
      unit: row.unit || 'portion',
      loggedAt: row.logged_at || row.created_at || undefined,
      micronutrients: row.micronutrients || {},
    });
    return acc;
  }, {});
}

function groupWorkouts(rows: any[]): Record<string, Workout[]> {
  return rows.reduce((acc: Record<string, Workout[]>, row) => {
    if (!acc[row.date]) acc[row.date] = [];
    acc[row.date].push({
      id: row.id,
      name: row.name || 'Workout',
      category: row.category || 'Workout',
      caloriesBurned: Number(row.calories_burned || 0),
      muscles: row.muscles || [],
      sets: row.sets || [],
      duration: row.duration || undefined,
    } as Workout);
    return acc;
  }, {});
}

function mapSteps(rows: any[]): Record<string, number> {
  return rows.reduce((acc: Record<string, number>, row) => {
    acc[row.date] = Number(row.steps || 0);
    return acc;
  }, {});
}

function groupWater(rows: any[]): Record<string, WaterLog[]> {
  return rows.reduce((acc: Record<string, WaterLog[]>, row) => {
    // Water is stored as ONE daily total per user/date.
    // We replace by date instead of appending so mobile/desktop values never double-count.
    acc[row.date] = [{
      amount: Number(row.amount || 0),
      time: row.logged_at ? new Date(row.logged_at).getTime() : Number(row.time || Date.now()),
    }];
    return acc;
  }, {});
}

export async function loadCloudData(): Promise<Partial<AppData> | null> {
  const userId = await getUserId();
  if (!userId) return null;

  const [profileRes, mealsRes, workoutsRes, weightsRes, stepsRes, waterRes, customExercisesRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('meals').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    supabase.from('workouts').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    supabase.from('weights').select('*').eq('user_id', userId).order('date', { ascending: true }),
    supabase.from('steps').select('*').eq('user_id', userId).order('date', { ascending: true }),
    supabase.from('water').select('*').eq('user_id', userId).order('logged_at', { ascending: true }),
    supabase.from('custom_exercises').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
  ]);

  const firstError = profileRes.error || mealsRes.error || workoutsRes.error || weightsRes.error || stepsRes.error || waterRes.error || customExercisesRes.error;
  if (firstError) throw firstError;

  const profileRow = profileRes.data;
  const cloudProfile = profileRow
    ? {
        name: profileRow.name ?? undefined,
        age: profileRow.age ?? undefined,
        height: profileRow.height ?? undefined,
        currentWeight: profileRow.current_weight ?? undefined,
        targetWeight: profileRow.target_weight ?? undefined,
        startWeight: profileRow.start_weight ?? undefined,
        targetBodyFat: profileRow.target_body_fat ?? undefined,
        timelineWeeks: profileRow.timeline_weeks ?? undefined,
        goal: profileRow.goal ?? undefined,
        unitsSystem: profileRow.units_system ?? undefined,
        mode: profileRow.mode ?? undefined,
        activity: profileRow.activity ?? undefined,
        diet: profileRow.diet ?? undefined,
        cuisine: profileRow.cuisine ?? undefined,
        stepGoal: profileRow.step_goal ?? undefined,
      }
    : {};

  return {
    profile: cloudProfile,
    meals: groupMeals(mealsRes.data || []),
    workouts: groupWorkouts(workoutsRes.data || []),
    weights: (weightsRes.data || []).map((w: any) => ({ date: w.date, weight: Number(w.weight || 0) })),
    steps: mapSteps(stepsRes.data || []),
    water: groupWater(waterRes.data || []),
    personalExercises: (customExercisesRes.data || []).map((e: any) => ({ name: e.name, bodyPart: e.body_part, met: e.met ?? undefined, caloriesPerMinuteStandard: e.calories_per_minute_standard ?? undefined })),
    lastSyncDate: new Date().toISOString(),
  };
}

export async function saveProfile(profile: any) {
  const userId = await getUserId();
  if (!userId) throw new Error('User not logged in');

  const { error } = await supabase.from('profiles').upsert({
    id: userId,
    name: profile.name ?? null,
    age: profile.age ?? null,
    height: profile.height ?? null,
    current_weight: profile.currentWeight ?? null,
    target_weight: profile.targetWeight ?? null,
    start_weight: profile.startWeight ?? profile.currentWeight ?? null,
    target_body_fat: profile.targetBodyFat ?? null,
    timeline_weeks: profile.timelineWeeks ?? null,
    goal: profile.goal ?? null,
    units_system: profile.unitsSystem ?? 'metric',
    mode: profile.mode ?? null,
    activity: profile.activity ?? null,
    diet: profile.diet ?? null,
    cuisine: profile.cuisine ?? null,
    step_goal: profile.stepGoal ?? null,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
}

export async function saveMeal(meal: any) {
  const userId = await getUserId();
  if (!userId) throw new Error('User not logged in');

  const { error } = await supabase.from('meals').upsert(
    {
      id: meal.id || crypto.randomUUID(),
      user_id: userId,
      date: meal.date,
      name: meal.name,
      meal_type: meal.meal_type,
      calories: meal.calories,
      protein: meal.protein,
      carbs: meal.carbs,
      fats: meal.fats,
      quantity: meal.quantity,
      unit: meal.unit,
      logged_at: meal.loggedAt || meal.logged_at || new Date().toISOString(),
      micronutrients: meal.micronutrients || meal.micros || meal.vitamins || {},
    },
    { onConflict: 'id' }
  );

  if (error) throw error;
}

export async function deleteMealFromCloud(id: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('User not logged in');

  const { error } = await supabase.from('meals').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

function isUuid(value: unknown) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function saveWorkout(date: string, workout: any) {
  const userId = await getUserId();
  if (!userId) throw new Error('User not logged in');

  // The workouts.id column is UUID. Older local data used Date.now() numbers,
  // which caused Supabase 400 errors on upsert. Only send real UUIDs.
  const workoutId = isUuid(workout.id) ? workout.id : crypto.randomUUID();

  const { error } = await supabase.from('workouts').upsert(
    {
      id: workoutId,
      user_id: userId,
      date,
      name: workout.name,
      category: workout.category || null,
      calories_burned: workout.caloriesBurned || 0,
      duration: workout.duration || null,
      muscles: workout.muscles || [],
      sets: workout.sets || [],
    },
    { onConflict: 'id' }
  );

  if (error) throw error;
  return workoutId;
}

export async function deleteWorkoutFromCloud(id: string | number) {
  const userId = await getUserId();
  if (!userId) throw new Error('User not logged in');

  if (!isUuid(id)) {
    console.warn('Skipping cloud workout delete for legacy non-UUID id:', id);
    return;
  }

  const { error } = await supabase.from('workouts').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

export async function saveWeight(date: string, weight: number) {
  const userId = await getUserId();
  if (!userId) throw new Error('User not logged in');

  const { error } = await supabase.from('weights').upsert(
    { user_id: userId, date, weight },
    { onConflict: 'user_id,date' }
  );

  if (error) throw error;
}

export async function saveSteps(date: string, steps: number) {
  const userId = await getUserId();
  if (!userId) throw new Error('User not logged in');

  const { error } = await supabase.from('steps').upsert(
    { user_id: userId, date, steps },
    { onConflict: 'user_id,date' }
  );

  if (error) throw error;
}


export async function deleteWeightFromCloud(date: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('User not logged in');

  const { error } = await supabase.from('weights').delete().eq('user_id', userId).eq('date', date);
  if (error) throw error;
}

export async function deleteStepsFromCloud(date: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('User not logged in');

  const { error } = await supabase.from('steps').delete().eq('user_id', userId).eq('date', date);
  if (error) throw error;
}

export async function saveWaterTotal(date: string, totalAmount: number, time = Date.now()) {
  const userId = await getUserId();
  if (!userId) throw new Error('User not logged in');

  const { error } = await supabase.from('water').upsert(
    {
      user_id: userId,
      date,
      amount: totalAmount,
      logged_at: new Date(time).toISOString(),
    },
    { onConflict: 'user_id,date' }
  );

  if (error) throw error;
}

// Backward-compatible alias. It now saves the daily total, not a separate water log.
export const saveWater = saveWaterTotal;

export async function deleteWaterFromCloud(date: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('User not logged in');

  const { error } = await supabase.from('water').delete().eq('user_id', userId).eq('date', date);
  if (error) throw error;
}


export function hasMeaningfulLocalData(data: AppData) {
  const profileComplete = Boolean(data.profile?.name || data.profile?.age || data.profile?.height || data.profile?.currentWeight);
  const hasMeals = Object.values(data.meals || {}).some((items: any) => Array.isArray(items) && items.length > 0);
  const hasWorkouts = Object.values(data.workouts || {}).some((items: any) => Array.isArray(items) && items.length > 0);
  const hasWeights = Array.isArray(data.weights) && data.weights.length > 0;
  const hasSteps = Object.keys(data.steps || {}).length > 0;
  const hasWater = Object.values(data.water || {}).some((items: any) => Array.isArray(items) && items.length > 0);

  return profileComplete || hasMeals || hasWorkouts || hasWeights || hasSteps || hasWater;
}

export function hasMeaningfulCloudData(data: Partial<AppData> | null) {
  if (!data) return false;

  const profileComplete = Boolean(data.profile?.name || data.profile?.age || data.profile?.height || data.profile?.currentWeight);
  const hasMeals = Object.values(data.meals || {}).some((items: any) => Array.isArray(items) && items.length > 0);
  const hasWorkouts = Object.values(data.workouts || {}).some((items: any) => Array.isArray(items) && items.length > 0);
  const hasWeights = Array.isArray(data.weights) && data.weights.length > 0;
  const hasSteps = Object.keys(data.steps || {}).length > 0;
  const hasWater = Object.values(data.water || {}).some((items: any) => Array.isArray(items) && items.length > 0);

  return profileComplete || hasMeals || hasWorkouts || hasWeights || hasSteps || hasWater;
}

export async function syncLocalDataToCloud(data: AppData) {
  const userId = await getUserId();
  if (!userId) throw new Error('User not logged in');

  if (data.profile?.name || data.profile?.age || data.profile?.height || data.profile?.currentWeight) {
    await saveProfile(data.profile);
  }

  for (const [date, meals] of Object.entries(data.meals || {})) {
    for (const meal of meals as Meal[]) {
      await saveMeal({
        id: meal.id || crypto.randomUUID(),
        date,
        name: meal.name,
        meal_type: meal.meal,
        calories: meal.calories,
        protein: meal.protein,
        carbs: meal.carbs,
        fats: meal.fats,
        quantity: meal.qty,
        unit: meal.unit,
      });
    }
  }

  for (const [date, workouts] of Object.entries(data.workouts || {})) {
    for (const workout of workouts as Workout[]) {
      await saveWorkout(date, workout);
    }
  }

  for (const weight of data.weights || []) {
    await saveWeight(weight.date, weight.weight);
  }

  for (const [date, steps] of Object.entries(data.steps || {})) {
    await saveSteps(date, Number(steps));
  }

  for (const [date, logs] of Object.entries(data.water || {})) {
    const total = (logs as WaterLog[]).reduce((sum, log) => sum + Number(log.amount || 0), 0);
    const lastTime = (logs as WaterLog[]).reduce((max, log) => Math.max(max, Number(log.time || 0)), 0) || Date.now();
    await saveWaterTotal(date, total, lastTime);
  }

  localStorage.setItem('stayfitinlife_cloud_synced', 'v3');
}

export async function loadWorkoutPlans() {
  const userId = await getUserId();
  if (!userId) return {};

  const { data, error } = await supabase
    .from('workout_plans')
    .select('*')
    .eq('user_id', userId);

  if (error) throw error;

  return (data || []).reduce((acc: Record<string, any>, row: any) => {
    acc[row.day_of_week] = {
      dayOfWeek: row.day_of_week,
      planName: row.plan_name || '',
      exercises: Array.isArray(row.exercises) ? row.exercises : [],
    };
    return acc;
  }, {});
}

export async function saveWorkoutPlan(plan: { dayOfWeek: string; planName: string; exercises: any[] }) {
  const userId = await getUserId();
  if (!userId) throw new Error('User not logged in');

  const { error } = await supabase.from('workout_plans').upsert(
    {
      user_id: userId,
      day_of_week: plan.dayOfWeek,
      plan_name: plan.planName,
      exercises: plan.exercises || [],
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,day_of_week' }
  );

  if (error) throw error;
}

export async function deleteWorkoutPlan(dayOfWeek: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('User not logged in');

  const { error } = await supabase
    .from('workout_plans')
    .delete()
    .eq('user_id', userId)
    .eq('day_of_week', dayOfWeek);

  if (error) throw error;
}


export async function saveCustomExercise(exercise: any) {
  const userId = await getUserId();
  if (!userId) throw new Error('User not logged in');

  const { error } = await supabase.from('custom_exercises').upsert(
    {
      user_id: userId,
      name: exercise.name,
      body_part: exercise.bodyPart || 'Chest',
      source: exercise.source || 'manual',
      met: exercise.met ?? null,
      calories_per_minute_standard: exercise.caloriesPerMinuteStandard ?? null,
    },
    { onConflict: 'user_id,name' }
  );

  if (error) throw error;
}
