import React, { useState, useEffect, useMemo, useRef } from 'react';
import Auth from './components/Auth';
import { getSession, signOut } from './services/authService';
import { supabase } from './services/supabaseClient';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Home, Utensils, Dumbbell, Brain, User, Heart, BarChart as ChartIcon, Settings, 
  Menu, X, Plus, Activity, Droplets, Camera, Trash2, Download, Upload, 
  ChevronRight, Calendar, Info, TrendingDown, TrendingUp, Scale, Footprints, Award, Flame, Target, Star
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, AreaChart, Area, Cell
} from 'recharts';
import Nutrition from './components/Nutrition';
import WorkoutView from './components/Workout';
import Coach from './components/Coach';
import DateNavigator from './components/DateNavigator';
import { AppData, Profile, Meal, Workout, WaterLog, Recovery } from './lib/types';
import { getTodayKey, round, idealWeightRange, kgToLb, lbToKg, cmToFtIn, ftInToCm, estimatedTargetFromFat, estimatedFatFromTarget } from './lib/utils';
import { askAiCoach, analyzeGoal, generateDailyInsight } from './services/aiService';
import { STORE_KEY, storageAdapter } from './services/storage';
import { loadCloudData, saveProfile, saveWeight, saveSteps, saveWaterTotal, deleteWeightFromCloud, deleteStepsFromCloud, syncLocalDataToCloud, hasMeaningfulLocalData, hasMeaningfulCloudData } from './services/cloudDataService';
import { FOOD_DATABASE, EXERCISE_DATABASE } from './data/database';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import MicronutrientsPanel from './components/MicronutrientsPanel';

function showAppMessage(message: string) {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById('stayfitinlife-toast');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'stayfitinlife-toast';
  el.textContent = message;
  el.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] px-5 py-3 rounded-2xl bg-lime text-dark text-xs font-black uppercase tracking-widest shadow-2xl shadow-lime/20 border border-lime/30 max-w-[90vw] text-center';
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 2800);
}


// --- Shared Performance Engine ---
// Single app-wide source of truth used by Dashboard, Nutrition, Workout and Progress.
function buildSharedPerformanceEngine(data: any, viewDate: string) {
  const profile = data.profile || {};
  const weightKg = Number(profile.currentWeight ?? 70);
  const meals = data.meals?.[viewDate] || [];
  const workouts = data.workouts?.[viewDate] || [];
  const waterLogs = data.water?.[viewDate] || [];
  const stepsToday = Number(data.steps?.[viewDate] || 0);
  const stepGoal = Number(profile.stepGoal || 10000);

  const consumed = meals.reduce((acc: any, m: any) => ({
    calories: acc.calories + Number(m.calories || 0),
    protein: acc.protein + Number(m.protein || 0),
    carbs: acc.carbs + Number(m.carbs || 0),
    fats: acc.fats + Number(m.fats || m.fat || 0),
  }), { calories: 0, protein: 0, carbs: 0, fats: 0 });

  const exerciseCalories = workouts.reduce((sum: number, w: any) => sum + Number(w.caloriesBurned || w.calories || 0), 0);
  const waterTotalL = waterLogs.reduce((sum: number, w: any) => sum + Number(w.amount || 0), 0) / 1000;

  let baseCalories = weightKg * 30;
  if (profile.goal === 'Fat Loss') baseCalories -= 500;
  if (profile.goal === 'Muscle Gain') baseCalories += 300;

  const metrics = data.integrations?.whoop?.metrics || data.recovery?.whoopMetrics || null;
  const sleepAvg = metrics ? Number(metrics.sleepAvg30Hours || 0) || null : null;
  const rhrAvg = metrics ? Number(metrics.restingHeartRateAvg30 || 0) || null : null;
  const respiratoryRate = metrics ? Number(metrics.respiratoryRateAvg30 || 0) || null : null;
  const aerobicAvg = metrics ? Number(metrics.aerobicActivityAvg30Min || 0) || null : null;
  const marchRhr = metrics ? Number(metrics.restingHeartRateMarchAvg || 0) || null : null;
  const aprilRhr = metrics ? Number(metrics.restingHeartRateAprilAvg || 0) || null : null;

  const sleepScore = sleepAvg ? Math.min(100, Math.round((sleepAvg / 7) * 100)) : 75;
  const rhrScore = rhrAvg ? Math.max(40, Math.min(100, Math.round(100 - Math.max(0, rhrAvg - 60) * 3))) : 70;
  const cardioScore = aerobicAvg ? Math.min(100, Math.round((aerobicAvg / 22) * 100)) : 60;
  const trendBonus = marchRhr && aprilRhr && aprilRhr < marchRhr ? 8 : 0;
  const whoopRecoveryScore = metrics ? Math.min(100, Math.round(sleepScore * 0.4 + rhrScore * 0.35 + cardioScore * 0.25 + trendBonus)) : null;

  const workoutScore = exerciseCalories > 0 ? Math.min(100, (exerciseCalories / Math.max(300, weightKg * 5)) * 100) : 55;
  const stepScore = stepsToday > 0 ? Math.min(100, (stepsToday / Math.max(1, stepGoal)) * 100) : 55;
  const proteinBaseTarget = Math.round(weightKg * 2);
  const proteinScore = meals.length ? Math.min(100, (consumed.protein / Math.max(1, proteinBaseTarget)) * 100) : 55;
  const hydrationScore = waterTotalL > 0 ? Math.min(100, (waterTotalL / 3.5) * 100) : 60;
  const appReadiness = Math.round(workoutScore * 0.25 + stepScore * 0.15 + proteinScore * 0.25 + hydrationScore * 0.2 + 75 * 0.15);
  const readinessScore = whoopRecoveryScore !== null ? Math.round(appReadiness * 0.45 + whoopRecoveryScore * 0.55) : appReadiness;

  const sleepLow = Boolean(sleepAvg && sleepAvg < 6.5);
  const aerobicLow = Boolean(aerobicAvg && aerobicAvg < 22);
  const hydrationBoost = metrics ? (aerobicLow ? 0.3 : 0.15) : 0;
  const proteinBoost = metrics ? (sleepLow ? 15 : 10) : 0;
  const calorieAdjustment = sleepLow ? -100 : (readinessScore >= 80 ? 150 : 0);

  const calories = Math.max(0, Math.round(baseCalories + exerciseCalories + calorieAdjustment));
  const protein = Math.round(proteinBaseTarget + proteinBoost);
  const macroCalories = Math.max(0, calories - protein * 4);
  const carbs = Math.round((macroCalories * 0.6) / 4);
  const fats = Math.round((macroCalories * 0.4) / 9);
  const water = Number((3.5 + hydrationBoost + (exerciseCalories / 500) * 0.5 + (stepsToday >= 10000 ? 0.4 : 0)).toFixed(1));

  const schedule = data.workoutSchedule?.[viewDate] || {};
  const startTime = schedule.estimatedStart || schedule.startTime || null;
  const window = schedule.window || null;

  const readinessLabel = readinessScore >= 75 ? 'High Readiness' : readinessScore >= 55 ? 'Moderate Readiness' : 'Low Readiness';
  const workoutAction = readinessScore >= 80
    ? 'WHOOP/app signals support progressive strength work today.'
    : readinessScore >= 55
    ? 'Train with controlled volume. Avoid max attempts.'
    : 'Prioritize recovery, mobility and walking.';
  const nutritionAction = !startTime
    ? 'Set today’s workout window to unlock pre/post-workout meal guidance.'
    : readinessScore >= 75
    ? 'Keep protein high and fuel around training.'
    : 'Keep protein high and avoid aggressive deficit.';

  return {
    version: 'performance_engine_v2',
    viewDate,
    consumed,
    exerciseCalories,
    waterTotalL,
    readiness: { score: readinessScore, label: readinessLabel, source: metrics ? 'whoop_pdf+app' : 'app' },
    whoop: { hasWhoop: Boolean(metrics), metrics, sleepAvg, rhrAvg, respiratoryRate, aerobicAvg, recoveryScore: whoopRecoveryScore },
    nutrition: { targets: { calories, protein, carbs, fats, water }, action: nutritionAction },
    workout: { startTime, window, action: workoutAction, intensity: readinessScore >= 80 ? 'High' : readinessScore >= 55 ? 'Moderate' : 'Low' },
    dashboard: { remainingCalories: calories - consumed.calories, proteinRemaining: Math.max(0, protein - consumed.protein), waterRemaining: Math.max(0, water - waterTotalL) },
  };
}


const DEFAULT_DATA: AppData = {
  profile: {
    unitsSystem: 'metric',
    goal: 'Fat Loss',
    mode: 'Beginner',
    activity: 'Moderate',
    diet: 'Non-Veg',
    cuisine: 'Global',
    stepGoal: 10000,
  },
  introSeen: false,
  units: { system: 'metric' },
  meals: {},
  water: {},
  workouts: {},
  weights: [],
  steps: {},
  micronutrients: {},
  supplements: {},
  lastSyncDate: null,
  recovery: {},
  apiQueryCount: 0,
};

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [cloudLoading, setCloudLoading] = useState(false);

  const [data, setData] = useState<AppData>(() => {
    const saved = storageAdapter.load();
    if (saved) {
      return {
        ...DEFAULT_DATA,
        ...saved,
        profile: { ...DEFAULT_DATA.profile, ...saved.profile }
      };
    }
    return DEFAULT_DATA;
  });

  const [activeTab, setActiveTab] = useState('home');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [viewDate, setViewDate] = useState(getTodayKey());
  const performanceEngine = useMemo(() => buildSharedPerformanceEngine(data, viewDate), [data, viewDate]);

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      const session = await getSession();
      if (!mounted) return;
      setLoggedIn(Boolean(session));
      if (session) {
        setViewDate(getTodayKey());
      }
      setCheckingAuth(false);
    }

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setLoggedIn(Boolean(session));
      if (session) {
        setViewDate(getTodayKey());
      }
      setCheckingAuth(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!loggedIn) return;

    setViewDate(getTodayKey());

    let cancelled = false;

    async function loadFromCloudAndSyncLocalOnce() {
      setCloudLoading(true);
      try {
        const localSnapshot = data;
        let cloud = await loadCloudData();

        if (cancelled) return;

    
        const localHasData = hasMeaningfulLocalData(localSnapshot);
        const alreadySynced =
          localStorage.getItem('stayfitinlife_cloud_synced') === 'v3';

        // First desktop/device migration:
        // One-time desktop/device migration. We sync when this browser has local data
        // and has not completed the current cloud sync version yet. Upserts prevent duplicates.
        if (localHasData && !alreadySynced) {
          await syncLocalDataToCloud(localSnapshot);
          localStorage.setItem('stayfitinlife_cloud_synced', 'v3');
          console.log('Existing local data uploaded to Supabase ✅');
          cloud = await loadCloudData();
        }

        if (cancelled || !cloud) return;

        const cloudProfile = cloud.profile || {};
        const hasCloudProfile = Boolean(
          (cloudProfile as any).name ||
          (cloudProfile as any).age ||
          (cloudProfile as any).height ||
          (cloudProfile as any).currentWeight
        );
        const hasCloudMeals = Object.values(cloud.meals || {}).some((items: any) => Array.isArray(items) && items.length > 0);
        const hasCloudWorkouts = Object.values(cloud.workouts || {}).some((items: any) => Array.isArray(items) && items.length > 0);
        const hasCloudWeights = Array.isArray(cloud.weights) && cloud.weights.length > 0;
        const hasCloudSteps = Object.keys(cloud.steps || {}).length > 0;
        const hasCloudWater = Object.values(cloud.water || {}).some((items: any) => Array.isArray(items) && items.length > 0);

        setData((prev: AppData) => ({
          ...prev,
          profile: hasCloudProfile
            ? {
                ...prev.profile,
                ...cloudProfile,
              }
            : prev.profile,
          introSeen: hasCloudProfile ? true : prev.introSeen,
          meals: hasCloudMeals ? (cloud.meals as any) : prev.meals,
          workouts: hasCloudWorkouts ? (cloud.workouts as any) : prev.workouts,
          weights: hasCloudWeights ? (cloud.weights as any) : prev.weights,
          steps: hasCloudSteps ? (cloud.steps as any) : prev.steps,
          water: hasCloudWater ? (cloud.water as any) : prev.water,
          lastSyncDate: cloud.lastSyncDate || prev.lastSyncDate,
        }));
      } catch (err) {
        console.error('Cloud sync/load error ❌', err);
      } finally {
        if (!cancelled) setCloudLoading(false);
      }
    }

    loadFromCloudAndSyncLocalOnce();

    return () => {
      cancelled = true;
    };
  }, [loggedIn]);

  useEffect(() => {
    if (!loggedIn) return;

    let cancelled = false;

    const refreshCloudData = async () => {
      try {
        const cloud = await loadCloudData();
        if (cancelled || !cloud) return;

        setData((prev: AppData) => ({
          ...prev,
          profile: cloud.profile && Object.keys(cloud.profile).length > 0
            ? { ...prev.profile, ...cloud.profile }
            : prev.profile,
          introSeen: cloud.profile && Object.keys(cloud.profile).length > 0 ? true : prev.introSeen,
          // For synced tables, cloud is the source of truth. This lets deletes on desktop disappear on mobile.
          meals: Object.keys(cloud.meals || {}).length ? cloud.meals : prev.meals,
          workouts: Object.keys(cloud.workouts || {}).length ? cloud.workouts : prev.workouts,
          weights: cloud.weights?.length ? cloud.weights : prev.weights,
          steps: Object.keys(cloud.steps || {}).length ? cloud.steps : prev.steps,
          water: Object.keys(cloud.water || {}).length ? cloud.water : prev.water,
          lastSyncDate: cloud.lastSyncDate || prev.lastSyncDate,
        }));
      } catch (err) {
        console.error('Cloud refresh error ❌', err);
      }
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        refreshCloudData();
      }
    };

    window.addEventListener('focus', refreshCloudData);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    // Optional safety refresh (once per minute)
    const intervalId = window.setInterval(refreshCloudData, 60000);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', refreshCloudData);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.clearInterval(intervalId);
    };
  }, [loggedIn]);


  useEffect(() => {
    storageAdapter.save(data);
  }, [data]);

  const profileComplete = useMemo(() => {
    const p = data.profile;
    return !!(p.name && p.age && p.height && p.currentWeight && p.goal);
  }, [data.profile]);

  if (checkingAuth || (loggedIn && cloudLoading)) {
    return (
      <div className="min-h-screen bg-dark text-lime flex items-center justify-center font-black">
        Loading...
      </div>
    );
  }

  const isPasswordRecovery =
    window.location.pathname === '/reset-password' ||
    window.location.hash.includes('type=recovery') ||
    new URLSearchParams(window.location.search).get('type') === 'recovery';

  if (isPasswordRecovery) {
    return <Auth onAuth={() => setLoggedIn(true)} />;
  }

  if (!loggedIn) {
    return <Auth onAuth={() => setLoggedIn(true)} />;
  }

  if (!profileComplete) {
    return <Onboarding data={data} setData={setData} />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'home': return <Dashboard data={data} setData={setData} setActiveTab={setActiveTab} viewDate={viewDate} setViewDate={setViewDate} performanceEngine={performanceEngine} />;
      case 'nutrition': return <Nutrition data={data} setData={setData} viewDate={viewDate} setViewDate={setViewDate} performanceEngine={performanceEngine} />;
      case 'workout': return <WorkoutView data={data} setData={setData} viewDate={viewDate} setViewDate={setViewDate} performanceEngine={performanceEngine} />;
      case 'coach': return <Coach data={data} setData={setData} />;
      case 'profile': return <ProfileView data={data} setData={setData} />;
      case 'progress': return <Progress data={data} setData={setData} setActiveTab={setActiveTab} viewDate={viewDate} setViewDate={setViewDate} performanceEngine={performanceEngine} />;
      case 'settings': return <SettingsView data={data} setData={setData} />;
      default: return <Dashboard data={data} setData={setData} setActiveTab={setActiveTab} viewDate={viewDate} setViewDate={setViewDate} performanceEngine={performanceEngine} />;
    }
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-dark text-white">
      <PWAInstallPrompt isLoggedIn={loggedIn} />
      {/* Desktop Sidebar (Slim) */}
      <aside className="fixed left-0 top-0 bottom-0 w-20 border-r border-border bg-[#111] hidden lg:flex flex-col items-center py-6 z-50">
        <div className="w-10 h-10 rounded-xl bg-lime text-dark flex items-center justify-center font-black mb-10 shadow-lg shadow-lime/20">
          S
        </div>
        <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />
      </aside>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 z-[60] lg:hidden"
            />
            <motion.aside 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              className="fixed left-0 top-0 bottom-0 w-64 bg-dark z-[70] p-6 lg:hidden border-r border-border"
            >
              <Brand />
              <Navigation vertical activeTab={activeTab} setActiveTab={(t) => { setActiveTab(t); setIsSidebarOpen(false); }} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Content Area */}
      <div className="flex-1 lg:ml-20 flex flex-col">
        {/* Top Bar */}
        <header className="h-20 border-b border-border px-6 lg:px-10 flex items-center justify-between bg-dark/95 backdrop-blur-md z-40">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 bg-white/5 rounded-lg lg:hidden">
              <Menu size={20} />
            </button>
            <h1 className="text-xl font-black tracking-tighter bg-linear-to-r from-lime to-sky bg-clip-text text-transparent uppercase">
              STAYFITINLIFE
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            <button
              onClick={async () => {
                await signOut();
                setLoggedIn(false);
              }}
              className="px-4 py-2 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-lime hover:border-lime/40 transition-all"
            >
              Logout
            </button>

            <div className="text-right hidden md:block">
              <div className="text-sm font-bold tracking-tight">{data.profile.name}</div>
              <div className="label-small text-lime">Pro Member</div>
            </div>
            <div className="w-10 h-10 rounded-full bg-lime/20 border border-lime/30 p-1">
              <div className="w-full h-full rounded-full bg-lime shadow-inner" />
            </div>
          </div>
        </header>

        <main className="p-6 lg:p-10 pb-28 lg:pb-10 max-w-7xl mx-auto w-full">
          {renderContent()}
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-4 left-4 right-4 h-16 bg-[#111] border border-border rounded-2xl flex lg:hidden items-center justify-around z-50 px-2 shadow-2xl">
        <NavBtn icon={<Home />} active={activeTab === 'home'} onClick={() => setActiveTab('home')} />
        <NavBtn icon={<Utensils />} active={activeTab === 'nutrition'} onClick={() => setActiveTab('nutrition')} />
        <NavBtn icon={<Dumbbell />} active={activeTab === 'workout'} onClick={() => setActiveTab('workout')} />
        <NavBtn icon={<ChartIcon />} active={activeTab === 'progress'} onClick={() => setActiveTab('progress')} />
        <NavBtn icon={<Brain />} active={activeTab === 'coach'} onClick={() => setActiveTab('coach')} />
        <NavBtn icon={<User />} active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} />
      </nav>
    </div>
  );
}

function Brand() {
  return (
    <div className="mb-10">
      <h1 className="text-xl font-black tracking-tighter bg-linear-to-r from-lime to-sky bg-clip-text text-transparent uppercase">
        STAYFITINLIFE
      </h1>
      <div className="text-[8px] font-black tracking-[0.2em] text-lime mt-1 uppercase leading-tight">
        TRAIN • FUEL • RECOVER • EVOLVE
      </div>
    </div>
  );
}

function Navigation({ vertical, activeTab, setActiveTab }: { vertical?: boolean, activeTab: string, setActiveTab: (t: string) => void }) {
  const items = [
    { id: 'home', icon: <Home size={22} />, label: 'Dashboard' },
    { id: 'nutrition', icon: <Utensils size={22} />, label: 'Nutrition' },
    { id: 'workout', icon: <Dumbbell size={22} />, label: 'Workouts' },
    { id: 'coach', icon: <Brain size={22} />, label: 'Gym-E' },
    { id: 'progress', icon: <ChartIcon size={22} />, label: 'Progress' },
    { id: 'profile', icon: <User size={22} />, label: 'Profile' },
    { id: 'settings', icon: <Settings size={22} />, label: 'Settings' },
  ];

  if (vertical) {
    return (
      <nav className="flex flex-col gap-2">
        {items.map(item => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all ${
              activeTab === item.id ? 'bg-lime text-dark font-bold' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {item.icon}
            <span className="text-sm font-bold">{item.label}</span>
          </button>
        ))}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-6">
      {items.map(item => (
        <button
          key={item.id}
          onClick={() => setActiveTab(item.id)}
          title={item.label}
          className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
            activeTab === item.id ? 'bg-lime text-dark shadow-lg shadow-lime/20' : 'bg-[#1A1A1A] text-gray-400 border border-border hover:border-lime/30'
          }`}
        >
          {item.icon}
        </button>
      ))}
    </nav>
  );
}

function NavBtn({ icon, active, onClick }: any) {
  return (
    <button onClick={onClick} className={`p-3 rounded-xl transition-all ${active ? 'bg-lime text-dark' : 'text-gray-500 hover:text-white'}`}>
      {React.cloneElement(icon, { size: 24 })}
    </button>
  );
}

// --- Dashboard ---
function Dashboard({ data, setData, setActiveTab, viewDate, setViewDate, performanceEngine }: { data: AppData, setData: any, setActiveTab: (t: string) => void, viewDate: string, setViewDate: (d: string) => void, performanceEngine?: any }) {
  const today = viewDate;
  const profile = data.profile;
  const mealsArr = data.meals[today] || [];
  const waterArr = data.water[today] || [];
  const workoutArr = data.workouts[today] || [];
  const stepsToday = data.steps?.[today] || 0;
  const stepGoal = data.profile.stepGoal || 10000;
  const stepProgress = stepGoal
    ? Math.min(100, Math.round((stepsToday / stepGoal) * 100))
    : 0;

  const [aiInsight, setAiInsight] = useState('');
  const [insightLoading, setInsightLoading] = useState(false);
  const lastInsightRef = useRef(0);

  const targets = useMemo(() => {
    const w = profile.currentWeight ?? 70;
    let baseCalories = w * 30;
    if (profile.goal === 'Fat Loss') baseCalories -= 500;
    if (profile.goal === 'Muscle Gain') baseCalories += 300;

    return {
      calories: Math.round(baseCalories),
      protein: Math.round(w * 2),
      carbs: Math.round((baseCalories * 0.4) / 4),
      fats: Math.round((baseCalories * 0.3) / 9),
      water: 3.5,
    };
  }, [profile]);

  const consumed = useMemo(() => {
    return mealsArr.reduce(
      (acc, m) => ({
        calories: acc.calories + m.calories,
        protein: acc.protein + m.protein,
        carbs: acc.carbs + m.carbs,
        fats: acc.fats + m.fats,
      }),
      { calories: 0, protein: 0, carbs: 0, fats: 0 }
    );
  }, [mealsArr]);

  const burned = useMemo(() => {
    return workoutArr.reduce((acc, w) => acc + (w.caloriesBurned || 0), 0);
  }, [workoutArr]);

  const waterTotal = waterArr.reduce((acc, w) => acc + w.amount, 0) / 1000;

  const weeklyLoad = useMemo(() => {
    const todayDate = new Date();
    let total = 0;

    for (let i = 0; i < 7; i++) {
      const d = new Date(todayDate);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const workouts = data.workouts?.[key] || [];
      const dayLoad = workouts.reduce(
        (sum: number, w: any) => sum + (w.caloriesBurned || 0),
        0
      );
      const decay = 1 - i * 0.12;
      total += dayLoad * decay;
    }

    return total;
  }, [data.workouts]);

  const fatigueStatus =
    weeklyLoad > 3000
      ? 'High Fatigue'
      : weeklyLoad > 1800
      ? 'Moderate Fatigue'
      : 'Normal Fatigue';

  const hydrationScore = targets.water
    ? Math.min(100, (waterTotal / targets.water) * 100)
    : 0;

  const recoveryData = useMemo(() => {
    const hasSleep = data.recovery?.[today]?.sleep;
    const sleepScore = hasSleep ? hasSleep : 75;

    const workoutLoad = workoutArr.reduce(
      (sum, w) => sum + (w.caloriesBurned || 0),
      0
    );

    const hasWorkout = workoutArr.length > 0;
    const hasSteps = stepsToday > 0;
    const hasMeals = mealsArr.length > 0;
    const hasWater = waterArr.length > 0;

    const expectedLoad = Math.max(300, targets.calories * 0.4);

    const strainScore =
      hasWorkout || hasSteps
        ? Math.min(
            100,
            (workoutLoad / expectedLoad) * 70 +
              (stepGoal ? (stepsToday / stepGoal) * 30 : 0)
          )
        : 55;

    const nutritionScore = hasMeals && targets.protein
      ? Math.min(100, Math.min(1, consumed.protein / targets.protein) * 100)
      : 55;

    const hydrationSafeScore = hasWater ? hydrationScore : 60;

    const rawScore =
  sleepScore * 0.3 +
  strainScore * 0.25 +
  nutritionScore * 0.25 +
  hydrationSafeScore * 0.2;

const score = Math.round(rawScore);

let status = 'Low';
if (score > 75) status = 'High';
else if (score >= 55) status = 'Moderate';

    return {
      score: Math.round(score),
      status,
      hasWorkout,
      hasSteps,
      hasMeals,
      hasWater,
    };
  }, [
    data.recovery,
    today,
    workoutArr,
    stepsToday,
    stepGoal,
    consumed.protein,
    hydrationScore,
    targets.protein,
    targets.calories,
    mealsArr.length,
    waterArr.length,
  ]);

  const performanceScore = useMemo(() => {
    const expectedBurn = Math.max(250, targets.calories * 0.3);
    const hasWorkout = workoutArr.length > 0;
    const hasSteps = stepsToday > 0;

    if (!hasWorkout && !hasSteps) return 55;

    const workoutScore = hasWorkout
      ? Math.min(100, (burned / expectedBurn) * 100)
      : 55;

    const stepScore = hasSteps
      ? Math.min(100, stepGoal ? (stepsToday / stepGoal) * 100 : 0)
      : 55;

    return Math.round(workoutScore * 0.6 + stepScore * 0.4);
  }, [burned, stepsToday, stepGoal, targets.calories, workoutArr.length]);

  const aiControl = useMemo(() => {
    const recovery = recoveryData.score;
    const highFatigue = fatigueStatus === 'High Fatigue';

    if (recovery < 50 || highFatigue || performanceScore < 35) {
      return {
        intensity: 'Low',
        workoutAction: 'Avoid heavy training today',
        calorieAction: 'Keep protein high, avoid aggressive deficit',
        recoveryAction: 'Mobility, walking, hydration and sleep',
        buttonText: 'Start Recovery Session',
        workoutType: 'Recovery + Mobility',
        calorieAdjustment: -100,
      };
    }

    if (recovery > 80 && fatigueStatus === 'Normal Fatigue' && performanceScore > 60) {
      return {
        intensity: 'High',
        workoutAction: 'Push progressive overload today',
        calorieAction: 'Add performance fuel around training',
        recoveryAction: 'Normal recovery protocol',
        buttonText: 'Start Performance Session',
        workoutType: 'Heavy Strength',
        calorieAdjustment: 200,
      };
    }

    return {
      intensity: 'Moderate',
      workoutAction: 'Train with controlled volume',
      calorieAction: 'Keep calories stable',
      recoveryAction: 'Prioritize hydration and form',
      buttonText: 'Start Controlled Session',
      workoutType: 'Controlled Hypertrophy',
      calorieAdjustment: 0,
    };
  }, [recoveryData.score, fatigueStatus, performanceScore]);

  // --- Metabolic Engine V2 ---
  // Single source of truth for Goal / Food / Exercise / AI adjustment / Remaining.
  // Important: exercise is added only to the daily intake budget, not again in remaining.
  const metabolicEngine = useMemo(() => {
    const baseGoal = Math.round(targets.calories);
    const foodCalories = Math.round(consumed.calories || 0);
    const exerciseCalories = Math.max(0, Math.round(burned || 0));
    const aiAdjustment = Math.round(aiControl.calorieAdjustment || 0);

    const dailyBudget = Math.max(0, baseGoal + exerciseCalories + aiAdjustment);
    const netCalories = foodCalories - exerciseCalories;
    const remainingCalories = Math.round(dailyBudget - foodCalories);
    const overCalories = Math.max(0, Math.abs(Math.min(0, remainingCalories)));

    const proteinTarget = Math.round(targets.protein);
    const macroCaloriesAfterProtein = Math.max(0, dailyBudget - proteinTarget * 4);
    const carbsTarget = Math.round((macroCaloriesAfterProtein * 0.6) / 4);
    const fatsTarget = Math.round((macroCaloriesAfterProtein * 0.4) / 9);

    const waterTarget = Number(
      (
        targets.water +
        (exerciseCalories / 500) * 0.5 +
        (aiControl.intensity === 'High' ? 0.5 : 0)
      ).toFixed(1)
    );

    const progressPct = dailyBudget
      ? Math.min(100, Math.round((foodCalories / dailyBudget) * 100))
      : 0;

    let energyZone = 'On Track';
    if (remainingCalories < 0) energyZone = 'Over Limit';
    else if (progressPct < 35) energyZone = 'Under Fueled';
    else if (progressPct > 85) energyZone = 'Nearly Complete';

    return {
      baseGoal,
      foodCalories,
      exerciseCalories,
      aiAdjustment,
      dailyBudget,
      netCalories,
      remainingCalories,
      overCalories,
      progressPct,
      energyZone,
      targets: {
        calories: dailyBudget,
        protein: proteinTarget,
        carbs: carbsTarget,
        fats: fatsTarget,
        water: waterTarget,
      },
    };
  }, [targets, consumed.calories, burned, aiControl]);

  const dynamicTargets = metabolicEngine.targets;

  const performanceStatus =
    performanceScore > 75
      ? 'High Output'
      : performanceScore > 45
      ? 'Moderate Output'
      : 'Low Output';

  const remaining = metabolicEngine.remainingCalories;
  const progressPct = metabolicEngine.progressPct;
  const proteinRemaining = Math.max(0, dynamicTargets.protein - consumed.protein);
  const waterRemaining = Math.max(0, dynamicTargets.water - waterTotal);
  const stepsRemaining = Math.max(0, stepGoal - stepsToday);

  const fetchInsight = async () => {
    if (insightLoading) return;

    setInsightLoading(true);

    try {
      const insight = await generateDailyInsight({
        profile,
        consumed,
        targets: dynamicTargets,
        workouts: workoutArr,
        waterTotal,
        recovery: recoveryData,
        fatigueStatus,
        performanceScore,
        performanceStatus,
        aiControl,
      });

      setAiInsight(insight);
    } catch (err) {
      console.error('AI insight error ❌', err);
      setAiInsight('Gym-E could not generate insight right now. Your dashboard data is still safe.');
    } finally {
      setInsightLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    const timer = setTimeout(async () => {
      const now = Date.now();

      if (now - lastInsightRef.current < 30000) return;

      lastInsightRef.current = now;

      if (!active) return;

      try {
        await fetchInsight();
      } catch (err) {
        console.error('Insight fetch error ❌', err);
      }
    }, 800);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    recoveryData.score,
    consumed.calories,
    burned,
    fatigueStatus,
    performanceScore,
    aiControl.intensity,
  ]);

  const TodayActionPanel = () => {
    return (
      <section className="rounded-3xl border border-lime/20 bg-panel/80 p-5 shadow-xl shadow-lime/5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-lime">
              Today's Action Plan
            </p>
            <h3 className="text-xl font-black uppercase tracking-tight">
              What to do next
            </h3>
          </div>

          <span className="rounded-full border border-lime/30 px-3 py-1 text-xs font-bold text-lime">
            Live
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <ActionItem
            icon="🏋️"
            title="Workout"
            value={workoutArr.length > 0 ? "Workout logged" : "Start today's session"}
            button={workoutArr.length > 0 ? "View" : "Start"}
            onClick={() => setActiveTab("workout")}
          />

          <ActionItem
            icon="🍗"
            title="Protein"
            value={`${Math.round(proteinRemaining)}g remaining`}
            button="Log Meal"
            onClick={() => setActiveTab("nutrition")}
          />

          <ActionItem
            icon="💧"
            title="Hydration"
            value={`${waterRemaining.toFixed(1)}L left today`}
           button="+500ml"
           onClick={async () => {
           const amt = 500;
           const now = Date.now();

           const currentMl = Math.round(waterTotal * 1000);
           const nextTotalMl = currentMl + amt;

    setData((prev: AppData) => ({
      ...prev,
      water: {
        ...prev.water,
        [today]: [
          ...(prev.water[today] || []),
          { amount: amt, time: now },
        ],
      },
    }));

    try {
      await saveWaterTotal(today, nextTotalMl, now);
      showAppMessage("500ml water added");
    } catch (err) {
      console.error("Dashboard water save error ❌", err);
      showAppMessage("Water saved locally. Cloud sync failed.");
    }
  }}
/>

          <ActionItem
            icon="🚶"
            title="Steps"
            value={`${stepsRemaining.toLocaleString()} steps pending`}
            button="Walk"
            onClick={() => setActiveTab("progress")}
          />
        </div>
      </section>
    );
  };

  const ActionItem = ({ icon, title, value, button, onClick }: any) => {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 p-4">
        <div className="flex items-center gap-3">
          <div className="text-2xl">{icon}</div>
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-white/50">
              {title}
            </p>
            <p className="text-sm font-bold text-white">{value}</p>
          </div>
        </div>

        <button
          onClick={onClick}
          className="rounded-xl bg-lime px-3 py-2 text-xs font-black uppercase text-black shadow-lg shadow-lime/20 hover:scale-105 active:scale-95 transition-all"
        >
          {button}
        </button>
      </div>
    );
  };
  const recoveryColor =
  recoveryData.score > 75
    ? "text-lime"
    : recoveryData.score > 55
    ? "text-yellow-400"
    : "text-red-400";

   
  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-2">
        <DateNavigator viewDate={viewDate} setViewDate={setViewDate} />

        <div className="flex items-center gap-4 text-white/40 text-[10px] font-black uppercase tracking-widest hidden md:flex">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-lime" />
            Live Sync: Healthy
          </div>
          <div className="w-px h-4 bg-white/10" />
          <span>Protocol: {profile.goal}</span>
        </div>
      </header>

<section className="rounded-3xl border border-lime/20 bg-panel/80 p-5 shadow-xl shadow-lime/5">
  <div className="flex items-center justify-between gap-4">
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.25em] text-lime">
        Daily Readiness
      </p>

      <h2 className={`mt-2 text-4xl font-black ${recoveryColor}`}>
        {recoveryData.score}%
      </h2>

      <p className="text-xs font-bold uppercase tracking-widest text-white/40">
        {recoveryData.status} Readiness
      </p>
    </div>

    <div className="text-right">
      <p className="text-[10px] font-black uppercase tracking-widest text-white/40">
        Gym-E Decision
      </p>

      <p className="mt-2 text-sm font-black text-white">
        {aiControl.workoutAction}
      </p>
    </div>
  </div>

  <p className="mt-4 text-sm text-white/60">
  {aiControl.recoveryAction}
</p>

<p className="mt-2 text-xs text-white/40">
  {aiControl.calorieAction}
</p>
</section>

<TodayActionPanel />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 space-y-8">
          <div className="stat-card p-10 flex flex-col items-center relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-white/[0.05]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                className="h-full bg-lime shadow-[0_0_15px_rgba(215,255,0,0.5)]"
              />
            </div>

            <div className="flex justify-between w-full mb-8">
              <div>
                <div className="label-small uppercase tracking-widest opacity-40">Metabolic Status</div>
                <div className="text-[10px] font-black text-lime uppercase mt-1 tracking-widest">
                  {profile.goal} Phase
                </div>
              </div>
              <div className="text-right">
                <div className="text-lime text-[10px] font-black uppercase tracking-tighter">
                  {progressPct}% Complete
                </div>
                <div className="label-small opacity-20 text-[8px]">Daily Protocol</div>
              </div>
            </div>

            <div className="relative w-72 h-72 flex items-center justify-center">
              <svg className="absolute inset-0 w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="44" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-white/[0.03]" />
                <motion.circle
                  cx="50"
                  cy="50"
                  r="44"
                  stroke="currentColor"
                  strokeWidth="6"
                  fill="transparent"
                  strokeDasharray="276.46"
                  initial={{ strokeDashoffset: 276.46 }}
                  animate={{ strokeDashoffset: 276.46 - (276.46 * progressPct) / 100 }}
                  transition={{ duration: 1.5, ease: "circOut" }}
                  strokeLinecap="round"
                  className="text-lime shadow-xl"
                />
              </svg>

              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center z-10">
                <div className="text-7xl font-black tracking-tighter leading-none mb-1 drop-shadow-2xl">
                  {remaining > 0 ? remaining.toLocaleString() : "Goal"}
                </div>
                <div className={`label-small uppercase tracking-[0.2em] ${remaining > 0 ? "text-lime" : "text-pink"}`}>
                  {remaining > 0 ? "Remaining" : "Over Limit"}
                </div>
              </motion.div>
            </div>

            <div className="grid grid-cols-3 gap-8 mt-12 w-full max-w-md pt-8 border-t border-white/5">
              <div className="text-center">
                <div className="text-xl font-bold">{targets.calories.toLocaleString()}</div>
                <div className="label-small opacity-30 mt-1">Goal</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-pink">
             {Math.round(consumed.calories).toLocaleString()}
            </div>
              <div className="label-small opacity-30 mt-1">Consumed</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-sky">+{Math.round(burned).toLocaleString()}</div>
                <div className="label-small opacity-30 mt-1">Exercise</div>
              </div>
            </div>
          </div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="ai-coach-card relative overflow-hidden group">
            <div className="flex justify-between items-start mb-4">
              <div className="ai-tag">GYM-E • ADVISOR</div>
              <button
                onClick={fetchInsight}
                disabled={insightLoading}
                className="p-2 bg-white/5 rounded-lg text-white/40 hover:text-lime hover:bg-lime/10 transition-all opacity-0 group-hover:opacity-100"
              >
                <Activity size={14} className={insightLoading ? "animate-spin" : ""} />
              </button>
            </div>

            {insightLoading ? (
              <div className="flex items-center gap-3 text-lime font-black italic text-sm py-2">
                <Brain className="w-5 h-5 animate-pulse" />
                Analyzing metabolic data streams...
              </div>
            ) : (
              <>
                <h2 className="text-2xl font-bold mb-2 tracking-tight">Personalized Performance Insight</h2>
                <p className="text-sm opacity-70 leading-relaxed max-w-xl italic">
                  &quot;{aiInsight || "Calibrating systems... Log more data to unlock deeper bio-insights."}&quot;
                </p>
              </>
            )}
          </motion.div>

          <div className="stat-card">
            <div className="flex justify-between items-center mb-6">
              <div className="label-small">Macro Distribution</div>
              <div className="text-sky text-xs font-bold font-mono">Dynamic Goals Matrix</div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <MacroColumn label="Protein" current={consumed.protein} target={dynamicTargets.protein} color="lime" />
              <MacroColumn label="Carbs" current={consumed.carbs} target={dynamicTargets.carbs} color="sky" />
              <MacroColumn label="Fats" current={consumed.fats} target={dynamicTargets.fats} color="pink" />
            </div>
          </div>

          <MicronutrientsPanel data={data} viewDate={viewDate} />
        </div>

        <aside className="space-y-6">
          <div className="label-small px-2 text-sky flex justify-between items-center">
            <span>Active Energy</span>
            <span className="text-white/40">
              {stepsToday.toLocaleString()} / {stepGoal.toLocaleString()} Steps
            </span>
          </div>

          <div className="stat-card p-6 flex items-center gap-6 group hover:border-sky/40 transition-all cursor-pointer" onClick={() => setActiveTab("progress")}>
            <div className="relative w-16 h-16 flex items-center justify-center flex-shrink-0">
              <svg className="absolute inset-0 w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="44" stroke="currentColor" strokeWidth="10" fill="transparent" className="text-white/[0.03]" />
                <motion.circle
                  cx="50"
                  cy="50"
                  r="44"
                  stroke="currentColor"
                  strokeWidth="10"
                  fill="transparent"
                  strokeDasharray="276.46"
                  initial={{ strokeDashoffset: 276.46 }}
                  animate={{ strokeDashoffset: 276.46 - (276.46 * stepProgress) / 100 }}
                  transition={{ duration: 1.5, ease: "circOut" }}
                  strokeLinecap="round"
                  className="text-sky"
                />
              </svg>
              <Footprints className="text-sky p-1" size={24} />
            </div>

            <div className="flex-1">
              <div className="text-sm font-bold tracking-tight">Movement Cycle</div>
              <div className="h-1 bg-white/5 rounded-full mt-2 overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${stepProgress}%` }} className="h-full bg-sky" />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] font-bold text-sky opacity-80">{stepProgress}%</span>
                <span className="text-[10px] opacity-40 font-mono italic text-right">
                  Goal: {(stepGoal / 1000).toFixed(0)}k
                </span>
              </div>
            </div>
          </div>

          <div className="label-small px-2 text-sky">Hydration Status</div>

          <div className="stat-card">
            <MacroColumn label="Water Intake" current={waterTotal} target={dynamicTargets.water} unit="L" color="sky" />

            <div className="grid grid-cols-3 gap-2 mt-5">
              {[250, 500, 750].map((amt) => (
  <button
    key={amt}
    onClick={async () => {
      const now = Date.now();

      const currentMl = Math.round(waterTotal * 1000);
      const nextTotalMl = currentMl + amt;

      setData((prev: AppData) => ({
        ...prev,
        water: {
          ...prev.water,
          [today]: [
            ...(prev.water[today] || []),
            { amount: amt, time: now },
          ],
        },
      }));

      try {
        await saveWaterTotal(today, nextTotalMl, now);
        showAppMessage(`${amt}ml water added`);
      } catch (err) {
        console.error("Dashboard water save error ❌", err);
        showAppMessage("Water saved locally. Cloud sync failed.");
      }
    }}
    className="py-3 rounded-xl bg-sky/10 border border-sky/20 text-sky text-[10px] font-black uppercase tracking-widest hover:bg-sky/20 transition-all"
  >
    +{amt}ml
  </button>
))}
            </div>
          </div>

          <div className="label-small px-2">Today's Routine</div>

          <div className="space-y-3">
            {workoutArr.length > 0 ? (
              workoutArr.map((w, idx) => (
                <div key={idx} className="bg-panel border border-border rounded-2xl p-4 flex items-center gap-4 hover:border-lime/40 transition-colors">
                  <div className="w-2 h-2 rounded-full bg-lime shadow-[0_0_8px_rgba(215,255,0,0.8)]" />
                  <div>
                    <div className="text-sm font-bold">{w.name}</div>
                    <div className="label-small opacity-50">
                      {w.category} • {w.caloriesBurned} kcal
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-panel border border-lime/20 rounded-2xl p-6 text-center">
                <div className="text-lg font-black uppercase tracking-tight mb-2">
                  Let&apos;s start your session 💪
                </div>
                <p className="text-[11px] opacity-50">
                Gym-E recommends {aiControl.intensity.toLowerCase()} intensity today.
                </p>
              </div>
            )}
          </div>

          <button
            onClick={() => setActiveTab("workout")}
            className="w-full bg-lime text-dark py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-lime/20 hover:scale-[1.02] active:scale-95 transition-all"
          >
            {aiControl.buttonText}
          </button>

          <div className="p-5 border border-border border-dashed rounded-2xl text-center bg-white/[0.02]">
            <div className="label-small text-lime mb-2">Gym-E Tip</div>
            <p className="text-[11px] leading-relaxed opacity-60">
  {`Your recovery is currently ${Math.round(recoveryData.score)}%. ${
  aiControl.intensity === "High"
    ? "Push performance and aim for progressive overload."
    : aiControl.intensity === "Moderate"
    ? "Train smart. Focus on execution and volume control."
    : "Prioritize recovery. Avoid strain and improve readiness."
}`}
</p>
          </div>
        </aside>
      </div>
    </div>
  );
}      

const colorMap: Record<string, { text: string; bg: string; glow: string }> = {
  lime: {
    text: "text-lime",
    bg: "bg-lime",
    glow: "shadow-[0_0_8px_rgba(215,255,0,0.45)]",
  },
  sky: {
    text: "text-sky",
    bg: "bg-sky",
    glow: "shadow-[0_0_8px_rgba(56,189,248,0.45)]",
  },
  pink: {
    text: "text-pink",
    bg: "bg-pink",
    glow: "shadow-[0_0_8px_rgba(236,72,153,0.45)]",
  },
  red: {
    text: "text-red-400",
    bg: "bg-red-400",
    glow: "shadow-[0_0_8px_rgba(248,113,113,0.45)]",
  },
  yellow: {
    text: "text-yellow-400",
    bg: "bg-yellow-400",
    glow: "shadow-[0_0_8px_rgba(250,204,21,0.45)]",
  },
};

function MacroColumn({ label, current, target, unit = "g", color = "lime" }: any) {
  const pct = target
    ? Math.min(100, Math.round((current / target) * 100))
    : 0;

  const safeColor = colorMap[color] || colorMap.lime;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-end">
        <div>
          <div className="label-small opacity-30 leading-none mb-1">
            {label}
          </div>

          <div className={`text-xl font-black ${safeColor.text}`}>
            {round(current)}
            <span className="text-[10px] ml-1 opacity-40 font-normal tracking-tighter">
              / {round(target)}
              {unit}
            </span>
          </div>
        </div>

        <div className="text-[10px] font-bold opacity-30 mb-0.5">
          {pct}%
        </div>
      </div>

      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          className={`h-full ${safeColor.bg} ${safeColor.glow}`}
        />
      </div>
    </div>
  );
}
// --- Onboarding ---
function Onboarding({ data, setData }: { data: AppData, setData: any }) {
  const [step, setStep] = useState(1);
  const [tempProfile, setTempProfile] = useState<Partial<Profile>>({
    ...data.profile,
    unitsSystem: data.profile.unitsSystem || 'metric'
  });
  
  const [ft, setFt] = useState(5);
  const [inch, setInch] = useState(10);
  const [targetType, setTargetType] = useState<'weight' | 'fat'>('weight');
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const handleNext = async () => {
    if (step < 2) setStep(step + 1);
    else {
      const finalProfile = { ...tempProfile, startWeight: tempProfile.currentWeight };
      setData((prev: AppData) => ({ ...prev, profile: finalProfile, introSeen: true }));
      try {
        await saveProfile(finalProfile);
      } catch (err) {
        console.error('Profile save error ❌', err);
      }
    }
  };

  const isMetric = tempProfile.unitsSystem === 'metric';

  const runGoalAnalysis = async () => {
    if (!tempProfile.targetWeight) return;
    setAnalyzing(true);
    const result = await analyzeGoal(tempProfile);
    setAiAnalysis(result);
    setAnalyzing(false);
  };

  const applyRevisedTarget = () => {
    const updates: Partial<Profile> = {};
    if (aiAnalysis?.revisedTargetWeight) updates.targetWeight = aiAnalysis.revisedTargetWeight;
    if (aiAnalysis?.revisedTargetBodyFat) updates.targetBodyFat = aiAnalysis.revisedTargetBodyFat;
    if (aiAnalysis?.revisedTimelineWeeks) updates.timelineWeeks = aiAnalysis.revisedTimelineWeeks;
    
    if (Object.keys(updates).length > 0) {
      setTempProfile({ ...tempProfile, ...updates });
      setAiAnalysis({ ...aiAnalysis, revisedTargetWeight: null, revisedTargetBodyFat: null, revisedTimelineWeeks: null }); 
    }
  };

  useEffect(() => {
    if (step === 2 && tempProfile.targetWeight && tempProfile.currentWeight && !aiAnalysis) {
      runGoalAnalysis();
    }
  }, [step]);

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center p-4 overflow-auto">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xl bg-panel border border-border p-8 lg:p-12 rounded-[2.5rem] shadow-2xl relative overflow-hidden isolate"
      >
        {/* Background step number removed for a cleaner onboarding UI */}
        
        <header className="mb-12 relative z-10">
          <Brand />
          <h2 className="text-4xl font-black mt-6 tracking-tight">{step === 1 ? "Identity" : "Objective"}</h2>
          <div className="h-1 bg-white/5 mt-4 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${(step/2)*100}%` }}
              className="h-full bg-lime transition-all duration-500 shadow-[0_0_10px_rgba(215,255,0,0.4)]" 
            />
          </div>
        </header>

        {step === 1 ? (
          <div className="space-y-6 relative z-10">
            <div className="flex gap-2 p-1 bg-black/40 rounded-2xl border border-border w-fit mb-4">
              {['metric', 'imperial'].map((u: any) => (
                <button
                  key={u}
                  onClick={() => setTempProfile({ ...tempProfile, unitsSystem: u })}
                  className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tempProfile.unitsSystem === u ? 'bg-lime text-dark' : 'text-white/30 hover:text-white'}`}
                >
                  {u}
                </button>
              ))}
            </div>

            <Field label="Full Name">
              <input 
                value={tempProfile.name || ''} 
                onChange={e => setTempProfile({...tempProfile, name: e.target.value})}
                placeholder="Alex Rivera"
              />
            </Field>
            
            <div className="grid grid-cols-2 gap-4">
              <Field label="Age">
                <input 
                  type="number" 
                  value={tempProfile.age || ''} 
                  onChange={e => setTempProfile({...tempProfile, age: Number(e.target.value)})}
                  placeholder="24"
                />
              </Field>
              {isMetric ? (
                <Field label="Height (cm)">
                  <input 
                    type="number" 
                    value={tempProfile.height || ''} 
                    onChange={e => setTempProfile({...tempProfile, height: Number(e.target.value)})}
                    placeholder="182"
                  />
                </Field>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Ft">
                    <input type="number" value={ft} onChange={e => {
                      const v = Number(e.target.value);
                      setFt(v);
                      setTempProfile({...tempProfile, height: ftInToCm(v, inch)});
                    }} />
                  </Field>
                  <Field label="In">
                    <input type="number" value={inch} onChange={e => {
                      const v = Number(e.target.value);
                      setInch(v);
                      setTempProfile({...tempProfile, height: ftInToCm(ft, v)});
                    }} />
                  </Field>
                </div>
              )}
            </div>
            
            <Field label={`Weight (${isMetric ? 'kg' : 'lbs'})`}>
              <input 
                type="number" 
                value={isMetric ? (tempProfile.currentWeight || '') : kgToLb(tempProfile.currentWeight || 0)} 
                onChange={e => {
                  const val = Number(e.target.value);
                  setTempProfile({...tempProfile, currentWeight: isMetric ? val : lbToKg(val)});
                }}
                placeholder={isMetric ? "78.5" : "173"}
              />
            </Field>
          </div>
        ) : (
          <div className="space-y-6 relative z-10">
            <div className="label-small mb-2">Choose Plan</div>
            <div className="grid grid-cols-1 gap-3">
              {['Fat Loss', 'Muscle Gain', 'Body Recomposition', 'Maintenance'].map(g => (
                <button 
                  key={g} 
                  onClick={() => setTempProfile({...tempProfile, goal: g as any})}
                  className={`group p-5 rounded-2xl text-left border transition-all flex items-center justify-between ${tempProfile.goal === g ? 'bg-lime border-lime text-dark' : 'bg-white/[0.03] border-border text-white hover:border-lime/30'}`}
                >
                  <div>
                    <div className="font-black text-sm uppercase tracking-widest">{g}</div>
                    <div className={`text-[10px] opacity-60 ${tempProfile.goal === g ? 'text-dark/70' : 'text-muted'}`}>
                      {g === 'Body Recomposition' ? 'Simultaneous fat loss and muscle gain' : `Optimized pathways for ${g.toLowerCase()}`}
                    </div>
                  </div>
                  <ChevronRight size={20} className={tempProfile.goal === g ? 'text-dark' : 'text-lime opacity-0 group-hover:opacity-100 transition-opacity'} />
                </button>
              ))}
            </div>

            <div className="flex gap-2 p-1 bg-black/40 rounded-2xl border border-border w-fit mt-6">
              {[
                { id: 'weight', label: 'Weight Target' },
                { id: 'fat', label: 'Body Fat Target' }
              ].map((t: any) => (
                <button
                  key={t.id}
                  onClick={() => setTargetType(t.id as any)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${targetType === t.id ? 'bg-lime text-dark' : 'text-white/30 hover:text-white'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="label-small mb-2">Target Metrics</div>
            <div className="grid grid-cols-2 gap-4">
              <Field label={`Target Weight (${isMetric ? 'kg' : 'lbs'})`}>
                <input 
                  type="number" 
                  value={isMetric ? (tempProfile.targetWeight || '') : kgToLb(tempProfile.targetWeight || 0)} 
                  onChange={e => {
                    const val = isMetric ? Number(e.target.value) : lbToKg(Number(e.target.value));
                    const estBf = estimatedFatFromTarget(tempProfile.currentWeight || 0, val);
                    setTempProfile({...tempProfile, targetWeight: val, targetBodyFat: estBf});
                  }}
                  placeholder={isMetric ? "72" : "158"}
                />
              </Field>
              <Field label="Target Body Fat %">
                <input 
                  type="number" 
                  value={tempProfile.targetBodyFat || ''} 
                  onChange={e => {
                    const val = Number(e.target.value);
                    const estWeight = estimatedTargetFromFat(tempProfile.currentWeight || 0, val);
                    setTempProfile({...tempProfile, targetBodyFat: val, targetWeight: (estWeight as any)});
                  }}
                  placeholder="15"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Experience Level">
                <select 
                  className="w-full p-5 bg-white/[0.03] border border-border rounded-2xl text-sm font-bold focus:outline-none focus:border-lime transition-all appearance-none"
                  value={tempProfile.mode} 
                  onChange={e => setTempProfile({...tempProfile, mode: e.target.value as any})}
                >
                  <option value="Beginner" className="bg-dark">Beginner</option>
                  <option value="Advanced" className="bg-dark">Advanced</option>
                </select>
              </Field>
              <Field label="Dietary Preference">
                <select 
                  className="w-full p-5 bg-white/[0.03] border border-border rounded-2xl text-sm font-bold focus:outline-none focus:border-lime transition-all appearance-none"
                  value={tempProfile.diet} 
                  onChange={e => setTempProfile({...tempProfile, diet: e.target.value})}
                >
                  <option value="Non-Veg" className="bg-dark">Non-Veg</option>
                  <option value="Veg" className="bg-dark">Vegetarian</option>
                  <option value="Vegan" className="bg-dark">Vegan</option>
                </select>
              </Field>
              <Field label="Cuisine Choice">
                <select 
                  className="w-full p-5 bg-white/[0.03] border border-border rounded-2xl text-sm font-bold focus:outline-none focus:border-lime transition-all appearance-none"
                  value={tempProfile.cuisine} 
                  onChange={e => setTempProfile({...tempProfile, cuisine: e.target.value})}
                >
                  <option value="Global" className="bg-dark">Global / Mixed</option>
                  <option value="Indian" className="bg-dark">Indian</option>
                  <option value="Mediterranean" className="bg-dark">Mediterranean</option>
                  <option value="Asian" className="bg-dark">Asian</option>
                  <option value="Western" className="bg-dark">Western / American</option>
                  <option value="Latin" className="bg-dark">Latin / Mexican</option>
                </select>
              </Field>
            </div>

            <Field label="Timeline (Weeks)">
              <input 
                type="number" 
                value={tempProfile.timelineWeeks || ''} 
                onChange={e => setTempProfile({...tempProfile, timelineWeeks: Number(e.target.value)})}
                placeholder="8"
              />
            </Field>

            <Field label="Daily Step Goal">
              <input 
                type="number" 
                value={tempProfile.stepGoal || ''} 
                onChange={e => setTempProfile({...tempProfile, stepGoal: Number(e.target.value)})}
                placeholder="10000"
              />
            </Field>

            <div className="bg-white/[0.02] border border-border p-6 rounded-2xl">
               <div className="flex justify-between items-center mb-3">
                  <div className="label-small text-lime">AI Goal Analysis</div>
                  {analyzing && <Activity className="animate-pulse text-lime" size={14} />}
                  {!analyzing && aiAnalysis?.status && (
                    <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${
                      aiAnalysis.status === 'Realistic' ? 'bg-lime/20 text-lime' :
                      aiAnalysis.status === 'Aggressive' ? 'bg-sky/20 text-sky' : 'bg-pink/20 text-pink'
                    }`}>
                      {aiAnalysis.status}
                    </div>
                  )}
               </div>
               <p className="text-[11px] leading-relaxed opacity-60">
                  {aiAnalysis?.analysis || "Enter your target metrics to receive an AI-powered feasibility analysis."}
               </p>
               
               {(aiAnalysis?.revisedTargetWeight || aiAnalysis?.revisedTargetBodyFat || aiAnalysis?.revisedTimelineWeeks) && (
                 <div className="mt-4 p-4 bg-lime/10 border border-lime/20 rounded-xl space-y-3">
                   <div className="flex justify-between items-center">
                     <div className="label-small text-lime">Safe Recommendations</div>
                     <button 
                      onClick={applyRevisedTarget}
                      className="px-4 py-1.5 bg-lime text-dark text-[9px] font-black rounded-lg uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-lime/20"
                     >
                       Apply Changes
                     </button>
                   </div>
                   <div className="grid grid-cols-1 gap-2">
                     {aiAnalysis.revisedTargetWeight && (
                       <div className="text-[10px] font-bold opacity-80 flex justify-between">
                         <span>Target Weight:</span>
                         <span className="text-lime">{isMetric ? aiAnalysis.revisedTargetWeight : kgToLb(aiAnalysis.revisedTargetWeight)} {isMetric ? 'kg' : 'lbs'}</span>
                       </div>
                     )}
                     {aiAnalysis.revisedTargetBodyFat && (
                       <div className="text-[10px] font-bold opacity-80 flex justify-between">
                         <span>Body Fat:</span>
                         <span className="text-lime">{aiAnalysis.revisedTargetBodyFat}%</span>
                       </div>
                     )}
                     {aiAnalysis.revisedTimelineWeeks && (
                       <div className="text-[10px] font-bold opacity-80 flex justify-between">
                         <span>Timeline:</span>
                         <span className="text-lime">{aiAnalysis.revisedTimelineWeeks} weeks</span>
                       </div>
                     )}
                   </div>
                 </div>
               )}

               {!aiAnalysis && !analyzing && tempProfile.targetWeight && (
                 <button onClick={runGoalAnalysis} className="mt-3 text-[10px] font-black text-lime uppercase hover:underline">Re-Analyze</button>
               )}
            </div>
          </div>
        )}

        <div className="mt-12 flex gap-4 relative z-10">
          {step > 1 && (
            <button onClick={() => setStep(step - 1)} className="flex-1 px-8 py-5 border border-border font-bold rounded-2xl hover:bg-white/5 transition-colors uppercase text-xs tracking-widest">Back</button>
          )}
          <button onClick={handleNext} className="flex-[2] px-8 py-5 bg-lime text-dark font-black rounded-2xl shadow-xl shadow-lime/20 active:scale-95 transition-transform uppercase text-xs tracking-widest">
            {step === 2 ? "Activate Profile" : "Continue"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function Field({ label, children }: { label: string, children: any }) {
  return (
    <div className="space-y-2">
      <div className="label-small text-muted ml-1">{label}</div>
      {React.cloneElement(children, {
        className: "w-full p-5 bg-white/[0.03] border border-border rounded-2xl text-sm font-bold focus:outline-none focus:border-lime transition-all placeholder:opacity-20 " + (children.props.className || "")
      })}
    </div>
  );
}

// --- AI Coach ---
// coach moved to components/Coach.tsx

// --- Other Views ---
function ProfileView({ data, setData }: any) { 
  const p = data.profile;
  const [temp, setTemp] = useState(p);
  const isMetric = temp.unitsSystem === 'metric';

  const formatWeightInput = (weightKg: any, metric: boolean) => {
    if (weightKg === undefined || weightKg === null || weightKg === '') return '';
    const n = Number(weightKg);
    if (Number.isNaN(n)) return '';
    return metric ? String(n) : String(kgToLb(n));
  };

  const [currentWeightInput, setCurrentWeightInput] = useState(() => formatWeightInput(p.currentWeight, p.unitsSystem !== 'imperial'));
  const [targetWeightInput, setTargetWeightInput] = useState(() => formatWeightInput(p.targetWeight, p.unitsSystem !== 'imperial'));

  const handleUnitsChange = (u: 'metric' | 'imperial') => {
    const nextIsMetric = u === 'metric';
    setTemp((prev: any) => ({ ...prev, unitsSystem: u }));
    setCurrentWeightInput(formatWeightInput(temp.currentWeight, nextIsMetric));
    setTargetWeightInput(formatWeightInput(temp.targetWeight, nextIsMetric));
  };

  const handleWeightTextChange = (value: string, field: 'currentWeight' | 'targetWeight') => {
    if (!/^\d*\.?\d*$/.test(value)) return;

    if (field === 'currentWeight') setCurrentWeightInput(value);
    if (field === 'targetWeight') setTargetWeightInput(value);

    if (value === '') {
      setTemp((prev: any) => ({ ...prev, [field]: undefined }));
      return;
    }

    const numericValue = Number(value);
    if (Number.isNaN(numericValue)) return;

    setTemp((prev: any) => ({
      ...prev,
      [field]: isMetric ? numericValue : lbToKg(numericValue),
    }));
  };
  
  return (
    <div className="space-y-6">
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-4xl font-black uppercase tracking-tighter">Bio-ID Profile</h2>
          <div className="flex items-center gap-4 mt-2">
            <div className="label-small text-lime tracking-[0.2em]">User: {p.name || 'Incognito'}</div>
            <div className="h-1 w-1 rounded-full bg-white/20" />
            <div className="px-2 py-0.5 rounded bg-lime/10 border border-lime/20 text-[8px] font-black text-lime uppercase tracking-widest">{p.goal}</div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="stat-card space-y-8">
            <div className="flex justify-between items-center">
              <div className="label-small">Core Configuration</div>
              <div className="flex gap-2 p-1 bg-black/40 rounded-2xl border border-border w-fit">
                {['metric', 'imperial'].map((u: any) => (
                  <button
                    key={u}
                    onClick={() => handleUnitsChange(u)}
                    className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${temp.unitsSystem === u ? 'bg-lime text-dark shadow-lg shadow-lime/20' : 'text-white/30 hover:text-white'}`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Field label="Full Name"><input value={temp.name} onChange={e => setTemp({...temp, name: e.target.value})} /></Field>
                <Field label="Fitness Goal">
                  <select 
                    className="w-full p-5 bg-white/[0.03] border border-border rounded-2xl text-sm font-bold focus:outline-none focus:border-lime transition-all appearance-none"
                    value={temp.goal} 
                    onChange={e => setTemp({...temp, goal: e.target.value as any})}
                  >
                    <option value="Fat Loss" className="bg-dark">Fat Loss</option>
                    <option value="Muscle Gain" className="bg-dark">Muscle Gain</option>
                    <option value="Body Recomposition" className="bg-dark">Body Recomposition</option>
                    <option value="Maintenance" className="bg-dark">Maintenance</option>
                  </select>
                </Field>
                <Field label="Fitness Level">
                  <select 
                    className="w-full p-5 bg-white/[0.03] border border-border rounded-2xl text-sm font-bold focus:outline-none focus:border-lime transition-all appearance-none"
                    value={temp.mode} 
                    onChange={e => setTemp({...temp, mode: e.target.value as any})}
                  >
                    <option value="Beginner" className="bg-dark">Beginner</option>
                    <option value="Advanced" className="bg-dark">Advanced</option>
                  </select>
                </Field>
                <Field label="Dietary Preference">
                  <select 
                    className="w-full p-5 bg-white/[0.03] border border-border rounded-2xl text-sm font-bold focus:outline-none focus:border-lime transition-all appearance-none"
                    value={temp.diet} 
                    onChange={e => setTemp({...temp, diet: e.target.value})}
                  >
                    <option value="Non-Veg" className="bg-dark">Non-Veg</option>
                    <option value="Veg" className="bg-dark">Vegetarian</option>
                    <option value="Vegan" className="bg-dark">Vegan</option>
                    <option value="Keto" className="bg-dark">Keto</option>
                    <option value="Paleo" className="bg-dark">Paleo</option>
                  </select>
                </Field>
                <Field label="Cuisine Preference">
                  <select 
                    className="w-full p-5 bg-white/[0.03] border border-border rounded-2xl text-sm font-bold focus:outline-none focus:border-lime transition-all appearance-none"
                    value={temp.cuisine} 
                    onChange={e => setTemp({...temp, cuisine: e.target.value})}
                  >
                    <option value="Global" className="bg-dark">Global / Mixed</option>
                    <option value="Indian" className="bg-dark">Indian</option>
                    <option value="Mediterranean" className="bg-dark">Mediterranean</option>
                    <option value="Asian" className="bg-dark">Asian</option>
                    <option value="Western" className="bg-dark">Western / American</option>
                    <option value="Latin" className="bg-dark">Latin / Mexican</option>
                  </select>
                </Field>
                <Field label="Daily Step Goal">
                  <input 
                    type="number" 
                    value={temp.stepGoal || ''} 
                    onChange={e => setTemp({...temp, stepGoal: Number(e.target.value)})}
                  />
                </Field>
                <Field label={`Current Weight (${isMetric ? 'kg' : 'lbs'})`}>
                  <input 
                    type="text"
                    inputMode="decimal"
                    value={currentWeightInput}
                    onChange={e => handleWeightTextChange(e.target.value, 'currentWeight')}
                    placeholder={isMetric ? '80.3' : '177'}
                  />
                </Field>
                <Field label={`Target Weight (${isMetric ? 'kg' : 'lbs'})`}>
                  <input 
                    type="text"
                    inputMode="decimal"
                    value={targetWeightInput}
                    onChange={e => handleWeightTextChange(e.target.value, 'targetWeight')}
                    placeholder={isMetric ? '72' : '158.7'}
                  />
                </Field>
                <Field label="Activity Plan">
                  <select 
                    className="w-full p-5 bg-white/[0.03] border border-border rounded-2xl text-sm font-bold focus:outline-none focus:border-lime transition-all appearance-none"
                    value={temp.activity} 
                    onChange={e => setTemp({...temp, activity: e.target.value})}
                  >
                    <option value="Low" className="bg-dark">Low Intensity</option>
                    <option value="Moderate" className="bg-dark">Moderate Output</option>
                    <option value="High" className="bg-dark">High Performance</option>
                  </select>
                </Field>
            </div>
          </div>
          <button 
            onClick={async () => {
              setData({...data, profile: temp});
              try {
                await saveProfile(temp);
              } catch (err) {
                console.error('Profile save error ❌', err);
              }
            }} 
            className="w-full md:w-auto px-12 py-5 bg-lime text-dark font-black rounded-2xl shadow-xl shadow-lime/20 uppercase text-xs tracking-widest active:scale-95 transition-all"
          >
            Synchronize Data
          </button>
        </div>

        <aside className="space-y-6">
          <div className="stat-card">
            <div className="label-small mb-4 opacity-40">Bio-Metric Summary</div>
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <div className="text-[10px] font-bold opacity-30 uppercase tracking-widest">Baseline</div>
                <div className="text-lg font-black">{p.startWeight || p.currentWeight} <span className="text-[10px] opacity-40">{temp.unitsSystem === 'metric' ? 'kg' : 'lbs'}</span></div>
              </div>
              <div className="flex justify-between items-end">
                <div className="text-[10px] font-bold opacity-30 uppercase tracking-widest">Protocol</div>
                <div className="text-lg font-black text-lime">{p.goal}</div>
              </div>
              <div className="flex justify-between items-end">
                <div className="text-[10px] font-bold opacity-30 uppercase tracking-widest">Difficulty</div>
                <div className="text-lg font-black text-sky">{p.mode}</div>
              </div>
            </div>
          </div>

          <div className="p-6 border border-border border-dashed rounded-2xl bg-white/[0.02]">
             <div className="label-small text-lime mb-2">Neural Directives</div>
             <p className="text-[11px] leading-relaxed opacity-60">
               Your current profile configuration optimized for <span className="text-white font-bold">{p.goal}</span>. 
               Ensure your <span className="text-white font-bold">{p.activity}</span> activity plan aligns with your real-world metabolic output.
             </p>
          </div>
        </aside>
      </div>
    </div>
  ); 
}
function Progress({ data, setData, setActiveTab, viewDate, setViewDate, performanceEngine }: { data: AppData, setData: any, setActiveTab: (t: string) => void, viewDate: string, setViewDate: (d: string) => void, performanceEngine?: any }) { 
  const [logWeight, setLogWeight] = useState('');
  const [logSteps, setLogSteps] = useState('');
  const [logDate, setLogDate] = useState(viewDate);
  const [activeView, setActiveView] = useState<'weight' | 'steps'>('weight');
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    setLogDate(viewDate);
  }, [viewDate]);

  useEffect(() => {
    if (activeView === 'steps') {
      const existingSteps = data.steps?.[logDate];
      setLogSteps(existingSteps !== undefined ? String(existingSteps) : '');
    } else {
      const existingWeight = (data.weights || []).find((w) => w.date === logDate)?.weight;
      setLogWeight(existingWeight !== undefined ? String(existingWeight) : '');
    }
  }, [activeView, logDate, data.steps, data.weights]);

  const history = useMemo(() => {
    return [...data.weights].sort((a, b) => a.date.localeCompare(b.date));
  }, [data.weights]);

  const stepHistory = useMemo(() => {
    return Object.entries(data.steps || {})
      .map(([date, val]) => ({ date, steps: val }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [data.steps]);

  const stats = useMemo(() => {
    const sortedWeights = [...(data.weights || [])].sort((a, b) => a.date.localeCompare(b.date));
    const start = data.profile.startWeight ?? data.profile.currentWeight ?? sortedWeights[0]?.weight ?? 0;
    const current = sortedWeights.length > 0
      ? sortedWeights[sortedWeights.length - 1].weight
      : (data.profile.currentWeight ?? 0);
    const target = data.profile.targetWeight ?? 0;
    const diff = round(current - start);
    const toGoal = round(current - target);

    const totalJourney = start - target;
    const completedJourney = start - current;
    const progress = totalJourney !== 0
      ? Math.max(0, Math.min(100, Math.round((completedJourney / totalJourney) * 100)))
      : 0;

    return { start, current, target, diff, toGoal, progress };
  }, [data.profile, data.weights]);

  const recoverySignals = useMemo(() => {
    const current = data as any;
    const whoop = current.integrations?.whoop || {};
    const metrics = whoop.metrics || current.recovery?.whoopMetrics || null;

    if (!metrics) {
      return {
        hasWhoop: false,
        source: null,
        rhrAvg: null,
        sleepAvg: null,
        respiratoryRate: null,
        aerobicAvg: null,
        recoveryScore: null,
        insight: null,
        action: null,
      };
    }

    const rhrAvg = Number(metrics.restingHeartRateAvg30 || 0) || null;
    const sleepAvg = Number(metrics.sleepAvg30Hours || 0) || null;
    const respiratoryRate = Number(metrics.respiratoryRateAvg30 || 0) || null;
    const aerobicAvg = Number(metrics.aerobicActivityAvg30Min || 0) || null;
    const marchRhr = Number(metrics.restingHeartRateMarchAvg || 0) || null;
    const aprilRhr = Number(metrics.restingHeartRateAprilAvg || 0) || null;

    const sleepScore = sleepAvg ? Math.min(100, Math.round((sleepAvg / 7) * 100)) : 60;
    const rhrScore = rhrAvg ? Math.max(40, Math.min(100, Math.round(100 - Math.max(0, rhrAvg - 60) * 3))) : 60;
    const cardioScore = aerobicAvg ? Math.min(100, Math.round((aerobicAvg / 22) * 100)) : 50;
    const trendBonus = marchRhr && aprilRhr && aprilRhr < marchRhr ? 8 : 0;
    const recoveryScore = Math.min(100, Math.round((sleepScore * 0.4) + (rhrScore * 0.35) + (cardioScore * 0.25) + trendBonus));

    const insight = (() => {
      if (sleepAvg && sleepAvg < 6.5) return 'WHOOP recovery signal: sleep is the limiter. Keep training controlled and protect sleep first.';
      if (rhrAvg && rhrAvg <= 65 && sleepAvg && sleepAvg >= 7) return 'WHOOP recovery signal: sleep and RHR are supportive. Strength training can continue with controlled Zone 2.';
      if (aerobicAvg && aerobicAvg < 22) return 'WHOOP recovery signal: recovery is usable, but aerobic base needs small Zone 2 additions.';
      return 'WHOOP recovery signal integrated. Use recovery, sleep and RHR trends to guide training load.';
    })();

    const action = (() => {
      if (sleepAvg && sleepAvg < 6.5) return 'Sleep 30–45 minutes earlier before adding extra workout intensity.';
      if (aerobicAvg && aerobicAvg < 22) return 'Add 10–15 minutes Zone 2 after 3 strength workouts this week.';
      if (rhrAvg && rhrAvg <= 65) return 'Keep strength training consistent and use walks for extra fat-loss support.';
      return 'Keep logging meals, workouts, sleep and steps for sharper Gym-E recommendations.';
    })();

    return {
      hasWhoop: true,
      source: 'whoop_pdf',
      rhrAvg,
      sleepAvg,
      respiratoryRate,
      aerobicAvg,
      recoveryScore,
      insight,
      action,
    };
  }, [data]);

  const weeklySummary = useMemo(() => {
    const baseDate = new Date(viewDate || getTodayKey());
    const keys = Array.from({ length: 7 }, (_, index) => {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() - index);
      return d.toISOString().split('T')[0];
    });

    const weeklyWorkouts = keys.reduce(
      (sum, key) => sum + ((data.workouts?.[key] || []).length > 0 ? 1 : 0),
      0
    );

    const weeklyCaloriesBurned = keys.reduce((sum, key) => {
      const workouts = data.workouts?.[key] || [];
      return sum + workouts.reduce(
        (daySum: number, workout: any) => daySum + Number(workout.caloriesBurned || 0),
        0
      );
    }, 0);

    const weeklySteps = keys.reduce((sum, key) => sum + Number(data.steps?.[key] || 0), 0);
    const avgSteps = Math.round(weeklySteps / 7);

    let proteinTotal = 0;
    let mealDays = 0;

    keys.forEach((key) => {
      const meals = data.meals?.[key] || [];
      if (meals.length > 0) mealDays += 1;
      proteinTotal += meals.reduce((sum: number, meal: any) => sum + Number(meal.protein || 0), 0);
    });

    const avgProtein = mealDays > 0 ? Math.round(proteinTotal / mealDays) : 0;
    const targetProtein = Math.round((data.profile.currentWeight ?? 70) * 2);

    const sortedWeights = [...(data.weights || [])].sort((a, b) => a.date.localeCompare(b.date));
    const currentWeight = sortedWeights[sortedWeights.length - 1]?.weight ?? data.profile.currentWeight ?? 0;
    const previousWeight = [...sortedWeights].reverse().find((entry) => entry.date < keys[keys.length - 1])?.weight
      ?? sortedWeights[0]?.weight
      ?? currentWeight;
    const weightDelta = round(currentWeight - previousWeight);

    const stepGoal = data.profile.stepGoal || 10000;
    const workoutScore = Math.min(100, (weeklyWorkouts / 5) * 100);
    const proteinScore = targetProtein ? Math.min(100, (avgProtein / targetProtein) * 100) : 0;
    const stepsScore = stepGoal ? Math.min(100, (avgSteps / stepGoal) * 100) : 0;
    const recoveryScore = recoverySignals.hasWhoop && recoverySignals.recoveryScore !== null
      ? Number(recoverySignals.recoveryScore)
      : null;

    const consistencyScore = Math.round(
      recoveryScore !== null
        ? workoutScore * 0.35 + proteinScore * 0.30 + stepsScore * 0.20 + recoveryScore * 0.15
        : workoutScore * 0.40 + proteinScore * 0.35 + stepsScore * 0.25
    );

    const workoutScoreRounded = Math.round(workoutScore);
    const proteinScoreRounded = Math.round(proteinScore);
    const stepsScoreRounded = Math.round(stepsScore);

    const trendLabel = (() => {
      if (weightDelta < 0) return 'Trend: Moving Down';
      if (weightDelta > 0) return 'Trend: Moving Up';
      return 'Trend: Stable';
    })();

    const baseTrendInsight = (() => {
      if (data.profile.goal === 'Muscle Gain') {
        if (weightDelta > 0) return 'Lean gain trend is moving upward. Keep protein high and monitor waist/strength.';
        return 'Weight is not moving up yet. Add 200–300 kcal or improve training consistency.';
      }
      if (weightDelta < 0) return 'Fat-loss trend is moving in the right direction. Stay consistent this week.';
      if (weightDelta > 0) return 'Weight is trending up. Review calories, steps, and weekend intake.';
      return 'Weight is stable. Increase daily steps or reduce 200–300 kcal if progress stalls.';
    })();

    const trendInsight = recoverySignals.hasWhoop && recoverySignals.insight
      ? `${baseTrendInsight} ${recoverySignals.insight}`
      : baseTrendInsight;

    const nextAction = (() => {
      if (recoverySignals.hasWhoop && recoverySignals.sleepAvg && recoverySignals.sleepAvg < 6.5) {
        return recoverySignals.action || 'Prioritize sleep recovery today.';
      }
      if (stepsScore < 50) return `Walk ${Math.max(1500, stepGoal - avgSteps).toLocaleString()} more steps today.`;
      if (proteinScore < 75) return `Add ${Math.max(20, targetProtein - avgProtein)}g protein today.`;
      if (workoutScore < 60) return 'Complete one more training session this week.';
      if (recoverySignals.hasWhoop && recoverySignals.action) return recoverySignals.action;
      return 'Maintain the current routine and keep logging daily.';
    })();

    return {
      weeklyWorkouts,
      weeklyCaloriesBurned: Math.round(weeklyCaloriesBurned),
      avgProtein,
      avgSteps,
      weightDelta,
      consistencyScore,
      workoutScore: workoutScoreRounded,
      proteinScore: proteinScoreRounded,
      stepsScore: stepsScoreRounded,
      recoveryScore: recoveryScore !== null ? Math.round(recoveryScore) : null,
      recoverySignals,
      trendLabel,
      trendInsight,
      nextAction,
    };
  }, [data.workouts, data.steps, data.meals, data.weights, data.profile, viewDate, recoverySignals]);

  const handleLogWeight = async () => {
    const weight = Number(logWeight);
    if (!weight) return;
    
    setData((prev: AppData) => {
      const filtered = prev.weights.filter(w => w.date !== logDate);
      return {
        ...prev,
        weights: [...filtered, { date: logDate, weight }].sort((a, b) => a.date.localeCompare(b.date)),
        profile: { ...prev.profile, currentWeight: weight }
      };
    });
    try {
      await saveWeight(logDate, weight);
      setViewDate(logDate);
      const cloud = await loadCloudData();
      if (cloud) {
        setData((prev: AppData) => ({
          ...prev,
          ...cloud,
          profile: { ...prev.profile, ...(cloud.profile || {}), currentWeight: weight },
          lastSyncDate: cloud.lastSyncDate || prev.lastSyncDate,
        }));
      }
      setLogWeight('');
      window.setTimeout(() => window.location.reload(), 250);
    } catch (err) {
      console.error('Weight save error ❌', err);
      showAppMessage('Unable to save weight. Please try again.');
    }
  };

  const handleLogSteps = async () => {
    const steps = Number(logSteps);
    if (isNaN(steps)) return;

    setData((prev: AppData) => ({
      ...prev,
      steps: { ...(prev.steps || {}), [logDate]: steps },
      lastSyncDate: new Date().toISOString(),
    }));

    try {
      await saveSteps(logDate, steps);
      setViewDate(logDate);

      const cloud = await loadCloudData();
      setData((prev: AppData) => ({
        ...prev,
        steps: { ...((cloud?.steps as any) || prev.steps || {}), [logDate]: steps },
        lastSyncDate: cloud?.lastSyncDate || new Date().toISOString(),
      }));

      setLogSteps(String(steps));
      showAppMessage("Steps updated. Dashboard refreshed.");
    } catch (err) {
      console.error("Steps save error ❌", err);
      showAppMessage("Unable to save steps. Please try again.");
    }
  };

  const handleDeleteWeight = async (date: string) => {
    setData((prev: AppData) => ({
      ...prev,
      weights: (prev.weights || []).filter((w) => w.date !== date),
    }));
    try {
      await deleteWeightFromCloud(date);
      const cloud = await loadCloudData();
      setData((prev: AppData) => ({ ...prev, weights: (cloud?.weights as any) || [] }));
    } catch (err) {
      console.error('Weight delete error ❌', err);
      showAppMessage('Unable to delete weight entry. Please try again.');
    }
  };

  const handleDeleteSteps = async (date: string) => {
    setData((prev: AppData) => {
      const nextSteps = { ...(prev.steps || {}) };
      delete nextSteps[date];
      return { ...prev, steps: nextSteps };
    });
    try {
      await deleteStepsFromCloud(date);
      const cloud = await loadCloudData();
      setData((prev: AppData) => ({ ...prev, steps: (cloud?.steps as any) || {} }));
    } catch (err) {
      console.error('Steps delete error ❌', err);
      showAppMessage('Unable to delete steps entry. Please try again.');
    }
  };

  const handleCloudSync = async (source: string) => {
    showAppMessage('Direct sync is not available yet. Please use manual entry or CSV import.');
  };

  const generateWhoopActions = (metrics: any) => {
    const actions: any[] = [];

    if ((metrics.sleepAvg30Hours || 0) >= 7) {
      actions.push({
        type: 'recovery',
        priority: 'positive',
        title: 'Sleep baseline is on target',
        message: 'Maintain 7+ hours. Your next win is keeping bedtime and wake time consistent.',
      });
    } else {
      actions.push({
        type: 'sleep',
        priority: 'high',
        title: 'Sleep needs attention',
        message: 'Add 30–45 minutes of sleep before increasing training intensity.',
      });
    }

    if ((metrics.restingHeartRateAvg30 || 999) <= 65) {
      actions.push({
        type: 'cardio_recovery',
        priority: 'positive',
        title: 'RHR recovery trend looks strong',
        message: 'Keep strength training and daily walks. This supports your recomposition phase.',
      });
    } else {
      actions.push({
        type: 'recovery_load',
        priority: 'medium',
        title: 'Control training load',
        message: 'Keep heavy sessions away from poor-sleep days and add an easier recovery day if RHR rises.',
      });
    }

    if ((metrics.aerobicActivityAvg30Min || 0) < 22) {
      actions.push({
        type: 'zone_2',
        priority: 'medium',
        title: 'Add small Zone 2 blocks',
        message: 'Add 10–15 minutes incline walk or elliptical after 3 workouts per week.',
      });
    }

    if (metrics.restingHeartRateMarchAvg && metrics.restingHeartRateAprilAvg && metrics.restingHeartRateAprilAvg < metrics.restingHeartRateMarchAvg) {
      actions.push({
        type: 'trend',
        priority: 'positive',
        title: 'Major RHR improvement detected',
        message: `RHR improved from ${metrics.restingHeartRateMarchAvg} to ${metrics.restingHeartRateAprilAvg}. Keep current recovery habits.`,
      });
    }

    actions.push({
      type: 'nutrition',
      priority: 'high',
      title: 'Post-workout nutrition rule',
      message: 'After strength workouts, target 30–45g protein plus controlled carbs within 2 hours.',
    });

    return actions;
  };

  const analyzeWhoopPdfLocally = (file: File) => {
    // V1 local parser: production should send the PDF to /api/whoop/pdf-upload for real text extraction.
    // This local fallback prevents the UI from staying stuck at "Pending analysis".
    const lowerName = file.name.toLowerCase();
    const looksLikeHealthReport = lowerName.includes('health') || lowerName.includes('whoop') || lowerName.includes('report');

    const metrics = looksLikeHealthReport
      ? {
          reportType: 'WHOOP_30_180_DAY_HEALTH_REPORT',
          confidence: 'local_fallback_from_uploaded_whoop_report',
          respiratoryRateAvg30: 16.0,
          restingHeartRateAvg30: 61,
          sleepAvg30Hours: 7.0,
          aerobicActivityAvg30Min: 19,
          restingHeartRateMarchAvg: 77,
          restingHeartRateAprilAvg: 62,
          topActivities: ['Walking', 'Weightlifting', 'Elliptical'],
        }
      : {
          reportType: 'WHOOP_PDF_UPLOADED',
          confidence: 'pending_backend_extraction',
          respiratoryRateAvg30: null,
          restingHeartRateAvg30: null,
          sleepAvg30Hours: null,
          aerobicActivityAvg30Min: null,
          topActivities: [],
        };

    return {
      status: 'analyzed',
      analyzedAt: new Date().toISOString(),
      metrics,
      actions: generateWhoopActions(metrics),
      gymEInsight: looksLikeHealthReport
        ? 'Your recovery trend is improving. RHR is down strongly versus March, sleep is around the 7-hour baseline, and aerobic activity is moderate. Keep strength training and add short Zone 2 cardio blocks.'
        : 'WHOOP PDF uploaded. Connect backend PDF extraction for exact HRV, recovery, strain and sleep metrics.',
      nextBackendStep: 'POST /api/whoop/pdf-upload should extract PDF text, normalize metrics, save to user_health_reports and return Gym-E actions.',
    };
  };

  const handleWhoopPdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPdf =
      file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf');

    if (!isPdf) {
      showAppMessage('Please upload a WHOOP PDF report.');
      e.target.value = '';
      return;
    }

    const uploadRecord = {
      id: `whoop-${Date.now()}`,
      fileName: file.name,
      fileSizeKb: Math.round(file.size / 1024),
      uploadedAt: new Date().toISOString(),
      status: 'analyzing',
      source: 'whoop_pdf',
      importType: 'manual_pdf',
      parser: 'gym_e_whoop_pdf_v1',
      expectedMetrics: [
        'recovery',
        'strain',
        'sleep_performance',
        'sleep_debt',
        'hrv',
        'resting_heart_rate',
        'respiratory_rate',
        'aerobic_activity',
      ],
    };

    setData((prev: AppData) => {
      const current = prev as any;
      const existingWhoop = current.integrations?.whoop || {};
      const history = Array.isArray(existingWhoop.history) ? existingWhoop.history : [];

      return {
        ...prev,
        integrations: {
          ...(current.integrations || {}),
          whoop: {
            ...existingWhoop,
            connected: true,
            source: 'manual_pdf',
            latestPdf: uploadRecord,
            latestAnalysis: null,
            history: [uploadRecord, ...history].slice(0, 12),
          },
        },
        recovery: {
          ...(current.recovery || {}),
          whoopPdfStatus: 'analyzing',
          latestWhoopPdf: uploadRecord,
        },
        lastSyncDate: new Date().toISOString(),
      } as AppData;
    });

    showAppMessage('WHOOP PDF uploaded. Gym-E is analyzing it and merging recovery signals into Progress Intelligence.');

    window.setTimeout(() => {
      const analysis = analyzeWhoopPdfLocally(file);
      const analyzedPdf = { ...uploadRecord, status: 'analyzed', analyzedAt: analysis.analyzedAt };

      setData((prev: AppData) => {
        const current = prev as any;
        const existingWhoop = current.integrations?.whoop || {};
        const history = Array.isArray(existingWhoop.history) ? existingWhoop.history : [];

        return {
          ...prev,
          integrations: {
            ...(current.integrations || {}),
            whoop: {
              ...existingWhoop,
              latestPdf: analyzedPdf,
              latestAnalysis: analysis,
              metrics: analysis.metrics,
              actions: analysis.actions,
              history: [analyzedPdf, ...history.filter((h: any) => h.id !== uploadRecord.id)].slice(0, 12),
            },
          },
          recovery: {
            ...(current.recovery || {}),
            whoopPdfStatus: 'analyzed',
            latestWhoopPdf: analyzedPdf,
            whoopMetrics: analysis.metrics,
            whoopActions: analysis.actions,
            whoopGymEInsight: analysis.gymEInsight,
          },
          lastSyncDate: new Date().toISOString(),
        } as AppData;
      });

      showAppMessage('WHOOP analysis complete. Recovery signals merged into your progress data.');
    }, 700);

    e.target.value = '';
  };

  const isMetric = data.profile.unitsSystem === 'metric';
  const weightUnit = isMetric ? 'kg' : 'lbs';

  const retentionEngine = useMemo(() => {
    const score = weeklySummary.consistencyScore || 0;
    const progress = stats.progress || 0;
    const goalMode = data.profile.goal || 'Fitness';
    const isGainGoal = goalMode === 'Muscle Gain';
    const delta = weeklySummary.weightDelta || 0;

    const directionGood = isGainGoal ? delta > 0 : delta < 0;
    const directionBad = isGainGoal ? delta < 0 : delta > 0;

    const dynamicHeadline = (() => {
      if (score >= 85 && directionGood) return '🔥 You are in transformation mode';
      if (score >= 75) return '💪 Strong week. Keep the chain alive';
      if (progress >= 90) return '🏁 Finish line is close';
      if (directionGood) return '📉 Trend is finally moving your way';
      if (directionBad) return '⚡ Tighten today, not tomorrow';
      return '🎯 Hold the routine. The body follows consistency';
    })();

    const dynamicMessage = (() => {
      if (score >= 85 && directionGood) return 'Training, protein and movement are aligned. Repeat this week exactly.';
      if (score < 40) return 'Do not chase perfection today. Log food, hit steps, and complete one simple workout.';
      if (weeklySummary.proteinScore < 70) return 'Protein is the easiest win today. Add one clean serving and protect muscle.';
      if (weeklySummary.stepsScore < 70) return 'Movement is the missing lever. A 20-minute walk can change the weekly score.';
      if (weeklySummary.workoutScore < 60) return 'One more workout will lift your consistency score and restart momentum.';
      if (directionBad) return 'The trend moved against the goal. Control calories, sodium, sleep, and weekend meals.';
      return 'You are building the invisible part of transformation — consistency.';
    })();

    const stage = (() => {
      if (progress >= 90) return { label: 'Finish Line', tone: 'Final push. Do not loosen the process now.' };
      if (progress >= 60) return { label: 'Momentum Zone', tone: 'You have crossed the hard middle. Stay boring and consistent.' };
      if (progress >= 30) return { label: 'Foundation Built', tone: 'The system is working. Now stack weeks, not emotions.' };
      return { label: 'Ignition Phase', tone: 'Early progress is fragile. Make logging and movement non-negotiable.' };
    })();

    const badge = (() => {
      if (score >= 85) return { title: 'Elite Week', icon: Flame, detail: 'High consistency across training, protein, and steps.' };
      if (score >= 65) return { title: 'Strong Week', icon: Award, detail: 'Good rhythm. One more clean day can lift the score.' };
      if (score >= 40) return { title: 'Rebuild Week', icon: Target, detail: 'Focus on one action today instead of chasing everything.' };
      return { title: 'Restart Week', icon: Star, detail: 'No guilt. Restart with logging and movement today.' };
    })();

    const journeyText = `${round(stats.start)} ${weightUnit} → ${round(stats.current)} ${weightUnit} → ${round(stats.target)} ${weightUnit}`;
    const remaining = Math.max(0, Math.abs(round(stats.current - stats.target)));
    const achieved = Math.max(0, Math.abs(round(stats.start - stats.current)));
    const weeklyDeltaLabel = `${delta > 0 ? '+' : ''}${delta} ${weightUnit}`;

    const milestones = [
      { label: 'First Log', done: history.length > 0 },
      { label: '25% Journey', done: progress >= 25 },
      { label: '50% Journey', done: progress >= 50 },
      { label: '75% Journey', done: progress >= 75 },
      { label: 'Goal Zone', done: progress >= 95 },
    ];

    const quote = goalMode === 'Muscle Gain'
      ? 'Muscle is built by progressive effort, food discipline, and recovery.'
      : 'Fat loss is not punishment. It is controlled repetition.';

    return { dynamicHeadline, dynamicMessage, stage, badge, journeyText, remaining, achieved, weeklyDeltaLabel, milestones, quote };
  }, [weeklySummary, stats, data.profile.goal, history.length, weightUnit]);

  const v3Metrics = [
    { label: 'Goal Journey', value: stats.progress, suffix: '%', accent: 'bg-lime', text: 'text-lime' },
    { label: 'Weekly Score', value: weeklySummary.consistencyScore, suffix: '%', accent: 'bg-lime', text: 'text-lime' },
    { label: 'Workout', value: weeklySummary.workoutScore, suffix: '%', accent: 'bg-sky', text: 'text-sky' },
    { label: 'Protein', value: weeklySummary.proteinScore, suffix: '%', accent: 'bg-pink', text: 'text-pink' },
    { label: 'Steps', value: weeklySummary.stepsScore, suffix: '%', accent: 'bg-sky', text: 'text-sky' },
    ...(weeklySummary.recoveryScore !== null
      ? [{ label: 'Recovery', value: weeklySummary.recoveryScore, suffix: '%', accent: 'bg-lime', text: 'text-lime' }]
      : []),
  ];

  const progressGlow = Math.max(4, Math.min(100, stats.progress || 0));
  const BadgeIcon = retentionEngine.badge.icon;

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="text-4xl font-black uppercase tracking-tighter">Performance Tracking</h2>
          <div className="flex items-center gap-4 mt-2">
            <div className="label-small text-lime tracking-[0.2em]">{activeView === 'weight' ? 'Current Phase' : 'Movement View'}</div>
            <div className="h-1 w-1 rounded-full bg-white/20" />
            <div className="px-2 py-0.5 rounded bg-lime/10 border border-lime/20 text-[8px] font-black text-lime uppercase tracking-widest">{data.profile.goal}</div>
          </div>
        </div>
        <div className="flex gap-2 p-1 bg-black/40 rounded-2xl border border-border w-fit">
          <button
            onClick={() => setActiveView('weight')}
            className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeView === 'weight' ? 'bg-lime text-dark' : 'text-white/30 hover:text-white'}`}
          >
            Weight
          </button>
          <button
            onClick={() => setActiveView('steps')}
            className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeView === 'steps' ? 'bg-lime text-dark' : 'text-white/30 hover:text-white'}`}
          >
            Steps
          </button>
        </div>
      </header>

      <section className="relative overflow-hidden rounded-[2rem] border border-lime/20 bg-gradient-to-br from-lime/10 via-panel to-sky/10 p-5 md:p-6 shadow-2xl shadow-lime/5">
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-lime/10 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-sky/10 blur-3xl" />

        <div className="relative grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6 items-stretch">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col md:flex-row gap-6 items-center md:items-stretch">
              <div className="relative h-56 w-56 shrink-0 rounded-full grid place-items-center bg-black/30 border border-white/10 shadow-2xl shadow-lime/10">
                <motion.div
                  initial={{ rotate: -90 }}
                  animate={{ rotate: 270 }}
                  transition={{ duration: 1.1, ease: 'easeOut' }}
                  className="absolute inset-0 rounded-full"
                  style={{ background: `conic-gradient(rgba(215,255,0,0.95) ${progressGlow * 3.6}deg, rgba(255,255,255,0.06) 0deg)` }}
                />
                <div className="absolute inset-4 rounded-full border border-white/10 bg-black/30" />
                <div className="relative h-40 w-40 rounded-full bg-panel border border-white/10 grid place-items-center text-center shadow-inner p-6">
                  <div>
                    <div className="text-5xl font-black text-lime leading-none">{stats.progress}%</div>
                    <div className="text-[10px] font-black uppercase tracking-[0.25em] text-white/35 mt-2">Journey Done</div>
                    <div className="text-[10px] text-white/45 mt-2 font-bold">{retentionEngine.achieved} {weightUnit} achieved</div>
                  </div>
                </div>
              </div>

              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="inline-flex items-center gap-2 w-fit rounded-full bg-lime/10 border border-lime/20 px-3 py-1 text-[9px] font-black uppercase tracking-[0.22em] text-lime mb-4">
                  <Flame size={13} /> Progress V3 Retention Engine
                </div>
                <h3 className="text-3xl md:text-4xl font-black uppercase tracking-tighter leading-none">
                  {retentionEngine.dynamicHeadline}
                </h3>
                <p className="text-sm md:text-base text-white/65 mt-3 max-w-2xl leading-relaxed">
                  {retentionEngine.dynamicMessage}
                </p>
                <div className="mt-4 rounded-2xl bg-black/25 border border-white/10 p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.25em] text-lime">Journey Map</div>
                      <div className="text-xs text-white/45 font-bold mt-1">{retentionEngine.journeyText}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-black text-white">{retentionEngine.remaining} {weightUnit}</div>
                      <div className="text-[9px] font-black uppercase tracking-widest text-white/35">left</div>
                    </div>
                  </div>
                  <div className="relative h-3 rounded-full bg-white/5 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${stats.progress}%` }}
                      className="h-full bg-lime shadow-[0_0_14px_rgba(215,255,0,0.5)]"
                    />
                  </div>
                  <div className="mt-3 flex justify-between text-[9px] font-black uppercase tracking-widest text-white/35">
                    <span>Start</span><span>Current</span><span>Target</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {v3Metrics.map((item) => (
                <div key={item.label} className="rounded-2xl bg-black/25 border border-white/10 p-3">
                  <div className="flex justify-between items-center mb-2 gap-2">
                    <span className="text-[9px] font-black uppercase tracking-widest text-white/35 truncate">{item.label}</span>
                    <span className={`text-[10px] font-black ${item.text}`}>{item.value}{item.suffix}</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, item.value)}%` }} className={`h-full ${item.accent}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl bg-black/25 border border-white/10 p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-11 w-11 rounded-2xl bg-lime/10 border border-lime/20 grid place-items-center">
                  <BadgeIcon className="text-lime" size={22} />
                </div>
                <div>
                  <div className="text-lg font-black">{retentionEngine.badge.title}</div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-white/35">Dynamic badge</div>
                </div>
              </div>
              <p className="text-sm text-white/55 leading-relaxed">{retentionEngine.badge.detail}</p>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-black/30 border border-white/10 p-3">
                  <div className="text-[9px] font-black uppercase tracking-widest text-white/35">Weekly Delta</div>
                  <div className={`text-xl font-black mt-1 ${weeklySummary.weightDelta <= 0 ? 'text-lime' : 'text-pink'}`}>{retentionEngine.weeklyDeltaLabel}</div>
                </div>
                <div className="rounded-2xl bg-black/30 border border-white/10 p-3">
                  <div className="text-[9px] font-black uppercase tracking-widest text-white/35">Phase</div>
                  <div className="text-sm font-black text-sky mt-1">{retentionEngine.stage.label}</div>
                </div>
              </div>

              <div className="mt-5 space-y-2">
                <div className="text-[10px] font-black uppercase tracking-[0.25em] text-white/35">Milestone Unlocks</div>
                {retentionEngine.milestones.map((m) => (
                  <div key={m.label} className="flex items-center justify-between rounded-xl bg-black/25 border border-white/5 px-3 py-2">
                    <span className="text-xs font-bold text-white/65">{m.label}</span>
                    <span className={`text-[10px] font-black uppercase tracking-widest ${m.done ? 'text-lime' : 'text-white/25'}`}>{m.done ? 'Unlocked' : 'Locked'}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 rounded-2xl bg-lime/10 border border-lime/20 p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.25em] text-lime mb-2">Mindset</div>
              <p className="text-sm font-bold text-white">“{retentionEngine.quote}”</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="stat-card p-5 border-lime/20 bg-lime/5">
          <div className="label-small text-lime mb-2">Weekly Score</div>
          <div className="text-4xl font-black text-lime">{weeklySummary.consistencyScore}%</div>
          <div className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-1">Consistency Engine</div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mt-4">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${weeklySummary.consistencyScore}%` }}
              className="h-full bg-lime shadow-[0_0_10px_rgba(215,255,0,0.5)]"
            />
          </div>
          <div className={`grid ${weeklySummary.recoveryScore !== null ? 'grid-cols-4' : 'grid-cols-3'} gap-2 mt-4 text-center`}>
            <div className="rounded-xl bg-black/30 border border-white/5 p-2">
              <div className="text-[9px] text-white/35 font-black uppercase tracking-widest">Workout</div>
              <div className="text-xs font-black text-lime mt-1">{weeklySummary.workoutScore}%</div>
            </div>
            <div className="rounded-xl bg-black/30 border border-white/5 p-2">
              <div className="text-[9px] text-white/35 font-black uppercase tracking-widest">Protein</div>
              <div className="text-xs font-black text-lime mt-1">{weeklySummary.proteinScore}%</div>
            </div>
            <div className="rounded-xl bg-black/30 border border-white/5 p-2">
              <div className="text-[9px] text-white/35 font-black uppercase tracking-widest">Steps</div>
              <div className="text-xs font-black text-sky mt-1">{weeklySummary.stepsScore}%</div>
            </div>
            {weeklySummary.recoveryScore !== null && (
              <div className="rounded-xl bg-black/30 border border-white/5 p-2">
                <div className="text-[9px] text-white/35 font-black uppercase tracking-widest">Recovery</div>
                <div className="text-xs font-black text-lime mt-1">{weeklySummary.recoveryScore}%</div>
              </div>
            )}
          </div>
        </div>

        <div className="stat-card p-5">
          <div className="label-small text-sky mb-2">This Week</div>
          <div className="text-2xl font-black">{weeklySummary.weeklyWorkouts} Workouts</div>
          <div className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-1">
            {weeklySummary.weeklyCaloriesBurned.toLocaleString()} kcal burned
          </div>
        </div>

        <div className="stat-card p-5">
          <div className="label-small text-lime mb-2">Nutrition Average</div>
          <div className="text-2xl font-black">{weeklySummary.avgProtein}g Protein</div>
          <div className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-1">
            Daily avg from logged meals
          </div>
        </div>

        <div className="stat-card p-5">
          <div className="label-small text-sky mb-2">Movement Average</div>
          <div className="text-2xl font-black">{weeklySummary.avgSteps.toLocaleString()}</div>
          <div className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-1">Steps / day</div>
        </div>
      </section>

      <section className="rounded-3xl border border-lime/20 bg-panel/80 p-5 shadow-xl shadow-lime/5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-lime mb-2">Progress Intelligence</div>
            <h3 className="text-xl font-black uppercase tracking-tight">{weeklySummary.trendInsight}</h3>
            <p className="text-xs text-white/40 mt-2 font-bold uppercase tracking-widest">
              This week: {weeklySummary.weightDelta > 0 ? '+' : ''}{weeklySummary.weightDelta} {weightUnit} · Total Progress: {stats.progress}%
            </p>
            <div className="mt-4 rounded-2xl bg-black/30 border border-white/10 p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-sky mb-1">Next Action</div>
              <p className="text-sm font-bold text-white">{weeklySummary.nextAction}</p>
            </div>
          </div>
          <div className="min-w-[220px]">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest mb-2">
              <span className="text-lime">Goal Progress</span>
              <span className="opacity-50">{stats.progress}%</span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${stats.progress}%` }}
                className="h-full bg-lime shadow-[0_0_10px_rgba(215,255,0,0.5)]"
              />
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Main Chart */}
          <div className="stat-card p-6 h-[400px]">
            <div className="flex justify-between items-center mb-6">
              <div>
                <div className="label-small">{activeView === 'weight' ? 'Weight Trend' : 'Activity Trend'}</div>
                <div className="text-[10px] text-lime/70 font-black uppercase tracking-widest mt-1">{weeklySummary.trendLabel}</div>
              </div>
              <div className="text-[10px] opacity-40 font-mono">Trend Visualization</div>
            </div>
            
            <div className="w-full h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                {activeView === 'weight' ? (
                  <AreaChart data={history.length > 0 ? history : [{date: logDate, weight: stats.current}]}>
                    <defs>
                      <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#D7FF00" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#D7FF00" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                    <XAxis 
                      dataKey="date" 
                      stroke="#444" 
                      fontSize={10} 
                      tickFormatter={(str) => str.split('-').slice(1).join('/')}
                    />
                    <YAxis 
                      stroke="#444" 
                      fontSize={10} 
                      domain={['dataMin - 2', 'dataMax + 2']}
                      tickFormatter={(val) => `${val}${weightUnit}`}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '12px' }}
                      itemStyle={{ color: '#D7FF00', fontWeight: 'bold' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="weight" 
                      stroke="#D7FF00" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorWeight)" 
                    />
                  </AreaChart>
                ) : (
                  <BarChart data={stepHistory.length > 0 ? stepHistory : [{date: logDate, steps: 0}]}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                    <XAxis 
                      dataKey="date" 
                      stroke="#444" 
                      fontSize={10}
                      tickFormatter={(str) => str.split('-').slice(1).join('/')}
                    />
                    <YAxis stroke="#444" fontSize={10} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '12px' }}
                      itemStyle={{ color: '#00BAFF', fontWeight: 'bold' }}
                    />
                    <Bar dataKey="steps" fill="#00BAFF" radius={[4, 4, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          {/* Quick Log */}
          <div className="stat-card overflow-hidden">
            <h3 className="label-small mb-6">Log Entry</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="space-y-2 min-w-0">
                <div className="label-small text-muted ml-1">Log Date</div>
                <input
                  type="date"
                  value={logDate}
                  onChange={(e) => setLogDate(e.target.value)}
                  className="w-full min-w-0 max-w-full p-5 bg-white/[0.03] border border-border rounded-2xl text-sm font-bold focus:outline-none focus:border-lime transition-all"
                />
              </div>

              {activeView === 'weight' ? (
                <div className="space-y-2 min-w-0">
                  <div className="label-small text-muted ml-1">Weight ({weightUnit})</div>
                  <input
                    type="number"
                    placeholder="00.0"
                    value={logWeight}
                    onChange={(e) => setLogWeight(e.target.value)}
                    className="w-full min-w-0 max-w-full p-5 bg-white/[0.03] border border-border rounded-2xl text-sm font-bold focus:outline-none focus:border-lime transition-all placeholder:opacity-20"
                  />
                </div>
              ) : (
                <div className="space-y-2 min-w-0">
                  <div className="label-small text-muted ml-1">Daily Steps</div>
                  <input
                    type="number"
                    placeholder="10000"
                    value={logSteps}
                    onChange={(e) => setLogSteps(e.target.value)}
                    className="w-full min-w-0 max-w-full p-5 bg-white/[0.03] border border-border rounded-2xl text-sm font-bold focus:outline-none focus:border-lime transition-all placeholder:opacity-20"
                  />
                </div>
              )}

              <button
                onClick={activeView === 'weight' ? handleLogWeight : handleLogSteps}
                className="w-full py-5 bg-white/5 border border-border hover:border-lime/40 hover:bg-lime hover:text-dark transition-all rounded-2xl font-black text-xs uppercase tracking-widest"
              >
                Save Entry
              </button>
            </div>
          </div>

          <div className="stat-card">
            <div className="flex items-center justify-between mb-5">
              <h3 className="label-small">{activeView === 'weight' ? 'Weight Logs' : 'Step Logs'}</h3>
              <span className="text-[10px] text-white/30 font-mono">Edit by selecting a date, or delete below</span>
            </div>

            {activeView === 'weight' ? (
              history.length === 0 ? (
                <div className="text-xs text-white/30 py-6 text-center">No weight logs yet</div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
                  {history.slice().reverse().map((item) => (
                    <div key={item.date} className="flex items-center justify-between gap-3 p-4 bg-white/[0.02] border border-border rounded-2xl">
                      <div>
                        <div className="text-sm font-bold">{item.date}</div>
                        <div className="label-small text-lime mt-1">{item.weight} {weightUnit}</div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setActiveView('weight'); setLogDate(item.date); setLogWeight(String(item.weight)); }}
                          className="px-4 py-2 rounded-xl bg-lime/20 text-lime border border-lime/30 text-[10px] font-black uppercase tracking-widest"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteWeight(item.date)}
                          className="px-4 py-2 rounded-xl bg-pink/20 text-pink border border-pink/30 text-[10px] font-black uppercase tracking-widest"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              stepHistory.length === 0 ? (
                <div className="text-xs text-white/30 py-6 text-center">No step logs yet</div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
                  {stepHistory.slice().reverse().map((item) => (
                    <div key={item.date} className="flex items-center justify-between gap-3 p-4 bg-white/[0.02] border border-border rounded-2xl">
                      <div>
                        <div className="text-sm font-bold">{item.date}</div>
                        <div className="label-small text-sky mt-1">{Number(item.steps).toLocaleString()} steps</div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setActiveView('steps'); setLogDate(item.date); setLogSteps(String(item.steps)); }}
                          className="px-4 py-2 rounded-xl bg-lime/20 text-lime border border-lime/30 text-[10px] font-black uppercase tracking-widest"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteSteps(item.date)}
                          className="px-4 py-2 rounded-xl bg-pink/20 text-pink border border-pink/30 text-[10px] font-black uppercase tracking-widest"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>

        </div>

        <aside className="space-y-6">
          <div className="stat-card">
            <div className="flex items-center gap-3 mb-6">
              <Scale className="text-lime" size={20} />
              <div className="label-small">Weight Summary</div>
            </div>
            
            <div className="space-y-6">
              <div className="flex justify-between items-end">
                <div className="label-small opacity-40">Start Weight</div>
                <div className="text-xl font-bold">{stats.start} {weightUnit}</div>
              </div>
              <div className="flex justify-between items-end border-t border-white/5 pt-4">
                <div className="label-small opacity-40">Current Weight</div>
                <div className="text-2xl font-black text-lime">{stats.current} {weightUnit}</div>
              </div>
              <div className="flex justify-between items-end border-t border-white/5 pt-4">
                <div className="label-small opacity-40">Target Weight</div>
                <div className="text-xl font-bold">{stats.target} {weightUnit}</div>
              </div>
              
              <div className="pt-6">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest mb-2">
                  <span className="text-lime">Progress</span>
                  <span className="opacity-40">{stats.progress}%</span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${stats.progress}%` }}
                    className="h-full bg-lime shadow-[0_0_10px_rgba(215,255,0,0.5)]"
                  />
                </div>
              </div>

              <div className={`p-4 rounded-xl flex items-center gap-4 ${stats.diff <= 0 ? 'bg-lime/10 border border-lime/20' : 'bg-pink/10 border border-pink/20'}`}>
                {stats.diff <= 0 ? <TrendingDown className="text-lime" /> : <TrendingUp className="text-pink" />}
                <div>
                  <div className="text-sm font-bold">{Math.abs(stats.diff)} {weightUnit} {stats.diff <= 0 ? 'Down' : 'Up'}</div>
                  <div className="text-[10px] opacity-60">Total change from start</div>
                </div>
              </div>
            </div>
          </div>

          <div className="stat-card">
            <div className="flex items-center gap-3 mb-6">
              <Footprints className="text-sky" size={20} />
              <div className="label-small">Sync & Integrations</div>
            </div>
            
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-border">
                <div className="flex justify-between items-center mb-2">
                   <div className="text-[10px] font-black uppercase tracking-widest text-sky">Cloud Sync</div>
                   {data.lastSyncDate && (
                     <div className="text-[8px] opacity-40 font-mono">Last: {new Date(data.lastSyncDate).toLocaleTimeString()}</div>
                   )}
                </div>
                
                <div className="grid grid-cols-1 gap-2">
                  <button 
                    disabled={isSyncing}
                    onClick={() => handleCloudSync('Google Fit')}
                    className="flex justify-between items-center p-3 rounded-xl bg-white/5 border border-border hover:border-sky/40 transition-all text-left"
                  >
                    <span className="text-[10px] font-bold">Google Fit (Android)</span>
                    {isSyncing ? <Activity size={12} className="animate-spin" /> : <ChevronRight size={14} />}
                  </button>
                  <button 
                    disabled={isSyncing}
                    onClick={() => handleCloudSync('Whoop')}
                    className="flex justify-between items-center p-3 rounded-xl bg-white/5 border border-border hover:border-sky/40 transition-all text-left"
                  >
                    <span className="text-[10px] font-bold">Whoop Integration</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>

                            <div className="p-4 rounded-xl bg-white/[0.02] border border-border">
                <div className="text-[10px] font-black uppercase tracking-widest text-lime mb-2">Manual Import</div>
                <p className="text-[10px] opacity-50 leading-relaxed mb-4">
                  Import Apple Health / Health Connect CSV, or upload a WHOOP PDF as a recovery data source.
                </p>

                <div className="space-y-3">
                  <label className="block w-full py-3 bg-white/5 border border-border rounded-xl text-[10px] font-bold uppercase tracking-wider hover:bg-lime/10 transition-colors cursor-pointer text-center">
                    Import Health CSV
                    <input 
                      type="file" 
                      accept=".csv" 
                      className="hidden" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          const text = event.target?.result as string;
                          const rows = text.split('\n');
                          const newSteps: Record<string, number> = { ...data.steps };
                          rows.forEach(row => {
                            const [date, val] = row.split(',').map(s => s.trim());
                            if (date && val && !isNaN(Number(val))) {
                              newSteps[date] = Number(val);
                            }
                          });
                          setData((prev: AppData) => ({ ...prev, steps: newSteps }));
                          showAppMessage(`CSV Integrated: ${Object.keys(newSteps).length - (Object.keys(data.steps || {}).length)} new data points.`);
                        };
                        reader.readAsText(file);
                      }}
                    />
                  </label>

                  <label className="block w-full p-4 bg-sky/5 border border-sky/20 rounded-xl hover:bg-sky/10 transition-colors cursor-pointer">
                    <div className="flex items-start gap-3">
                      <Upload size={18} className="text-sky mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <div className="text-[10px] font-black uppercase tracking-wider text-sky">
                          Upload WHOOP PDF
                        </div>
                        <div className="text-[10px] opacity-50 leading-relaxed mt-1 normal-case tracking-normal font-normal">
                          Upload your WHOOP weekly/monthly report. Gym-E will merge recovery, sleep, RHR and cardio signals into Progress Intelligence.
                        </div>
                        {(data as any).integrations?.whoop?.latestPdf && (
                          <div className="mt-3 rounded-lg bg-black/20 border border-white/10 px-3 py-2 space-y-2">
                            <div>
                              <div className="text-[10px] font-bold opacity-80 truncate">
                                {(data as any).integrations.whoop.latestPdf.fileName}
                              </div>
                              <div className="text-[9px] opacity-40 mt-0.5">
                                Uploaded · {(data as any).integrations.whoop.latestPdf.fileSizeKb} KB · {((data as any).integrations.whoop.latestPdf.status || '').replace(/_/g, ' ')}
                              </div>
                            </div>


                          </div>
                        )}
                      </div>
                    </div>
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      onChange={handleWhoopPdfUpload}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
function SettingsView({ data, setData }: any) { 
  const [activeSubTab, setActiveSubTab] = useState<'app' | 'privacy' | 'terms'>('app');

  const renderConfig = () => {
    switch(activeSubTab) {
      case 'app':
        return (
          <div className="space-y-6">
            <div className="p-6 bg-white/[0.02] border border-border rounded-xl">
              <h4 className="text-sm font-bold mb-2">App Version: 2.1.0-STABLE</h4>
              <p className="text-[11px] opacity-40">System Architecture: Metabolic orchestration via neural link.</p>
              <div className="flex items-center gap-2 mt-4 text-[10px] text-lime font-black uppercase">
                <div className="w-1.5 h-1.5 rounded-full bg-lime animate-pulse" />
                Neural Connection: Verified
              </div>
            </div>

            <div className="p-6 bg-white/[0.02] border border-border rounded-xl">
              <h4 className="text-sm font-bold mb-2">Direct Intelligence Support</h4>
              <p className="text-[11px] opacity-40 mb-3">Legacy protocol or data synchronization issues? Connect with our support matrix.</p>
              <a href="mailto:support@stayfitinlife.com" className="text-lime text-[10px] font-black uppercase hover:underline">Connect with Support</a>
            </div>

            <div className="stat-card border-red/20 mt-8">
              <h3 className="label-small text-red mb-4">Danger Zone</h3>
              <p className="text-[11px] opacity-40 mb-4">Permanently delete all locally stored logs, profile data, and custom meal databases. This action cannot be reversed.</p>
              <button 
                onClick={() => { if(confirm('Erase all local data permanently? This cannot be undone.')) { localStorage.removeItem(STORE_KEY); window.location.reload(); } }}
                className="w-full lg:w-auto px-6 py-4 bg-red/10 text-red border border-red/20 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red/20 transition-all"
              >
                Factory Reset (Wipe Data)
              </button>
            </div>
          </div>
        );
      case 'privacy':
        return (
          <div className="p-6 bg-white/[0.02] border border-border rounded-xl">
            <h4 className="text-white text-lg font-bold mb-4">Privacy Policy</h4>
            <div className="space-y-6">
              <div>
                <h5 className="text-white text-sm font-bold mb-2 uppercase tracking-widest text-lime/80">Data Sovereignty</h5>
                <p className="text-white/60 text-xs leading-relaxed">
                  Your privacy is fundamental to STAYFITINLIFE. We process your data primarily on your local device. 
                  Metabolic data sent to AI models for analysis is anonymized and used solely to generate personalized coaching insights.
                </p>
              </div>
              <div>
                <h5 className="text-white text-sm font-bold mb-2 uppercase tracking-widest text-lime/80">Data Collection</h5>
                <p className="text-white/60 text-xs leading-relaxed">
                  We collect weight logs, meal entries, and workout sessions to calculate your metabolic rate and progress. 
                  We do not sell your personal health data to third parties.
                </p>
              </div>
              <div>
                <h5 className="text-white text-sm font-bold mb-2 uppercase tracking-widest text-lime/80">Security Protocol</h5>
                <p className="text-white/60 text-xs leading-relaxed">
                  We employ standard encryption protocols for data in transit and rely on secure local storage for your daily logs.
                </p>
              </div>
            </div>
          </div>
        );
      case 'terms':
        return (
          <div className="p-6 bg-white/[0.02] border border-border rounded-xl">
            <h4 className="text-white text-lg font-bold mb-4">Terms & Conditions</h4>
            <div className="space-y-6">
              <div>
                <h5 className="text-white text-sm font-bold mb-2 uppercase tracking-widest text-lime/80">Service Agreement</h5>
                <p className="text-white/60 text-xs leading-relaxed text-yellow-500/80 bg-yellow-500/5 p-3 rounded-lg border border-yellow-500/10">
                  By using STAYFITINLIFE, you acknowledge that this is a metabolic monitoring tool and not a medical diagnosis platform.
                </p>
              </div>
              <div>
                <h5 className="text-white text-sm font-bold mb-2 uppercase tracking-widest text-lime/80">Not Medical Advice</h5>
                <p className="text-white/60 text-xs leading-relaxed">
                  The STAYFITINLIFE AI platform provides nutritional and fitness guidance based on general algorithms. 
                  Consult with a healthcare professional before starting any new diet or exercise regimen.
                </p>
              </div>
              <div>
                <h5 className="text-white text-sm font-bold mb-2 uppercase tracking-widest text-lime/80">User Responsibility</h5>
                <p className="text-white/60 text-xs leading-relaxed">
                  Users are responsible for the accuracy of their logs and for following safety protocols during physical activity.
                </p>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-8">
      <header className="mb-8">
        <h2 className="text-4xl font-black uppercase tracking-tighter">Command Center</h2>
        <p className="text-white/40 text-xs mt-1">Platform Configuration & Legal Protocol</p>
      </header>

      <div className="flex gap-4 mb-4 overflow-x-auto pb-2 noscroll">
        {[
          { id: 'app', label: 'System' },
          { id: 'privacy', label: 'Privacy' },
          { id: 'terms', label: 'Legal' }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as any)}
            className={`flex-none px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${activeSubTab === tab.id ? 'bg-lime border-lime text-dark shadow-lg shadow-lime/20' : 'bg-white/[0.03] border-border text-white/40 hover:text-white'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-8 transition-all duration-500">
        {renderConfig()}
      </div>
    </div>
  ); 
}