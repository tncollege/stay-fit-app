import { supabase } from './supabaseClient';

export type WorkoutLogInput = {
  date: string;
  workout: string;
  duration?: number;
  calories?: number;
};

export async function saveWorkout(workout: WorkoutLogInput) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;

  if (userError || !user) {
    throw new Error('User not logged in');
  }

  const { data, error } = await supabase
    .from('workout_logs')
    .insert({
      user_id: user.id,
      date: workout.date,
      workout: workout.workout,
      duration: workout.duration ?? null,
      calories: workout.calories ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getWorkouts() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;

  if (userError || !user) return [];

  const { data, error } = await supabase
    .from('workout_logs')
    .select('*')
    .eq('user_id', user.id)
    .order('date', { ascending: false });

  if (error) throw error;
  return data ?? [];
}
