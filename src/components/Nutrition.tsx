import React, { useState, useEffect, useMemo } from 'react';
import { Camera, Search, Plus, Trash2, ChevronRight, X, Scan, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AppData, Meal } from '../lib/types';
import { FOOD_DATABASE } from '../data/database';
import { round } from '../lib/utils';
import { Html5Qrcode } from 'html5-qrcode';
import { searchFoodNutrition } from '../services/aiService';
import { Brain, Sparkles, PlusCircle } from 'lucide-react';
import DateNavigator from './DateNavigator';
import { deleteMealFromCloud, deleteWaterFromCloud, saveMeal, saveWaterTotal } from '../services/cloudDataService';


function showNutritionMessage(message: string) {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById('stayfitinlife-nutrition-toast');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'stayfitinlife-nutrition-toast';
  el.textContent = message;
  el.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] px-5 py-3 rounded-2xl bg-lime text-dark text-xs font-black uppercase tracking-widest shadow-2xl shadow-lime/20 border border-lime/30 max-w-[90vw] text-center';
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 2600);
}

function normalizeMicronutrients(food: any): Record<string, number> {
  const raw = food?.micronutrients || food?.micros || food?.vitamins || {};
  const normalized: Record<string, number> = {};
  Object.entries(raw).forEach(([key, value]) => {
    const n = Number(value || 0);
    if (!Number.isNaN(n) && n > 0) normalized[key] = n;
  });

  const name = String(food?.name || '').toLowerCase();

  // Sensible fallback for common branded supplements when exact label data is missing.
  if (Object.keys(normalized).length === 0) {
    if (name.includes('magnesium')) normalized.magnesium = 200;
    if (name.includes('vitamin d') || name.includes('d3')) normalized.vitaminD = 1000;
    if (name.includes('vitamin c')) normalized.vitaminC = 500;
    if (name.includes('b12') || name.includes('vitamin b12')) normalized.vitaminB12 = 2.4;
    if (name.includes('zinc')) normalized.zinc = 10;
    if (name.includes('iron')) normalized.iron = 18;
    if (name.includes('calcium')) normalized.calcium = 500;
    if (name.includes('omega')) normalized.omega3 = 1000;
    if (name.includes('multivitamin')) {
      normalized.vitaminC = normalized.vitaminC || 75;
      normalized.vitaminD = normalized.vitaminD || 1000;
      normalized.zinc = normalized.zinc || 10;
      normalized.vitaminB12 = normalized.vitaminB12 || 2.4;
    }
  }

  return normalized;
}

const MICRO_LABELS: Record<string, string> = {
  vitaminD: 'Vitamin D',
  vitaminC: 'Vitamin C',
  vitaminB12: 'Vitamin B12',
  calcium: 'Calcium',
  iron: 'Iron',
  magnesium: 'Magnesium',
  zinc: 'Zinc',
  omega3: 'Omega-3',
};

function scaleMicronutrients(micros: Record<string, number>, qty: number) {
  return Object.fromEntries(
    Object.entries(micros).map(([key, value]) => [key, Math.round(Number(value || 0) * qty * 10) / 10])
  );
}


const MEAL_UNIT_OPTIONS = ['g', 'ml', 'kg', 'L', 'piece', 'bowl', 'cup', 'scoop', 'tbsp', 'tsp', 'slice', 'glass', 'serving', 'meal'];


// SaaS-grade Nutrition Engine V1
// This layer keeps nutrition intelligence API/database-ready and prevents UI-only logic bugs.
type NutritionEngineInput = {
  meals: any[];
  consumed: { calories: number; protein: number; carbs: number; fats: number };
  targets: { calories: number; protein: number; carbs: number; fats: number; water: number };
  waterTotalL: number;
  smartWaterTarget: number;
  workoutStartTime?: string | null;
};

type NutritionEngineOutput = {
  status: 'On Track' | 'Needs Attention' | 'Completed' | 'Recovery Focus';
  primaryInsight: string;
  mealTimingInsight: string;
  nextBestAction: string;
  loggedMeals: Record<string, boolean>;
  currentMealWindow: string;
  workoutMealTiming: 'pre-workout' | 'post-workout' | 'normal';
  dailyScore: number;
  apiPayload: {
    version: string;
    loggedMeals: Record<string, boolean>;
    consumed: { calories: number; protein: number; carbs: number; fats: number };
    targets: { calories: number; protein: number; carbs: number; fats: number; water: number };
    hydration: { currentL: number; targetL: number };
    workout: { startTime: string | null; mealTiming: string };
  };
};

const normalizeMealSlot = (value: any) => String(value || '').trim().toLowerCase();

const getMealSlot = (meal: any) => normalizeMealSlot(meal?.meal || meal?.mealType || meal?.category || meal?.slot);

const getLoggedMeals = (meals: any[]) => ({
  breakfast: meals.some(m => getMealSlot(m) === 'breakfast'),
  lunch: meals.some(m => getMealSlot(m) === 'lunch'),
  dinner: meals.some(m => getMealSlot(m) === 'dinner'),
  snacks: meals.some(m => getMealSlot(m) === 'snacks' || getMealSlot(m) === 'snack'),
});

const getCurrentMealWindow = () => {
  const hour = new Date().getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snacks';
};

const extractWorkoutStartTime = (workouts: any[]) => {
  const workout = workouts.find(w => w?.startTime || w?.plannedStartTime || w?.time || w?.scheduledTime || w?.startedAt || w?.dateTime);
  const raw = workout?.startTime || workout?.plannedStartTime || workout?.time || workout?.scheduledTime || workout?.startedAt || workout?.dateTime;
  if (!raw) return null;
  const text = String(raw);
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (match) return `${match[1].padStart(2, '0')}:${match[2]}`;
  return null;
};

const classifyMealAroundWorkoutStart = (mealTime: string | null, workoutStartTime?: string | null) => {
  if (!mealTime || !workoutStartTime) return 'normal' as const;
  const today = new Date().toISOString().split('T')[0];
  const meal = new Date(`${today}T${mealTime}`);
  const workout = new Date(`${today}T${workoutStartTime}`);
  if (Number.isNaN(meal.getTime()) || Number.isNaN(workout.getTime())) return 'normal' as const;
  const before = (workout.getTime() - meal.getTime()) / 60000;
  const after = (meal.getTime() - workout.getTime()) / 60000;
  if (before >= 30 && before <= 150) return 'pre-workout' as const;
  if (after >= 45 && after <= 180) return 'post-workout' as const;
  return 'normal' as const;
};

const buildNutritionEngine = (input: NutritionEngineInput): NutritionEngineOutput => {
  const { meals, consumed, targets, waterTotalL, smartWaterTarget, workoutStartTime } = input;
  const loggedMeals = getLoggedMeals(meals);
  const currentMealWindow = getCurrentMealWindow();
  const nowTime = new Date().toTimeString().slice(0, 5);
  const workoutMealTiming = classifyMealAroundWorkoutStart(nowTime, workoutStartTime);

  const proteinGap = Math.max(0, targets.protein - consumed.protein);
  const calorieGap = Math.max(0, targets.calories - consumed.calories);
  const waterGap = Math.max(0, smartWaterTarget - waterTotalL);
  const proteinScore = Math.min(100, Math.round((consumed.protein / Math.max(1, targets.protein)) * 100));
  const calorieScore = Math.min(100, Math.round((consumed.calories / Math.max(1, targets.calories)) * 100));
  const hydrationScore = Math.min(100, Math.round((waterTotalL / Math.max(0.1, smartWaterTarget)) * 100));
  const dailyScore = Math.round((proteinScore * 0.4) + (calorieScore * 0.35) + (hydrationScore * 0.25));

  let primaryInsight = 'Nutrition is on track today.';
  if (proteinGap > 40 && calorieGap > 600) {
    primaryInsight = `Protein and calories are low. Add one balanced high-protein meal: ${Math.min(50, Math.round(proteinGap))}g protein and 500–700 kcal.`;
  } else if (proteinGap > 40) {
    primaryInsight = `Protein is low today. Aim for a realistic ${Math.min(50, Math.round(proteinGap))}g protein meal next.`;
  } else if (calorieGap > 600) {
    primaryInsight = `You are under-eating by around ${Math.round(calorieGap)} kcal. Add a balanced meal.`;
  } else if (consumed.carbs > targets.carbs * 1.2) {
    primaryInsight = 'Carbs are running high. Keep the next meal protein-focused.';
  } else if (consumed.fats > targets.fats * 1.2) {
    primaryInsight = 'Fats are running high. Keep the next meal lean and protein-focused.';
  }

  let mealTimingInsight = 'Keep meals balanced according to your daily macro target.';
  if (workoutMealTiming === 'pre-workout') {
    mealTimingInsight = 'Pre-workout window active: prioritize easy carbs + moderate protein. Keep fats low for digestion.';
  } else if (workoutMealTiming === 'post-workout') {
    mealTimingInsight = 'Post-workout window active: prioritize protein + carbs for recovery and glycogen refill.';
  } else if (currentMealWindow === 'breakfast' && !loggedMeals.breakfast) {
    mealTimingInsight = 'Morning focus: start with protein, slow carbs, and hydration.';
  } else if (currentMealWindow === 'lunch' && !loggedMeals.lunch) {
    mealTimingInsight = 'Lunch focus: balanced protein, carbs, vegetables, and hydration.';
  } else if (currentMealWindow === 'dinner' && !loggedMeals.dinner) {
    mealTimingInsight = 'Evening focus: lighter dinner with high protein and recovery foods.';
  } else if (loggedMeals.dinner) {
    mealTimingInsight = 'Dinner logged. Focus now on hydration, digestion, and recovery.';
  } else if (loggedMeals[currentMealWindow as keyof typeof loggedMeals]) {
    mealTimingInsight = `${currentMealWindow.charAt(0).toUpperCase() + currentMealWindow.slice(1)} already logged. Focus on remaining protein, water, and recovery.`;
  }

  const carbGap = Math.max(0, targets.carbs - consumed.carbs);
  const fatGap = Math.max(0, targets.fats - consumed.fats);

  let nextBestAction = 'Stay consistent.';
  if (calorieGap > 600 && proteinGap > 25 && carbGap > 35) {
    nextBestAction = `Build next meal: ${Math.min(40, Math.round(proteinGap))}g protein + ${Math.min(60, Math.round(carbGap))}g carbs, keep fats moderate.`;
  } else if (proteinGap > 25 && carbGap > 35) {
    nextBestAction = `Add ${Math.min(40, Math.round(proteinGap))}g protein + ${Math.min(50, Math.round(carbGap))}g clean carbs.`;
  } else if (proteinGap > 25) {
    nextBestAction = `Add ${Math.min(40, Math.round(proteinGap))}g lean protein.`;
  } else if (carbGap > 50 && workoutMealTiming !== 'normal') {
    nextBestAction = `Add ${Math.min(60, Math.round(carbGap))}g workout carbs.`;
  } else if (fatGap > 20 && calorieGap > 300) {
    nextBestAction = `Add a small healthy-fat serving, around ${Math.min(20, Math.round(fatGap))}g fats.`;
  } else if (waterGap >= 0.5) {
    nextBestAction = `Add ${Math.round(Math.min(0.75, waterGap) * 1000)}ml water.`;
  }
  if (!loggedMeals.dinner && currentMealWindow === 'dinner') nextBestAction = proteinGap > 25 ? 'Create a high-protein dinner.' : 'Create a balanced dinner.';
  if (loggedMeals.dinner && waterGap < 0.5 && proteinGap <= 25 && carbGap <= 35) nextBestAction = 'Wind down: digestion, hydration, and sleep support.';

  let status: NutritionEngineOutput['status'] = 'Needs Attention';
  const proteinOk = consumed.protein >= targets.protein * 0.75;
  const caloriesOk = consumed.calories >= targets.calories * 0.55;
  const carbsHigh = consumed.carbs > targets.carbs * 1.25;
  const fatsHigh = consumed.fats > targets.fats * 1.25;
  if (proteinOk && caloriesOk && !carbsHigh && !fatsHigh) status = 'On Track';
  if (loggedMeals.dinner && dailyScore >= 75) status = 'Recovery Focus';
  if (dailyScore >= 90 && waterGap <= 0.2) status = 'Completed';

  return {
    status,
    primaryInsight,
    mealTimingInsight,
    nextBestAction,
    loggedMeals,
    currentMealWindow,
    workoutMealTiming,
    dailyScore,
    apiPayload: {
      version: 'nutrition-engine-v1',
      loggedMeals,
      consumed,
      targets,
      hydration: { currentL: waterTotalL, targetL: smartWaterTarget },
      workout: { startTime: workoutStartTime || null, mealTiming: workoutMealTiming },
    },
  };
};


type MacroRef = { calories: number; protein: number; carbs: number; fats: number; qty: number; unit: string; source?: string; };

const COMMON_INGREDIENT_MACROS: Array<{ keys: string[]; ref: MacroRef }> = [
  { keys: ['chicken breast', 'grilled chicken', 'chicken tikka', 'peri peri chicken', 'chicken'], ref: { qty: 100, unit: 'g', calories: 165, protein: 31, carbs: 0, fats: 3.6, source: 'Smart per 100g estimate' } },
  { keys: ['paneer'], ref: { qty: 100, unit: 'g', calories: 265, protein: 18, carbs: 3, fats: 21, source: 'Smart per 100g estimate' } },
  { keys: ['tofu'], ref: { qty: 100, unit: 'g', calories: 76, protein: 8, carbs: 2, fats: 4.8, source: 'Smart per 100g estimate' } },
  { keys: ['rice', 'cooked rice'], ref: { qty: 100, unit: 'g', calories: 130, protein: 2.7, carbs: 28, fats: 0.3, source: 'Smart per 100g estimate' } },
  { keys: ['dal', 'lentil'], ref: { qty: 100, unit: 'g', calories: 116, protein: 9, carbs: 20, fats: 0.4, source: 'Smart per 100g estimate' } },
  { keys: ['roti', 'chapati'], ref: { qty: 1, unit: 'piece', calories: 120, protein: 4, carbs: 22, fats: 3, source: 'Smart per piece estimate' } },
  { keys: ['egg white'], ref: { qty: 1, unit: 'piece', calories: 17, protein: 3.6, carbs: 0.2, fats: 0.1, source: 'Smart per piece estimate' } },
  { keys: ['egg', 'whole egg'], ref: { qty: 1, unit: 'piece', calories: 70, protein: 6, carbs: 0.6, fats: 5, source: 'Smart per piece estimate' } },
  { keys: ['whey'], ref: { qty: 1, unit: 'scoop', calories: 120, protein: 24, carbs: 3, fats: 1.5, source: 'Smart per scoop estimate' } },
  { keys: ['banana'], ref: { qty: 1, unit: 'piece', calories: 105, protein: 1.3, carbs: 27, fats: 0.3, source: 'Smart per piece estimate' } },
  { keys: ['apple'], ref: { qty: 1, unit: 'piece', calories: 52, protein: 0.3, carbs: 14, fats: 0.2, source: 'Smart per piece estimate' } },
  { keys: ['curd', 'yogurt', 'yoghurt'], ref: { qty: 100, unit: 'g', calories: 60, protein: 3.5, carbs: 4.7, fats: 3.3, source: 'Smart per 100g estimate' } },
  { keys: ['olive oil'], ref: { qty: 10, unit: 'ml', calories: 90, protein: 0, carbs: 0, fats: 10, source: 'Smart per 10ml estimate' } },
  { keys: ['butter'], ref: { qty: 10, unit: 'g', calories: 72, protein: 0, carbs: 0, fats: 8, source: 'Smart per 10g estimate' } },
  { keys: ['cheese'], ref: { qty: 30, unit: 'g', calories: 120, protein: 7, carbs: 1, fats: 10, source: 'Smart per 30g estimate' } },
  { keys: ['lettuce'], ref: { qty: 100, unit: 'g', calories: 15, protein: 1.4, carbs: 2.9, fats: 0.2, source: 'Smart per 100g estimate' } },
  { keys: ['cucumber'], ref: { qty: 100, unit: 'g', calories: 16, protein: 0.7, carbs: 3.6, fats: 0.1, source: 'Smart per 100g estimate' } },
  { keys: ['tomato'], ref: { qty: 100, unit: 'g', calories: 18, protein: 0.9, carbs: 3.9, fats: 0.2, source: 'Smart per 100g estimate' } },
  { keys: ['mixed seeds', 'seeds'], ref: { qty: 15, unit: 'g', calories: 85, protein: 3, carbs: 3, fats: 7, source: 'Smart per 15g estimate' } },
  { keys: ['pasta'], ref: { qty: 100, unit: 'g', calories: 157, protein: 5.8, carbs: 31, fats: 0.9, source: 'Smart cooked per 100g estimate' } },
  { keys: ['pita'], ref: { qty: 1, unit: 'piece', calories: 170, protein: 6, carbs: 34, fats: 2, source: 'Smart per piece estimate' } },
  { keys: ['tortilla', 'wrap'], ref: { qty: 1, unit: 'piece', calories: 180, protein: 5, carbs: 32, fats: 4, source: 'Smart per piece estimate' } },
];

const unitToBaseMultiplier = (qty: number, unit: string, ref: MacroRef) => {
  const from = String(unit || '').toLowerCase();
  const base = String(ref.unit || '').toLowerCase();
  const q = Number(qty || 0);
  const refQty = Number(ref.qty || 1);
  if (!q || !refQty) return 0;
  if (from === base) return q / refQty;
  if (from === 'kg' && base === 'g') return (q * 1000) / refQty;
  if (from === 'g' && base === 'kg') return q / 1000 / refQty;
  if (from === 'l' && base === 'ml') return (q * 1000) / refQty;
  if (from === 'ml' && base === 'l') return q / 1000 / refQty;
  if (base === 'g') {
    if (from === 'cup') return (q * 150) / refQty;
    if (from === 'tbsp') return (q * 15) / refQty;
    if (from === 'tsp') return (q * 5) / refQty;
    if (from === 'bowl') return (q * 180) / refQty;
    if (from === 'serving') return q;
  }
  if (base === 'ml') {
    if (from === 'cup') return (q * 240) / refQty;
    if (from === 'tbsp') return (q * 15) / refQty;
    if (from === 'tsp') return (q * 5) / refQty;
    if (from === 'glass') return (q * 250) / refQty;
  }
  return q / refQty;
};

const scaleMacrosFromRef = (qty: number, unit: string, ref?: MacroRef | null) => {
  if (!ref) return null;
  const factor = unitToBaseMultiplier(qty, unit, ref);
  return {
    calories: Math.max(0, Math.round(ref.calories * factor)),
    protein: Math.max(0, round(ref.protein * factor)),
    carbs: Math.max(0, round(ref.carbs * factor)),
    fats: Math.max(0, round(ref.fats * factor)),
  };
};


export default function Nutrition({ data, setData, viewDate, setViewDate, performanceEngine }: { data: AppData, setData: any, viewDate: string, setViewDate: (d: string) => void, performanceEngine?: any }) {
  const [selectedMeal, setSelectedMeal] = useState('Breakfast');
  const [searchQuery, setSearchQuery] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [selectedMain, setSelectedMain] = useState<string | null>(null);
  const [selectedSub, setSelectedSub] = useState<string | null>(null);
  const [selectedFood, setSelectedFood] = useState<any>(null);
  const [qtyInput, setQtyInput] = useState('1');
  const [wholeEggs, setWholeEggs] = useState(2);
  const [eggWhites, setEggWhites] = useState(0);
  const [servingType, setServingType] = useState<string>('standard');
  const [aiSearching, setAiSearching] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customFood, setCustomFood] = useState({
    name: '',
    calories: 0,
    protein: 0,
    carbs: 0,
    fats: 0,
    unit: 'portion',
    portion: '1 serving'
  });
  const [showMealBuilder, setShowMealBuilder] = useState(false);
  const [customMealName, setCustomMealName] = useState('');
  const [aiMealPrompt, setAiMealPrompt] = useState('');
  const [aiBuildingMeal, setAiBuildingMeal] = useState(false);
  const [mealBuilderComponents, setMealBuilderComponents] = useState<any[]>([]);
  const [manualIngredient, setManualIngredient] = useState({ name: '', qty: '', unit: 'g', calories: '', protein: '', carbs: '', fats: '' });
  const [manualMacroRef, setManualMacroRef] = useState<MacroRef | null>(null);
  const [manualLookupLoading, setManualLookupLoading] = useState(false);
  const [weatherTemp, setWeatherTemp] = useState<number | null>(null);
  const [weatherAvailable, setWeatherAvailable] = useState(false);

  const mealsArr = data.meals[viewDate] || [];
  const waterArr = data.water[viewDate] || [];
  const waterTotalMl = waterArr.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const personalFoodList = data.personalFood || [];
  const combinedFoodList = [...FOOD_DATABASE, ...personalFoodList];

  const mealBuilderTotals = useMemo(() => {
    return mealBuilderComponents.reduce(
      (acc, item) => ({
        calories: acc.calories + Number(item.calories || 0),
        protein: acc.protein + Number(item.protein || 0),
        carbs: acc.carbs + Number(item.carbs || 0),
        fats: acc.fats + Number(item.fats || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fats: 0 }
    );
  }, [mealBuilderComponents]);

  const EGG_DATA = {
    whole: { cal: 70, p: 6, c: 0.6, f: 5 },
    white: { cal: 17, p: 3.6, c: 0.2, f: 0.1 }
  };

  const isEggDish = selectedFood?.main === 'Eggs';
  const isGlobalEgg = isEggDish && selectedFood?.sub === 'Global';
  const qtyValue = qtyInput.trim() === '' ? 0 : Number(qtyInput) || 0;
  const saveQtyValue = qtyInput.trim() === '' ? 1 : Number(qtyInput) || 1;

  const isSupplementMeal = (meal: any) => {
    const name = String(meal?.name || '').toLowerCase();
    const unit = String(meal?.unit || '').toLowerCase();

    return (
      unit.includes('capsule') ||
      unit.includes('tablet') ||
      unit.includes('softgel') ||
      name.includes('omega') ||
      name.includes('vitamin') ||
      name.includes('d3') ||
      name.includes('k2') ||
      name.includes('magnesium') ||
      name.includes('zinc') ||
      name.includes('multivitamin')
    );
  };

  const consumed = useMemo(() => {
    return mealsArr.reduce(
      (acc, meal) => {
        // Supplements stay visible in the log, but they do not distort the daily food coaching.
        if (isSupplementMeal(meal)) return acc;

        return {
          calories: acc.calories + Number(meal.calories || 0),
          protein: acc.protein + Number(meal.protein || 0),
          carbs: acc.carbs + Number(meal.carbs || 0),
          fats: acc.fats + Number(meal.fats || 0),
        };
      },
      { calories: 0, protein: 0, carbs: 0, fats: 0 }
    );
  }, [mealsArr]);

  const targets = useMemo(() => {
    const engineTargets = performanceEngine?.nutrition?.targets;
    if (engineTargets) {
      return {
        calories: Math.round(Number(engineTargets.calories || 0)),
        protein: Math.round(Number(engineTargets.protein || 0)),
        carbs: Math.round(Number(engineTargets.carbs || 0)),
        fats: Math.round(Number(engineTargets.fats || 0)),
        water: Number(engineTargets.water || 3.5),
      };
    }

    const w = data.profile.currentWeight ?? 70;
    let baseCalories = w * 30;

    if (data.profile.goal === 'Fat Loss') baseCalories -= 500;
    if (data.profile.goal === 'Muscle Gain') baseCalories += 300;

    return {
      calories: Math.round(baseCalories),
      protein: Math.round(w * 2),
      carbs: Math.round((baseCalories * 0.4) / 4),
      fats: Math.round((baseCalories * 0.3) / 9),
      water: 3.5,
    };
  }, [data.profile, performanceEngine]);

  useEffect(() => {
    let cancelled = false;

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setWeatherAvailable(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;

        try {
          const res = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m`
          );
          const json = await res.json();
          const temp = Number(json?.current?.temperature_2m);

          if (!cancelled && Number.isFinite(temp)) {
            setWeatherTemp(temp);
            setWeatherAvailable(true);
          }
        } catch (err) {
          console.error('Global weather hydration fetch failed ❌', err);
          if (!cancelled) setWeatherAvailable(false);
        }
      },
      (err) => {
        console.warn('Location permission unavailable for hydration weather:', err?.message || err);
        if (!cancelled) setWeatherAvailable(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 30 * 60 * 1000 }
    );

    return () => {
      cancelled = true;
    };
  }, []);

  const waterTotalL = waterTotalMl / 1000;
  const workoutArr = data.workouts?.[viewDate] || [];
  const stepsToday = Number(data.steps?.[viewDate] || 0);
  const workoutBurned = workoutArr.reduce((sum: number, workout: any) => sum + Number(workout.caloriesBurned || 0), 0);

  const getWeatherHydrationBoost = (tempC: number) => {
    if (tempC >= 35) return 0.8;
    if (tempC >= 30) return 0.5;
    if (tempC >= 25) return 0.3;
    return 0;
  };

  // Global smart hydration target: base + live weather from GPS + activity load.
  const hydrationContext = useMemo(() => {
    const weatherBoost = weatherTemp !== null ? getWeatherHydrationBoost(weatherTemp) : 0;
    const workoutBoost = Math.min(0.75, (workoutBurned / 500) * 0.5);
    const stepsBoost = stepsToday >= 10000 ? 0.4 : stepsToday >= 7000 ? 0.25 : stepsToday >= 4000 ? 0.15 : 0;
    const target = Math.round((targets.water + weatherBoost + workoutBoost + stepsBoost) * 10) / 10;

    let reminder = 'Hydration is steady. Keep sipping through the day.';
    if (waterTotalL >= target) {
      reminder = 'Hydration goal achieved. Maintain normal sipping only.';
    } else if (weatherTemp !== null && weatherBoost > 0 && workoutBurned > 0) {
      reminder = `Global weather is ${Math.round(weatherTemp)}°C and workout load is active. Add 500ml water and electrolytes if you sweat heavily.`;
    } else if (workoutBurned > 0) {
      reminder = 'Workout logged today. Add 500ml water around training.';
    } else if (weatherTemp !== null && weatherBoost > 0) {
      reminder = `Global weather is ${Math.round(weatherTemp)}°C. Add 250–500ml extra water.`;
    } else if (stepsToday >= 7000) {
      reminder = 'Higher movement day. Add 250–500ml water to stay ahead.';
    } else if (!weatherAvailable) {
      reminder = 'Allow location access to personalize hydration with live global weather.';
    }

    return { target, weatherBoost, workoutBoost, stepsBoost, reminder };
  }, [targets.water, workoutBurned, stepsToday, waterTotalL, weatherTemp, weatherAvailable]);

  const smartWaterTarget = Math.max(hydrationContext.target, Number(performanceEngine?.nutrition?.targets?.water || 0));
  const waterGap = Math.max(0, smartWaterTarget - waterTotalL);

  const workoutStartTime = useMemo(() => performanceEngine?.workout?.startTime || extractWorkoutStartTime(workoutArr), [workoutArr, performanceEngine]);

  const nutritionEngine = useMemo(() => buildNutritionEngine({
    meals: mealsArr,
    consumed,
    targets,
    waterTotalL,
    smartWaterTarget,
    workoutStartTime,
  }), [mealsArr, consumed, targets, waterTotalL, smartWaterTarget, workoutStartTime]);

  const nutritionInsight = nutritionEngine.primaryInsight;
  const nutritionStatus = nutritionEngine.status;
  const mealSuggestion = nutritionEngine.mealTimingInsight;
  const nextBestNutritionAction = nutritionEngine.nextBestAction;
  const dailyNutritionScore = nutritionEngine.dailyScore;

  const macroGaps = useMemo(() => ({
    calories: Math.max(0, Math.round(targets.calories - consumed.calories)),
    protein: Math.max(0, Math.round(targets.protein - consumed.protein)),
    carbs: Math.max(0, Math.round(targets.carbs - consumed.carbs)),
    fats: Math.max(0, Math.round(targets.fats - consumed.fats)),
    water: Math.max(0, Math.round(waterGap * 10) / 10),
  }), [targets, consumed, waterGap]);

  // Nutrition should guide the next eating decision, not duplicate the dashboard PCF summary.
  // These values are capped into realistic next-meal targets so large full-day gaps never overflow compact cards.
  const nextMealFuelTarget = useMemo(() => {
    const calories = macroGaps.calories <= 0 ? 0 : Math.min(700, Math.max(350, macroGaps.calories));
    const protein = macroGaps.protein <= 0 ? 0 : Math.min(45, Math.max(25, macroGaps.protein));
    const carbs = macroGaps.carbs <= 0 ? 0 : Math.min(70, Math.max(25, macroGaps.carbs));
    const fats = macroGaps.fats <= 0 ? 0 : Math.min(18, Math.max(8, macroGaps.fats));

    const action = protein > 0 && carbs > 0
      ? `Build next meal: ${protein}g protein + ${carbs}g carbs, fats ${fats}g max.`
      : protein > 0
        ? `Build next meal around ${protein}g lean protein.`
        : carbs > 0
          ? `Use ${carbs}g clean carbs around training.`
          : 'Macros are on track. Focus on hydration and consistency.';

    return { calories, protein, carbs, fats, action };
  }, [macroGaps]);

  const fuelBalanceCards = useMemo(() => ([
    { label: 'Meal energy', value: nextMealFuelTarget.calories > 0 ? String(nextMealFuelTarget.calories) : 'Done', unit: nextMealFuelTarget.calories > 0 ? 'kcal' : '', tone: 'text-pink', action: nextMealFuelTarget.calories > 0 ? 'Next meal range' : 'Complete' },
    { label: 'Protein', value: nextMealFuelTarget.protein > 0 ? String(nextMealFuelTarget.protein) : '0', unit: 'g', tone: 'text-lime', action: nextMealFuelTarget.protein > 0 ? 'Priority' : 'On track' },
    { label: 'Carbs', value: nextMealFuelTarget.carbs > 0 ? String(nextMealFuelTarget.carbs) : '0', unit: 'g', tone: 'text-sky', action: nextMealFuelTarget.carbs > 0 ? 'Fuel' : 'Controlled' },
    { label: 'Fats', value: nextMealFuelTarget.fats > 0 ? String(nextMealFuelTarget.fats) : '0', unit: 'g', tone: 'text-amber-300', action: nextMealFuelTarget.fats > 0 ? 'Limit' : 'Keep lean' },
  ]), [nextMealFuelTarget]);

  // Conversions for non-standard serving sizes
  const CONVERSIONS: Record<string, number> = {
    '100g': 100,
    '1g': 1,
    'bowl': 250,
    'spoon': 15,
    'piece': 80, // Average piece weight
    'ml': 1,     // 1ml ≈ 1g for most liquids
    'oz': 28.35, // 1 oz ≈ 28.35g
  };

  const getWeightMultiplier = () => {
    if (!selectedFood) return 1;
    if (servingType === 'standard') return 1;
    
    // 1. Get standard weight of the food's default portion in grams
    // We look for "250g" or "100ml" in the portion string
    const match = selectedFood.portion.match(/(\d+)\s*(g|ml)/i);
    const weightInPortion = match ? parseInt(match[1]) : (selectedFood.unit === '100g' ? 100 : 100);
    
    // 2. Get target weight from selected serving type (in grams)
    const targetWeight = CONVERSIONS[servingType] || 100;
    
    return targetWeight / weightInPortion;
  };

  const calculateDetailedMacros = () => {
    if (!selectedFood) return { cal: 0, p: 0, c: 0, f: 0 };
    
    const weightMult = getWeightMultiplier();
    
    if (isEggDish) {
      if (isGlobalEgg) {
        // Base is Veggies + Oil (Template - 2 Whole Eggs)
        const baseCal = selectedFood.calories - (2 * EGG_DATA.whole.cal);
        const baseP = selectedFood.protein - (2 * EGG_DATA.whole.p);
        const baseC = selectedFood.carbs - (2 * EGG_DATA.whole.c);
        const baseF = selectedFood.fats - (2 * EGG_DATA.whole.f);

        return {
          cal: Math.round(((baseCal * weightMult) + (wholeEggs * EGG_DATA.whole.cal) + (eggWhites * EGG_DATA.white.cal)) * qtyValue),
          p: round(((baseP * weightMult) + (wholeEggs * EGG_DATA.whole.p) + (eggWhites * EGG_DATA.white.p)) * qtyValue),
          c: round(((baseC * weightMult) + (wholeEggs * EGG_DATA.whole.c) + (eggWhites * EGG_DATA.white.c)) * qtyValue),
          f: round(((baseF * weightMult) + (wholeEggs * EGG_DATA.whole.f) + (eggWhites * EGG_DATA.white.f)) * qtyValue)
        };
      } else {
        // Basic Egg Items (just use counts)
        return {
          cal: Math.round(((wholeEggs * EGG_DATA.whole.cal) + (eggWhites * EGG_DATA.white.cal)) * qtyValue),
          p: round(((wholeEggs * EGG_DATA.whole.p) + (eggWhites * EGG_DATA.white.p)) * qtyValue),
          c: round(((wholeEggs * EGG_DATA.whole.c) + (eggWhites * EGG_DATA.white.c)) * qtyValue),
          f: round(((wholeEggs * EGG_DATA.whole.f) + (eggWhites * EGG_DATA.white.f)) * qtyValue)
        };
      }
    }
    
    return {
      cal: Math.round(selectedFood.calories * weightMult * qtyValue),
      p: round(selectedFood.protein * weightMult * qtyValue),
      c: round(selectedFood.carbs * weightMult * qtyValue),
      f: round(selectedFood.fats * weightMult * qtyValue)
    };
  };

  const currentMacros = calculateDetailedMacros();
  const currentMicros = scaleMicronutrients(normalizeMicronutrients(selectedFood), qtyValue || 1);

  const handleAddMeal = async () => {
    if (!selectedFood) return;

    const finalMacros = calculateDetailedMacros();
    const unitLabel = servingType === 'standard' ? selectedFood.unit : servingType;
    const mealName = isEggDish
      ? selectedFood.name + " (" + wholeEggs + "W, " + eggWhites + "E)"
      : selectedFood.name;

    const newMeal: Meal = {
      id: crypto.randomUUID(),
      name: mealName,
      meal: selectedMeal,
      calories: finalMacros.cal,
      protein: finalMacros.p,
      carbs: finalMacros.c,
      fats: finalMacros.f,
      qty: saveQtyValue,
      unit: unitLabel || 'portion',
      loggedAt: new Date().toISOString(),
      micronutrients: currentMicros
    };

    const foodWithCategory = { ...selectedFood, main: 'User Food' };
    const isAlreadyInDb = combinedFoodList.some(
      f => f.name.toLowerCase() === selectedFood.name.toLowerCase()
    );

    try {
      // Save to Supabase first. This prevents the auto cloud refresh from
      // replacing the local meal list with old cloud data and making the meal disappear.
      await saveMeal({
        id: newMeal.id,
        date: viewDate,
        name: mealName,
        meal_type: selectedMeal,
        calories: Number(finalMacros.cal) || 0,
        protein: Number(finalMacros.p) || 0,
        carbs: Number(finalMacros.c) || 0,
        fats: Number(finalMacros.f) || 0,
        quantity: saveQtyValue,
        unit: unitLabel || 'portion',
        loggedAt: newMeal.loggedAt,
        micronutrients: currentMicros,
      });

      setData((prev: AppData) => ({
        ...prev,
        meals: {
          ...prev.meals,
          [viewDate]: [...(prev.meals[viewDate] || []), newMeal]
        },
        micronutrients: Object.keys(currentMicros).length > 0 ? {
          ...(prev.micronutrients || {}),
          [viewDate]: [...((prev.micronutrients || {})[viewDate] || []), { name: mealName, micronutrients: currentMicros }]
        } : (prev.micronutrients || {}),
        supplements: Object.keys(currentMicros).length > 0 ? {
          ...(prev.supplements || {}),
          [viewDate]: [...((prev.supplements || {})[viewDate] || []), { name: mealName, micronutrients: currentMicros }]
        } : (prev.supplements || {}),
        personalFood: isAlreadyInDb
          ? (prev.personalFood || [])
          : [...(prev.personalFood || []), foodWithCategory]
      }));

      showNutritionMessage('Food logged');
      setSelectedFood(null);
      setSearchQuery('');
      setWholeEggs(2);
      setEggWhites(0);
      setQtyInput('1');
    } catch (err) {
      console.error('Meal save error ❌', err);
      showNutritionMessage('Unable to save food. Please try again.');
    }
  };


  const normalizeMealBuilderComponent = (item: any) => {
    const normalized = {
      id: item.id || crypto.randomUUID(),
      name: item.name || 'Ingredient',
      qty: Number(item.qty || 1),
      unit: item.unit || item.portion || 'serving',
      calories: Math.max(0, Math.round(Number(item.calories || 0))),
      protein: Math.max(0, round(Number(item.protein || 0))),
      carbs: Math.max(0, round(Number(item.carbs || 0))),
      fats: Math.max(0, round(Number(item.fats ?? item.fat ?? 0))),
      macroRef: item.macroRef || null,
    };
    return {
      ...normalized,
      macroRef: normalized.macroRef || {
        calories: normalized.calories,
        protein: normalized.protein,
        carbs: normalized.carbs,
        fats: normalized.fats,
        qty: normalized.qty || 1,
        unit: normalized.unit || 'serving',
        source: item.source || 'Added estimate',
      },
    };
  };

  const findLocalIngredientMacroRef = (name: string): MacroRef | null => {
    const text = String(name || '').toLowerCase().trim();
    if (!text) return null;
    const dbMatch = combinedFoodList.find(food => {
      const foodName = String(food.name || '').toLowerCase();
      return foodName === text || foodName.includes(text) || text.includes(foodName);
    });
    if (dbMatch) {
      return {
        calories: Number(dbMatch.calories || 0),
        protein: Number(dbMatch.protein || 0),
        carbs: Number(dbMatch.carbs || 0),
        fats: Number(dbMatch.fats ?? dbMatch.fat ?? 0),
        qty: Number(dbMatch.qty || 1),
        unit: dbMatch.unit || dbMatch.portion || 'serving',
        source: 'Food database match',
      };
    }
    const smartMatch = COMMON_INGREDIENT_MACROS.find(item => item.keys.some(key => text.includes(key)));
    return smartMatch ? smartMatch.ref : null;
  };

  const applyManualMacroRef = (ref: MacroRef | null, nextQty = manualIngredient.qty, nextUnit = manualIngredient.unit) => {
    if (!ref) return;
    const scaled = scaleMacrosFromRef(Number(nextQty || 0), nextUnit || ref.unit, ref);
    if (!scaled) return;
    setManualMacroRef(ref);
    setManualIngredient(prev => ({
      ...prev,
      unit: prev.unit || ref.unit || 'g',
      calories: String(scaled.calories),
      protein: String(scaled.protein),
      carbs: String(scaled.carbs),
      fats: String(scaled.fats),
    }));
  };

  const lookupManualIngredientNutrition = async () => {
    if (!manualIngredient.name.trim()) return;
    setManualLookupLoading(true);
    try {
      const localRef = findLocalIngredientMacroRef(manualIngredient.name);
      if (localRef) {
        applyManualMacroRef(localRef);
        showNutritionMessage('Nutrition auto-filled from database');
        return;
      }
      const aiFood = await searchFoodNutrition(`${manualIngredient.name} ${manualIngredient.qty || 1} ${manualIngredient.unit || 'g'}`);
      if (!aiFood) {
        showNutritionMessage('No nutrition match found. Enter macros manually.');
        return;
      }
      const ref: MacroRef = {
        calories: Number(aiFood.calories || 0),
        protein: Number(aiFood.protein || 0),
        carbs: Number(aiFood.carbs || 0),
        fats: Number(aiFood.fats ?? aiFood.fat ?? 0),
        qty: Number(manualIngredient.qty || 1),
        unit: manualIngredient.unit || aiFood.unit || aiFood.portion || 'serving',
        source: 'Gym-E AI lookup',
      };
      setManualMacroRef(ref);
      setManualIngredient(prev => ({
        ...prev,
        name: aiFood.name || prev.name,
        calories: String(Math.round(ref.calories)),
        protein: String(round(ref.protein)),
        carbs: String(round(ref.carbs)),
        fats: String(round(ref.fats)),
      }));
      showNutritionMessage('Gym-E AI nutrition filled');
    } catch (err) {
      console.error('Manual ingredient lookup error ❌', err);
      showNutritionMessage('AI lookup failed. Enter macros manually.');
    } finally {
      setManualLookupLoading(false);
    }
  };

  useEffect(() => {
    if (!showMealBuilder || !manualIngredient.name.trim()) return;
    const t = window.setTimeout(() => {
      const localRef = findLocalIngredientMacroRef(manualIngredient.name);
      if (localRef) applyManualMacroRef(localRef);
    }, 450);
    return () => window.clearTimeout(t);
  }, [manualIngredient.name, showMealBuilder]);

  useEffect(() => {
    if (!manualMacroRef) return;
    const scaled = scaleMacrosFromRef(Number(manualIngredient.qty || 0), manualIngredient.unit, manualMacroRef);
    if (!scaled) return;
    setManualIngredient(prev => ({ ...prev, calories: String(scaled.calories), protein: String(scaled.protein), carbs: String(scaled.carbs), fats: String(scaled.fats) }));
  }, [manualIngredient.qty, manualIngredient.unit, manualMacroRef]);

  const addManualIngredientToMeal = () => {
    if (!manualIngredient.name.trim()) return;
    setMealBuilderComponents(prev => [...prev, normalizeMealBuilderComponent({
      ...manualIngredient,
      qty: Number(manualIngredient.qty || 1),
      calories: Number(manualIngredient.calories || 0),
      protein: Number(manualIngredient.protein || 0),
      carbs: Number(manualIngredient.carbs || 0),
      fats: Number(manualIngredient.fats || 0),
      macroRef: manualMacroRef,
    })]);
    setManualIngredient({ name: '', qty: '', unit: 'g', calories: '', protein: '', carbs: '', fats: '' });
    setManualMacroRef(null);
    showNutritionMessage('Ingredient added');
  };

  const updateMealBuilderComponent = (id: string, key: string, value: any) => {
    setMealBuilderComponents(prev => prev.map(item => {
      if (item.id !== id) return item;
      const numericKeys = ['qty', 'calories', 'protein', 'carbs', 'fats'];
      const updated = { ...item, [key]: numericKeys.includes(key) ? Number(value) : value };
      if ((key === 'qty' || key === 'unit') && updated.macroRef) {
        const scaled = scaleMacrosFromRef(Number(updated.qty || 0), updated.unit, updated.macroRef);
        if (scaled) return { ...updated, ...scaled };
      }
      return updated;
    }));
  };

  const removeMealBuilderComponent = (id: string) => {
    setMealBuilderComponents(prev => prev.filter(item => item.id !== id));
  };

  const estimateMealComponentsFromPrompt = async (prompt: string) => {
    const text = prompt.toLowerCase();
    const components: any[] = [];
    const add = (item: any) => components.push(normalizeMealBuilderComponent(item));

    const matchedFoods = combinedFoodList
      .filter(food => {
        const name = String(food.name || '').toLowerCase();
        return name.length > 3 && text.includes(name);
      })
      .slice(0, 6);

    matchedFoods.forEach(food => add({
      name: food.name,
      qty: 1,
      unit: food.unit || food.portion || 'serving',
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fats: food.fats,
    }));

    const smartRules = [
      { keys: ['chicken', 'shawarma'], item: { name: 'Chicken Shawarma', qty: 150, unit: 'g', calories: 310, protein: 36, carbs: 4, fats: 16 } },
      { keys: ['chicken'], item: { name: 'Chicken Breast / Tikka', qty: 150, unit: 'g', calories: 248, protein: 46, carbs: 0, fats: 5 } },
      { keys: ['paneer'], item: { name: 'Paneer', qty: 100, unit: 'g', calories: 265, protein: 18, carbs: 3, fats: 21 } },
      { keys: ['dal'], item: { name: 'Dal', qty: 1, unit: 'bowl', calories: 180, protein: 10, carbs: 28, fats: 4 } },
      { keys: ['rice'], item: { name: 'Rice', qty: 1, unit: 'bowl', calories: 205, protein: 4, carbs: 45, fats: 0 } },
      { keys: ['roti'], item: { name: 'Roti', qty: 1, unit: 'piece', calories: 120, protein: 4, carbs: 22, fats: 3 } },
      { keys: ['pita'], item: { name: 'Pita Bread', qty: 1, unit: 'piece', calories: 170, protein: 6, carbs: 34, fats: 2 } },
      { keys: ['wrap'], item: { name: 'Wrap / Tortilla', qty: 1, unit: 'piece', calories: 180, protein: 5, carbs: 32, fats: 4 } },
      { keys: ['pasta'], item: { name: 'Cooked Pasta', qty: 1, unit: 'bowl', calories: 300, protein: 10, carbs: 58, fats: 3 } },
      { keys: ['egg'], item: { name: 'Eggs', qty: 2, unit: 'piece', calories: 140, protein: 12, carbs: 1, fats: 10 } },
      { keys: ['whey'], item: { name: 'Whey Protein', qty: 1, unit: 'scoop', calories: 120, protein: 24, carbs: 3, fats: 2 } },
      { keys: ['banana'], item: { name: 'Banana', qty: 1, unit: 'piece', calories: 105, protein: 1, carbs: 27, fats: 0 } },
      { keys: ['curd'], item: { name: 'Curd / Yogurt', qty: 150, unit: 'g', calories: 90, protein: 6, carbs: 7, fats: 4 } },
      { keys: ['yogurt'], item: { name: 'Yogurt / Dressing', qty: 100, unit: 'g', calories: 90, protein: 6, carbs: 7, fats: 4 } },
      { keys: ['olive oil'], item: { name: 'Olive Oil', qty: 10, unit: 'ml', calories: 90, protein: 0, carbs: 0, fats: 10 } },
      { keys: ['seeds'], item: { name: 'Mixed Seeds', qty: 15, unit: 'g', calories: 85, protein: 3, carbs: 3, fats: 7 } },
      { keys: ['cheese'], item: { name: 'Cheese', qty: 30, unit: 'g', calories: 120, protein: 7, carbs: 1, fats: 10 } },
      { keys: ['sauce'], item: { name: 'Sauce / Dressing', qty: 30, unit: 'g', calories: 80, protein: 1, carbs: 5, fats: 6 } },
      { keys: ['garlic'], item: { name: 'Garlic Sauce', qty: 30, unit: 'g', calories: 120, protein: 1, carbs: 2, fats: 12 } },
      { keys: ['salad'], item: { name: 'Mixed Salad Vegetables', qty: 100, unit: 'g', calories: 35, protein: 2, carbs: 7, fats: 0 } },
      { keys: ['lettuce'], item: { name: 'Lettuce', qty: 50, unit: 'g', calories: 8, protein: 1, carbs: 2, fats: 0 } },
      { keys: ['cucumber'], item: { name: 'Cucumber', qty: 100, unit: 'g', calories: 16, protein: 1, carbs: 4, fats: 0 } },
      { keys: ['sushi'], item: { name: 'Sushi Rice + Fish Base', qty: 1, unit: 'bowl', calories: 420, protein: 28, carbs: 55, fats: 10 } },
      { keys: ['smoothie'], item: { name: 'Smoothie Base', qty: 1, unit: 'glass', calories: 250, protein: 12, carbs: 38, fats: 6 } },
    ];

    smartRules.forEach(rule => {
      if (rule.keys.every(key => text.includes(key)) && !components.some(c => c.name.toLowerCase() === rule.item.name.toLowerCase())) {
        add(rule.item);
      }
    });

    if (components.length === 0) {
      const aiFood = await searchFoodNutrition(prompt);
      if (aiFood) {
        add({
          name: aiFood.name || prompt,
          qty: 1,
          unit: aiFood.unit || aiFood.portion || 'meal',
          calories: aiFood.calories,
          protein: aiFood.protein,
          carbs: aiFood.carbs,
          fats: aiFood.fats,
        });
      }
    }

    return components.length ? components : [normalizeMealBuilderComponent({
      name: prompt,
      qty: 1,
      unit: 'meal',
      calories: 450,
      protein: 25,
      carbs: 45,
      fats: 15,
    })];
  };

  const handleBuildMealWithAI = async () => {
    if (!aiMealPrompt.trim()) return;
    setAiBuildingMeal(true);
    try {
      const components = await estimateMealComponentsFromPrompt(aiMealPrompt.trim());
      setMealBuilderComponents(prev => [...prev, ...components]);
      if (!customMealName.trim()) {
        const cleaned = aiMealPrompt.trim();
        setCustomMealName(cleaned.length > 42 ? cleaned.slice(0, 42) + '...' : cleaned);
      }
      showNutritionMessage('AI meal components added');
    } catch (err) {
      console.error('AI meal builder error ❌', err);
      showNutritionMessage('Unable to build meal. Add ingredients manually.');
    } finally {
      setAiBuildingMeal(false);
    }
  };

  const handleSaveBuiltMeal = async () => {
    if (!customMealName.trim() || mealBuilderComponents.length === 0) return;

    const newMeal: Meal = {
      id: crypto.randomUUID(),
      name: customMealName.trim(),
      meal: selectedMeal,
      calories: Math.round(mealBuilderTotals.calories),
      protein: round(mealBuilderTotals.protein),
      carbs: round(mealBuilderTotals.carbs),
      fats: round(mealBuilderTotals.fats),
      qty: 1,
      unit: 'meal',
      loggedAt: new Date().toISOString(),
    };

    const foodWithCategory = {
      name: newMeal.name,
      calories: newMeal.calories,
      protein: newMeal.protein,
      carbs: newMeal.carbs,
      fats: newMeal.fats,
      unit: 'meal',
      portion: '1 meal',
      main: 'User Food',
      cuisine: 'Custom Meal',
      components: mealBuilderComponents,
    };

    const isAlreadyInDb = combinedFoodList.some(
      f => f.name.toLowerCase() === newMeal.name.toLowerCase()
    );

    try {
      await saveMeal({
        id: newMeal.id,
        date: viewDate,
        name: newMeal.name,
        meal_type: selectedMeal,
        calories: Number(newMeal.calories) || 0,
        protein: Number(newMeal.protein) || 0,
        carbs: Number(newMeal.carbs) || 0,
        fats: Number(newMeal.fats) || 0,
        quantity: 1,
        unit: 'meal',
        loggedAt: newMeal.loggedAt,
      });

      setData((prev: AppData) => ({
        ...prev,
        meals: {
          ...prev.meals,
          [viewDate]: [...(prev.meals[viewDate] || []), newMeal]
        },
        personalFood: isAlreadyInDb
          ? (prev.personalFood || [])
          : [...(prev.personalFood || []), foodWithCategory]
      }));

      setShowMealBuilder(false);
      setCustomMealName('');
      setAiMealPrompt('');
      setMealBuilderComponents([]);
      showNutritionMessage('Custom meal logged');
    } catch (err) {
      console.error('Built meal save error ❌', err);
      showNutritionMessage('Unable to save meal. Please try again.');
    }
  };

  const handleAiSearch = async () => {
    if (!searchQuery) return;
    setAiSearching(true);
    const result = await searchFoodNutrition(searchQuery);
    if (result) {
      setSelectedFood(result);
      setSearchQuery('');
    }
    setAiSearching(false);
  };

  const handleAddCustom = async () => {
    if (!customFood.name) return;

    const newMeal: Meal = {
      id: crypto.randomUUID(),
      ...customFood,
      meal: selectedMeal,
      qty: 1,
      loggedAt: new Date().toISOString()
    };

    const foodWithCategory = { ...customFood, main: 'User Food' };
    const isAlreadyInDb = combinedFoodList.some(
      f => f.name.toLowerCase() === customFood.name.toLowerCase()
    );

    try {
      // Save to Supabase first, then update UI. This keeps local UI and cloud refresh in sync.
      await saveMeal({
        id: newMeal.id,
        date: viewDate,
        name: customFood.name,
        meal_type: selectedMeal,
        calories: Number(customFood.calories) || 0,
        protein: Number(customFood.protein) || 0,
        carbs: Number(customFood.carbs) || 0,
        fats: Number(customFood.fats) || 0,
        quantity: 1,
        unit: customFood.unit || 'portion',
        loggedAt: newMeal.loggedAt,
      });

      setData((prev: AppData) => ({
        ...prev,
        meals: {
          ...prev.meals,
          [viewDate]: [...(prev.meals[viewDate] || []), newMeal]
        },
        personalFood: isAlreadyInDb
          ? (prev.personalFood || [])
          : [...(prev.personalFood || []), foodWithCategory]
      }));

      showNutritionMessage('Food logged');
      setShowCustomForm(false);
      setCustomFood({ name: '', calories: 0, protein: 0, carbs: 0, fats: 0, unit: 'portion', portion: '1 serving' });
    } catch (err) {
      console.error('Meal save error ❌', err);
      showNutritionMessage('Unable to save food. Please try again.');
    }
  };

  const mains = Array.from(new Set(combinedFoodList.map(f => f.main)))
    .filter(m => !['Main Dish', 'Main Course', 'Main course', 'main course', 'main dish', 'Indian cuisine', 'Indian Cuisine', 'indian cuisine'].includes(m));

  const subs = selectedMain 
    ? Array.from(new Set(combinedFoodList.filter(f => f.main === selectedMain).map(f => {
        const val = f.cuisine || f.sub;
        if (val && (val.toLowerCase() === 'indian cuisine')) return 'Indian';
        return val;
      })))
      .filter(s => s && !['Main Dish', 'Main Course', 'Main course', 'main course', 'main dish', 'Indian cuisine', 'Indian Cuisine', 'indian cuisine'].includes(s))
    : [];

  const filteredFoods = combinedFoodList.filter(f => {
    const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         f.cuisine?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMain = selectedMain ? f.main === selectedMain : true;
    const matchesSub = selectedSub ? (f.cuisine === selectedSub || f.sub === selectedSub) : true;
    return matchesSearch && matchesMain && matchesSub;
  });

  const deleteMeal = async (id: string) => {
    setData((prev: AppData) => ({
      ...prev,
      meals: {
        ...prev.meals,
        [viewDate]: prev.meals[viewDate].filter(m => m.id !== id)
      }
    }));

    try {
      await deleteMealFromCloud(id);
    } catch (err) {
      console.error('Meal delete error ❌', err);
    }
  };

  const clearWater = async () => {
    setData((prev: AppData) => ({
      ...prev,
      water: {
        ...prev.water,
        [viewDate]: []
      }
    }));

    try {
      await deleteWaterFromCloud(viewDate);
      console.log('Water deleted from Supabase ✅');
    } catch (err) {
      console.error('Water delete error ❌', err);
    }
  };

  const addWater = async (amount: number) => {
    const time = Date.now();
    const currentTotal = (data.water[viewDate] || []).reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );
    const newTotal = currentTotal + amount;

    // Store water as ONE daily total so devices do not merge/double-count values.
    setData((prev: AppData) => ({
      ...prev,
      water: {
        ...prev.water,
        [viewDate]: [{ amount: newTotal, time }]
      }
    }));

    try {
      await saveWaterTotal(viewDate, newTotal, time);
      console.log('Water total saved to Supabase ✅');
      showNutritionMessage(amount + 'ml water added');
    } catch (err) {
      console.error('Water save error ❌', err);
      showNutritionMessage('Water saved locally. Cloud sync failed.');
    }
  };

  const handleEditMeal = (meal: Meal) => {
    setSelectedFood(meal);
    setQtyInput(String(Number(meal.qty) || 1));
    setSelectedMeal(meal.meal);
    deleteMeal(meal.id);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="text-4xl font-black">Nutrition</h2>
          <div className="label-small text-lime mt-1 tracking-[0.2em]">Metabolic Fueling System</div>
        </div>
        <DateNavigator viewDate={viewDate} setViewDate={setViewDate} />
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="stat-card space-y-6">
            <div className="flex gap-2 p-1 bg-black/40 rounded-2xl border border-border">
              {['Breakfast', 'Lunch', 'Dinner', 'Snacks'].map(m => (
                <button
                  key={m}
                  onClick={() => setSelectedMeal(m)}
                  className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${selectedMeal === m ? 'bg-lime text-dark shadow-lg shadow-lime/20' : 'text-white/30 hover:text-white'}`}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-sky/10 bg-sky/5 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="label-small text-sky">Today's Water</div>
                  <div className="mt-1 text-[11px] font-bold uppercase tracking-widest text-white/40">
                    Smart target: {smartWaterTarget.toFixed(1)}L
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black text-sky">{round(waterTotalL)}L</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                    {waterGap > 0 ? waterGap.toFixed(1) + 'L left' : 'Goal done'}
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-sky/10 bg-black/20 p-3 text-[11px] font-bold leading-relaxed text-white/60">
                {hydrationContext.reminder}
              </div>

              <div className="mt-2 text-[10px] font-black uppercase tracking-widest text-sky/80">
                {weatherTemp !== null
                  ? `Weather adjusted globally: ${Math.round(weatherTemp)}°C · Target ${smartWaterTarget.toFixed(1)}L`
                  : 'Global weather hydration: allow location for live adjustment'}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                {[250, 500, 750].map(amt => (
                  <button
                    key={amt}
                    onClick={() => addWater(amt)}
                    className="rounded-xl bg-sky/10 border border-sky/20 text-sky py-3 text-[10px] font-black uppercase tracking-widest hover:bg-sky/20 active:scale-95 transition-all"
                  >
                    +{amt}ml
                  </button>
                ))}
              </div>

              {waterTotalMl > 0 && (
                <button
                  onClick={clearWater}
                  className="mt-3 w-full rounded-xl bg-white/5 border border-sky/20 text-sky py-3 text-[9px] font-black uppercase tracking-widest hover:bg-sky/10 transition-all"
                >
                  Clear Water
                </button>
              )}
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
              <button 
                onClick={() => { setSelectedMain(null); setSelectedSub(null); }}
                className={`flex-none px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${!selectedMain ? 'bg-lime border-lime text-dark shadow-lg shadow-lime/20' : 'bg-white/[0.03] border-border text-white/40 hover:text-white'}`}
              >
                All
              </button>
              {mains.map(m => (
                <button
                  key={m}
                  onClick={() => { setSelectedMain(m); setSelectedSub(null); }}
                  className={`flex-none px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${selectedMain === m ? 'bg-lime border-lime text-dark shadow-lg shadow-lime/20' : 'bg-white/[0.03] border-border text-white/40 hover:text-white'}`}
                >
                  {m}
                </button>
              ))}
              <button 
                onClick={() => setShowCustomForm(true)}
                className="flex-none px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border border-dashed border-pink/30 text-pink hover:bg-pink/10 transition-all flex items-center gap-2"
              >
                <PlusCircle size={10} /> Custom
              </button>
              <button 
                onClick={() => setShowMealBuilder(true)}
                className="flex-none px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border border-dashed border-lime/40 text-lime hover:bg-lime/10 transition-all flex items-center gap-2"
              >
                <Sparkles size={10} /> Create Meal
              </button>
            </div>

            {selectedMain && subs.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar border-t border-border/50 pt-4">
                {subs.map(s => (
                  <button
                    key={s}
                    onClick={() => setSelectedSub(s === selectedSub ? null : s)}
                    className={`flex-none px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${selectedSub === s ? 'bg-sky border-sky text-dark shadow-lg shadow-sky/20' : 'bg-white/[0.03] border-border text-white/40 hover:text-white'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 opacity-30" />
              <input 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-28 py-5 bg-white/[0.02] border border-border rounded-2xl text-sm font-bold focus:outline-none focus:border-lime transition-all placeholder:opacity-20"
                placeholder="Search nutrients or cuisines..."
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <button 
                  onClick={handleAiSearch}
                  disabled={aiSearching || !searchQuery}
                  className={`p-2 rounded-xl border transition-all ${aiSearching ? 'bg-white/5 border-white/10 text-white/20' : 'bg-sky/10 border-sky/20 text-sky hover:bg-sky/20'}`}
                >
                  <Sparkles size={18} className={aiSearching ? 'animate-pulse' : ''} />
                </button>
                <button 
                  onClick={() => setShowScanner(true)}
                  className="p-2 bg-lime/10 text-lime rounded-xl border border-lime/20 hover:bg-lime/20 transition-all"
                >
                  <Scan size={18} />
                </button>
              </div>
            </div>

            {searchQuery && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-2 max-h-[300px] overflow-auto pr-2 custom-scrollbar">
                {filteredFoods.length > 0 ? (
                  filteredFoods.map(food => (
                    <button
                      key={food.name}
                      onClick={() => { setSelectedFood(food); setSearchQuery(''); }}
                      className="w-full flex justify-between items-center p-5 bg-white/[0.02] border border-border hover:border-lime/40 rounded-2xl transition-all text-left"
                    >
                      <div>
                        <p className="font-bold text-sm tracking-tight">{food.name}</p>
                        <div className="label-small opacity-30 mt-1">{food.cuisine || food.main} • {food.portion}</div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-lime">{food.calories} <span className="text-[10px] opacity-40">KCAL</span></p>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="p-8 text-center bg-white/[0.01] border border-dashed border-border rounded-2xl">
                    <Brain className="w-8 h-8 mx-auto mb-3 opacity-20" />
                    <p className="text-xs font-bold opacity-30 mb-4">No local matches found</p>
                    <button 
                      onClick={handleAiSearch}
                      disabled={aiSearching}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-sky text-dark font-black rounded-xl text-[10px] uppercase tracking-widest hover:shadow-lg hover:shadow-sky/20 transition-all"
                    >
                      {aiSearching ? 'Searching...' : 'Ask Gym-E to find it'}
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </div>

        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-lime/20 bg-lime/10 p-5">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-[10px] font-black uppercase tracking-[0.25em] text-lime">
                Gym-E Nutrition Insight
              </div>
              <div className={'rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest ' + (['On Track', 'Completed', 'Recovery Focus'].includes(nutritionStatus) ? 'bg-lime/20 text-lime border border-lime/20' : 'bg-pink/10 text-pink border border-pink/20')}>
                {nutritionStatus}
              </div>
            </div>
            <p className="text-sm font-bold text-white leading-relaxed">
              {nutritionInsight}
            </p>
            <p className="mt-2 text-[11px] text-white/40 font-bold uppercase tracking-widest">
              {mealSuggestion}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-[9px] font-black uppercase tracking-widest text-white/30">Nutrition Score</div>
                <div className="mt-1 text-lg font-black text-lime">{dailyNutritionScore}<span className="text-[10px] text-white/30">/100</span></div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-[9px] font-black uppercase tracking-widest text-white/30">Next Best Action</div>
                <div className="mt-1 text-[11px] font-bold leading-snug text-white/70">{nextBestNutritionAction}</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                onClick={() => {
                  setSelectedMeal(new Date().getHours() < 17 ? 'Lunch' : 'Dinner');
                  setSelectedMain('Chicken');
                  setSelectedSub(null);
                  setSearchQuery('chicken');
                  showNutritionMessage('Showing high-protein options');
                }}
                className="rounded-xl bg-lime text-dark px-3 py-3 text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all"
              >
                Find Protein Meal
              </button>
              <button
                onClick={() => setShowMealBuilder(true)}
                className="rounded-xl bg-pink/10 border border-pink/20 text-pink px-3 py-3 text-[10px] font-black uppercase tracking-widest hover:bg-pink/20 active:scale-95 transition-all"
              >
                Create Meal
              </button>
              <button
                onClick={() => addWater(500)}
                className="rounded-xl bg-sky/10 border border-sky/20 text-sky px-3 py-3 text-[10px] font-black uppercase tracking-widest hover:bg-sky/20 active:scale-95 transition-all"
              >
                +500ml Water
              </button>
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-white/60">Next Meal Fuel Target</div>
                  <div className="mt-1 text-[9px] font-bold uppercase tracking-widest text-white/30">Action target from today’s remaining gaps</div>
                </div>
                {performanceEngine?.nutrition?.targets && (
                  <div className="self-start shrink-0 rounded-full border border-lime/20 bg-lime/10 px-3 py-1 text-[8px] font-black uppercase tracking-widest text-lime">
                    WHOOP adjusted
                  </div>
                )}
              </div>

              <div className="mb-3 rounded-xl border border-lime/10 bg-lime/[0.04] px-3 py-2 text-[10px] font-bold leading-snug text-white/60">
                {nextMealFuelTarget.action}
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {fuelBalanceCards.map(card => (
                  <div key={card.label} className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-white/50 overflow-hidden">
                    <div className="truncate text-[9px] font-black uppercase tracking-widest">{card.label}</div>
                    <div className={"mt-1 flex min-w-0 items-end gap-1 " + card.tone}>
                      <span className="min-w-0 truncate text-lg font-black leading-none tracking-tight">{card.value}</span>
                      {card.unit && <span className="shrink-0 pb-0.5 text-[9px] font-black uppercase tracking-widest text-white/30">{card.unit}</span>}
                    </div>
                    <div className="mt-1 truncate text-[8px] font-black uppercase tracking-widest text-white/25">
                      {card.action}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="stat-card">
            <h3 className="label-small mb-6 text-pink">Daily Intake Log</h3>
            <div className="space-y-3">
              {mealsArr.length === 0 ? (
                <div className="py-20 text-center">
                  <div className="label-small opacity-20 italic">No metabolic inputs recorded</div>
                </div>
              ) : (
                mealsArr.map(meal => (
                  <div key={meal.id} className="flex justify-between items-center p-5 bg-white/[0.02] border border-border rounded-2xl group hover:border-pink/30 transition-all">
                    <div>
                      <div className="label-small text-lime mb-1">{meal.meal}</div>
                      <p className="font-bold text-sm tracking-tight">{meal.name}</p>
                      <div className="text-[9px] font-bold text-muted uppercase tracking-widest mt-1 opacity-40">
                         P {meal.protein}g • C {meal.carbs}g • F {meal.fats}g
                      </div>
                      <div className="text-[9px] font-bold text-white/30 uppercase tracking-widest mt-1">
                        Logged: {meal.loggedAt ? new Date(meal.loggedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-black text-pink">{meal.calories} <span className="text-[8px] opacity-50 uppercase">kcal</span></p>
                        <p className="label-small opacity-30 mt-0.5">{meal.qty} {meal.unit}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleEditMeal(meal)} className="p-2 bg-white/5 rounded-lg text-white/20 hover:text-lime hover:bg-lime/10 transition-all">
                          <Search size={14} />
                        </button>
                        <button onClick={() => deleteMeal(meal.id)} className="p-2 bg-white/5 rounded-lg text-white/20 hover:text-pink hover:bg-pink/10 transition-all">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {selectedFood && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedFood(null)} className="absolute inset-0 bg-black/90 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-md bg-panel border border-border p-10 rounded-[3rem] shadow-2xl">
               <button onClick={() => setSelectedFood(null)} className="absolute top-8 right-8 p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-all"><X size={18}/></button>
               <div className="label-small text-lime mb-2">Detailed Analysis</div>
               <h3 className="text-3xl font-black mb-1">{selectedFood.name}</h3>
               <div className="label-small opacity-30 mb-10">{selectedFood.portion}</div>
               
               <div className="grid grid-cols-4 gap-3 mb-6">
                  <NutriSmall label="Kcal" val={currentMacros.cal} color="text-pink" />
                  <NutriSmall label="Prot" val={currentMacros.p} color="text-lime" />
                  <NutriSmall label="Carb" val={currentMacros.c} color="text-sky" />
                  <NutriSmall label="Fat" val={currentMacros.f} />
               </div>

               {Object.keys(currentMicros).length > 0 && (
                 <div className="mb-8 p-4 rounded-2xl bg-lime/5 border border-lime/20">
                   <div className="label-small text-lime mb-3">Micronutrients / Supplement Actives</div>
                   <div className="grid grid-cols-2 gap-2">
                     {Object.entries(currentMicros).map(([key, value]) => (
                       <div key={key} className="flex justify-between items-center bg-white/[0.03] border border-border rounded-xl px-3 py-2">
                         <span className="text-[9px] font-black uppercase tracking-widest text-white/45">{MICRO_LABELS[key] || key}</span>
                         <span className="text-xs font-black text-lime">{value}</span>
                       </div>
                     ))}
                   </div>
                 </div>
               )}

               <div className="space-y-6">
                  <div className="space-y-3">
                    <label className="label-small text-muted ml-1">Serving Size</label>
                    <div className="flex flex-wrap gap-2">
                       {['standard', '100g', 'ml', 'oz', 'bowl', 'piece', 'spoon', '1g'].map((type) => {
                         const isStandard = type === 'standard';
                         const label = isStandard ? (selectedFood.unit || 'Portion') : type;
                         
                         return (
                           <button
                             key={type}
                             onClick={() => setServingType(type)}
                             className={`px-4 py-3 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${servingType === type ? 'bg-white/10 border-white/20 text-white' : 'bg-white/[0.02] border-border text-white/20'}`}
                           >
                             {label}
                           </button>
                         );
                       })}
                    </div>
                  </div>

                  {isEggDish && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="label-small text-muted ml-1">Whole Eggs</label>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setWholeEggs(Math.max(0, wholeEggs - 1))} className="w-10 h-10 bg-white/5 rounded-xl hover:bg-white/10 transition-all">-</button>
                          <div className="flex-1 h-12 bg-white/[0.03] border border-border rounded-xl flex items-center justify-center font-black">{wholeEggs}</div>
                          <button onClick={() => setWholeEggs(wholeEggs + 1)} className="w-10 h-10 bg-white/5 rounded-xl hover:bg-white/10 transition-all">+</button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="label-small text-muted ml-1">Egg Whites</label>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setEggWhites(Math.max(0, eggWhites - 1))} className="w-10 h-10 bg-white/5 rounded-xl hover:bg-white/10 transition-all">-</button>
                          <div className="flex-1 h-12 bg-white/[0.03] border border-border rounded-xl flex items-center justify-center font-black">{eggWhites}</div>
                          <button onClick={() => setEggWhites(eggWhites + 1)} className="w-10 h-10 bg-white/5 rounded-xl hover:bg-white/10 transition-all">+</button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <label className="label-small text-muted ml-1">Quantity (Multiplier)</label>
                    <input 
                      type="text"
                      inputMode="decimal"
                      value={qtyInput}
                      onChange={e => {
                        const next = e.target.value;
                        if (/^\d*\.?\d*$/.test(next)) setQtyInput(next);
                      }}
                      onFocus={e => e.currentTarget.select()}
                      placeholder="1"
                      className="w-full px-6 py-5 bg-white/[0.03] border border-border rounded-2xl text-2xl font-black focus:outline-none focus:border-lime transition-all"
                    />
                  </div>
                  
                  <button onClick={handleAddMeal} className="w-full py-5 bg-lime text-dark font-black rounded-2xl shadow-xl shadow-lime/20 uppercase text-xs tracking-widest active:scale-95 transition-all">Add to {selectedMeal}</button>
               </div>
            </motion.div>
          </div>
        )}

        {showScanner && (
          <BarcodeScanner onResult={(res) => { console.log('Scanned:', res); setShowScanner(false); }} onClose={() => setShowScanner(false)} />
        )}

        {showMealBuilder && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowMealBuilder(false)} className="absolute inset-0 bg-black/90 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.92, opacity: 0, y: 16 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.92, opacity: 0, y: 16 }} className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-panel border border-border p-5 md:p-8 rounded-[2rem] md:rounded-[3rem] shadow-2xl custom-scrollbar">
              <button onClick={() => setShowMealBuilder(false)} className="absolute top-5 right-5 p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-all"><X size={18}/></button>

              <div className="pr-12">
                <div className="label-small text-lime mb-2">Universal Meal Builder</div>
                <h3 className="text-3xl md:text-4xl font-black tracking-tight">Create Any Meal</h3>
                <p className="mt-2 text-xs md:text-sm font-bold text-white/40 leading-relaxed">
                  Build any homemade, restaurant, or custom meal from any cuisine. Use Gym-E AI to break it down, then edit every ingredient before logging.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-5 mt-8">
                <div className="space-y-5">
                  <div className="rounded-3xl border border-lime/20 bg-lime/5 p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles size={16} className="text-lime" />
                      <div className="text-[10px] font-black uppercase tracking-[0.25em] text-lime">Build with Gym-E AI</div>
                    </div>
                    <textarea
                      value={aiMealPrompt}
                      onChange={e => setAiMealPrompt(e.target.value)}
                      placeholder="Describe any meal from any cuisine. Example: dal chawal with curd, paneer tikka wrap, chicken shawarma plate, sushi bowl, pasta with chicken, smoothie with banana and whey"
                      className="w-full min-h-[105px] rounded-2xl bg-black/30 border border-white/10 px-4 py-4 text-sm font-bold outline-none resize-none focus:border-lime/50 transition-all placeholder:text-white/20"
                    />
                    <button
                      onClick={handleBuildMealWithAI}
                      disabled={aiBuildingMeal || !aiMealPrompt.trim()}
                      className="mt-3 w-full rounded-2xl bg-lime py-4 text-[10px] font-black uppercase tracking-widest text-dark shadow-xl shadow-lime/20 disabled:opacity-30 active:scale-95 transition-all"
                    >
                      {aiBuildingMeal ? 'Breaking Down Meal...' : 'AI Break Down Meal'}
                    </button>
                  </div>

                  <div className="rounded-3xl border border-pink/20 bg-pink/5 p-5 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <PlusCircle size={16} className="text-pink" />
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-[0.25em] text-pink">Manual Ingredient</div>
                          <div className="text-[10px] font-bold text-white/35 mt-1">Auto macro fill updates when quantity/unit changes.</div>
                        </div>
                      </div>
                      {manualMacroRef?.source && (
                        <div className="hidden sm:block rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-white/35">
                          {manualMacroRef.source}
                        </div>
                      )}
                    </div>

                    <input
                      value={manualIngredient.name}
                      onChange={e => {
                        setManualIngredient({ ...manualIngredient, name: e.target.value });
                        setManualMacroRef(null);
                      }}
                      placeholder="Ingredient name e.g. Peri Peri Chicken, Dal, Rice, Olive Oil"
                      className="w-full rounded-2xl bg-black/30 border border-white/10 px-5 py-4 text-base font-bold outline-none focus:border-pink/50"
                    />

                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={manualIngredient.qty}
                        onChange={e => setManualIngredient({ ...manualIngredient, qty: e.target.value })}
                        placeholder="Quantity"
                        className="w-full rounded-2xl bg-black/30 border border-white/10 px-5 py-4 text-base font-black outline-none focus:border-pink/50"
                      />
                      <select
                        value={manualIngredient.unit}
                        onChange={e => setManualIngredient({ ...manualIngredient, unit: e.target.value })}
                        className="w-full rounded-2xl bg-black/30 border border-white/10 px-5 py-4 text-base font-black outline-none focus:border-pink/50"
                      >
                        {MEAL_UNIT_OPTIONS.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                      </select>
                    </div>

                    <button
                      onClick={lookupManualIngredientNutrition}
                      disabled={manualLookupLoading || !manualIngredient.name.trim()}
                      className="w-full rounded-2xl border border-lime/20 bg-lime/10 py-4 text-[10px] font-black uppercase tracking-widest text-lime disabled:opacity-30 active:scale-95 transition-all"
                    >
                      {manualLookupLoading ? 'Looking Up Nutrition...' : 'AI Nutrition Lookup'}
                    </button>

                    <div className="grid grid-cols-2 gap-3">
                      <input type="number" value={manualIngredient.calories} onChange={e => setManualIngredient({ ...manualIngredient, calories: e.target.value })} placeholder="Calories" className="rounded-2xl bg-black/30 border border-white/10 px-5 py-4 text-base font-black text-pink outline-none focus:border-pink/50" />
                      <input type="number" value={manualIngredient.protein} onChange={e => setManualIngredient({ ...manualIngredient, protein: e.target.value })} placeholder="Protein (g)" className="rounded-2xl bg-black/30 border border-white/10 px-5 py-4 text-base font-black text-lime outline-none focus:border-pink/50" />
                      <input type="number" value={manualIngredient.carbs} onChange={e => setManualIngredient({ ...manualIngredient, carbs: e.target.value })} placeholder="Carbs (g)" className="rounded-2xl bg-black/30 border border-white/10 px-5 py-4 text-base font-black text-sky outline-none focus:border-pink/50" />
                      <input type="number" value={manualIngredient.fats} onChange={e => setManualIngredient({ ...manualIngredient, fats: e.target.value })} placeholder="Fat (g)" className="rounded-2xl bg-black/30 border border-white/10 px-5 py-4 text-base font-black outline-none focus:border-pink/50" />
                    </div>

                    <button onClick={addManualIngredientToMeal} className="w-full rounded-2xl bg-pink text-dark px-4 py-4 text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all">
                      Add Ingredient
                    </button>
                  </div>
                </div>

                <div className="space-y-5">
                  <input
                    value={customMealName}
                    onChange={e => setCustomMealName(e.target.value)}
                    placeholder="Meal name e.g. Chicken Shawarma Plate"
                    className="w-full rounded-2xl bg-white/[0.03] border border-border px-5 py-4 text-lg font-black outline-none focus:border-lime transition-all"
                  />

                  <div className="grid grid-cols-4 gap-2">
                    <NutriSmall label="Kcal" val={Math.round(mealBuilderTotals.calories)} color="text-pink" />
                    <NutriSmall label="Prot" val={round(mealBuilderTotals.protein) + 'g'} color="text-lime" />
                    <NutriSmall label="Carb" val={round(mealBuilderTotals.carbs) + 'g'} color="text-sky" />
                    <NutriSmall label="Fat" val={round(mealBuilderTotals.fats) + 'g'} />
                  </div>

                  <div className="rounded-3xl border border-border bg-black/20 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="label-small text-white/40">Editable Components</div>
                      <div className="text-[10px] font-black text-white/30 uppercase tracking-widest">{mealBuilderComponents.length} items</div>
                    </div>

                    {mealBuilderComponents.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-xs font-bold text-white/30">
                        Use AI breakdown or add ingredients manually.
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
                        {mealBuilderComponents.map(item => (
                          <div key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                            <div className="flex items-start justify-between gap-3">
                              <input
                                value={item.name}
                                onChange={e => updateMealBuilderComponent(item.id, 'name', e.target.value)}
                                className="flex-1 bg-transparent text-sm font-black outline-none"
                              />
                              <button onClick={() => removeMealBuilderComponent(item.id)} className="p-2 rounded-xl bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-all"><Trash2 size={14}/></button>
                            </div>
                            <div className="grid grid-cols-6 gap-2 mt-3">
                              <input type="number" value={item.qty} onChange={e => updateMealBuilderComponent(item.id, 'qty', e.target.value)} className="rounded-xl bg-black/30 border border-white/10 px-2 py-2 text-[11px] font-black outline-none" />
                              <select value={item.unit} onChange={e => updateMealBuilderComponent(item.id, 'unit', e.target.value)} className="rounded-xl bg-black/30 border border-white/10 px-2 py-2 text-[11px] font-bold outline-none">
                                {MEAL_UNIT_OPTIONS.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                              </select>
                              <input type="number" value={item.calories} onChange={e => updateMealBuilderComponent(item.id, 'calories', e.target.value)} className="rounded-xl bg-black/30 border border-white/10 px-2 py-2 text-[11px] font-black text-pink outline-none" />
                              <input type="number" value={item.protein} onChange={e => updateMealBuilderComponent(item.id, 'protein', e.target.value)} className="rounded-xl bg-black/30 border border-white/10 px-2 py-2 text-[11px] font-black text-lime outline-none" />
                              <input type="number" value={item.carbs} onChange={e => updateMealBuilderComponent(item.id, 'carbs', e.target.value)} className="rounded-xl bg-black/30 border border-white/10 px-2 py-2 text-[11px] font-black text-sky outline-none" />
                              <input type="number" value={item.fats} onChange={e => updateMealBuilderComponent(item.id, 'fats', e.target.value)} className="rounded-xl bg-black/30 border border-white/10 px-2 py-2 text-[11px] font-black outline-none" />
                            </div>
                            <div className="grid grid-cols-6 gap-2 mt-1 text-[8px] font-black uppercase tracking-widest text-white/25 px-2">
                              <span>Qty</span><span>Unit</span><span>Kcal</span><span>P</span><span>C</span><span>F</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => {
                        setCustomMealName('');
                        setAiMealPrompt('');
                        setMealBuilderComponents([]);
                      }}
                      className="rounded-2xl bg-white/5 border border-white/10 py-4 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                    >
                      Clear
                    </button>
                    <button
                      onClick={handleSaveBuiltMeal}
                      disabled={!customMealName.trim() || mealBuilderComponents.length === 0}
                      className="rounded-2xl bg-lime text-dark py-4 text-[10px] font-black uppercase tracking-widest shadow-xl shadow-lime/20 disabled:opacity-30 active:scale-95 transition-all"
                    >
                      Save & Log Meal
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showCustomForm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCustomForm(false)} className="absolute inset-0 bg-black/90 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-md bg-panel border border-border p-10 rounded-[3rem] shadow-2xl">
               <button onClick={() => setShowCustomForm(false)} className="absolute top-8 right-8 p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-all"><X size={18}/></button>
               <div className="label-small text-pink mb-2">Custom Metabolic Input</div>
               <h3 className="text-3xl font-black mb-10">Add Custom Food</h3>
               
               <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="label-small text-muted ml-1 uppercase opacity-40">Food Name</label>
                    <input 
                      value={customFood.name}
                      onChange={e => setCustomFood({...customFood, name: e.target.value})}
                      placeholder="Enter dish name..."
                      className="w-full px-6 py-4 bg-white/[0.03] border border-border rounded-2xl text-lg font-bold focus:outline-none focus:border-pink transition-all"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="label-small text-muted ml-1 uppercase opacity-40">Calories</label>
                      <input 
                        type="number"
                        value={customFood.calories}
                        onChange={e => setCustomFood({...customFood, calories: Number(e.target.value)})}
                        className="w-full px-6 py-4 bg-white/[0.03] border border-border rounded-2xl font-black text-pink"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="label-small text-muted ml-1 uppercase opacity-40">Protein (g)</label>
                      <input 
                        type="number"
                        value={customFood.protein}
                        onChange={e => setCustomFood({...customFood, protein: Number(e.target.value)})}
                        className="w-full px-6 py-4 bg-white/[0.03] border border-border rounded-2xl font-black text-lime"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="label-small text-muted ml-1 uppercase opacity-40">Carbs (g)</label>
                      <input 
                        type="number"
                        value={customFood.carbs}
                        onChange={e => setCustomFood({...customFood, carbs: Number(e.target.value)})}
                        className="w-full px-6 py-4 bg-white/[0.03] border border-border rounded-2xl font-black text-sky"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="label-small text-muted ml-1 uppercase opacity-40">Fats (g)</label>
                      <input 
                        type="number"
                        value={customFood.fats}
                        onChange={e => setCustomFood({...customFood, fats: Number(e.target.value)})}
                        className="w-full px-6 py-4 bg-white/[0.03] border border-border rounded-2xl font-black"
                      />
                    </div>
                  </div>
                  <button onClick={handleAddCustom} className="w-full py-5 bg-pink text-dark font-black rounded-2xl shadow-xl shadow-pink/20 uppercase text-xs tracking-widest active:scale-95 transition-all mt-4">Add to {selectedMeal}</button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NutriSmall({ label, val, color = 'text-white' }: any) {
  return (
    <div className="bg-white/[0.03] border border-border p-4 rounded-2xl text-center">
      <div className="label-small opacity-20 mb-1 leading-none">{label}</div>
      <p className={`text-sm font-black ${color}`}>{val}</p>
    </div>
  );
}

function BarcodeScanner({ onResult, onClose }: { onResult: (res: string) => void, onClose: () => void }) {
  useEffect(() => {
    let html5QrCode: Html5Qrcode;
    
    const start = async () => {
      html5QrCode = new Html5Qrcode("reader");
      try {
        await html5QrCode.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (decodedText) => {
            onResult(decodedText);
            html5QrCode.stop();
          },
          () => {}
        );
      } catch (err) {
        console.error(err);
      }
    };

    start();
    return () => {
      if (html5QrCode) html5QrCode.stop().catch(() => {});
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black">
      <div id="reader" className="w-full max-w-lg aspect-square rounded-3xl overflow-hidden border-2 border-cyan shadow-[0_0_50px_rgba(32,228,255,0.3)]"></div>
      <button onClick={onClose} className="absolute top-10 right-10 p-4 bg-white/10 rounded-full text-white"><X size={32}/></button>
      <div className="absolute bottom-10 left-0 right-0 text-center">
        <p className="text-cyan font-black tracking-widest uppercase text-sm">Align Barcode in Frame</p>
      </div>
    </div>
  );
}
