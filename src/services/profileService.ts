import { supabase } from './supabaseClient';

export type ProfileInput = {
  name?: string;
  age?: number;
  weight?: number;
  height?: number;
  goal?: string;
};

export async function saveProfile(profile: ProfileInput) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;

  if (userError || !user) {
    throw new Error('User not logged in');
  }

  const { data, error } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      ...profile,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getProfile() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;

  if (userError || !user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) return null;
  return data;
}
