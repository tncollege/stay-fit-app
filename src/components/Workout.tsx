import React, { useState, useEffect, useRef } from 'react';
import {
  Dumbbell,
  Timer,
  Trash2,
  CheckCircle2,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Brain,
  PlusCircle,
  X,
  Search,
  Trophy,
  Wind,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AppData, Workout } from '../lib/types';
import { EXERCISE_DATABASE } from '../data/database';
import { searchExerciseInfo, calculateRecoveryTime } from '../services/aiService';
import DateNavigator from './DateNavigator';
import { saveWorkout, deleteWorkoutFromCloud } from '../services/cloudDataService';

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

function normalizeExerciseName(value: string) {
  return value.replace(/\s*protocol$/i, '').trim();
}

function toExerciseTitle(value: string) {
  return normalizeExerciseName(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export default function WorkoutView({
  data,
  setData,
  viewDate,
  setViewDate,
}: {
  data: AppData;
  setData: any;
  viewDate: string;
  setViewDate: (d: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<'strength' | 'cardio' | 'sports' | 'yoga'>('strength');
  const [selectedMuscle, setSelectedMuscle] = useState<string>('Chest');
  const [selectedSportSub, setSelectedSportSub] = useState<string>('Racket Sports');
  const [selectedYogaSub, setSelectedYogaSub] = useState<string>('Vinyasa');

  const [currentSets, setCurrentSets] = useState<any[]>([]);
  const [workoutName, setWorkoutName] = useState('');
  const [exercise, setExercise] = useState('');
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [rpe, setRpe] = useState('7');

  const [searchQuery, setSearchQuery] = useState('');
  const [aiSearching, setAiSearching] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);

  const [editingSetId, setEditingSetId] = useState<number | string | null>(null);
  const [editWeight, setEditWeight] = useState('');
  const [editReps, setEditReps] = useState('');

  const [cardioExercise, setCardioExercise] = useState('');
  const [cardioDuration, setCardioDuration] = useState('');
  const [cardioDistance, setCardioDistance] = useState('');
  const [cardioExtraValue, setCardioExtraValue] = useState('');
  const [cardioExtraMetric, setCardioExtraMetric] = useState('');

  const [customExercise, setCustomExercise] = useState({
    name: '',
    bodyPart: 'Chest',
    met: 4,
    caloriesPerMinuteStandard: 6,
  });

  const [timerTime, setTimerTime] = useState(60);
  const [timerActive, setTimerActive] = useState(false);
  const [recoveryReason, setRecoveryReason] = useState('');

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const workoutsArr = data.workouts[viewDate] || [];
  const personalExercises = data.personalExercises || [];

  const getDynamicCardioMetric = (value: string) => {
    const ex = value.toLowerCase();
    if (ex.includes('treadmill')) return 'Incline (%)';
    if (ex.includes('cycling') || ex.includes('bike')) return 'Resistance';
    if (ex.includes('rowing')) return 'Resistance';
    if (ex.includes('stair') || ex.includes('climber')) return 'Floors';
    if (ex.includes('running')) return 'Avg Heart Rate';
    if (ex.includes('walking')) return 'Incline (%)';
    if (ex.includes('hiit')) return 'Intensity (1-10)';
    if (ex.includes('jump rope')) return 'Rounds';
    return '';
  };

  const shouldShowDistance = (value: string) => {
    const ex = value.toLowerCase();
    if (!ex) return true;
    if (ex.includes('hiit')) return false;
    if (ex.includes('jump rope')) return false;
    if (ex.includes('stair') || ex.includes('climber')) return false;
    return true;
  };

  useEffect(() => {
    setCardioExtraMetric(getDynamicCardioMetric(cardioExercise));
    setCardioExtraValue('');
  }, [cardioExercise]);

  const getExerciseOptions = (category: string, subcategory?: string) => {
    let fromBase: string[] = [];

    if (subcategory) {
      fromBase = (EXERCISE_DATABASE as any)[category]?.[subcategory] || [];
    } else {
      const baseVal = (EXERCISE_DATABASE as any)[category];
      fromBase = Array.isArray(baseVal) ? baseVal : [];
    }

    const fromPersonal = personalExercises
      .filter((e) => e.bodyPart === (subcategory || category))
      .map((e) => e.name);

    return Array.from(new Set([...fromBase, ...fromPersonal].map((e) => toExerciseTitle(String(e)))));
  };

  const handleAddSet = async () => {
    if (!exercise || !reps) return;

    const finalExercise = toExerciseTitle(exercise);
    const finalWeight = weight || '0';
    const newSet = {
      exercise: finalExercise,
      weight: finalWeight,
      reps,
      rpe,
      muscle: selectedMuscle,
      id: crypto.randomUUID(),
    };

    setCurrentSets((prev) => [...prev, newSet]);

    setTimerActive(false);
    const recoveryWeight = finalWeight === '0' ? 'bodyweight' : `${finalWeight}kg`;
    const recovery = await calculateRecoveryTime(finalExercise, recoveryWeight, reps);

    if (recovery) {
      setTimerTime(recovery.seconds);
      setRecoveryReason(recovery.reason);
      setTimerActive(true);
    }

    setWeight('');
    setReps('');
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
          (e) => e.name.toLowerCase() === fixedName.toLowerCase()
        );

        if (!exists) {
          setData((prev: AppData) => ({
            ...prev,
            personalExercises: [...(prev.personalExercises || []), fixedResult],
          }));
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
    } finally {
      setAiSearching(false);
    }
  };

  const handleStartEditingSet = (s: any) => {
    setEditingSetId(s.id);
    setEditWeight(s.weight);
    setEditReps(s.reps);
  };

  const handleUpdateSet = (id: number | string) => {
    setCurrentSets((prev) =>
      prev.map((s) => (s.id === id ? { ...s, weight: editWeight || '0', reps: editReps } : s))
    );
    setEditingSetId(null);
  };

  const handleAddCustomExercise = () => {
    if (!customExercise.name) return;

    const fixedCustom = {
      ...customExercise,
      name: toExerciseTitle(customExercise.name),
    };

    setData((prev: AppData) => ({
      ...prev,
      personalExercises: [...(prev.personalExercises || []), fixedCustom],
    }));

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
  };

  const addWorkoutToStateAndCloud = async (newWorkout: Workout) => {
    setData((prev: AppData) => ({
      ...prev,
      workouts: {
        ...prev.workouts,
        [viewDate]: [...(prev.workouts[viewDate] || []), newWorkout],
      },
    }));

    try {
      await saveWorkout(viewDate, newWorkout);
      console.log('Workout saved to Supabase ✅');
    } catch (err) {
      console.error('Supabase workout save error ❌', err);
    }
  };

  const handleAddCardio = async () => {
    if (!cardioExercise || !cardioDuration) return;

    const durationNum = parseInt(cardioDuration);
    const calories = durationNum * 8;
    const extraParam = cardioExtraMetric && cardioExtraValue ? { [cardioExtraMetric]: cardioExtraValue } : {};

    const newWorkout: Workout = {
      id: crypto.randomUUID(),
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
    if (currentSets.length === 0) return;

    const workoutMuscles = Array.from(
      new Set(currentSets.map((s: any) => s.muscle || selectedMuscle).filter(Boolean))
    );
    const autoWorkoutName =
      workoutMuscles.length > 1
        ? `${workoutMuscles.join(' + ')} Workout`
        : `${workoutMuscles[0] || selectedMuscle} Workout`;

    const newWorkout: Workout = {
      id: crypto.randomUUID(),
      name: workoutName.trim() || autoWorkoutName,
      category: 'Strength',
      muscles: workoutMuscles.length ? workoutMuscles : [selectedMuscle],
      sets: currentSets,
      caloriesBurned: Math.round(currentSets.length * 25),
    };

    await addWorkoutToStateAndCloud(newWorkout);

    setCurrentSets([]);
    setExercise('');
    setWorkoutName('');
    setTimerActive(false);
    setTimerTime(60);
    setRecoveryReason('');
  };

  const handleAddSportsOrYoga = async (category: 'Sports' | 'Yoga') => {
    if (!cardioExercise || !cardioDuration) return;

    const durationNum = parseInt(cardioDuration);

    const newWorkout: Workout = {
      id: crypto.randomUUID(),
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
        [viewDate]: (prev.workouts[viewDate] || []).filter((w) => w.id !== id),
      },
    }));

    try {
      await deleteWorkoutFromCloud(id);
      console.log('Workout deleted from Supabase ✅');
    } catch (err) {
      console.error('Supabase workout delete error ❌', err);
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
      setCurrentSets(workout.sets);
      setSelectedMuscle(workout.muscles[0] || 'Chest');
      setActiveTab('strength');
    }

    handleDeleteWorkout(workout.id);
  };

  const handleDeletePersonalExercise = (name: string) => {
    setData((prev: AppData) => ({
      ...prev,
      personalExercises: (prev.personalExercises || []).filter((e) => e.name !== name),
    }));
  };

  return (
    <>
      {timerActive && (
        <div className="fixed top-24 right-4 z-[95] rounded-2xl border border-lime/30 bg-panel/95 px-5 py-4 text-lime shadow-xl shadow-lime/20 backdrop-blur-md">
          <div className="text-[9px] font-black uppercase tracking-widest opacity-70">Rest Timer</div>
          <div className="text-2xl font-black font-mono">
            {Math.floor(timerTime / 60)}:{String(timerTime % 60).padStart(2, '0')}
          </div>
        </div>
      )}

      <div className="space-y-6">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="text-4xl font-black uppercase tracking-tighter">Performance Log</h2>
            <div className="flex items-center gap-4 mt-2">
              <div className="label-small text-lime tracking-[0.2em]">Neural Output Calibration</div>
              <div className="h-1 w-1 rounded-full bg-white/20" />
              <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                {workoutsArr.length} Sessions Logged
              </div>
            </div>
          </div>
          <DateNavigator viewDate={viewDate} setViewDate={setViewDate} />
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="stat-card space-y-8">
              <div className="flex gap-2 p-1 bg-black/40 rounded-2xl border border-border w-fit overflow-x-auto max-w-full scrollbar-hide">
                {[
                  ['strength', 'Strength'],
                  ['cardio', 'Cardio'],
                  ['sports', 'Sports'],
                  ['yoga', 'Yoga'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id as any)}
                    className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 ${
                      activeTab === id ? 'bg-lime text-dark shadow-lg shadow-lime/20' : 'text-white/30 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-28 py-5 bg-white/[0.02] border border-border rounded-2xl text-sm font-bold focus:outline-none focus:border-lime transition-all placeholder:opacity-20"
                  placeholder="Search exercise with AI..."
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  <button
                    onClick={handleAiSearch}
                    disabled={aiSearching || !searchQuery}
                    className={`p-2 rounded-xl border transition-all ${
                      aiSearching
                        ? 'bg-white/5 border-white/10 text-white/20'
                        : 'bg-sky/10 border-sky/20 text-sky hover:bg-sky/20'
                    }`}
                  >
                    <Sparkles size={18} className={aiSearching ? 'animate-pulse' : ''} />
                  </button>
                  <button
                    onClick={() => setShowCustomForm(true)}
                    className="p-2 bg-pink/10 text-pink rounded-xl border border-pink/20 hover:bg-pink/20 transition-all"
                  >
                    <PlusCircle size={18} />
                  </button>
                </div>
              </div>

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
                  shouldShowDistance={shouldShowDistance}
                  handleAddCardio={handleAddCardio}
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

            <div className="stat-card">
              <h3 className="label-small mb-6 text-pink">Temporal Record</h3>

              {workoutsArr.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="label-small opacity-20 italic">No output recorded for this date</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {workoutsArr.map((w, idx) => (
                    <div
                      key={w.id || idx}
                      className="p-5 bg-white/[0.02] border border-border rounded-2xl space-y-3 group/session transition-all hover:border-white/10"
                    >
                      <div className="flex justify-between items-center gap-4">
                        <div>
                          <p className="font-bold text-sm tracking-tight">{w.name}</p>
                          <span className="label-small text-sky">{w.category}</span>
                        </div>

                        <div className="flex gap-2 opacity-100 md:opacity-0 md:group-hover/session:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleEditWorkout(w)}
                            className="p-2 rounded-lg bg-lime/20 text-lime border border-lime/30 hover:bg-lime hover:text-black shadow-[0_0_10px_rgba(163,230,53,0.6)] transition-all active:scale-95"
                          >
                            <Search size={14} />
                          </button>

                          <button
                            onClick={() => handleDeleteWorkout(w.id)}
                            className="p-2 rounded-lg bg-pink/20 text-pink border border-pink/30 hover:bg-pink hover:text-black shadow-[0_0_10px_rgba(244,114,182,0.6)] transition-all active:scale-95"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest opacity-40">
                        <span>{w.sets.length} total units</span>
                        <span className="text-lime">{w.caloriesBurned} kcal net</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

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

              <div className="label-small text-pink mb-2">Custom Biometric Input</div>
              <h3 className="text-3xl font-black mb-10">Add Custom Exercise</h3>

              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="label-small text-muted ml-1 uppercase opacity-40">Exercise Name</label>
                  <input
                    value={customExercise.name}
                    onChange={(e) => setCustomExercise({ ...customExercise, name: e.target.value })}
                    placeholder="Enter exercise name..."
                    className="w-full px-6 py-4 bg-white/[0.03] border border-border rounded-2xl text-lg font-bold focus:outline-none focus:border-pink transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="label-small text-muted ml-1 uppercase opacity-40">Body Part</label>
                  <select
                    value={customExercise.bodyPart}
                    onChange={(e) => setCustomExercise({ ...customExercise, bodyPart: e.target.value })}
                    className="w-full p-5 bg-white/[0.03] border border-border rounded-2xl text-sm font-bold focus:outline-none focus:border-pink transition-all appearance-none"
                  >
                    {Object.keys(EXERCISE_DATABASE).map((m) => (
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
    </>
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
  } = props;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-2">
      <div>
        <div className="label-small text-muted mb-4 ml-1">Target Muscle Group</div>
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
          {Object.keys(EXERCISE_DATABASE)
            .filter((k) => Array.isArray((EXERCISE_DATABASE as any)[k]))
            .map((m) => (
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
                  <div
                    className={`text-[10px] font-black uppercase tracking-widest ${
                      selectedMuscle === m ? 'text-lime' : 'text-white/60'
                    }`}
                  >
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
            <div className="label-small text-muted ml-1">Calibration Target (Exercise)</div>
            <div className="relative">
              <input
                value={exercise}
                onChange={(e) => setExercise(toExerciseTitle(e.target.value))}
                className="w-full p-5 bg-white/[0.03] border border-border rounded-2xl text-sm font-bold focus:outline-none focus:border-lime transition-all"
                placeholder="Select or type Exercise..."
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
                <p className="text-[10px] text-white/30 mt-1">
                  Log your working sets below. Image previews were removed so exercise names stay accurate.
                </p>
              </motion.div>
            )}
          </div>

          {personalExercises.filter((e: any) => e.bodyPart === selectedMuscle).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {personalExercises
                .filter((e: any) => e.bodyPart === selectedMuscle)
                .map((e: any) => (
                  <div
                    key={e.name}
                    className="flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[9px] uppercase font-bold tracking-wider"
                  >
                    <span className="text-white/60">{e.name}</span>
                    <button onClick={() => handleDeletePersonalExercise(e.name)} className="text-white/20 hover:text-pink transition-colors">
                      <X size={10} />
                    </button>
                  </div>
                ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="label-small text-muted ml-1">Load (KG)</div>
              <input
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="w-full p-5 bg-white/[0.03] border border-border rounded-2xl text-sm font-black focus:outline-none focus:border-lime transition-all"
                placeholder="0 (BW)"
              />
            </div>
            <div className="space-y-2">
              <div className="label-small text-muted ml-1">Volume (Reps)</div>
              <input
                type="number"
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                className="w-full p-5 bg-white/[0.03] border border-border rounded-2xl text-sm font-black focus:outline-none focus:border-lime transition-all"
                placeholder="10"
              />
            </div>
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
                    <span className="text-[10px] font-black uppercase text-lime tracking-[0.2em]">Neural Calibration</span>
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

      <div className="space-y-2">
        <div className="flex justify-between items-center mb-2 px-1">
          <div className="label-small text-muted">Intensity (RPE Scale)</div>
          <span className={`text-[10px] font-black uppercase ${Number(rpe) > 8 ? 'text-pink' : 'text-lime'}`}>
            {rpe === '10' ? 'Failure' : rpe === '9' ? 'Extreme' : rpe === '8' ? 'Heavy' : 'Moderate'}
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
              {val}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleAddSet}
        className="w-full py-5 bg-white/[0.02] border border-border border-dashed hover:border-lime text-sky font-black rounded-2xl transition-all uppercase text-[10px] tracking-[0.2em]"
      >
        Confirm Set Output
      </button>

      {currentSets.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="space-y-4 mb-6">
            <div>
              <div className="label-small text-muted mb-2 ml-1">Workout Name</div>
              <input
                value={workoutName}
                onChange={(e) => setWorkoutName(e.target.value)}
                className="w-full p-4 bg-white/[0.03] border border-border rounded-2xl text-sm font-bold focus:outline-none focus:border-lime transition-all"
                placeholder="Push, Pull, Upper Body, Full Body..."
              />
            </div>
            <div className="flex justify-between items-center">
              <div className="label-small text-lime">Active Bio-Calibration Session</div>
              <button
                onClick={handleFinishWorkout}
                className="px-6 py-2 bg-lime text-dark rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-lime/20 active:scale-95 transition-all"
              >
                Submit Session
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {currentSets.map((s: any, idx: number) => (
              <div
                key={s.id}
                className="flex justify-between items-center p-5 bg-white/[0.02] border border-border rounded-2xl group hover:border-lime/30 transition-all"
              >
                {editingSetId === s.id ? (
                  <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-1">
                      <p className="font-bold text-sm tracking-tight">{s.exercise}</p>
                      <div className="label-small opacity-30 mt-1">Editing Calibration {idx + 1}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={editWeight}
                        onChange={(e) => setEditWeight(e.target.value)}
                        className="w-20 p-2 bg-black border border-border rounded-lg text-xs font-black text-lime focus:outline-none focus:border-lime"
                        placeholder="0"
                      />
                      <input
                        type="number"
                        value={editReps}
                        onChange={(e) => setEditReps(e.target.value)}
                        className="w-16 p-2 bg-black border border-border rounded-lg text-xs font-black text-lime focus:outline-none focus:border-lime"
                        placeholder="Reps"
                      />
                      <button onClick={() => handleUpdateSet(s.id)} className="p-2 bg-lime text-dark rounded-lg hover:bg-lime/80 transition-all">
                        <CheckCircle2 size={14} />
                      </button>
                      <button onClick={() => setEditingSetId(null)} className="p-2 bg-white/5 rounded-lg text-white/40 hover:text-white transition-all">
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="font-bold text-sm tracking-tight">{s.exercise}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="label-small opacity-30">Set {idx + 1}</div>
                        {s.rpe && (
                          <div
                            className={`px-2 py-0.5 rounded-[4px] text-[8px] font-black uppercase ${
                              Number(s.rpe) >= 9 ? 'bg-pink/20 text-pink' : 'bg-lime/20 text-lime'
                            }`}
                          >
                            RPE {s.rpe}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-xs font-black text-lime">
                          {s.weight === '0' ? 'BW' : s.weight}
                          {s.weight !== '0' && <span className="text-[10px] opacity-40 ml-1">KG</span>}
                        </div>
                        <div className="text-[10px] font-bold opacity-30">Load</div>
                      </div>
                      <div className="w-px h-6 bg-white/10" />
                      <div className="text-right">
                        <div className="text-xs font-black text-white">{s.reps}</div>
                        <div className="text-[10px] font-bold opacity-30">Reps</div>
                      </div>

                      <div className="flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleStartEditingSet(s)}
                          className="p-2 rounded-lg bg-lime/20 text-lime border border-lime/30 hover:bg-lime hover:text-black shadow-[0_0_10px_rgba(163,230,53,0.35)] transition-all active:scale-95"
                        >
                          <Search size={14} />
                        </button>
                        <button
                          onClick={() => setCurrentSets(currentSets.filter((x: any) => x.id !== s.id))}
                          className="p-2 rounded-lg bg-pink/20 text-pink border border-pink/30 hover:bg-pink hover:text-black shadow-[0_0_10px_rgba(244,114,182,0.35)] transition-all active:scale-95"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
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
    shouldShowDistance,
    handleAddCardio,
  } = props;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-2 transition-all">
      <div className="space-y-6">
        <div className="label-small text-muted ml-1">Primary Cardio Engines</div>
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

        <div className="space-y-2">
          <div className="label-small text-muted ml-1">Manual Selection / Search Override</div>
          <input
            value={cardioExercise}
            onChange={(e) => setCardioExercise(toExerciseTitle(e.target.value))}
            className="w-full p-5 bg-white/[0.03] border border-border rounded-2xl text-sm font-bold focus:outline-none focus:border-lime transition-all"
            placeholder="Select or type cardio..."
          />
        </div>
      </div>

      <div className={`grid gap-4 ${cardioExtraMetric && shouldShowDistance(cardioExercise) ? 'grid-cols-2 sm:grid-cols-3' : cardioExtraMetric || shouldShowDistance(cardioExercise) ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div className="space-y-2">
          <div className="label-small text-muted ml-1">Duration (Min)</div>
          <input
            type="number"
            value={cardioDuration}
            onChange={(e) => setCardioDuration(e.target.value)}
            className="w-full p-5 bg-white/[0.03] border border-border rounded-2xl text-sm font-black focus:outline-none focus:border-lime transition-all"
            placeholder="30"
          />
        </div>

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
        Log Cardio Output
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
  } = props;

  const subs = Object.keys((EXERCISE_DATABASE as any)[mode] || {});

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-2 transition-all">
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="label-small text-muted ml-1">Duration (Min)</div>
          <input
            type="number"
            value={cardioDuration}
            onChange={(e) => setCardioDuration(e.target.value)}
            className="w-full p-5 bg-white/[0.03] border border-border rounded-2xl text-sm font-black focus:outline-none focus:border-lime transition-all"
            placeholder={mode === 'Sports' ? '60' : '45'}
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={handleSubmit}
            disabled={!cardioExercise || !cardioDuration}
            className="w-full py-5 bg-lime text-dark font-black rounded-2xl shadow-xl shadow-lime/20 uppercase text-xs tracking-widest active:scale-95 disabled:opacity-20 transition-all"
          >
            Log {mode} Session
          </button>
        </div>
      </div>
    </div>
  );
}

function RestTimer({ time, setTime, isActive, setIsActive, reason }: any) {
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (isActive && time > 0) {
      timerRef.current = setInterval(() => {
        setTime((prev: number) => prev - 1);
      }, 1000);
    } else if (time <= 0 && isActive) {
      playAlert();

      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Rest Finished!', {
          body: 'Time for your next set!',
          icon: '/favicon.ico',
        });
      }

      if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 500]);
      setIsActive(false);
    }

    return () => clearInterval(timerRef.current);
  }, [isActive, time, setIsActive, setTime]);

  const playAlert = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);

      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.1);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1);

      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 1);
    } catch (e) {
      console.error('Audio alert failed', e);
    }
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="stat-card text-center relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-[2px] bg-white/5 overflow-hidden">
        <motion.div
          initial={{ x: '-100%' }}
          animate={isActive ? { x: '100%' } : { x: '-100%' }}
          transition={{ duration: time, ease: 'linear' }}
          className="w-full h-full bg-lime shadow-[0_0_10px_rgba(215,255,0,0.8)]"
        />
      </div>

      <div className="flex justify-between items-center mb-6">
        <h3 className="label-small text-sky">Neural Recovery</h3>
        <Timer className="text-sky opacity-40" size={18} />
      </div>

      {reason && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 px-4 py-2 bg-sky/5 rounded-xl border border-sky/10 inline-block"
        >
          <p className="text-[9px] font-black uppercase tracking-widest text-sky">{reason}</p>
        </motion.div>
      )}

      <div className="text-6xl font-black mb-10 font-mono tracking-tighter text-white/90">{formatTime(time)}</div>

      <div className="flex justify-center gap-4">
        <button
          onClick={() => setIsActive(!isActive)}
          className={`px-8 py-5 rounded-2xl flex-1 flex items-center justify-center transition-all ${
            isActive ? 'bg-pink/10 text-pink border border-pink/20' : 'bg-lime text-dark shadow-xl shadow-lime/20'
          }`}
        >
          {isActive ? <Pause size={20} /> : <Play size={20} />}
        </button>

        <button
          onClick={() => {
            setIsActive(false);
            setTime(60);
          }}
          className="p-5 bg-white/[0.03] border border-border rounded-2xl text-muted hover:text-white transition-all"
        >
          <RotateCcw size={20} />
        </button>
      </div>

      <div className="flex gap-2 mt-8">
        {[45, 60, 90, 120, 180, 300].map((s) => (
          <button
            key={s}
            onClick={() => {
              setTime(s);
              setIsActive(false);
            }}
            className={`flex-1 py-3 rounded-xl text-[9px] font-black tracking-widest uppercase border transition-all ${
              time === s
                ? 'border-lime text-lime bg-lime/10 shadow-[0_0_10px_rgba(215,255,0,0.1)]'
                : 'border-border text-white/20 hover:text-white/40'
            }`}
          >
            {s < 60 ? `${s}s` : `${s / 60}m`}
          </button>
        ))}
      </div>
    </div>
  );
}
