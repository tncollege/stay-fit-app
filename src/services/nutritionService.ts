import { supabase } from './supabaseClient';

export type NutritionLogInput = {
  date: string;
  meal: string;
  calories: number;
  protein?: number;
  carbs?: number;
  fats?: number;
};

export async function saveNutrition(entry: NutritionLogInput) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;

  if (userError || !user) {
    throw new Error('User not logged in');
  }

  const { data, error } = await supabase
    .from('nutrition_logs')
    .insert({
      user_id: user.id,
      date: entry.date,
      meal: entry.meal,
      calories: Number(entry.calories) || 0,
      protein: Number(entry.protein) || 0,
      carbs: Number(entry.carbs) || 0,
      fats: Number(entry.fats) || 0,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getNutrition() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;

  if (userError || !user) return [];

  const { data, error } = await supabase
    .from('nutrition_logs')
    .select('*')
    .eq('user_id', user.id)
    .order('date', { ascending: false });

  if (error) throw error;
  return data ?? [];
}
