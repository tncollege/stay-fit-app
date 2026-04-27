import React, { useState, useEffect, useMemo } from 'react';
import Auth from './components/Auth';
import { getSession, signOut } from './services/authService';
import { supabase } from './services/supabaseClient';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Home, Utensils, Dumbbell, Brain, User, Heart, BarChart as ChartIcon, Settings, 
  Menu, X, Plus, Activity, Droplets, Camera, Trash2, Download, Upload, 
  ChevronRight, Calendar, Info, TrendingDown, TrendingUp, Scale, Footprints
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
import { loadCloudData, saveProfile, saveWeight, saveSteps, deleteWeightFromCloud, deleteStepsFromCloud, saveWaterTotal, syncLocalDataToCloud, hasMeaningfulLocalData, hasMeaningfulCloudData } from './services/cloudDataService';
import { FOOD_DATABASE, EXERCISE_DATABASE } from './data/database';

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

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      const session = await getSession();
      if (!mounted) return;
      setLoggedIn(Boolean(session));
      setCheckingAuth(false);
    }

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setLoggedIn(Boolean(session));
      setCheckingAuth(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!loggedIn) return;

    let cancelled = false;

    async function loadFromCloudAndSyncLocalOnce() {
      setCloudLoading(true);
      try {
        const localSnapshot = data;
        let cloud = await loadCloudData();

        if (cancelled) return;

        const cloudHasData = hasMeaningfulCloudData(cloud);
        const localHasData = hasMeaningfulLocalData(localSnapshot);
        const alreadySynced = localStorage.getItem('stayfitinlife_cloud_synced') === 'v3';

        // First desktop/device migration:
        // One-time desktop/device migration. We sync when this browser has local data
        // and has not completed the current cloud sync version yet. Upserts prevent duplicates.
        if (localHasData && !alreadySynced) {
          await syncLocalDataToCloud(localSnapshot);
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
          meals: (cloud.meals as any) || {},
          workouts: (cloud.workouts as any) || {},
          weights: (cloud.weights as any) || [],
          steps: (cloud.steps as any) || {},
          water: (cloud.water as any) || {},
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
    const intervalId = window.setInterval(refreshCloudData, 15000);

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
      case 'home': return <Dashboard data={data} setData={setData} setActiveTab={setActiveTab} viewDate={viewDate} setViewDate={setViewDate} />;
      case 'nutrition': return <Nutrition data={data} setData={setData} viewDate={viewDate} setViewDate={setViewDate} />;
      case 'workout': return <WorkoutView data={data} setData={setData} viewDate={viewDate} setViewDate={setViewDate} />;
      case 'coach': return <Coach data={data} setData={setData} />;
      case 'profile': return <ProfileView data={data} setData={setData} />;
      case 'progress': return <Progress data={data} setData={setData} setActiveTab={setActiveTab} viewDate={viewDate} setViewDate={setViewDate} />;
      case 'settings': return <SettingsView data={data} setData={setData} />;
      default: return <Dashboard data={data} setData={setData} setActiveTab={setActiveTab} viewDate={viewDate} setViewDate={setViewDate} />;
    }
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-dark text-white">
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
function Dashboard({ data, setData, setActiveTab, viewDate, setViewDate }: { data: AppData, setData: any, setActiveTab: (t: string) => void, viewDate: string, setViewDate: (d: string) => void }) {
  const today = viewDate;
  const profile = data.profile;
  const mealsArr = data.meals[today] || [];
  const waterArr = data.water[today] || [];
  const workoutArr = data.workouts[today] || [];
  const stepsToday = data.steps?.[today] || 0;
  const stepGoal = data.profile.stepGoal || 10000;
  const stepProgress = Math.min(100, Math.round((stepsToday / stepGoal) * 100));

  const [aiInsight, setAiInsight] = useState('');
  const [insightLoading, setInsightLoading] = useState(false);

  const targets = useMemo(() => {
    const w = profile.currentWeight || 70;
    let baseCalories = w * 30;
    if (profile.goal === 'Fat Loss') baseCalories -= 500;
    if (profile.goal === 'Muscle Gain') baseCalories += 300;
    if (profile.goal === 'Body Recomposition') baseCalories += 0; // Maintenance
    return {
      calories: Math.round(baseCalories),
      protein: Math.round(w * 2),
      carbs: Math.round(baseCalories * 0.4 / 4),
      fats: Math.round(baseCalories * 0.3 / 9),
      water: 3.5,
    };
  }, [profile]);

  const consumed = useMemo(() => {
    return mealsArr.reduce((acc, m) => ({
      calories: acc.calories + m.calories,
      protein: acc.protein + m.protein,
      carbs: acc.carbs + m.carbs,
      fats: acc.fats + m.fats,
    }), { calories: 0, protein: 0, carbs: 0, fats: 0 });
  }, [mealsArr]);

  const burned = useMemo(() => {
    return workoutArr.reduce((acc, w) => acc + (w.caloriesBurned || 0), 0);
  }, [workoutArr]);

  const dynamicTargets = useMemo(() => {
    // Add burned calories to the goal
    const totalCal = targets.calories + burned;
    const protein = targets.protein; // Protein remains BW-dependent
    // Re-calculate carbs and fats to fill the new calorie goal
    // We keep fixed protein, so carbs/fats share the rest. 
    // Simplified: just scale with ratios but respecting protein floor.
    const remainingCals = totalCal - (protein * 4);
    const carbs = Math.round((remainingCals * 0.6) / 4);
    const fats = Math.round((remainingCals * 0.4) / 9);
    const water = targets.water + (burned / 500) * 0.5;

    return { calories: totalCal, protein, carbs, fats, water };
  }, [targets, burned]);

  const waterTotal = waterArr.reduce((acc, w) => acc + w.amount, 0) / 1000;
  const handleDashboardWater = async (amountMl: number) => {
    const time = Date.now();
    const currentTotal = (data.water[today] || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const newTotal = currentTotal + amountMl;

    setData((prev: AppData) => ({
      ...prev,
      water: {
        ...prev.water,
        [today]: [{ amount: newTotal, time }]
      }
    }));

    try {
      await saveWaterTotal(today, newTotal, time);
      console.log('Dashboard water saved to Supabase ✅');
    } catch (err) {
      console.error('Dashboard water save error ❌', err);
    }
  };

  const netCalories = consumed.calories - burned;
  const remaining = targets.calories - netCalories;
  const progressPct = Math.min(100, Math.round((consumed.calories / dynamicTargets.calories) * 100));

  const fetchInsight = async () => {
    setInsightLoading(true);
    const insight = await generateDailyInsight({
      profile,
      consumed,
      targets: dynamicTargets,
      workouts: workoutArr,
      waterTotal
    });
    setAiInsight(insight);
    setInsightLoading(false);
  };

  useEffect(() => {
    if (!aiInsight) {
      fetchInsight();
    }
  }, []);

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

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
      <div className="xl:col-span-2 space-y-8">
        {/* Calories Ring - Interactive Progress */}
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
              <div className="text-[10px] font-black text-lime uppercase mt-1 tracking-widest">{profile.goal} Phase</div>
            </div>
            <div className="text-right">
              <div className="text-lime text-[10px] font-black uppercase tracking-tighter">{progressPct}% Complete</div>
              <div className="label-small opacity-20 text-[8px]">Daily Protocol</div>
            </div>
          </div>

          <div className="relative w-72 h-72 flex items-center justify-center">
            {/* SVG Ring for better control and animation */}
            <svg className="absolute inset-0 w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
              {/* Background Path */}
              <circle
                cx="50"
                cy="50"
                r="44"
                stroke="currentColor"
                strokeWidth="6"
                fill="transparent"
                className="text-white/[0.03]"
              />
              {/* Progress Path */}
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
            
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center z-10"
            >
              <div className="text-7xl font-black tracking-tighter leading-none mb-1 drop-shadow-2xl">
                {remaining > 0 ? remaining.toLocaleString() : "Goal"}
              </div>
              <div className={`label-small uppercase tracking-[0.2em] ${remaining > 0 ? 'text-lime' : 'text-pink'}`}>
                {remaining > 0 ? 'Remaining' : 'Over Limit'}
              </div>
            </motion.div>
          </div>

          <div className="grid grid-cols-3 gap-8 mt-12 w-full max-w-md pt-8 border-t border-white/5">
            <div className="text-center">
              <div className="text-xl font-bold">{targets.calories.toLocaleString()}</div>
              <div className="label-small opacity-30 mt-1">Goal</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-pink">-{Math.round(consumed.calories).toLocaleString()}</div>
              <div className="label-small opacity-30 mt-1">Food</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-sky">+{Math.round(burned).toLocaleString()}</div>
              <div className="label-small opacity-30 mt-1">Exercise</div>
            </div>
          </div>
        </div>

        {/* AI Insight Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="ai-coach-card relative overflow-hidden group"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="ai-tag">GYM-E • ADVISOR</div>
            <button 
              onClick={fetchInsight}
              disabled={insightLoading}
              className="p-2 bg-white/5 rounded-lg text-white/40 hover:text-lime hover:bg-lime/10 transition-all opacity-0 group-hover:opacity-100"
            >
              <Activity size={14} className={insightLoading ? 'animate-spin' : ''} />
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
                "{aiInsight || "Calibrating systems... Log more data to unlock deeper bio-insights."}"
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
      </div>

      {/* Side Routine Panel */}
      <aside className="space-y-6">
        <div className="label-small px-2 text-sky flex justify-between items-center">
          <span>Active Energy</span>
          <span className="text-white/40">{stepsToday.toLocaleString()} / {stepGoal.toLocaleString()} Steps</span>
        </div>
        <div className="stat-card p-6 flex items-center gap-6 group hover:border-sky/40 transition-all cursor-pointer" onClick={() => setActiveTab('progress')}>
           <div className="relative w-16 h-16 flex items-center justify-center flex-shrink-0">
             <svg className="absolute inset-0 w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="44" stroke="currentColor" strokeWidth="10" fill="transparent" className="text-white/[0.03]" />
                <motion.circle
                  cx="50" cy="50" r="44" stroke="currentColor" strokeWidth="10" fill="transparent"
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
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${stepProgress}%` }}
                  className="h-full bg-sky"
                />
             </div>
             <div className="flex justify-between mt-1">
                <span className="text-[10px] font-bold text-sky opacity-80">{stepProgress}%</span>
                <span className="text-[10px] opacity-40 font-mono italic text-right">Goal: {(stepGoal / 1000).toFixed(0)}k</span>
             </div>
           </div>
        </div>

        <div className="label-small px-2 text-sky flex justify-between items-center">
          <span>Hydration Status</span>
          <span className="text-white/40">{waterTotal.toFixed(1)}L / {dynamicTargets.water.toFixed(1)}L</span>
        </div>
        <div className="stat-card space-y-4">
           <MacroColumn label="Water Intake" current={waterTotal} target={dynamicTargets.water} unit="L" color="sky" />
           <div className="grid grid-cols-3 gap-2">
             {[250, 500, 750].map((amt) => (
               <button
                 key={amt}
                 onClick={() => handleDashboardWater(amt)}
                 className="py-3 rounded-xl bg-sky/10 border border-sky/20 text-sky text-[10px] font-black uppercase tracking-widest hover:bg-sky/20 transition-all active:scale-95"
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
                  <div className="label-small opacity-50">{w.category} • {w.caloriesBurned} kcal</div>
                </div>
              </div>
            ))
          ) : (
            <div className="bg-panel border border-border border-dashed rounded-2xl p-8 text-center">
              <div className="label-small mb-2">No activity logged</div>
              <p className="text-[10px] opacity-40">Ready to sync your training session?</p>
            </div>
          )}
        </div>

        <button className="w-full bg-lime text-dark py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-lime/20 hover:scale-[1.02] active:scale-95 transition-all">
          Start Training Session
        </button>

        <div className="p-5 border border-border border-dashed rounded-2xl text-center bg-white/[0.02]">
           <div className="label-small text-lime mb-2">Gym-E Tip</div>
           <p className="text-[11px] leading-relaxed opacity-60">"Your recovery is currently {round(82)}%. Maintain moderate intensity for today's session."</p>
        </div>
      </aside>
    </div>
  </div>
);
}

function MacroColumn({ label, current, target, unit = 'g', color }: any) {
  const pct = Math.min(100, Math.round((current / target) * 100));
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-end">
        <div>
          <div className="label-small opacity-30 leading-none mb-1">{label}</div>
          <div className={`text-xl font-black text-${color}`}>
            {round(current)}
            <span className="text-[10px] ml-1 opacity-40 font-normal tracking-tighter">/ {round(target)}{unit}</span>
          </div>
        </div>
        <div className="text-[10px] font-bold opacity-30 mb-0.5">{pct}%</div>
      </div>
      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          className={`h-full bg-${color} shadow-[0_0_8px_rgba(255,255,255,0.1)]`}
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
                    onClick={() => setTemp({ ...temp, unitsSystem: u })}
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
                    type="number" 
                    value={isMetric ? temp.currentWeight : kgToLb(temp.currentWeight)} 
                    onChange={e => {
                      const val = Number(e.target.value);
                      setTemp({...temp, currentWeight: isMetric ? val : lbToKg(val)});
                    }} 
                  />
                </Field>
                <Field label={`Target Weight (${isMetric ? 'kg' : 'lbs'})`}>
                  <input 
                    type="number" 
                    value={isMetric ? temp.targetWeight : kgToLb(temp.targetWeight)} 
                    onChange={e => {
                      const val = Number(e.target.value);
                      setTemp({...temp, targetWeight: isMetric ? val : lbToKg(val)});
                    }} 
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
function Progress({ data, setData, setActiveTab, viewDate, setViewDate }: { data: AppData, setData: any, setActiveTab: (t: string) => void, viewDate: string, setViewDate: (d: string) => void }) { 
  const [logWeight, setLogWeight] = useState('');
  const [logSteps, setLogSteps] = useState('');
  const [logDate, setLogDate] = useState(viewDate);
  const [activeView, setActiveView] = useState<'weight' | 'steps'>('weight');
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    setLogDate(viewDate);
  }, [viewDate]);

  const history = useMemo(() => {
    return [...data.weights].sort((a, b) => a.date.localeCompare(b.date));
  }, [data.weights]);

  const stepHistory = useMemo(() => {
    return Object.entries(data.steps || {})
      .map(([date, val]) => ({ date, steps: val }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [data.steps]);

  const stats = useMemo(() => {
    const start = data.profile.startWeight || data.profile.currentWeight || 0;
    const current = data.weights.length > 0 ? data.weights[data.weights.length - 1].weight : (data.profile.currentWeight || 0);
    const target = data.profile.targetWeight || 0;
    const diff = round(current - start);
    const toGoal = round(current - target);
    const progress = start !== target ? Math.max(0, Math.min(100, Math.round(((start - current) / (start - target)) * 100))) : 0;
    
    return { start, current, target, diff, toGoal, progress };
  }, [data.profile, data.weights]);

  useEffect(() => {
    if (activeView === 'steps') {
      const existingSteps = data.steps?.[logDate];
      setLogSteps(existingSteps !== undefined ? String(existingSteps) : '');
    } else {
      const existingWeight = (data.weights || []).find(w => w.date === logDate)?.weight;
      setLogWeight(existingWeight !== undefined ? String(existingWeight) : '');
    }
  }, [activeView, logDate, data.steps, data.weights]);

  const refreshCloudAfterProgressChange = async () => {
    const cloud = await loadCloudData();
    if (!cloud) return;

    setData((prev: AppData) => ({
      ...prev,
      weights: (cloud.weights as any) || [],
      steps: (cloud.steps as any) || {},
      profile: cloud.profile && Object.keys(cloud.profile).length > 0
        ? { ...prev.profile, ...cloud.profile }
        : prev.profile,
      lastSyncDate: cloud.lastSyncDate || prev.lastSyncDate,
    }));
  };

  const handleLogWeight = async () => {
    const weight = Number(logWeight);
    if (!logWeight.trim() || !Number.isFinite(weight) || weight <= 0) {
      alert('Please enter a valid weight.');
      return;
    }
    
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
      await refreshCloudAfterProgressChange();
      alert('Weight synchronized.');
    } catch (err) {
      console.error('Weight save error ❌', err);
      alert('Weight save failed. Please try again.');
    }
  };

  const handleLogSteps = async () => {
    const steps = Number(logSteps);
    if (!logSteps.trim() || !Number.isFinite(steps) || steps < 0) {
      alert('Please enter valid steps.');
      return;
    }
    
    setData((prev: AppData) => ({
      ...prev,
      steps: { ...prev.steps, [logDate]: steps }
    }));

    try {
      await saveSteps(logDate, steps);
      setViewDate(logDate);
      await refreshCloudAfterProgressChange();
      alert('Steps synchronized. Dashboard Movement Cycle refreshed.');
    } catch (err) {
      console.error('Steps save error ❌', err);
      alert('Steps save failed. Please try again.');
    }
  };

  const handleEditWeight = (date: string, weight: number) => {
    setActiveView('weight');
    setLogDate(date);
    setLogWeight(String(weight));
  };

  const handleDeleteWeight = async (date: string) => {
    if (!confirm('Delete this weight entry?')) return;

    setData((prev: AppData) => ({
      ...prev,
      weights: (prev.weights || []).filter(w => w.date !== date),
    }));

    try {
      await deleteWeightFromCloud(date);
      await refreshCloudAfterProgressChange();
    } catch (err) {
      console.error('Weight delete error ❌', err);
      alert('Weight delete failed. Please try again.');
    }
  };

  const handleEditSteps = (date: string, steps: number) => {
    setActiveView('steps');
    setLogDate(date);
    setLogSteps(String(steps));
  };

  const handleDeleteSteps = async (date: string) => {
    if (!confirm('Delete this steps entry?')) return;

    setData((prev: AppData) => {
      const nextSteps = { ...(prev.steps || {}) };
      delete nextSteps[date];
      return { ...prev, steps: nextSteps };
    });

    try {
      await deleteStepsFromCloud(date);
      await refreshCloudAfterProgressChange();
    } catch (err) {
      console.error('Steps delete error ❌', err);
      alert('Steps delete failed. Please try again.');
    }
  };


  const handleCloudSync = async (source: string) => {
    alert(`${source} direct sync needs a native HealthKit/Health Connect/WHOOP integration. Use manual entry or CSV import for now.`);
  };

  const isMetric = data.profile.unitsSystem === 'metric';
  const weightUnit = isMetric ? 'kg' : 'lbs';

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="text-4xl font-black uppercase tracking-tighter">Performance Tracking</h2>
          <div className="flex items-center gap-4 mt-2">
            <div className="label-small text-lime tracking-[0.2em]">Matrix: {activeView === 'weight' ? 'Gravitational' : 'Kinetic'}</div>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Main Chart */}
          <div className="stat-card p-6 h-[400px]">
            <div className="flex justify-between items-center mb-6">
              <div className="label-small">{activeView === 'weight' ? 'Weight Trend' : 'Activity Trend'}</div>
              <div className="text-[10px] opacity-40 font-mono">Real-time Visualization</div>
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
          <div className="stat-card">
            <h3 className="label-small mb-6">Log Record</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="space-y-2 min-w-0">
                <div className="label-small text-muted ml-1">Protocol Date</div>
                <input
                  type="date"
                  value={logDate}
                  onChange={e => setLogDate(e.target.value)}
                  className="w-full min-w-0 max-w-full p-5 bg-white/[0.03] border border-border rounded-2xl text-sm font-bold focus:outline-none focus:border-lime transition-all appearance-none"
                />
              </div>

              {activeView === 'weight' ? (
                <Field label={`Weight (${weightUnit})`}>
                  <input type="number" placeholder="00.0" value={logWeight} onChange={e => setLogWeight(e.target.value)} />
                </Field>
              ) : (
                <Field label="Daily Steps">
                  <input type="number" placeholder="Enter steps" value={logSteps} onChange={e => setLogSteps(e.target.value)} />
                </Field>
              )}

              <button 
                onClick={activeView === 'weight' ? handleLogWeight : handleLogSteps}
                className="w-full py-5 bg-lime text-dark border border-lime hover:scale-[1.01] active:scale-95 transition-all rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-lime/20"
              >
                {activeView === 'weight' ? 'Save Weight' : 'Save Steps'}
              </button>
            </div>
          </div>

          <div className="stat-card">
            <div className="flex justify-between items-center mb-6">
              <h3 className="label-small">{activeView === 'weight' ? 'Weight History' : 'Steps History'}</h3>
              <div className="text-[10px] text-white/30 font-bold uppercase tracking-widest">Edit or delete entries</div>
            </div>

            {activeView === 'weight' ? (
              history.length === 0 ? (
                <div className="py-10 text-center label-small opacity-20 italic">No weight records yet</div>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto custom-scrollbar">
                  {history.slice().reverse().map(item => (
                    <div key={item.date} className="flex items-center justify-between gap-4 p-4 bg-white/[0.02] border border-border rounded-2xl">
                      <div>
                        <div className="text-sm font-black">{item.weight} {weightUnit}</div>
                        <div className="label-small opacity-40 mt-1">{item.date}</div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleEditWeight(item.date, item.weight)} className="p-2 rounded-lg bg-lime/20 text-lime border border-lime/30 hover:bg-lime hover:text-dark transition-all">
                          <Search size={14} />
                        </button>
                        <button onClick={() => handleDeleteWeight(item.date)} className="p-2 rounded-lg bg-pink/20 text-pink border border-pink/30 hover:bg-pink hover:text-dark transition-all">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              stepHistory.length === 0 ? (
                <div className="py-10 text-center label-small opacity-20 italic">No step records yet</div>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto custom-scrollbar">
                  {stepHistory.slice().reverse().map(item => (
                    <div key={item.date} className="flex items-center justify-between gap-4 p-4 bg-white/[0.02] border border-border rounded-2xl">
                      <div>
                        <div className="text-sm font-black text-sky">{item.steps.toLocaleString()} steps</div>
                        <div className="label-small opacity-40 mt-1">{item.date}</div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleEditSteps(item.date, item.steps)} className="p-2 rounded-lg bg-lime/20 text-lime border border-lime/30 hover:bg-lime hover:text-dark transition-all">
                          <Search size={14} />
                        </button>
                        <button onClick={() => handleDeleteSteps(item.date)} className="p-2 rounded-lg bg-pink/20 text-pink border border-pink/30 hover:bg-pink hover:text-dark transition-all">
                          <Trash2 size={14} />
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
                <div className="label-small opacity-40">Journey Start</div>
                <div className="text-xl font-bold">{stats.start} {weightUnit}</div>
              </div>
              <div className="flex justify-between items-end border-t border-white/5 pt-4">
                <div className="label-small opacity-40">Current State</div>
                <div className="text-2xl font-black text-lime">{stats.current} {weightUnit}</div>
              </div>
              <div className="flex justify-between items-end border-t border-white/5 pt-4">
                <div className="label-small opacity-40">Target Protocol</div>
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
                  <div className="text-[10px] opacity-60">Total variance from baseline</div>
                </div>
              </div>
            </div>
          </div>

          <div className="stat-card">
            <div className="flex items-center gap-3 mb-6">
              <Footprints className="text-sky" size={20} />
              <div className="label-small">Sync Hub</div>
            </div>
            
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-border">
                <div className="flex justify-between items-center mb-2">
                   <div className="text-[10px] font-black uppercase tracking-widest text-sky">Cloud Services</div>
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
                    <span className="text-[10px] font-bold">Whoop Matrix</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white/[0.02] border border-border">
                <div className="text-[10px] font-black uppercase tracking-widest text-lime mb-2">Manual Integration</div>
                <p className="text-[10px] opacity-50 leading-relaxed mb-4">
                  Export Apple Health or Health Connect data to CSV and synchronize manually.
                </p>
                <label className="block w-full py-3 bg-white/5 border border-border rounded-xl text-[10px] font-bold uppercase tracking-wider hover:bg-lime/10 transition-colors cursor-pointer text-center">
                  Import Protocol CSV
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
                        alert(`CSV Integrated: ${Object.keys(newSteps).length - (Object.keys(data.steps || {}).length)} new data points.`);
                      };
                      reader.readAsText(file);
                    }}
                  />
                </label>
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
