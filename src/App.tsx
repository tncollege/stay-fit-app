import React, { useState, useEffect, useMemo } from 'react';
import Auth from './components/Auth';
import { getSession, signOut } from './services/authService';

// keep your existing imports BELOW this line 👇
import { motion, AnimatePresence } from 'motion/react';
import { Home, Utensils, Dumbbell, Brain, User, Settings, Menu } from 'lucide-react';
import Nutrition from './components/Nutrition';
import WorkoutView from './components/Workout';
import Coach from './components/Coach';
import DateNavigator from './components/DateNavigator';
import { AppData } from './lib/types';
import { getTodayKey } from './lib/utils';
import { storageAdapter } from './services/storage';

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
  // 🔐 AUTH STATE
  const [loggedIn, setLoggedIn] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // 📦 APP STATE
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

  // 🔐 CHECK LOGIN
  useEffect(() => {
    getSession().then((session) => {
      setLoggedIn(!!session);
      setCheckingAuth(false);
    });
  }, []);

  // 💾 SAVE DATA
  useEffect(() => {
    storageAdapter.save(data);
  }, [data]);

  const profileComplete = useMemo(() => {
    const p = data.profile;
    return !!(p.name && p.age && p.height && p.currentWeight && p.goal);
  }, [data.profile]);

  // ⏳ LOADING SCREEN
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-lime font-black">Loading...</div>
      </div>
    );
  }

  // 🔐 LOGIN SCREEN
  if (!loggedIn) {
    return <Auth onAuth={() => setLoggedIn(true)} />;
  }

  // 🧾 ONBOARDING
  if (!profileComplete) {
    return <div className="text-white p-10">Complete Profile First</div>;
  }

  // 📱 MAIN APP
  return (
    <div className="flex min-h-screen bg-black text-white">

      {/* Sidebar */}
      <aside className="w-20 hidden lg:flex flex-col items-center py-6 bg-[#111]">
        <button onClick={() => setActiveTab('home')}><Home /></button>
        <button onClick={() => setActiveTab('nutrition')}><Utensils /></button>
        <button onClick={() => setActiveTab('workout')}><Dumbbell /></button>
        <button onClick={() => setActiveTab('coach')}><Brain /></button>
        <button onClick={() => setActiveTab('profile')}><User /></button>
        <button onClick={() => setActiveTab('settings')}><Settings /></button>
      </aside>

      <div className="flex-1">

        {/* TOP BAR */}
        <header className="h-20 flex items-center justify-between px-6 border-b border-gray-800">
          <h1 className="text-xl font-bold text-lime">STAYFITINLIFE</h1>

          <button
            onClick={async () => {
              await signOut();
              setLoggedIn(false);
            }}
            className="px-4 py-2 border border-gray-600 rounded text-sm"
          >
            Logout
          </button>
        </header>

        {/* CONTENT */}
        <main className="p-6">
          {activeTab === 'home' && <div>Dashboard</div>}
          {activeTab === 'nutrition' && <Nutrition data={data} setData={setData} />}
          {activeTab === 'workout' && <WorkoutView data={data} setData={setData} />}
          {activeTab === 'coach' && <Coach data={data} setData={setData} />}
          {activeTab === 'profile' && <div>Profile</div>}
          {activeTab === 'settings' && <div>Settings</div>}
        </main>

      </div>
    </div>
  );
}