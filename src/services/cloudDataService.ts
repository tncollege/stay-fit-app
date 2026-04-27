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
    if (!acc[row.date]) acc[row.date] = [];
    acc[row.date].push({
      amount: Number(row.amount || 0),
      time: row.logged_at ? new Date(row.logged_at).getTime() : Number(row.time || Date.now()),
    });
    return acc;
  }, {});
}

export async function loadCloudData(): Promise<Partial<AppData> | null> {
  const userId = await getUserId();
  if (!userId) return null;

  const [profileRes, mealsRes, workoutsRes, weightsRes, stepsRes, waterRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('meals').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    supabase.from('workouts').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    supabase.from('weights').select('*').eq('user_id', userId).order('date', { ascending: true }),
    supabase.from('steps').select('*').eq('user_id', userId).order('date', { ascending: true }),
    supabase.from('water').select('*').eq('user_id', userId).order('logged_at', { ascending: true }),
  ]);

  const firstError = profileRes.error || mealsRes.error || workoutsRes.error || weightsRes.error || stepsRes.error || waterRes.error;
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

export async function saveWorkout(date: string, workout: any) {
  const userId = await getUserId();
  if (!userId) throw new Error('User not logged in');

  const { error } = await supabase.from('workouts').upsert(
    {
      id: workout.id || crypto.randomUUID(),
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

export async function saveWater(date: string, amount: number, time = Date.now()) {
  const userId = await getUserId();
  if (!userId) throw new Error('User not logged in');

  const loggedAt = new Date(time).toISOString();
  const { error } = await supabase.from('water').upsert(
    {
      user_id: userId,
      date,
      amount,
      logged_at: loggedAt,
    },
    { onConflict: 'user_id,logged_at' }
  );

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
    for (const log of logs as WaterLog[]) {
      await saveWater(date, Number(log.amount || 0), Number(log.time || Date.now()));
    }
  }

  localStorage.setItem('stayfitinlife_cloud_synced', 'v3');
}
