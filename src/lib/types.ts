export interface Profile {
  name: string;
  age: number;
  height: number;
  currentWeight: number;
  startWeight: number;
  goal: "Fat Loss" | "Muscle Gain" | "Maintenance" | "Body Recomposition";
  targetWeight: number;
  currentBodyFat?: number;
  targetBodyFat: number;
  timelineWeeks: number;
  targetDate: string;
  activity: "Low" | "Moderate" | "High";
  diet: string;
  cuisine: string;
  mode: "Beginner" | "Advanced";
  unitsSystem: "metric" | "imperial";
  legalAccepted: boolean;
  stepGoal?: number;
}

export interface Meal {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  qty: string | number;
  unit: string;
  meal: string;
}

export interface Workout {
  id: string | number;
  name: string;
  category: string;
  caloriesBurned: number;
  sets: WorkoutSet[];
  muscles: string[];
  duration?: number;
}


export interface WorkoutSet {
  id?: string | number;
  weight?: string | number;
  reps?: string | number;
  duration?: number;
  completed?: boolean;
}

export interface ExerciseInfo {
  name: string;
  met?: number;
  bodyPart?: string;
  intensity?: string;
  caloriesPerMinuteStandard?: number;
}

export interface WaterLog {
  amount: number;
  time: number;
}

export interface Recovery {
  sleep: string;
  quality: string;
  energy: string;
  soreness: string;
}

export interface AppData {
  profile: Partial<Profile>;
  introSeen: boolean;
  units: { system: "metric" | "imperial" };
  meals: Record<string, Meal[]>;
  water: Record<string, WaterLog[]>;
  workouts: Record<string, Workout[]>;
  weights: { date: string; weight: number }[];
  steps: Record<string, number>;
  recovery: Record<string, Recovery>;
  personalFood?: Meal[];
  personalExercises?: ExerciseInfo[];
  cachedWorkoutPlan?: string;
  cachedMealPlan?: string;
  cachedSupplementPlan?: string;
  apiQueryCount?: number;
  lastApiQueryDate?: string;
  lastWorkoutPlanDate?: string;
  lastMealPlanDate?: string;
  lastSupplementPlanDate?: string;
  lastSyncDate?: string | null;
}
