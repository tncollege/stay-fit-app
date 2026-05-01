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
