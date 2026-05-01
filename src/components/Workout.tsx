import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Brain,
  CheckCircle2,
  Dumbbell,
  Pause,
  Play,
  PlusCircle,
  RotateCcw,
  Edit,
  Search,
  Sparkles,
  Timer,
  Trash2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { AppData, Workout } from '../lib/types';
import { EXERCISE_DATABASE } from '../data/database';
import { calculateRecoveryTime, searchExerciseInfo } from '../services/aiService';
import DateNavigator from './DateNavigator';
import {
  deleteWorkoutFromCloud,
  deleteWorkoutPlan,
  loadWorkoutPlans,
  saveCustomExercise,
  saveWorkout,
  saveWorkoutPlan,
} from '../services/cloudDataService';

const FORM_TIPS: Record<string, any> = {
  'lat pulldown': {
    cues: [
      'Pull elbows down, not hands',
      'Keep chest up and slight lean back',
      'Full stretch at top',
    ],
    mistakes: [
      'Leaning too far back',
      'Using momentum',
      'Partial reps',
    ],
    pro: 'Pause 1 second at bottom for better activation',
  },

  'deadlift': {
    cues: [
      'Keep bar close to body',
      'Neutral spine throughout',
      'Push through heels',
    ],
    mistakes: [
      'Rounding lower back',
      'Jerking the bar',
      'Overextending at top',
    ],
    pro: 'Think “push floor away” instead of pulling bar',
  },

  'barbell curl': {
    cues: [
      'Keep elbows fixed',
      'Full stretch at bottom',
      'Controlled tempo',
    ],
    mistakes: [
      'Swinging body',
      'Using shoulders',
      'Half reps',
    ],
    pro: 'Slow eccentric = better growth',
  },
};

type Tab = 'strength' | 'cardio' | 'sports' | 'yoga';

type TrainingMode = 'Auto' | 'Push' | 'Pull' | 'Legs' | 'Upper' | 'Lower' | 'Recovery';

const TRAINING_MODES: TrainingMode[] = ['Auto', 'Push', 'Pull', 'Legs', 'Upper', 'Lower', 'Recovery'];

const WORKOUT_WINDOW_MAP: Record<string, { label: string; estimatedStart: string }> = {
  morning: { label: 'Morning', estimatedStart: '07:00' },
  afternoon: { label: 'Afternoon', estimatedStart: '14:00' },
  evening: { label: 'Evening', estimatedStart: '18:00' },
};

const CATEGORY_IMAGES: Record<string, string> = {
  Chest: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=600&auto=format&fit=crop',
  Back: 'https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?q=80&w=600&auto=format&fit=crop',
  Legs: 'https://images.unsplash.com/photo-1434608519344-49d77a699e1d?q=80&w=600&auto=format&fit=crop',
  Shoulders: 'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?q=80&w=600&auto=format&fit=crop',
  Arms: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?q=80&w=600&auto=format&fit=crop',
  Core: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?q=80&w=600&auto=format&fit=crop',
  Cardio: 'https://images.unsplash.com/photo-1538805060514-97d9cc17730c?q=80&w=600&auto=format&fit=crop',
  Sports: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?q=80&w=600&auto=format&fit=crop',
  Yoga: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?q=80&w=600&auto=format&fit=crop',
};

const BODY_PARTS = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'];

const RPE_LABELS: Record<string, string> = {
  '6': 'Easy',
  '7': 'Moderate',
  '8': 'Hard',
  '9': 'Very Hard',
  '10': 'Max',
};

function safeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function showWorkoutMessage(message: string, tone: 'success' | 'error' = 'success') {
  if (typeof document === 'undefined') return;

  const existing = document.getElementById('stayfitinlife-workout-toast');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'stayfitinlife-workout-toast';
  el.textContent = message;
  el.className = `fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] px-5 py-3 rounded-2xl text-dark text-xs font-black uppercase tracking-widest shadow-2xl border max-w-[90vw] text-center ${
    tone === 'error'
      ? 'bg-pink border-pink/40 shadow-pink/20'
      : 'bg-lime border-lime/30 shadow-lime/20'
  }`;
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 2600);
}

function normalizeExerciseName(value: string) {
  return String(value || '').replace(/\s*protocol$/i, '').trim();
}

function toExerciseTitle(value: string) {
  return normalizeExerciseName(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type WorkoutSet = {
  weight: number;
  reps: number;
  rpe?: number;
  muscle?: string;
  id?: string | number;
  exercise?: string;
  timestamp?: number;
};
function getSetVolume(set: WorkoutSet) {
  const weight = Number(set?.weight || 0);
  const reps = Number(set?.reps || 0);
  return weight * reps;
}
function getNextTarget(lastSet: WorkoutSet | null) {
  if (!lastSet) return null;

  const weight = Number(lastSet.weight || 0);
  const reps = Number(lastSet.reps || 0);
  const rpe = Number(lastSet?.rpe ?? 7);

  if (rpe <= 6) {
    return {
      text: `Increase weight to ${weight + 5} kg`,
      type: 'weight',
    };
  }

  if (rpe <= 8) {
    return {
      text: `Increase weight to ${weight + 2.5} kg`,
      type: 'weight',
    };
  }

  if (rpe === 9) {
    return {
      text: `Increase reps to ${reps + 1}`,
      type: 'reps',
    };
  }

  return {
    text: `Repeat same weight to stabilize`,
    type: 'repeat',
  };
}
function getWorkoutTotalVolume(sets: WorkoutSet[] = []) {
  return sets.reduce((total, set) => total + getSetVolume(set), 0);
}

function getPlanTrainingMode(plan: any): TrainingMode | null {
  if (!plan) return null;

  const planName = String(plan.planName || '').toLowerCase();
  const exerciseText = (plan.exercises || [])
    .flatMap((exercise: any) => [exercise?.name, exercise?.bodyPart])
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const planText = `${planName} ${exerciseText}`.trim();

  if (!planText) return null;

  // CRITICAL: respect the actual daily plan name first.
  // Example: "Legs + Core" contains "Leg Curl" in exercises, but it must never become Pull.
  if (/recovery|mobility|stretch|yoga|walk/.test(planName)) return 'Recovery';
  if (/leg|lower|quad|hamstring|glute|calf|squat|lunge|core/.test(planName)) return 'Legs';
  if (/push|chest|tricep|shoulder|bench|press/.test(planName)) return 'Push';
  if (/pull|back|bicep|row|pulldown|pullup|chinup|deadlift/.test(planName)) return 'Pull';
  if (/upper/.test(planName)) return 'Upper';
  if (/lower/.test(planName)) return 'Lower';

  // Then infer from exercises. Legs are checked before Pull because "Leg Curl" is a leg exercise.
  if (/recovery|mobility|stretch|yoga|walk/.test(planText)) return 'Recovery';
  if (/leg|lower|quad|hamstring|glute|calf|squat|lunge|leg press|leg curl|leg extension|free squat|core|crunch|leg raise/.test(planText)) return 'Legs';
  if (/push|chest|tricep|shoulder|bench|press|dip|fly|raise/.test(planText)) return 'Push';
  if (/pull|back|bicep|row|pulldown|pullup|chinup|deadlift|barbell curl|dumbbell curl|hammer curl/.test(planText)) return 'Pull';
  if (/upper/.test(planText)) return 'Upper';
  if (/lower/.test(planText)) return 'Lower';

  return null;
}

function getRecommendedTrainingMode(
  score: number,
  fatigueStatus: string,
  dayName: string,
  todayPlan?: any
): TrainingMode {
  if (score < 50 || fatigueStatus === 'High Fatigue') return 'Recovery';

  const plannedMode = getPlanTrainingMode(todayPlan);
  if (plannedMode) return plannedMode;

  const day = dayName.toLowerCase();
  if (day.includes('monday')) return 'Push';
  if (day.includes('tuesday')) return 'Pull';
  if (day.includes('wednesday')) return score > 70 ? 'Legs' : 'Upper';
  if (day.includes('thursday')) return score > 65 ? 'Upper' : 'Recovery';
  if (day.includes('friday')) return score > 70 ? 'Legs' : 'Lower';
  if (day.includes('saturday')) return score > 60 ? 'Upper' : 'Recovery';
  return score > 65 ? 'Push' : 'Recovery';
}

function getModePrescription(mode: TrainingMode, score: number, fatigueStatus: string) {
  if (mode === 'Recovery') {
    return {
      title: 'Recovery + Mobility',
      intensity: 'Low',
      volume: '2–3 light circuits',
      reps: '12–20 controlled reps',
      instruction: 'Avoid heavy loading. Use mobility, walking, stretching and light pump work.',
    };
  }

  if (score >= 75 && fatigueStatus === 'Normal Fatigue') {
    return {
      title: `${mode} Performance Session`,
      intensity: 'High',
      volume: '4–5 working sets',
      reps: '6–10 reps on compounds, 10–15 on isolation',
      instruction: 'Push progressive overload. Add load or reps where form is stable.',
    };
  }

  if (score >= 55) {
    return {
      title: `${mode} Hypertrophy Session`,
      intensity: 'Moderate',
      volume: '3–4 working sets',
      reps: '8–12 reps with clean tempo',
      instruction: 'Train with controlled volume. Keep 1–3 reps in reserve and avoid max attempts.',
    };
  }

  return {
    title: `${mode} Light Session`,
    intensity: 'Low',
    volume: '2–3 working sets',
    reps: '10–15 easy reps',
    instruction: 'Keep effort low. Focus on form, blood flow and recovery.',
  };
}

function formatSessionTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function getWorkoutDisplayName(w: any) {
  if (!w) return '';
  const name = String(w.name || '').trim();
  if (w.category && w.category !== 'Strength') return name;

  const muscles: string[] = Array.isArray(w.muscles) ? w.muscles : [];
  const exercises = (w.sets || []).map((s: any) => String(s.exercise || '').toLowerCase());

  const hasBack =
    muscles.includes('Back') ||
    exercises.some((e: string) => e.includes('row') || e.includes('pulldown') || e.includes('pull'));
  const hasBiceps =
    muscles.includes('Arms') ||
    exercises.some((e: string) => e.includes('curl') || e.includes('bicep'));
  const hasChest =
    muscles.includes('Chest') ||
    exercises.some((e: string) => e.includes('bench') || e.includes('chest') || e.includes('fly'));
  const hasShoulders =
    muscles.includes('Shoulders') ||
    exercises.some((e: string) => e.includes('shoulder') || e.includes('raise'));
  const hasTriceps =
    exercises.some((e: string) => e.includes('tricep') || e.includes('pushdown') || e.includes('extension'));
  const hasLegs =
    muscles.includes('Legs') ||
    exercises.some((e: string) => e.includes('squat') || e.includes('leg') || e.includes('lunge'));

  const genericNames = ['Arms Workout', 'Chest Workout', 'Back Workout', 'Legs Workout', 'Shoulders Workout', 'Core Workout'];

  if (name && !genericNames.includes(name)) return name;
  if (hasBack && hasBiceps) return 'Pull Workout';
  if ((hasChest || hasShoulders) && hasTriceps) return 'Push Workout';
  if (hasLegs) return 'Legs Workout';

  return name || 'Strength Workout';
}

function getDynamicCardioMetric(value: string) {
  const ex = value.toLowerCase();
  if (ex.includes('treadmill') || ex.includes('walking')) return 'Incline (%)';
  if (ex.includes('cycling') || ex.includes('bike') || ex.includes('rowing')) return 'Resistance';
  if (ex.includes('stair') || ex.includes('climber')) return 'Floors';
  if (ex.includes('running')) return 'Avg Heart Rate';
  if (ex.includes('hiit')) return 'Intensity (1-10)';
  if (ex.includes('jump rope')) return 'Rounds';
  return '';
}

function shouldShowDistance(value: string) {
  const ex = value.toLowerCase();
  if (!ex) return true;
  if (ex.includes('hiit')) return false;
  if (ex.includes('jump rope')) return false;
  if (ex.includes('stair') || ex.includes('climber')) return false;
  return true;
}

function getCardioCaloriesPerMinute(exercise: string, fatigueStatus?: string) {
  const ex = exercise.toLowerCase();
  let base = 7;

  if (ex.includes('walk')) base = 4;
  if (ex.includes('run') || ex.includes('hiit') || ex.includes('jump')) base = 10;
  if (ex.includes('cycling') || ex.includes('bike') || ex.includes('row')) base = 8;
  if (ex.includes('stair') || ex.includes('climber')) base = 9;
  if (ex.includes('swim')) base = 8;
  if (ex.includes('elliptical')) base = 7;

  if (fatigueStatus === 'High Fatigue') return Math.max(3, base - 2);
  if (fatigueStatus === 'Moderate Fatigue') return Math.max(3, base - 1);
  return base;
}

function getConditioningAdvice(readiness: number, fatigueStatus: string, mode: 'Cardio' | 'Sports' | 'Yoga') {
  if (mode === 'Yoga') {
    if (readiness < 55 || fatigueStatus === 'High Fatigue') return 'Recovery flow: keep it easy, nasal breathing, long holds.';
    if (readiness > 75 && fatigueStatus === 'Normal Fatigue') return 'Performance flow: add mobility, balance and controlled strength holds.';
    return 'Controlled flow: focus on mobility, breath and joint quality.';
  }

  if (readiness < 55 || fatigueStatus === 'High Fatigue') return 'Low-intensity zone today. Avoid hard intervals and keep the session restorative.';
  if (readiness > 75 && fatigueStatus === 'Normal Fatigue') return 'Good day for higher output. Intervals or tempo work can be added.';
  return 'Moderate effort recommended. Keep intensity controlled and finish fresh.';
}

function normalizeForMatch(value: string) {
  return normalizeExerciseName(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export default function WorkoutView({
  data,
  setData,
  viewDate,
  setViewDate,
  performanceEngine,
}: {
  data: AppData;
  setData: any;
  viewDate: string;
  setViewDate: (d: string) => void;
  performanceEngine?: any;
}) {
  const [activeTab, setActiveTab] = useState<Tab>('strength');
  const [selectedMuscle, setSelectedMuscle] = useState('Chest');
  const [selectedSportSub, setSelectedSportSub] = useState('Racket Sports');
  const [selectedYogaSub, setSelectedYogaSub] = useState('Vinyasa');

  const [currentSets, setCurrentSets] = useState<any[]>([]);
  const [workoutName, setWorkoutName] = useState('');
  const [exercise, setExercise] = useState('');
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [rpe, setRpe] = useState('7');

  const [searchQuery, setSearchQuery] = useState('');
  const [aiSearching, setAiSearching] = useState(false);
  const [savingWorkout, setSavingWorkout] = useState(false);
  const [savingSet, setSavingSet] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);

  const [editingSetId, setEditingSetId] = useState<number | string | null>(null);
  const [editWeight, setEditWeight] = useState('');
  const [editReps, setEditReps] = useState('');

  const [cardioExercise, setCardioExercise] = useState('');
  const [cardioDuration, setCardioDuration] = useState('');
  const [cardioDistance, setCardioDistance] = useState('');
  const [cardioExtraValue, setCardioExtraValue] = useState('');
  const [cardioExtraMetric, setCardioExtraMetric] = useState('');
  const [showTipsFor, setShowTipsFor] = useState<string | null>(null);

  const [customExercise, setCustomExercise] = useState({
    name: '',
    bodyPart: 'Chest',
    met: 4,
    caloriesPerMinuteStandard: 6,
  });

  const [timerTime, setTimerTime] = useState(60);
  const [timerActive, setTimerActive] = useState(false);
  const [recoveryReason, setRecoveryReason] = useState('');

  const [workoutPlans, setWorkoutPlans] = useState<Record<string, any>>({});
  const [planEditorOpen, setPlanEditorOpen] = useState(false);
  const [completedPlanExercises, setCompletedPlanExercises] = useState<Record<string, boolean>>({});
  const [trainingMode, setTrainingMode] = useState<TrainingMode>('Auto');
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [sessionElapsed, setSessionElapsed] = useState(0);

  const dayNames = useMemo(
    () => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    []
  );

  const todayName = dayNames[new Date(viewDate + 'T00:00:00').getDay()];
  const [editingPlanDay, setEditingPlanDay] = useState(todayName);
  const [planNameInput, setPlanNameInput] = useState('');
  const [planExerciseInput, setPlanExerciseInput] = useState('');
  const [planBodyPartInput, setPlanBodyPartInput] = useState('Chest');

  const workoutsArr = data.workouts?.[viewDate] || [];
  const todaysWorkoutSchedule = (data as any).workoutSchedule?.[viewDate] || {};
  const selectedWorkoutWindow = todaysWorkoutSchedule.window || performanceEngine?.workout?.window || '';
  const workoutStartTime = todaysWorkoutSchedule.estimatedStart || todaysWorkoutSchedule.startTime || performanceEngine?.workout?.startTime || null;
  const setWorkoutWindowForDate = (windowKey: string) => {
    const selected = WORKOUT_WINDOW_MAP[windowKey];
    if (!selected) return;
    setData((prev: any) => ({
      ...prev,
      workoutSchedule: {
        ...(prev.workoutSchedule || {}),
        [viewDate]: {
          ...(prev.workoutSchedule?.[viewDate] || {}),
          window: windowKey,
          estimatedStart: selected.estimatedStart,
          updatedAt: new Date().toISOString(),
        },
      },
    }));
    try {
      localStorage.setItem('stayfit_workout_window_context', JSON.stringify({ date: viewDate, window: windowKey, estimatedStart: selected.estimatedStart }));
    } catch {}
    showWorkoutMessage(`Workout window set: ${selected.label}`);
  };
  const personalExercises = data.personalExercises || [];
  
const allWorkouts = useMemo<Workout[]>(() => {
  return Object.values(data.workouts ?? {}).flatMap((day) => day ?? []);
}, [data.workouts]);

  const yesterdayKey = useMemo(() => {
    const d = new Date(viewDate + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    return getLocalDateKey(d);
  }, [viewDate]);

  const yesterdayWorkouts = data.workouts?.[yesterdayKey] || [];
  const currentPlanDraft = workoutPlans[editingPlanDay] || {
    dayOfWeek: editingPlanDay,
    planName: '',
    exercises: [],
  };
  const todayPlan = workoutPlans[todayName];

  const totalWorkoutVolume = getWorkoutTotalVolume(currentSets);
  const trainedMuscles = Array.from(new Set(currentSets.map((s) => s.muscle).filter(Boolean)));

  const stepsToday = Number(data.steps?.[viewDate] || 0);
  const stepGoal = Number(data.profile?.stepGoal || 10000);
  const waterTotal = (data.water?.[viewDate] || []).reduce(
    (sum: number, item: any) => sum + Number(item.amount || 0),
    0
  ) / 1000;
  const mealsToday = data.meals?.[viewDate] || [];
  const proteinToday = mealsToday.reduce((sum: number, meal: any) => sum + Number(meal.protein || 0), 0);
  const weightKg = Number(data.profile?.currentWeight ?? 70);
  const proteinTarget = Math.max(1, Math.round(weightKg * 2));
  const todayWorkoutBurn = workoutsArr.reduce((sum: number, w: any) => sum + Number(w.caloriesBurned || 0), 0);

  const weeklyTrainingLoad = useMemo(() => {
    const baseDate = new Date(viewDate + 'T00:00:00');
    let total = 0;

    for (let i = 0; i < 7; i++) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() - i);
      const key = getLocalDateKey(d);
      const dayWorkouts = data.workouts?.[key] || [];
      const dayLoad = dayWorkouts.reduce((sum: number, w: any) => sum + Number(w.caloriesBurned || 0), 0);
      total += dayLoad * Math.max(0.2, 1 - i * 0.12);
    }

    return Math.round(total);
  }, [data.workouts, viewDate]);

  const fatigueStatus =
    weeklyTrainingLoad > 3000
      ? 'High Fatigue'
      : weeklyTrainingLoad > 1800
      ? 'Moderate Fatigue'
      : 'Normal Fatigue';

  const workoutReadiness = useMemo(() => {
    if (performanceEngine?.readiness?.score) return Math.round(Number(performanceEngine.readiness.score));
    const sleepScore = Number(data.recovery?.[viewDate]?.sleep || 75);
    const strainScore =
      todayWorkoutBurn > 0 || stepsToday > 0
        ? Math.min(
            100,
            (todayWorkoutBurn / Math.max(300, weightKg * 5)) * 65 +
              (stepGoal ? (stepsToday / stepGoal) * 35 : 0)
          )
        : 55;
    const nutritionScore = mealsToday.length ? Math.min(100, (proteinToday / proteinTarget) * 100) : 55;
    const hydrationScore = waterTotal > 0 ? Math.min(100, (waterTotal / 3.5) * 100) : 60;

    const rawScore = sleepScore * 0.3 + strainScore * 0.25 + nutritionScore * 0.25 + hydrationScore * 0.2;
    return Math.round(rawScore);
  }, [
    data.recovery,
    viewDate,
    todayWorkoutBurn,
    stepsToday,
    stepGoal,
    weightKg,
    mealsToday.length,
    proteinToday,
    proteinTarget,
    waterTotal,
    performanceEngine,
  ]);

  const recommendedMode = useMemo(
    () => getRecommendedTrainingMode(workoutReadiness, fatigueStatus, todayName, todayPlan),
    [workoutReadiness, fatigueStatus, todayName, todayPlan]
  );

  const activeTrainingMode = trainingMode === 'Auto' ? recommendedMode : trainingMode;
  const workoutEnginePlanName = useMemo(() => {
    const planName = String(todayPlan?.planName || '').trim();
    return planName || activeTrainingMode;
  }, [todayPlan?.planName, activeTrainingMode]);

  const workoutPrescription = useMemo(() => {
    const base = getModePrescription(activeTrainingMode, workoutReadiness, fatigueStatus);
    if (!todayPlan?.planName) return base;
    return {
      ...base,
      title:
        activeTrainingMode === 'Recovery'
          ? `${workoutEnginePlanName} Recovery Session`
          : `${workoutEnginePlanName} Hypertrophy Session`,
    };
  }, [activeTrainingMode, workoutReadiness, fatigueStatus, todayPlan?.planName, workoutEnginePlanName]);

  const workoutRecommendationLabel = trainingMode === 'Auto' ? workoutEnginePlanName : activeTrainingMode;
  const hasLoggedTodayWorkout = workoutsArr.length > 0;

  const startTrainingSession = () => {
    if (sessionActive) return;
    const now = Date.now();
    setSessionActive(true);
    setSessionStartedAt(now);
    setSessionElapsed(0);
    showWorkoutMessage(`${activeTrainingMode} session started`);
  };

  const resetTrainingSession = () => {
    setSessionActive(false);
    setSessionStartedAt(null);
    setSessionElapsed(0);
    setTimerActive(false);
    showWorkoutMessage('Session reset');
  };

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    setCardioExtraMetric(getDynamicCardioMetric(cardioExercise));
    setCardioExtraValue('');
  }, [cardioExercise]);

  useEffect(() => {
    loadWorkoutPlans()
      .then((plans) => setWorkoutPlans(plans || {}))
      .catch((err) => console.error('Workout plan load failed', err));
  }, []);

  useEffect(() => {
    setEditingPlanDay(todayName);
  }, [todayName]);

  useEffect(() => {
    if (!sessionActive || !sessionStartedAt) return;

    const id = window.setInterval(() => {
      setSessionElapsed(Math.max(0, Math.round((Date.now() - sessionStartedAt) / 1000)));
    }, 1000);

    return () => window.clearInterval(id);
  }, [sessionActive, sessionStartedAt]);

  useEffect(() => {
    const selected = workoutPlans[editingPlanDay];
    setPlanNameInput(selected?.planName || '');
    setPlanExerciseInput('');
    setPlanBodyPartInput('Chest');
  }, [editingPlanDay, workoutPlans]);

  const getExerciseOptions = (category: string, subcategory?: string) => {
    let fromBase: string[] = [];
    if (subcategory) {
      fromBase = (EXERCISE_DATABASE as any)[category]?.[subcategory] || [];
    } else {
      const baseVal = (EXERCISE_DATABASE as any)[category];
      fromBase = Array.isArray(baseVal) ? baseVal : [];
    }

    const fromPersonal = personalExercises
      .filter((e: any) => e.bodyPart === (subcategory || category))
      .map((e: any) => e.name);

    return Array.from(new Set([...fromBase, ...fromPersonal].map((e) => toExerciseTitle(String(e)))));
  };

  const getPreviousPerformance = (exerciseName: string) => {
    if (!exerciseName) return null;

    
    const matchingSets = allWorkouts
      .flatMap((w: any) => (w.sets || []).map((s: any) => ({ ...s, workoutName: w.name })))
      .filter((s: any) => String(s.exercise || '').toLowerCase() === exerciseName.toLowerCase());

    if (!matchingSets.length) return null;

    const last = [...matchingSets].sort(
  (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
)[0];
    const nextTarget = getNextTarget(last);
    const best = matchingSets.reduce((bestSet: any, current: any) => {
      return getSetVolume(current) > getSetVolume(bestSet) ? current : bestSet;
    }, matchingSets[0]);

    const suggestedWeight = Number(last.weight || 0) > 0 ? Number(last.weight || 0) + 2.5 : 0;
    const suggestedReps = Number(last.reps || 0) > 0 ? Number(last.reps || 0) + 1 : 0;

    return {
  lastWeight: last.weight || '0',
  lastReps: last.reps || '0',
  bestSet: `${best.weight || 0} kg × ${best.reps || 0}`,
  suggested: suggestedWeight > 0
    ? `Try ${suggestedWeight} kg or ${suggestedReps} reps today`
    : `Try ${suggestedReps} reps today`,
  nextTarget,
};
  };
  const previousPerformance = useMemo(
  () => getPreviousPerformance(exercise),
  [exercise, allWorkouts]
);
  const suggestSets = () => {
    const goal = data.profile?.goal;
    const level = data.profile?.mode;
    if (goal === 'Muscle Gain') return level === 'Advanced' ? '4–5' : '3–4';
    if (goal === 'Fat Loss') return '2–3';
    if (goal === 'Body Recomposition') return '3–4';
    if (goal === 'Maintenance') return '2–3';
    return '3–4';
  };

  const suggestedRepsForExercise = (name: string, bodyPart?: string) => {
    const lower = name.toLowerCase();
    if (bodyPart === 'Core') return '12–20';
    if (lower.includes('curl') || lower.includes('raise') || lower.includes('extension') || lower.includes('fly')) return '10–15';
    if (lower.includes('deadlift') || lower.includes('squat') || lower.includes('bench') || lower.includes('press') || lower.includes('row')) return '6–10';
    return '8–10';
  };

  const addExerciseToPlan = () => {
    const name = toExerciseTitle(planExerciseInput);
    if (!name) return;

    const existing = currentPlanDraft.exercises || [];
    if (existing.some((ex: any) => ex.name.toLowerCase() === name.toLowerCase())) return;

    setWorkoutPlans((prev) => ({
      ...prev,
      [editingPlanDay]: {
        dayOfWeek: editingPlanDay,
        planName: planNameInput || prev[editingPlanDay]?.planName || '',
        exercises: [...existing, { name, bodyPart: planBodyPartInput }],
      },
    }));
    setPlanExerciseInput('');
  };

  const removeExerciseFromPlan = (index: number) => {
    const existing = currentPlanDraft.exercises || [];
    setWorkoutPlans((prev) => ({
      ...prev,
      [editingPlanDay]: {
        dayOfWeek: editingPlanDay,
        planName: planNameInput || prev[editingPlanDay]?.planName || '',
        exercises: existing.filter((_: any, i: number) => i !== index),
      },
    }));
  };

  const saveCurrentPlan = async () => {
    const plan = {
      dayOfWeek: editingPlanDay,
      planName: planNameInput.trim() || editingPlanDay + ' Workout',
      exercises: currentPlanDraft.exercises || [],
    };

    if (!plan.exercises.length) {
      showWorkoutMessage('Add at least one exercise to this plan.', 'error');
      return;
    }

    setSavingPlan(true);
    try {
      await saveWorkoutPlan(plan);
      setWorkoutPlans((prev) => ({ ...prev, [editingPlanDay]: plan }));
      showWorkoutMessage('Weekly plan saved successfully');
      setPlanEditorOpen(false);
      setEditingPlanDay(todayName);
      setPlanNameInput('');
      setPlanExerciseInput('');
      setPlanBodyPartInput('Chest');
      setActiveTab('strength');
    } catch (err) {
      console.error('Workout plan save failed', err);
      showWorkoutMessage('Unable to save weekly plan. Please try again.', 'error');
    } finally {
      setSavingPlan(false);
    }
  };

  const clearCurrentPlan = async () => {
    setWorkoutPlans((prev) => {
      const next = { ...prev };
      delete next[editingPlanDay];
      return next;
    });
    setPlanNameInput('');

    try {
      await deleteWorkoutPlan(editingPlanDay);
      showWorkoutMessage('Plan cleared');
    } catch (err) {
      console.error('Workout plan delete failed', err);
      showWorkoutMessage('Unable to clear plan. Please try again.', 'error');
    }
  };

  const startTodayPlan = () => {
    if (!todayPlan) return;

    setWorkoutName(todayPlan.planName || todayName + ' Workout');

    const first = todayPlan.exercises?.[0];
    if (first) {
      setSelectedMuscle(first.bodyPart || 'Chest');
      setExercise(first.name);
    }

    setActiveTab('strength');
    showWorkoutMessage('Today’s plan loaded');
  };

  const startPlanExercise = (ex: any) => {
    setSelectedMuscle(ex.bodyPart || 'Chest');
    setExercise(ex.name);
    setActiveTab('strength');
    showWorkoutMessage(`${ex.name} loaded`);
  };

  const togglePlanExerciseComplete = (name: string) => {
    setCompletedPlanExercises((prev) => ({
      ...prev,
      [name]: !prev[name],
    }));
  };

  const handleAddSet = async () => {
    if (!exercise || !reps) {
      showWorkoutMessage('Select exercise and enter reps first.', 'error');
      return;
    }

    setSavingSet(true);

    if (!sessionActive) {
      const now = Date.now();
      setSessionActive(true);
      setSessionStartedAt(now);
      setSessionElapsed(0);
    }

    const finalExercise = toExerciseTitle(exercise);
    const finalWeight = weight || '0';
    const newSet: WorkoutSet = {
  exercise: finalExercise,
  weight: Number(finalWeight || 0),
  reps: Number(reps || 0),
  rpe: Number(rpe || 7),
  muscle: selectedMuscle,
  id: safeId(),
  timestamp: Date.now(),
};

    setCurrentSets((prev) => [...prev, newSet]);

    setTimerActive(false);
    try {
      const recoveryWeight = finalWeight === '0' ? 'bodyweight' : `${finalWeight}kg`;
      const recovery = await calculateRecoveryTime(finalExercise, recoveryWeight, reps);
      if (recovery) {
        setTimerTime(recovery.seconds);
        setRecoveryReason(recovery.reason);
        setTimerActive(true);
      }
    } catch (err) {
      console.error('Recovery timer failed', err);
    }

    setWeight('');
    setReps('');
    showWorkoutMessage('Set saved successfully');
    window.setTimeout(() => setSavingSet(false), 400);
  };

  const handleAiSearch = async () => {
    if (!searchQuery) return;
    setAiSearching(true);

    try {
      const result = await searchExerciseInfo(searchQuery);
      if (result) {
        const fixedName = toExerciseTitle(result.name || searchQuery);
        const fixedResult = { ...result, name: fixedName };

        const exists = (personalExercises || []).some(
          (e: any) => e.name.toLowerCase() === fixedName.toLowerCase()
        );

        if (!exists) {
          setData((prev: AppData) => ({
            ...prev,
            personalExercises: [...(prev.personalExercises || []), fixedResult],
          }));

          saveCustomExercise({
            ...fixedResult,
            bodyPart: fixedResult.bodyPart || 'Chest',
            source: 'ai',
          }).catch((err) => console.error('Custom exercise save failed', err));
        }

        if (fixedResult.bodyPart === 'Cardio') {
          setCardioExercise(fixedName);
          setActiveTab('cardio');
        } else {
          setSelectedMuscle(fixedResult.bodyPart || 'Chest');
          setExercise(fixedName);
          setActiveTab('strength');
        }

        setSearchQuery('');
      }
    } catch (err) {
      console.error('AI exercise search failed', err);
      showWorkoutMessage('AI search failed. Try manual entry.', 'error');
    } finally {
      setAiSearching(false);
    }
  };

  const handleStartEditingSet = (s: any) => {
    setEditingSetId(s.id);
    setEditWeight(s.weight);
    setEditReps(s.reps);
  };

  const handleUpdateSet = (id: string | number) => {
  setCurrentSets((prev) =>
    prev.map((s) =>
      s.id === id ? { ...s, weight: Number(editWeight || '0'), reps: Number(editReps || 0) } : s
    )
  );

  setEditingSetId(null);
  showWorkoutMessage('Set updated');
};
  const handleAddCustomExercise = () => {
    if (!customExercise.name) return;

    const fixedCustom = { ...customExercise, name: toExerciseTitle(customExercise.name) };

    setData((prev: AppData) => ({
      ...prev,
      personalExercises: [...(prev.personalExercises || []), fixedCustom],
    }));

    saveCustomExercise({ ...fixedCustom, source: 'manual' }).catch((err) =>
      console.error('Custom exercise save failed', err)
    );

    if (fixedCustom.bodyPart === 'Cardio') {
      setCardioExercise(fixedCustom.name);
      setActiveTab('cardio');
    } else {
      setSelectedMuscle(fixedCustom.bodyPart);
      setExercise(fixedCustom.name);
      setActiveTab('strength');
    }

    setShowCustomForm(false);
    setCustomExercise({ name: '', bodyPart: 'Chest', met: 4, caloriesPerMinuteStandard: 6 });
    showWorkoutMessage('Exercise added');
  };

  const addWorkoutToStateAndCloud = async (newWorkout: Workout) => {
    setSavingWorkout(true);
    try {
      await saveWorkout(viewDate, newWorkout);
      setData((prev: AppData) => ({
        ...prev,
        workouts: {
          ...prev.workouts,
          [viewDate]: [...(prev.workouts[viewDate] || []), newWorkout],
        },
      }));

      showWorkoutMessage('Workout saved successfully');
      window.setTimeout(() => {
        document.getElementById('workout-history')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 200);
    } catch (err) {
      console.error('Supabase workout save error ❌', err);
      showWorkoutMessage('Unable to save workout. Please try again.', 'error');
    } finally {
      setSavingWorkout(false);
    }
  };

  const handleAddCardio = async () => {
    if (!cardioExercise || !cardioDuration) return;

    const durationNum = parseInt(cardioDuration, 10);
    const calories = durationNum * 8;
    const extraParam = cardioExtraMetric && cardioExtraValue ? { [cardioExtraMetric]: cardioExtraValue } : {};

    const newWorkout: Workout = {
      id: safeId(),
      name: `${toExerciseTitle(cardioExercise)} Session`,
      category: 'Cardio',
      muscles: ['Cardio'],
      sets: [
        {
          exercise: toExerciseTitle(cardioExercise),
          duration: durationNum,
          distance: shouldShowDistance(cardioExercise) ? cardioDistance : undefined,
          ...extraParam,
        },
      ],
      caloriesBurned: calories,
      duration: durationNum,
    };

    await addWorkoutToStateAndCloud(newWorkout);
    setCardioExercise('');
    setCardioDuration('');
    setCardioDistance('');
    setCardioExtraValue('');
    setActiveTab('strength');
  };

  const handleFinishWorkout = async () => {
    if (currentSets.length === 0) {
      showWorkoutMessage('Save at least one set first.', 'error');
      return;
    }

    const workoutMuscles = Array.from(new Set(currentSets.map((s: any) => s.muscle || selectedMuscle).filter(Boolean)));

    const autoWorkoutName =
      workoutMuscles.length > 1
        ? `${workoutMuscles.join(' + ')} Workout`
        : `${workoutMuscles[0] || selectedMuscle} Workout`;

    const finalWorkoutName = workoutName && workoutName.trim().length > 1 ? workoutName.trim() : autoWorkoutName;

    const avgRpe = currentSets.reduce(
      (sum: number, set: any) => sum + Number(set.rpe || 7),
      0
    ) / Math.max(1, currentSets.length);
    const sessionDuration = sessionStartedAt
      ? Math.max(1, Math.round((Date.now() - sessionStartedAt) / 60000))
      : undefined;

    const newWorkout: Workout = {
      id: safeId(),
      name: finalWorkoutName,
      category: 'Strength',
      muscles: workoutMuscles.length ? workoutMuscles : [selectedMuscle],
      sets: currentSets,
      caloriesBurned: Math.round(currentSets.length * 22 * (avgRpe / 7)),
      duration: sessionDuration,
    };

    await addWorkoutToStateAndCloud(newWorkout);
    setCurrentSets([]);
    setExercise('');
    setWorkoutName('');
    setTimerActive(false);
    setTimerTime(60);
    setRecoveryReason('');
    setSessionActive(false);
    setSessionStartedAt(null);
    setSessionElapsed(0);
  };

  const handleAddSportsOrYoga = async (category: 'Sports' | 'Yoga') => {
    if (!cardioExercise || !cardioDuration) return;

    const durationNum = parseInt(cardioDuration, 10);

    const newWorkout: Workout = {
      id: safeId(),
      name: `${toExerciseTitle(cardioExercise)} Session`,
      category,
      muscles: [category],
      sets: [{ exercise: toExerciseTitle(cardioExercise), duration: durationNum }],
      caloriesBurned: durationNum * (category === 'Sports' ? 7 : 4),
      duration: durationNum,
    };

    await addWorkoutToStateAndCloud(newWorkout);
    setCardioExercise('');
    setCardioDuration('');
  };

  const handleDeleteWorkout = async (id: string | number) => {
    setData((prev: AppData) => ({
      ...prev,
      workouts: {
        ...prev.workouts,
        [viewDate]: (prev.workouts[viewDate] || []).filter((w: any) => w.id !== id),
      },
    }));

    try {
      await deleteWorkoutFromCloud(id);
      showWorkoutMessage('Workout deleted');
    } catch (err) {
      console.error('Supabase workout delete error ❌', err);
      showWorkoutMessage('Unable to delete workout. Please try again.', 'error');
    }
  };

  const handleEditWorkout = (workout: Workout) => {
    if (workout.category === 'Cardio') {
      const s = workout.sets[0];
      setCardioExercise(s.exercise);
      setCardioDuration(String(s.duration || ''));
      setCardioDistance(s.distance || '');
      setActiveTab('cardio');
    } else if (workout.category === 'Sports') {
      const s = workout.sets[0];
      setCardioExercise(s.exercise);
      setCardioDuration(String(s.duration || ''));
      setActiveTab('sports');
    } else if (workout.category === 'Yoga') {
      const s = workout.sets[0];
      setCardioExercise(s.exercise);
      setCardioDuration(String(s.duration || ''));
      setActiveTab('yoga');
    } else {
      setCurrentSets(workout.sets || []);
      setSelectedMuscle(workout.muscles?.[0] || 'Chest');
      setWorkoutName(workout.name || '');
      setActiveTab('strength');
    }

    handleDeleteWorkout(workout.id);
  };

  const handleDeletePersonalExercise = (name: string) => {
    setData((prev: AppData) => ({
      ...prev,
      personalExercises: (prev.personalExercises || []).filter((e: any) => e.name !== name),
    }));
  };

  return (
    <>
      {timerActive && (
  <div className="fixed top-24 right-4 z-[95] rounded-2xl border border-lime/30 bg-panel/95 px-5 py-4 text-lime shadow-xl shadow-lime/20 backdrop-blur-md">
    <div className="text-[9px] font-black uppercase tracking-widest opacity-70">
      Rest Timer
    </div>
    <div className="text-2xl font-black font-mono">
      {Math.floor(timerTime / 60)}:
      {String(timerTime % 60).padStart(2, '0')}
    </div>
  </div>
)}

{/* MAIN CONTAINER */}
<div className="space-y-6 relative">

  {/* HEADER */}
  <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
    
    <div>
      <h2 className="text-4xl font-black uppercase tracking-tighter">
        Workout Log
      </h2>

      <div className="flex items-center gap-4 mt-2">
        <div className="label-small text-lime tracking-[0.2em]">
          Track sets, reps, volume and progress
        </div>

        <div className="h-1 w-1 rounded-full bg-white/20" />

        <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
          {workoutsArr.length} Sessions Logged
        </div>
      </div>
    </div>

    {/* DATE NAV */}
    <div className="flex items-center justify-end">
      <DateNavigator viewDate={viewDate} setViewDate={setViewDate} />
    </div>

  </header>

        <SessionSummary
          totalSets={currentSets.length}
          totalVolume={totalWorkoutVolume}
          trainedMuscles={trainedMuscles}
          currentSets={currentSets}
        />

        <WorkoutEnginePanel
          trainingMode={trainingMode}
          setTrainingMode={setTrainingMode}
          activeTrainingMode={activeTrainingMode}
          recommendedMode={recommendedMode}
          recommendationLabel={workoutRecommendationLabel}
          readiness={workoutReadiness}
          fatigueStatus={fatigueStatus}
          weeklyTrainingLoad={weeklyTrainingLoad}
          prescription={workoutPrescription}
          sessionActive={sessionActive}
          sessionElapsed={sessionElapsed}
          startTrainingSession={startTrainingSession}
          resetTrainingSession={resetTrainingSession}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="stat-card space-y-8">
              <TabSwitcher activeTab={activeTab} setActiveTab={setActiveTab} />

              {hasLoggedTodayWorkout ? (
                <TodayWorkoutSummary workouts={workoutsArr} workoutStartTime={workoutStartTime} onExtraSession={startTrainingSession} />
              ) : (
              <WeeklyPlanSection
                dayNames={dayNames}
                todayName={todayName}
                todayPlan={todayPlan}
                planEditorOpen={planEditorOpen}
                setPlanEditorOpen={setPlanEditorOpen}
                editingPlanDay={editingPlanDay}
                setEditingPlanDay={setEditingPlanDay}
                planNameInput={planNameInput}
                setPlanNameInput={setPlanNameInput}
                currentPlanDraft={currentPlanDraft}
                planExerciseInput={planExerciseInput}
                setPlanExerciseInput={setPlanExerciseInput}
                planBodyPartInput={planBodyPartInput}
                setPlanBodyPartInput={setPlanBodyPartInput}
                getExerciseOptions={getExerciseOptions}
                addExerciseToPlan={addExerciseToPlan}
                removeExerciseFromPlan={removeExerciseFromPlan}
                saveCurrentPlan={saveCurrentPlan}
                savingPlan={savingPlan}
                clearCurrentPlan={clearCurrentPlan}
                startTodayPlan={startTodayPlan}
                suggestSets={suggestSets}
                suggestedRepsForExercise={suggestedRepsForExercise}
                yesterdayWorkouts={yesterdayWorkouts}
                startPlanExercise={startPlanExercise}
                completedPlanExercises={completedPlanExercises}
                togglePlanExerciseComplete={togglePlanExerciseComplete}
                currentSets={currentSets}
                selectedWorkoutWindow={selectedWorkoutWindow}
                workoutStartTime={workoutStartTime}
                setWorkoutWindowForDate={setWorkoutWindowForDate}
                setShowTipsFor={setShowTipsFor}
              />
              )}

              <AISearchBar
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                handleAiSearch={handleAiSearch}
                aiSearching={aiSearching}
                setShowCustomForm={setShowCustomForm}
              />

              {activeTab === 'strength' ? (
                <StrengthPanel
                  selectedMuscle={selectedMuscle}
                  setSelectedMuscle={setSelectedMuscle}
                  exercise={exercise}
                  setExercise={setExercise}
                  getExerciseOptions={getExerciseOptions}
                  personalExercises={personalExercises}
                  handleDeletePersonalExercise={handleDeletePersonalExercise}
                  weight={weight}
                  setWeight={setWeight}
                  reps={reps}
                  setReps={setReps}
                  rpe={rpe}
                  setRpe={setRpe}
                  handleAddSet={handleAddSet}
                  savingSet={savingSet}
                  currentSets={currentSets}
                  setCurrentSets={setCurrentSets}
                  editingSetId={editingSetId}
                  editWeight={editWeight}
                  setEditWeight={setEditWeight}
                  editReps={editReps}
                  setEditReps={setEditReps}
                  handleStartEditingSet={handleStartEditingSet}
                  handleUpdateSet={handleUpdateSet}
                  workoutName={workoutName}
                  setWorkoutName={setWorkoutName}
                  handleFinishWorkout={handleFinishWorkout}
                  savingWorkout={savingWorkout}
                  setEditingSetId={setEditingSetId}
                  previousPerformance={previousPerformance}
                />
              ) : activeTab === 'cardio' ? (
                <CardioPanel
                  cardioExercise={cardioExercise}
                  setCardioExercise={setCardioExercise}
                  getExerciseOptions={getExerciseOptions}
                  cardioDuration={cardioDuration}
                  setCardioDuration={setCardioDuration}
                  cardioDistance={cardioDistance}
                  setCardioDistance={setCardioDistance}
                  cardioExtraMetric={cardioExtraMetric}
                  cardioExtraValue={cardioExtraValue}
                  setCardioExtraValue={setCardioExtraValue}
                  handleAddCardio={handleAddCardio}
                  readiness={workoutReadiness}
                  fatigueStatus={fatigueStatus}
                />
              ) : activeTab === 'sports' ? (
                <SportsYogaPanel
                  mode="Sports"
                  selectedSub={selectedSportSub}
                  setSelectedSub={setSelectedSportSub}
                  cardioExercise={cardioExercise}
                  setCardioExercise={setCardioExercise}
                  cardioDuration={cardioDuration}
                  setCardioDuration={setCardioDuration}
                  getExerciseOptions={getExerciseOptions}
                  handleSubmit={() => handleAddSportsOrYoga('Sports')}
                  readiness={workoutReadiness}
                  fatigueStatus={fatigueStatus}
                />
              ) : (
                <SportsYogaPanel
                  mode="Yoga"
                  selectedSub={selectedYogaSub}
                  setSelectedSub={setSelectedYogaSub}
                  cardioExercise={cardioExercise}
                  setCardioExercise={setCardioExercise}
                  cardioDuration={cardioDuration}
                  setCardioDuration={setCardioDuration}
                  getExerciseOptions={getExerciseOptions}
                  handleSubmit={() => handleAddSportsOrYoga('Yoga')}
                  readiness={workoutReadiness}
                  fatigueStatus={fatigueStatus}
                />
              )}
            </div>
          </div>

          <div className="space-y-8">
            <RestTimer
              time={timerTime}
              setTime={setTimerTime}
              isActive={timerActive}
              setIsActive={setTimerActive}
              reason={recoveryReason}
            />

            <WorkoutHistory
              workoutsArr={workoutsArr}
              handleEditWorkout={handleEditWorkout}
              handleDeleteWorkout={handleDeleteWorkout}
            />
          </div>
        </div>
      </div>
{showTipsFor && (
  <div
    className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center"
    onClick={() => setShowTipsFor(null)} // ✅ click outside closes
  >
    <div
      className="w-full max-w-md bg-[#111] rounded-t-3xl p-5"
      onClick={(e) => e.stopPropagation()} // ✅ prevent inside click closing
    >

      {/* Title */}
      <div className="flex justify-between items-center mb-3">
        <div className="text-sm font-black text-lime uppercase">
          {showTipsFor}
        </div>

        {/* Close Icon */}
        <button
          onClick={() => setShowTipsFor(null)}
          className="text-white/40 hover:text-white transition"
        >
          ✕
        </button>
      </div>

      {(() => {
        const normalized = normalizeExerciseName(showTipsFor).toLowerCase();

        const key = Object.keys(FORM_TIPS).find(k =>
  normalized.includes(k) || k.includes(normalized)
);

        const tips = key ? FORM_TIPS[key] : null;

        if (!tips) {
          return (
            <div className="text-xs text-white/70 leading-relaxed">
              Keep your form controlled, use full range of motion, and avoid momentum.
            </div>
          );
        }

        return (
          <>
            {/* CUES */}
            <div className="mb-4">
              <div className="text-[10px] uppercase text-lime font-bold mb-1">Key Cues</div>
              {tips.cues.map((c: string, i: number) => (
                <div key={i} className="text-xs text-white/80">✔ {c}</div>
              ))}
            </div>

            {/* MISTAKES */}
            <div className="mb-4">
              <div className="text-[10px] uppercase text-pink font-bold mb-1">Avoid</div>
              {tips.mistakes.map((m: string, i: number) => (
                <div key={i} className="text-xs text-white/60">✖ {m}</div>
              ))}
            </div>

            {/* PRO TIP */}
            <div className="p-3 bg-lime/10 border border-lime/30 rounded-xl text-xs">
              💡 {tips.pro}
            </div>
          </>
        );
      })()}

    </div>
  </div>
)}
      <CustomExerciseModal
        showCustomForm={showCustomForm}
        setShowCustomForm={setShowCustomForm}
        customExercise={customExercise}
        setCustomExercise={setCustomExercise}
        handleAddCustomExercise={handleAddCustomExercise}
      />
    </>
  );
}

function WorkoutEnginePanel({
  trainingMode,
  setTrainingMode,
  activeTrainingMode,
  recommendedMode,
  recommendationLabel,
  readiness,
  fatigueStatus,
  weeklyTrainingLoad,
  prescription,
  sessionActive,
  sessionElapsed,
  startTrainingSession,
  resetTrainingSession,
}: any) {
  const readinessColor = readiness >= 75 ? 'text-lime' : readiness >= 55 ? 'text-yellow-400' : 'text-pink';

  return (
    <section className="rounded-[2rem] border border-lime/20 bg-panel/80 p-5 shadow-xl shadow-lime/5 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.25em] text-lime">
            Workout Engine V2
          </div>
          <h3 className="text-2xl font-black uppercase tracking-tight mt-1">
            {prescription.title}
          </h3>
          <p className="text-xs text-white/50 font-bold mt-2 max-w-2xl">
            {prescription.instruction}
          </p>
          <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-sky">
            Weekly plan synced · Intensity adjusted by readiness
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center min-w-[280px]">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className={`text-2xl font-black ${readinessColor}`}>{readiness}%</div>
            <div className="text-[8px] uppercase tracking-widest text-white/30 font-black">
              Readiness
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="text-sm font-black text-sky">
              {fatigueStatus.replace(' Fatigue', '')}
            </div>
            <div className="text-[8px] uppercase tracking-widest text-white/30 font-black">
              Fatigue
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="text-sm font-black text-lime">{weeklyTrainingLoad}</div>
            <div className="text-[8px] uppercase tracking-widest text-white/30 font-black">
              7D Load
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniMetric label="Intensity" value={prescription.intensity} />
        <MiniMetric label="Volume" value={prescription.volume} />
        <MiniMetric label="Rep Target" value={prescription.reps} />
        <MiniMetric label="Recommendation" value={recommendationLabel || recommendedMode} />
      </div>

      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {TRAINING_MODES.map((mode) => (
            <button
              key={mode}
              onClick={() => setTrainingMode(mode)}
              className={`shrink-0 px-4 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${
                trainingMode === mode
                  ? 'bg-lime text-dark border-lime shadow-lg shadow-lime/20'
                  : 'bg-white/[0.03] border-border text-white/40 hover:text-white hover:border-lime/30'
              }`}
            >
              {mode === 'Auto' ? `Auto: ${recommendationLabel || recommendedMode}` : mode}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {sessionActive && (
            <div className="px-4 py-2 rounded-xl bg-lime/10 border border-lime/20 text-lime text-xs font-black font-mono">
              {formatSessionTime(sessionElapsed)}
            </div>
          )}

          <button
            onClick={startTrainingSession}
            disabled={sessionActive}
            className="px-5 py-3 rounded-xl bg-lime text-dark text-[10px] font-black uppercase tracking-widest shadow-lg shadow-lime/20 disabled:opacity-50 disabled:pointer-events-none"
          >
            {sessionActive ? 'Session Active' : 'Start Session'}
          </button>

          <button
            onClick={resetTrainingSession}
            className="px-4 py-3 rounded-xl bg-white/[0.03] border border-border text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white"
          >
            Reset
          </button>
        </div>
      </div>
    </section>
  );
}

function SessionSummary({ totalSets, totalVolume, trainedMuscles, currentSets }: any) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <SummaryCard label="Total Sets" value={totalSets} />
      <SummaryCard label="Total Volume" value={`${totalVolume} kg`} />
      <SummaryCard label="Muscles Trained" value={trainedMuscles.length ? trainedMuscles.join(', ') : '—'} />
      <SummaryCard label="Active Session" value={currentSets.length ? 'In Progress' : 'Not Started'} />
    </div>
  );
}

function SummaryCard({ label, value }: any) {
  return (
    <div className="rounded-2xl border border-border bg-white/[0.02] p-4">
      <div className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">{label}</div>
      <div className="text-sm font-black text-white">{value}</div>
    </div>
  );
}

function TabSwitcher({ activeTab, setActiveTab }: any) {
  return (
    <div className="flex gap-2 p-1 bg-black/40 rounded-2xl border border-border w-fit overflow-x-auto max-w-full scrollbar-hide">
      {[
        ['strength', 'Strength'],
        ['cardio', 'Cardio'],
        ['sports', 'Sports'],
        ['yoga', 'Yoga'],
      ].map(([id, label]) => (
        <button
          key={id}
          onClick={() => setActiveTab(id)}
          className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 ${
            activeTab === id ? 'bg-lime text-dark shadow-lg shadow-lime/20' : 'text-white/30 hover:text-white'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function AISearchBar({ searchQuery, setSearchQuery, handleAiSearch, aiSearching, setShowCustomForm }: any) {
  return (
    <div className="relative">
      <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20" size={18} />
      <input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full pl-12 pr-40 py-5 bg-white/[0.02] border border-border rounded-2xl text-sm font-bold focus:outline-none focus:border-lime transition-all placeholder:opacity-40"
        placeholder="Search exercise..."
      />
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
        <button
          onClick={handleAiSearch}
          disabled={aiSearching || !searchQuery}
          className={`px-3 py-2 rounded-xl border transition-all flex items-center gap-2 ${
            aiSearching ? 'bg-white/5 border-white/10 text-white/20' : 'bg-sky/10 border-sky/20 text-sky hover:bg-sky/20'
          }`}
          title="Search with AI"
        >
          <Sparkles size={16} className={aiSearching ? 'animate-pulse' : ''} />
          <span className="hidden sm:inline text-[9px] font-black uppercase tracking-widest">AI Search</span>
        </button>
        <button
          onClick={() => setShowCustomForm(true)}
          className="p-2 bg-pink/10 text-pink rounded-xl border border-pink/20 hover:bg-pink/20 transition-all"
          title="Add custom exercise"
        >
          <PlusCircle size={18} />
        </button>
      </div>
    </div>
  );
}


function TodayWorkoutSummary({ workouts, workoutStartTime, onExtraSession }: any) {
  const totalSets = (workouts || []).reduce((sum: number, w: any) => sum + ((w.sets || []).length || Number(w.totalSets || 0)), 0);
  const totalVolume = (workouts || []).reduce((sum: number, w: any) => sum + Number(w.volume || w.totalVolume || 0), 0);
  const calories = (workouts || []).reduce((sum: number, w: any) => sum + Number(w.caloriesBurned || w.calories || 0), 0);
  const title = getWorkoutDisplayName(workouts?.[0]) || 'Workout Completed';

  return (
    <div className="rounded-[2rem] border border-lime/20 bg-lime/[0.04] p-5 space-y-5">
      <div>
        <div className="label-small text-lime mb-2">Today’s Workout Summary</div>
        <h3 className="text-2xl font-black tracking-tight">{title}</h3>
        <p className="text-[11px] text-white/40 mt-1">
          Today’s workout is already logged. The plan is hidden now; focus on recovery, hydration and post-workout nutrition.
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Sessions" value={(workouts || []).length} />
        <SummaryCard label="Sets" value={totalSets || '—'} />
        <SummaryCard label="Volume" value={totalVolume ? `${Math.round(totalVolume)} kg` : '—'} />
        <SummaryCard label="Calories" value={calories ? `+${Math.round(calories)}` : '—'} />
      </div>
      <div className="rounded-2xl border border-sky/20 bg-sky/5 p-4 text-[11px] text-sky font-bold leading-relaxed">
        {workoutStartTime
          ? `Nutrition Engine can now use your ${workoutStartTime} workout window for post-workout meal guidance.`
          : 'Set a workout window next time so Nutrition can time pre/post-workout meals automatically.'}
      </div>
      <button
        onClick={onExtraSession}
        className="w-full rounded-2xl bg-white/[0.04] border border-border py-3 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white"
      >
        Start Additional Session
      </button>
    </div>
  );
}

function WeeklyPlanSection(props: any) {
  const {
    dayNames,
    todayName,
    todayPlan,
    planEditorOpen,
    setPlanEditorOpen,
    editingPlanDay,
    setEditingPlanDay,
    planNameInput,
    setPlanNameInput,
    currentPlanDraft,
    planExerciseInput,
    setPlanExerciseInput,
    planBodyPartInput,
    setPlanBodyPartInput,
    getExerciseOptions,
    addExerciseToPlan,
    removeExerciseFromPlan,
    saveCurrentPlan,
    savingPlan,
    clearCurrentPlan,
    startTodayPlan,
    suggestSets,
    suggestedRepsForExercise,
    yesterdayWorkouts,
    startPlanExercise,
    completedPlanExercises,
    togglePlanExerciseComplete,
    currentSets = [],
    selectedWorkoutWindow,
    workoutStartTime,
    setWorkoutWindowForDate,
  } = props;

  const plannedExercises = todayPlan?.exercises || [];
  const hasLoggedSetForExercise = (name: string) =>
    (currentSets || []).some((set: any) => normalizeForMatch(set.exercise || '') === normalizeForMatch(name));
  const yesterdayNames = (yesterdayWorkouts || []).map((w: any) => getWorkoutDisplayName(w)).filter(Boolean);
  const yesterdaySummary = yesterdayNames.length > 1 ? yesterdayNames.join(' + ') : yesterdayNames[0];
const { setShowTipsFor } = props;
  const yesterdayNote =
    yesterdaySummary && todayPlan?.planName
      ? `Yesterday you logged ${yesterdaySummary}. Today is planned as ${todayPlan.planName}. Update the weekly plan if your split changed.`
      : '';

  return (
    <div data-weekly-plan-section className="rounded-[2rem] border border-lime/20 bg-lime/[0.03] p-5 space-y-5">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <div className="label-small text-lime mb-2">Today’s Workout Plan • {todayName}</div>
          <h3 className="text-2xl font-black tracking-tight">{todayPlan?.planName || 'No plan set for today'}</h3>
          <p className="text-[11px] text-white/40 mt-1">
            Begin the weekly plan, log sets, then complete exercises when at least one set is recorded.
          </p>
        </div>
        <div className="flex gap-2">
          {todayPlan && (
            <button
              onClick={startTodayPlan}
              className="px-5 py-3 rounded-xl bg-lime text-dark text-[10px] font-black uppercase tracking-widest shadow-lg shadow-lime/20 active:scale-95 transition-all"
            >
              {`Begin ${todayPlan?.planName || 'Workout'}`}
            </button>
          )}
          <button
            onClick={() => setPlanEditorOpen(!planEditorOpen)}
            className="px-5 py-3 rounded-xl bg-white/[0.04] border border-border text-white/60 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all"
          >
            {planEditorOpen ? 'Close Plan' : 'Edit Plan'}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3">When will you train today?</div>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(WORKOUT_WINDOW_MAP).map(([key, item]: any) => (
            <button
              key={key}
              onClick={() => setWorkoutWindowForDate?.(key)}
              className={`rounded-xl px-3 py-3 text-[10px] font-black uppercase tracking-widest border transition-all ${
                selectedWorkoutWindow === key
                  ? 'bg-lime text-dark border-lime shadow-lg shadow-lime/20'
                  : 'bg-white/[0.03] text-white/50 border-border hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="text-[11px] text-white/40 mt-3">
          {workoutStartTime
            ? `Nutrition will use approx. ${workoutStartTime} for pre/post-workout guidance.`
            : 'Select a workout window to unlock pre/post-workout meal guidance.'}
        </div>
      </div>

      {yesterdayNote && (
        <div className="rounded-2xl border border-sky/20 bg-sky/5 p-4 text-[11px] text-sky font-bold leading-relaxed">
          {yesterdayNote}
        </div>
      )}

      {plannedExercises.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {plannedExercises.map((ex: any, idx: number) => (
            <div key={idx} className="rounded-2xl border border-border bg-white/[0.02] p-4 space-y-3">
              <div className="flex justify-between gap-3">
                <div>
                  <div className="text-sm font-black">{ex.name}</div>
                  <div className="label-small text-lime mt-1">{ex.bodyPart}</div>
                </div>
                <button
                  onClick={() => togglePlanExerciseComplete(ex.name)}
                  disabled={!completedPlanExercises[ex.name] && !hasLoggedSetForExercise(ex.name)}
                  title={!completedPlanExercises[ex.name] && !hasLoggedSetForExercise(ex.name) ? 'Log at least one set first' : 'Mark exercise complete'}
                  className={`px-3 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${
                    completedPlanExercises[ex.name]
                      ? 'bg-lime text-dark border-lime'
                      : hasLoggedSetForExercise(ex.name)
                        ? 'bg-white/[0.03] text-lime border-lime/30 hover:bg-lime hover:text-dark'
                        : 'bg-white/[0.02] text-white/20 border-border cursor-not-allowed'
                  }`}
                >
                  {completedPlanExercises[ex.name] ? 'Completed' : 'Complete'}
                </button>
              </div>

              <div className="text-[10px] text-white/40 font-bold uppercase tracking-widest">
                Suggested: {suggestSets()} sets • {suggestedRepsForExercise(ex.name, ex.bodyPart)} reps
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => startPlanExercise(ex)} className="py-2 rounded-xl bg-lime/15 text-lime border border-lime/20 text-[9px] font-black uppercase hover:bg-lime hover:text-dark transition-all">
                  Log Set
                </button>
                <button onClick={() => setPlanEditorOpen(true)} className="py-2 rounded-xl bg-white/[0.03] text-white/40 border border-border text-[9px] font-black uppercase hover:text-white transition-all">
                  Edit
                </button>
                <button
  onClick={() => setShowTipsFor(ex.name)}
  className="py-2 rounded-xl bg-sky/10 text-sky border border-sky/20 text-[9px] font-black uppercase"
>
  Form Tips
</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {planEditorOpen && (
        <div className="rounded-[2rem] border border-border bg-black/20 p-5 space-y-5">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {dayNames.map((day: string) => (
              <button
                key={day}
                onClick={() => setEditingPlanDay(day)}
                className={
                  'shrink-0 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ' +
                  (editingPlanDay === day
                    ? 'bg-lime border-lime text-dark shadow-lg shadow-lime/20'
                    : 'bg-white/[0.03] border-border text-white/40 hover:text-white')
                }
              >
                {day.slice(0, 3)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputText label="Workout Name" value={planNameInput} onChange={setPlanNameInput} placeholder="Push, Pull, Upper Body..." />
            <div className="space-y-2">
              <div className="label-small text-muted ml-1">Body Part</div>
              <select
                value={planBodyPartInput}
                onChange={(e) => {
                  setPlanBodyPartInput(e.target.value);
                  setPlanExerciseInput('');
                }}
                className="w-full p-4 bg-white/[0.03] border border-border rounded-2xl text-sm font-bold focus:outline-none focus:border-lime transition-all"
              >
                {BODY_PARTS.map((m) => (
                  <option key={m} value={m} className="bg-dark">
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <InputText label="Add Exercise" value={planExerciseInput} onChange={setPlanExerciseInput} placeholder="Search exercise..." />
            <div className="max-h-40 overflow-y-auto space-y-2 custom-scrollbar">
              {getExerciseOptions(planBodyPartInput)
                .filter((e: string) => !planExerciseInput || e.toLowerCase().includes(planExerciseInput.toLowerCase()))
                .slice(0, 10)
                .map((e: string) => (
                  <button
                    key={e}
                    onClick={() => setPlanExerciseInput(e)}
                    className="w-full text-left px-4 py-3 rounded-xl border bg-white/[0.03] border-border text-white/60 hover:text-white hover:border-lime/30 text-xs font-bold transition-all"
                  >
                    {e}
                  </button>
                ))}
            </div>
            <button
              onClick={addExerciseToPlan}
              className="w-full py-3 rounded-xl bg-sky/15 text-sky border border-sky/30 text-[10px] font-black uppercase tracking-widest hover:bg-sky hover:text-dark transition-all"
            >
              Add Exercise To {editingPlanDay}
            </button>
          </div>

          {(currentPlanDraft.exercises || []).length > 0 && (
            <div className="space-y-2">
              {(currentPlanDraft.exercises || []).map((ex: any, idx: number) => (
                <div key={idx} className="flex justify-between items-center rounded-xl border border-border bg-white/[0.02] px-4 py-3">
                  <div>
                    <div className="text-sm font-bold">{ex.name}</div>
                    <div className="label-small text-lime">{ex.bodyPart}</div>
                  </div>
                  <button onClick={() => removeExerciseFromPlan(idx)} className="p-2 rounded-lg bg-pink/20 text-pink border border-pink/30">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={saveCurrentPlan}
              disabled={savingPlan}
              className="py-4 rounded-2xl bg-lime text-dark text-[10px] font-black uppercase tracking-widest shadow-lg shadow-lime/20 disabled:opacity-50 disabled:pointer-events-none active:scale-95 transition-all"
            >
              {savingPlan ? 'Saving...' : 'Save Weekly Plan'}
            </button>
            <button
              onClick={clearCurrentPlan}
              className="py-4 rounded-2xl bg-pink/15 text-pink border border-pink/30 text-[10px] font-black uppercase tracking-widest"
            >
              Clear Day
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StrengthPanel(props: any) {
  const {
    selectedMuscle,
    setSelectedMuscle,
    exercise,
    setExercise,
    getExerciseOptions,
    personalExercises,
    handleDeletePersonalExercise,
    weight,
    setWeight,
    reps,
    setReps,
    rpe,
    setRpe,
    handleAddSet,
    savingSet,
    currentSets,
    setCurrentSets,
    editingSetId,
    editWeight,
    setEditWeight,
    editReps,
    setEditReps,
    handleStartEditingSet,
    handleUpdateSet,
    workoutName,
    setWorkoutName,
    handleFinishWorkout,
    savingWorkout,
    setEditingSetId,
    previousPerformance,
  } = props;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-2">
      <div>
        <div className="label-small text-muted mb-4 ml-1">Target Muscle Group</div>
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
          {BODY_PARTS.map((m) => (
            <button
              key={m}
              onClick={() => {
                setSelectedMuscle(m);
                setExercise('');
              }}
              className={`relative shrink-0 w-28 h-36 rounded-2xl overflow-hidden border transition-all active:scale-95 group ${
                selectedMuscle === m
                  ? 'border-lime shadow-[0_0_20px_rgba(215,255,0,0.2)]'
                  : 'border-border/50 opacity-40 hover:opacity-100 hover:border-lime/30'
              }`}
            >
              <img
                src={CATEGORY_IMAGES[m]}
                alt={m}
                referrerPolicy="no-referrer"
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
              <div className="absolute inset-0 flex flex-col justify-end p-3 text-left">
                <div
                  className={`w-1.5 h-1.5 rounded-full mb-1 transition-all ${
                    selectedMuscle === m ? 'bg-lime shadow-[0_0_8px_rgba(215,255,0,1)]' : 'bg-white/20'
                  }`}
                />
                <div className={`text-[10px] font-black uppercase tracking-widest ${selectedMuscle === m ? 'text-lime' : 'text-white/60'}`}>
                  {m}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="label-small text-muted ml-1">Select Exercise</div>
            <div className="relative">
              <input
                value={exercise}
                onChange={(e) => setExercise(toExerciseTitle(e.target.value))}
                className="w-full p-5 bg-white/[0.03] border border-border rounded-2xl text-sm font-bold focus:outline-none focus:border-lime transition-all"
                placeholder="Search exercise..."
              />
              <Search className="absolute right-5 top-1/2 -translate-y-1/2 opacity-20" size={16} />
            </div>

            <div className="mt-3 max-h-56 overflow-y-auto space-y-2 custom-scrollbar">
              {getExerciseOptions(selectedMuscle)
                .filter((e: string) => !exercise || e.toLowerCase().includes(exercise.toLowerCase()))
                .slice(0, 16)
                .map((e: string) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setExercise(e)}
                    className={`w-full text-left px-4 py-3 rounded-xl border text-xs font-bold transition-all ${
                      exercise === e
                        ? 'bg-lime text-dark border-lime shadow-lg shadow-lime/20'
                        : 'bg-white/[0.03] border-border text-white/50 hover:text-white hover:border-lime/30'
                    }`}
                  >
                    {e}
                  </button>
                ))}
            </div>

            {exercise && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mt-4 p-4 bg-lime/5 border border-lime/20 rounded-2xl"
              >
                <div className="text-[10px] font-black text-lime uppercase tracking-widest mb-1">Selected Exercise</div>
                <div className="text-sm font-bold text-white/90">{exercise}</div>
                {previousPerformance ? (
  <>
    <div className="grid grid-cols-2 gap-2 mt-4">
      <MiniMetric label="Last Weight" value={`${previousPerformance.lastWeight} kg`} />
      <MiniMetric label="Last Reps" value={previousPerformance.lastReps} />
      <MiniMetric label="Best Set" value={previousPerformance.bestSet} />
      <MiniMetric label="Suggested" value={previousPerformance.suggested} />
    </div>

    {previousPerformance.nextTarget && (
      <div className="mt-3 p-3 bg-lime/10 border border-lime/30 rounded-xl">
        <div className="text-[9px] uppercase tracking-widest text-lime font-black">
          AI Target
        </div>
        <div className="text-xs font-bold text-white mt-1">
          {previousPerformance.nextTarget.text}
        </div>
      </div>
    )}
  </>
) : (                <p className="text-[10px] text-white/30 mt-1">No previous performance found. Start with a controlled first set.</p>
                )}
              </motion.div>
            )}
          </div>

          {personalExercises.filter((e: any) => e.bodyPart === selectedMuscle).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {personalExercises
                .filter((e: any) => e.bodyPart === selectedMuscle)
                .map((e: any) => (
                  <div key={e.name} className="flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[9px] uppercase font-bold tracking-wider">
                    <span className="text-white/60">{e.name}</span>
                    <button onClick={() => handleDeletePersonalExercise(e.name)} className="text-white/20 hover:text-pink transition-colors">
                      <X size={10} />
                    </button>
                  </div>
                ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <InputBlock label="Weight (KG)" value={weight} onChange={setWeight} placeholder="0 for bodyweight" />
            <InputBlock label="Reps" value={reps} onChange={setReps} placeholder="10" />
          </div>
        </div>

        <div className="hidden md:block">
          <div className="p-1 bg-white/5 border border-border rounded-2xl overflow-hidden aspect-[4/3] relative group shadow-2xl">
            <img
              src={CATEGORY_IMAGES[selectedMuscle]}
              alt="Muscle Focus"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover transition-all duration-1000 group-hover:scale-105 group-hover:rotate-1"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
            <div className="absolute bottom-6 left-6 right-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Brain size={12} className="text-lime" />
                    <span className="text-[10px] font-black uppercase text-lime tracking-[0.2em]">Muscle Focus</span>
                  </div>
                  <div className="text-2xl font-black uppercase tracking-tighter text-white">{selectedMuscle} Group</div>
                </div>
                <div className="p-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10">
                  <Dumbbell size={20} className="text-white" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <RpeSelector rpe={rpe} setRpe={setRpe} />

      <button
        onClick={handleAddSet}
        disabled={savingSet}
        className="w-full py-5 bg-white/[0.02] border border-border border-dashed hover:border-lime text-sky font-black rounded-2xl transition-all uppercase text-[10px] tracking-[0.2em] disabled:opacity-50 disabled:pointer-events-none"
      >
        {savingSet ? 'Saving Set...' : 'Save Set'}
      </button>

      {currentSets.length > 0 && (
        <ActiveSets
          currentSets={currentSets}
          setCurrentSets={setCurrentSets}
          editingSetId={editingSetId}
          editWeight={editWeight}
          setEditWeight={setEditWeight}
          editReps={editReps}
          setEditReps={setEditReps}
          handleStartEditingSet={handleStartEditingSet}
          handleUpdateSet={handleUpdateSet}
          workoutName={workoutName}
          setWorkoutName={setWorkoutName}
          handleFinishWorkout={handleFinishWorkout}
          savingWorkout={savingWorkout}
          setEditingSetId={setEditingSetId}
        />
      )}
    </div>
  );
}

function MiniMetric({ label, value }: any) {
  return (
    <div className="rounded-xl bg-black/20 border border-border p-3">
      <div className="text-[8px] uppercase tracking-widest text-white/30 font-black">{label}</div>
      <div className="text-[10px] text-white/80 font-black mt-1">{value}</div>
    </div>
  );
}

function InputText({ label, value, onChange, placeholder }: any) {
  return (
    <div className="space-y-2">
      <div className="label-small text-muted ml-1">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full p-4 bg-white/[0.03] border border-border rounded-2xl text-sm font-bold focus:outline-none focus:border-lime transition-all"
        placeholder={placeholder}
      />
    </div>
  );
}

function InputBlock({ label, value, onChange, placeholder }: any) {
  return (
    <div className="space-y-2">
      <div className="label-small text-muted ml-1">{label}</div>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full p-5 bg-white/[0.03] border border-border rounded-2xl text-sm font-black focus:outline-none focus:border-lime transition-all"
        placeholder={placeholder}
      />
    </div>
  );
}

function RpeSelector({ rpe, setRpe }: any) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center mb-2 px-1">
        <div className="label-small text-muted">Intensity / RPE</div>
        <span className={`text-[10px] font-black uppercase ${Number(rpe) > 8 ? 'text-pink' : 'text-lime'}`}>
          RPE {rpe} • {RPE_LABELS[rpe]}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {['6', '7', '8', '9', '10'].map((val) => (
          <button
            key={val}
            onClick={() => setRpe(val)}
            className={`py-3 rounded-xl text-xs font-black transition-all border ${
              rpe === val
                ? 'bg-lime text-dark border-lime shadow-[0_0_15px_rgba(215,255,0,0.2)]'
                : 'bg-white/5 border-border text-white/40 hover:border-lime/30'
            }`}
          >
            <div>{val}</div>
            <div className="text-[8px] opacity-60 mt-1">{RPE_LABELS[val]}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ActiveSets(props: any) {
  const {
    currentSets,
    setCurrentSets,
    editingSetId,
    editWeight,
    setEditWeight,
    editReps,
    setEditReps,
    handleStartEditingSet,
    handleUpdateSet,
    workoutName,
    setWorkoutName,
    handleFinishWorkout,
    savingWorkout,
    setEditingSetId,
  } = props;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="space-y-4 mb-6">
        <InputText label="Workout Name" value={workoutName} onChange={setWorkoutName} placeholder="Push, Pull, Upper Body, Full Body..." />
        <div className="flex justify-between items-center">
          <div className="label-small text-lime">Saved Sets</div>
          <button
            onClick={handleFinishWorkout}
            disabled={savingWorkout}
            className="px-6 py-2 bg-lime text-dark rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-lime/20 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            {savingWorkout ? 'Saving...' : 'Submit Workout'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-white/[0.02]">
        <table className="w-full min-w-[620px] text-left">
          <thead>
            <tr className="border-b border-border text-[9px] uppercase tracking-widest text-white/30">
              <th className="p-4">Set</th>
              <th className="p-4">Exercise</th>
              <th className="p-4">Weight</th>
              <th className="p-4">Reps</th>
              <th className="p-4">RPE</th>
              <th className="p-4">Volume</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentSets.map((s: any, idx: number) => (
              <tr key={s.id} className="border-b border-border/60 last:border-0">
                <td className="p-4 text-xs font-black text-lime">{idx + 1}</td>
                <td className="p-4 text-xs font-bold">{s.exercise}</td>

                {editingSetId === s.id ? (
                  <>
                    <td className="p-4">
                      <input
                        type="number"
                        value={editWeight}
                        onChange={(e) => setEditWeight(e.target.value)}
                        className="w-20 p-2 bg-black border border-border rounded-lg text-xs font-black text-lime focus:outline-none focus:border-lime"
                      />
                    </td>
                    <td className="p-4">
                      <input
                        type="number"
                        value={editReps}
                        onChange={(e) => setEditReps(e.target.value)}
                        className="w-16 p-2 bg-black border border-border rounded-lg text-xs font-black text-lime focus:outline-none focus:border-lime"
                      />
                    </td>
                    <td className="p-4 text-xs font-bold">RPE {s.rpe}</td>
                    <td className="p-4 text-xs font-black text-white/70">{getSetVolume({ ...s, weight: Number(editWeight), reps: Number(editReps) })} kg</td>
                    <td className="p-4">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleUpdateSet(s.id)} className="p-2 bg-lime text-dark rounded-lg hover:bg-lime/80 transition-all">
                          <CheckCircle2 size={14} />
                        </button>
                        <button onClick={() => setEditingSetId(null)} className="p-2 bg-white/5 rounded-lg text-white/40 hover:text-white transition-all">
                          <X size={14} />
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="p-4 text-xs font-black text-lime">{s.weight === '0' ? 'BW' : `${s.weight} kg`}</td>
                    <td className="p-4 text-xs font-black">{s.reps}</td>
                    <td className="p-4 text-xs font-bold">RPE {s.rpe} • {RPE_LABELS[String(s.rpe)] || ''}</td>
                    <td className="p-4 text-xs font-black text-white/70">{getSetVolume(s)} kg</td>
                    <td className="p-4">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleStartEditingSet(s)}
                          className="p-2 rounded-lg bg-lime/20 text-lime border border-lime/30 hover:bg-lime hover:text-black transition-all active:scale-95"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          onClick={() => setCurrentSets(currentSets.filter((x: any) => x.id !== s.id))}
                          className="p-2 rounded-lg bg-pink/20 text-pink border border-pink/30 hover:bg-pink hover:text-black transition-all active:scale-95"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}

function CardioPanel(props: any) {
  const {
    cardioExercise,
    setCardioExercise,
    getExerciseOptions,
    cardioDuration,
    setCardioDuration,
    cardioDistance,
    setCardioDistance,
    cardioExtraMetric,
    cardioExtraValue,
    setCardioExtraValue,
    handleAddCardio,
    readiness = 55,
    fatigueStatus = 'Normal Fatigue',
  } = props;

  const durationNum = Number(cardioDuration || 0);
  const estimatedCalories = durationNum
    ? Math.round(durationNum * getCardioCaloriesPerMinute(cardioExercise, fatigueStatus))
    : 0;
  const cardioAdvice = getConditioningAdvice(readiness, fatigueStatus, 'Cardio');

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-2 transition-all">
      <div className="rounded-3xl border border-sky/20 bg-sky/5 p-5">
        <div className="label-small text-sky mb-2">Cardio Coach</div>
        <p className="text-sm font-bold text-white">{cardioAdvice}</p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-[10px] font-black uppercase tracking-widest text-white/40">
          <div>Readiness: <span className="text-lime">{readiness}%</span></div>
          <div>Est. Burn: <span className="text-sky">{estimatedCalories || '—'} kcal</span></div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="label-small text-muted ml-1">Primary Cardio Options</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {getExerciseOptions('Cardio').map((e: string) => (
            <button
              key={e}
              onClick={() => setCardioExercise(e)}
              className={`w-full p-4 rounded-2xl border text-left transition-all active:scale-95 ${
                cardioExercise === e
                  ? 'bg-lime/20 border-lime text-lime shadow-lg'
                  : 'bg-white/[0.02] border-border text-white/40 hover:bg-white/[0.05] hover:text-white'
              }`}
            >
              <p className="text-[10px] font-black uppercase tracking-widest leading-tight">{e}</p>
            </button>
          ))}
        </div>

        <InputText label="Manual Selection / Search" value={cardioExercise} onChange={(v: string) => setCardioExercise(toExerciseTitle(v))} placeholder="Search cardio..." />
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {[15, 30, 45, 60].map((min) => (
            <button
              key={min}
              onClick={() => setCardioDuration(String(min))}
              className={`shrink-0 px-4 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${
                Number(cardioDuration) === min ? 'bg-lime text-dark border-lime' : 'bg-white/[0.03] border-border text-white/40 hover:text-white'
              }`}
            >
              {min} min
            </button>
          ))}
        </div>
      </div>

      <div
        className={`grid gap-4 ${
          cardioExtraMetric && shouldShowDistance(cardioExercise)
            ? 'grid-cols-2 sm:grid-cols-3'
            : cardioExtraMetric || shouldShowDistance(cardioExercise)
              ? 'grid-cols-2'
              : 'grid-cols-1'
        }`}
      >
        <InputBlock label="Duration (Min)" value={cardioDuration} onChange={setCardioDuration} placeholder="30" />

        {shouldShowDistance(cardioExercise) && (
          <div className="space-y-2">
            <div className="label-small text-muted ml-1">Distance (Km)</div>
            <input
              type="text"
              value={cardioDistance}
              onChange={(e) => setCardioDistance(e.target.value)}
              className="w-full p-5 bg-white/[0.03] border border-border rounded-2xl text-sm font-black focus:outline-none focus:border-lime transition-all"
              placeholder="5.0"
            />
          </div>
        )}

        {cardioExtraMetric && (
          <div className="space-y-2 animate-in zoom-in-95">
            <div className="label-small text-sky ml-1 font-black">{cardioExtraMetric}</div>
            <input
              type="text"
              value={cardioExtraValue}
              onChange={(e) => setCardioExtraValue(e.target.value)}
              className="w-full p-5 bg-sky/5 border border-sky/20 rounded-2xl text-sm font-black text-sky focus:outline-none focus:border-sky transition-all"
              placeholder="..."
            />
          </div>
        )}
      </div>

      <button
        onClick={handleAddCardio}
        disabled={!cardioExercise || !cardioDuration}
        className="w-full py-6 bg-lime text-dark font-black rounded-3xl shadow-xl shadow-lime/20 uppercase text-xs tracking-[0.3em] active:scale-95 disabled:opacity-20 disabled:pointer-events-none transition-all flex items-center justify-center gap-3"
      >
        <CheckCircle2 size={18} />
        {cardioExercise ? `Log ${toExerciseTitle(cardioExercise)}` : 'Log Cardio'}
      </button>
    </div>
  );
}

function SportsYogaPanel(props: any) {
  const {
    mode,
    selectedSub,
    setSelectedSub,
    cardioExercise,
    setCardioExercise,
    cardioDuration,
    setCardioDuration,
    getExerciseOptions,
    handleSubmit,
    readiness = 55,
    fatigueStatus = 'Normal Fatigue',
  } = props;

  const durationNum = Number(cardioDuration || 0);
  const estimatedCalories = durationNum
    ? Math.round(durationNum * (mode === 'Sports' ? getCardioCaloriesPerMinute(cardioExercise || mode, fatigueStatus) : 4))
    : 0;
  const coachAdvice = getConditioningAdvice(readiness, fatigueStatus, mode);

  const subs = Object.keys((EXERCISE_DATABASE as any)[mode] || {});

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-2 transition-all">
      <div className="rounded-3xl border border-lime/20 bg-lime/[0.04] p-5">
        <div className="label-small text-lime mb-2">{mode} Coach</div>
        <p className="text-sm font-bold text-white">{coachAdvice}</p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-[10px] font-black uppercase tracking-widest text-white/40">
          <div>Readiness: <span className="text-lime">{readiness}%</span></div>
          <div>Est. Burn: <span className="text-sky">{estimatedCalories || '—'} kcal</span></div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="label-small text-muted ml-1">{mode === 'Sports' ? 'Sports Disciplines' : 'Yoga Styles'}</div>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          {subs.map((sub) => (
            <button
              key={sub}
              onClick={() => {
                setSelectedSub(sub);
                setCardioExercise('');
              }}
              className={`shrink-0 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                selectedSub === sub
                  ? 'bg-lime/10 border-lime text-lime shadow-lg'
                  : 'bg-white/[0.02] border-border text-white/30 hover:text-white'
              }`}
            >
              {sub}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="label-small text-muted ml-1">{mode === 'Sports' ? 'Select Activity' : 'Select Asana / Sequence'}</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {getExerciseOptions(mode, selectedSub).map((e: string) => (
            <button
              key={e}
              onClick={() => setCardioExercise(e)}
              className={`w-full p-4 rounded-2xl border text-left transition-all active:scale-95 ${
                cardioExercise === e
                  ? 'bg-lime/20 border-lime text-lime shadow-lg'
                  : 'bg-white/[0.02] border-border text-white/40 hover:bg-white/[0.05] hover:text-white'
              }`}
            >
              <p className="text-[10px] font-black uppercase tracking-widest leading-tight">{e}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {(mode === 'Sports' ? [30, 45, 60, 90] : [15, 30, 45, 60]).map((min) => (
          <button
            key={min}
            onClick={() => setCardioDuration(String(min))}
            className={`shrink-0 px-4 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${
              Number(cardioDuration) === min ? 'bg-lime text-dark border-lime' : 'bg-white/[0.03] border-border text-white/40 hover:text-white'
            }`}
          >
            {min} min
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InputBlock label="Duration (Min)" value={cardioDuration} onChange={setCardioDuration} placeholder={mode === 'Sports' ? '60' : '45'} />
        <div className="flex items-end">
          <button
            onClick={handleSubmit}
            disabled={!cardioExercise || !cardioDuration}
            className="w-full py-5 bg-lime text-dark font-black rounded-2xl shadow-xl shadow-lime/20 uppercase text-xs tracking-widest active:scale-95 disabled:opacity-20 transition-all"
          >
            {cardioExercise ? `Log ${toExerciseTitle(cardioExercise)}` : `Log ${mode}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function WorkoutHistory({ workoutsArr, handleEditWorkout, handleDeleteWorkout }: any) {
  return (
    <div id="workout-history" className="stat-card">
      <h3 className="label-small mb-6 text-pink">Workout History</h3>

      {workoutsArr.length === 0 ? (
        <div className="py-16 text-center">
          <div className="label-small opacity-20 italic">No workout recorded for this date</div>
        </div>
      ) : (
        <div className="space-y-3">
          {workoutsArr.map((w: any, idx: number) => (
            <div key={w.id || idx} className="p-5 bg-white/[0.02] border border-border rounded-2xl space-y-3 group/session transition-all hover:border-white/10">
              <div className="flex justify-between items-center gap-4">
                <div>
                  <p className="font-bold text-sm tracking-tight">{w.name}</p>
                  <span className="label-small text-sky">{w.category}</span>
                </div>

                <div className="flex gap-2 opacity-100 md:opacity-0 md:group-hover/session:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleEditWorkout(w)}
                    className="p-2 rounded-lg bg-lime/20 text-lime border border-lime/30 hover:bg-lime hover:text-black transition-all active:scale-95"
                    title="Edit workout"
                  >
                    <Search size={14} />
                  </button>

                  <button
                    onClick={() => handleDeleteWorkout(w.id)}
                    className="p-2 rounded-lg bg-pink/20 text-pink border border-pink/30 hover:bg-pink hover:text-black transition-all active:scale-95"
                    title="Delete workout"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest opacity-40">
                <span>{w.sets?.length || 0} sets</span>
                <span className="text-lime">{getWorkoutTotalVolume(w.sets || [])} kg volume</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomExerciseModal(props: any) {
  const { showCustomForm, setShowCustomForm, customExercise, setCustomExercise, handleAddCustomExercise } = props;

  return (
    <AnimatePresence>
      {showCustomForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowCustomForm(false)}
            className="absolute inset-0 bg-black/90 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="relative w-full max-w-md bg-panel border border-border p-10 rounded-[3rem] shadow-2xl"
          >
            <button
              onClick={() => setShowCustomForm(false)}
              className="absolute top-8 right-8 p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-all"
            >
              <X size={18} />
            </button>

            <div className="label-small text-pink mb-2">Custom Exercise</div>
            <h3 className="text-3xl font-black mb-10">Add Exercise</h3>

            <div className="space-y-5">
              <InputText
                label="Exercise Name"
                value={customExercise.name}
                onChange={(v: string) => setCustomExercise({ ...customExercise, name: v })}
                placeholder="Enter exercise name..."
              />

              <div className="space-y-2">
                <label className="label-small text-muted ml-1 uppercase opacity-40">Body Part</label>
                <select
                  value={customExercise.bodyPart}
                  onChange={(e) => setCustomExercise({ ...customExercise, bodyPart: e.target.value })}
                  className="w-full p-5 bg-white/[0.03] border border-border rounded-2xl text-sm font-bold focus:outline-none focus:border-pink transition-all appearance-none"
                >
                  {[...BODY_PARTS, 'Cardio'].map((m) => (
                    <option key={m} value={m} className="bg-dark">
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleAddCustomExercise}
                className="w-full py-5 bg-pink text-dark font-black rounded-2xl shadow-xl shadow-pink/20 uppercase text-xs tracking-widest active:scale-95 transition-all mt-4"
              >
                Add Exercise
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function RestTimer({ time, setTime, isActive, setIsActive, reason }: any) {
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (isActive && time > 0) {
      timerRef.current = window.setInterval(() => setTime((t: number) => t - 1), 1000);
    } else if (time <= 0) {
      setIsActive(false);
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('StayFitInLife', { body: 'Rest complete. Start your next set.' });
      }
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate?.([200, 100, 200]);
      }
    }

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [isActive, time, setTime, setIsActive]);

  const reset = () => {
    setIsActive(false);
    setTime(60);
  };

  return (
    <div className="stat-card">
      <div className="flex items-center gap-3 mb-6">
        <Timer size={18} className="text-lime" />
        <h3 className="label-small text-lime">Rest Timer</h3>
      </div>

      <div className="text-5xl font-black font-mono tracking-tighter">
        {Math.floor(time / 60)}:{String(time % 60).padStart(2, '0')}
      </div>

      {reason && <p className="text-[10px] text-white/40 mt-3 leading-relaxed">{reason}</p>}

      <div className="flex gap-3 mt-6">
        <button
          onClick={() => setIsActive(!isActive)}
          className="flex-1 py-3 rounded-xl bg-lime text-dark font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2"
        >
          {isActive ? <Pause size={14} /> : <Play size={14} />}
          {isActive ? 'Pause Timer' : 'Start Timer'}
        </button>
        <button onClick={reset} className="px-4 rounded-xl bg-white/5 border border-border text-white/50 hover:text-white text-[10px] font-black uppercase">
          <RotateCcw size={14} />
          Reset
        </button>
      </div>
    </div>
  );
}