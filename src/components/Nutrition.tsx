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


export default function Nutrition({ data, setData, viewDate, setViewDate }: { data: AppData, setData: any, viewDate: string, setViewDate: (d: string) => void }) {
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

  const mealsArr = data.meals[viewDate] || [];
  const waterArr = data.water[viewDate] || [];
  const waterTotalMl = waterArr.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const personalFoodList = data.personalFood || [];
  const combinedFoodList = [...FOOD_DATABASE, ...personalFoodList];

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
  }, [data.profile]);

  const waterTotalL = waterTotalMl / 1000;
  const waterGap = Math.max(0, targets.water - waterTotalL);

  const nutritionInsight = useMemo(() => {
    const proteinGap = Math.max(0, targets.protein - consumed.protein);
    const calorieGap = Math.max(0, targets.calories - consumed.calories);
    const realisticProteinTarget = Math.min(50, Math.round(proteinGap));

    if (proteinGap > 40 && calorieGap > 600) {
      return 'Protein and calories are low. Add one balanced high-protein meal: ' + realisticProteinTarget + 'g protein and 500–700 kcal.';
    }

    if (proteinGap > 40) {
      return 'Protein is low today. Aim for a realistic ' + realisticProteinTarget + 'g protein meal next.';
    }

    if (calorieGap > 600) {
      return 'You are under-eating by around ' + Math.round(calorieGap) + ' kcal. Add a balanced meal.';
    }

    if (consumed.carbs > targets.carbs * 1.2) {
      return 'Carbs are running high. Keep the next meal protein-focused.';
    }

    if (consumed.fats > targets.fats * 1.2) {
      return 'Fats are running high. Keep the next meal lean and protein-focused.';
    }

    return 'Nutrition is on track today.';
  }, [consumed, targets]);

  const nutritionStatus = useMemo(() => {
    const proteinOk = consumed.protein >= targets.protein * 0.75;
    const caloriesOk = consumed.calories >= targets.calories * 0.55;
    const carbsHigh = consumed.carbs > targets.carbs * 1.25;
    const fatsHigh = consumed.fats > targets.fats * 1.25;

    return proteinOk && caloriesOk && !carbsHigh && !fatsHigh
      ? 'On Track'
      : 'Needs Attention';
  }, [consumed, targets]);

  const mealSuggestion = useMemo(() => {
    const hour = new Date().getHours();

    if (hour < 12) return 'Morning focus: protein-rich breakfast + hydration.';
    if (hour < 17) return 'Afternoon focus: balanced carbs + protein for energy.';
    return 'Evening focus: lighter dinner with high protein and recovery foods.';
  }, []);
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
              <div className="flex items-center justify-between">
                <div className="label-small text-sky">Today's Water</div>
                <div className="text-sm font-black text-sky">{round(waterTotalL)}L</div>
              </div>
              {waterArr.length > 0 && (
                <div className="mt-3 space-y-2">
                  {waterArr.slice(-5).reverse().map((w, idx) => (
                    <div key={String(w.time) + '-' + idx} className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-white/40">
                      <span>{waterArr.length === 1 ? 'Daily total' : new Date(w.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="text-sky">{waterArr.length === 1 ? round(Number(w.amount || 0) / 1000) + 'L' : '+' + w.amount + 'ml'}</span>
                    </div>
                  ))}
                </div>
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

          <div className="stat-card">
            <div className="flex items-center justify-between mb-4">
              <div className="label-small text-sky">Hydration Tracker</div>
              {waterTotalMl > 0 && (
                <button
                  onClick={clearWater}
                  className="px-3 py-2 rounded-xl bg-white/5 border border-sky/20 text-sky text-[9px] font-black uppercase tracking-widest hover:bg-sky/10 transition-all"
                >
                  Clear Water
                </button>
              )}
            </div>
            <div className="flex gap-2">
              {[250, 500, 750].map(amt => (
                <button 
                  key={amt}
                  onClick={() => addWater(amt)}
                  className="flex-1 py-4 bg-sky/10 border border-sky/20 text-sky rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-sky/20 transition-all"
                >
                  +{amt}ml
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-lime/20 bg-lime/10 p-5">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-[10px] font-black uppercase tracking-[0.25em] text-lime">
                Gym-E Nutrition Insight
              </div>
              <div className={'rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest ' + (nutritionStatus === 'On Track' ? 'bg-lime/20 text-lime border border-lime/20' : 'bg-pink/10 text-pink border border-pink/20')}>
                {nutritionStatus}
              </div>
            </div>
            <p className="text-sm font-bold text-white leading-relaxed">
              {nutritionInsight}
            </p>
            <p className="mt-2 text-[11px] text-white/40 font-bold uppercase tracking-widest">
              {mealSuggestion}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
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
                onClick={() => addWater(500)}
                className="rounded-xl bg-sky/10 border border-sky/20 text-sky px-3 py-3 text-[10px] font-black uppercase tracking-widest hover:bg-sky/20 active:scale-95 transition-all"
              >
                +500ml Water
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-[10px] font-black uppercase tracking-widest">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-white/50">
                Protein left
                <div className="mt-1 text-lime text-sm">
                  {Math.max(0, Math.round(targets.protein - consumed.protein))}g
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-white/50">
                Water left
                <div className="mt-1 text-sky text-sm">
                  {waterGap > 0 ? waterGap.toFixed(1) + 'L' : 'Done'}
                </div>
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
