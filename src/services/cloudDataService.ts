import { supabase } from './supabaseClient';
import type { AppData, Meal, Workout } from '../lib/types';

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

export async function loadCloudData(): Promise<Partial<AppData> | null> {
  const userId = await getUserId();
  if (!userId) return null;

  const [profileRes, mealsRes, workoutsRes, weightsRes, stepsRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('meals').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    supabase.from('workouts').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    supabase.from('weights').select('*').eq('user_id', userId).order('date', { ascending: true }),
    supabase.from('steps').select('*').eq('user_id', userId).order('date', { ascending: true }),
  ]);

  const firstError = profileRes.error || mealsRes.error || workoutsRes.error || weightsRes.error || stepsRes.error;
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

  const { error } = await supabase.from('meals').insert({
    id: meal.id,
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
  });

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

  const { error } = await supabase.from('workouts').insert({
    user_id: userId,
    date,
    name: workout.name,
    category: workout.category || null,
    calories_burned: workout.caloriesBurned || 0,
    duration: workout.duration || null,
    muscles: workout.muscles || [],
    sets: workout.sets || [],
  });

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
