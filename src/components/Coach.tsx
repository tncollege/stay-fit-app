import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Brain, Send, Sparkles, Utensils, Dumbbell, Activity, CheckCircle2, ChevronRight, RefreshCw, X, MessageSquare, ListTodo, Soup, Info, Pill } from 'lucide-react';
import { AppData, Profile } from '../lib/types';
import { askAiCoach, generateWorkoutPlan, generateMealPlan, generateSupplementPlan } from '../services/aiService';
import { getTodayKey } from '../lib/utils';
import Markdown from 'react-markdown';

export default function Coach({ data, setData }: { data: AppData, setData: any }) {
  const [activeSubTab, setActiveSubTab] = useState<'chat' | 'workout' | 'meal' | 'supplement'>('chat');
  const [question, setQuestion] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [workoutPlan, setWorkoutPlan] = useState(data.cachedWorkoutPlan || '');
  const [mealPlan, setMealPlan] = useState(data.cachedMealPlan || '');
  const [supplementPlan, setSupplementPlan] = useState(data.cachedSupplementPlan || '');
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);

  const todayKey = getTodayKey();

  const coachContext = useMemo(() => {
    const todayMeals = data.meals?.[todayKey] || [];
    const todayWorkouts = data.workouts?.[todayKey] || [];
    const todayWater = data.water?.[todayKey] || [];
    const todaySteps = data.steps?.[todayKey] || 0;
    const todayRecovery = data.recovery?.[todayKey] || {};

    const calories = todayMeals.reduce((sum, m) => sum + Number(m.calories || 0), 0);
    const protein = todayMeals.reduce((sum, m) => sum + Number(m.protein || 0), 0);
    const carbs = todayMeals.reduce((sum, m) => sum + Number(m.carbs || 0), 0);
    const fats = todayMeals.reduce((sum, m) => sum + Number(m.fats || 0), 0);
    const waterLitres = todayWater.reduce((sum, w) => sum + Number(w.amount || 0), 0) / 1000;
    const burned = todayWorkouts.reduce((sum, w) => sum + Number(w.caloriesBurned || 0), 0);

    const weight = data.profile.currentWeight ?? 70;
    let targetCalories = weight * 30;
    if (data.profile.goal === 'Fat Loss') targetCalories -= 500;
    if (data.profile.goal === 'Muscle Gain') targetCalories += 300;

    const targets = {
      calories: Math.round(targetCalories),
      protein: Math.round(weight * 2),
      carbs: Math.round((targetCalories * 0.4) / 4),
      fats: Math.round((targetCalories * 0.3) / 9),
      water: 3.5,
    };

    let weeklyLoad = 0;
    let workoutsThisWeek = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const workouts = data.workouts?.[key] || [];
      workoutsThisWeek += workouts.length;
      weeklyLoad += workouts.reduce((sum, w) => sum + Number(w.caloriesBurned || 0), 0);
    }

    const recoveryScore = (() => {
      const sleep = Number((todayRecovery as any)?.sleep || 70);
      const proteinRatio = targets.protein ? Math.min(1, protein / targets.protein) : 0.5;
      const waterRatio = targets.water ? Math.min(1, waterLitres / targets.water) : 0.5;
      const strainPenalty = Math.min(25, weeklyLoad / 160);
      return Math.max(35, Math.min(95, Math.round(sleep * 0.4 + proteinRatio * 25 + waterRatio * 20 + 20 - strainPenalty)));
    })();

    const fatigueStatus = weeklyLoad > 3000 ? 'High Fatigue' : weeklyLoad > 1800 ? 'Moderate Fatigue' : 'Normal Fatigue';
    const coachMode = recoveryScore > 75 && fatigueStatus === 'Normal Fatigue'
      ? 'Performance'
      : recoveryScore >= 55
      ? 'Controlled Build'
      : 'Recovery';

    return {
      date: todayKey,
      profile: data.profile,
      meals: todayMeals,
      workouts: todayWorkouts,
      recovery: todayRecovery,
      consumed: { calories, protein, carbs, fats },
      targets,
      waterLitres,
      burned,
      steps: todaySteps,
      weeklyLoad,
      workoutsThisWeek,
      recoveryScore,
      fatigueStatus,
      coachMode,
      lastWorkout: todayWorkouts[todayWorkouts.length - 1] || null,
      activePlans: {
        workoutPlan: Boolean(workoutPlan && !workoutPlan.toUpperCase().includes('ERROR')),
        mealPlan: Boolean(mealPlan && !mealPlan.toUpperCase().includes('ERROR')),
        supplementPlan: Boolean(supplementPlan && !supplementPlan.toUpperCase().includes('ERROR')),
      },
    };
  }, [data, todayKey, workoutPlan, mealPlan, supplementPlan]);

  const coachTone = coachContext.coachMode === 'Performance'
    ? 'Push performance, but keep technical form strict.'
    : coachContext.coachMode === 'Controlled Build'
    ? 'Train smart with controlled volume and protect recovery.'
    : 'Prioritize recovery, mobility, hydration and sleep.';


  const isWithinLastWeek = (dateString?: string) => {
    if (!dateString) return false;
    const lastDate = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - lastDate.getTime());
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return diffDays < 7;
  };

  const handleAsk = async (forcedQuestion?: string) => {
    const finalQuestion = (forcedQuestion || question).trim();
    if (!finalQuestion || loading) return;

    const today = new Date().toDateString();
    let queryCount = data.apiQueryCount || 0;

    if (data.lastApiQueryDate !== today) {
      queryCount = 0;
    }

    if (queryCount >= 5) {
      setResponse('Daily AI limit reached. Your 5 coaching queries reset tomorrow. You can still use saved plans and quick actions.');
      setQuestion('');
      return;
    }

    setLoading(true);

    try {
      const ans = await askAiCoach(finalQuestion, {
        profile: data.profile,
        today: coachContext.meals,
        recovery: coachContext.recovery,
        insights: [],
        coachContext,
        consumed: coachContext.consumed,
        targets: coachContext.targets,
        workouts: coachContext.workouts,
        weeklyLoad: coachContext.weeklyLoad,
        workoutsThisWeek: coachContext.workoutsThisWeek,
        fatigueStatus: coachContext.fatigueStatus,
        recoveryScore: coachContext.recoveryScore,
        coachMode: coachContext.coachMode,
        lastWorkout: coachContext.lastWorkout,
      });

      setResponse(ans);
      setData((prev: AppData) => ({
        ...prev,
        apiQueryCount: queryCount + 1,
        lastApiQueryDate: today,
      }));
    } catch (err) {
      console.error('Gym-E Coach V2 error:', err);
      setResponse('Gym-E could not connect right now. Your app data is safe. Try again in a moment.');
    } finally {
      setLoading(false);
      setQuestion('');
    }
  };

  const askWithPrompt = async (prompt: string) => {
    setActiveSubTab('chat');
    setQuestion(prompt);
    await handleAsk(prompt);
  };

  const isError = (plan: string) => {
    if (!plan) return true;
    const up = plan.toUpperCase();
    return up.includes('ERROR') || 
           up.includes('QUOTA') || 
           up.includes('INVALID') || 
           up.includes('UNABLE TO GENERATE') ||
           up.includes('FAILED TO') ||
           plan.length < 50; // Real plans are usually long
  };

  const handleGenerateWorkoutPlan = async () => {
    const hasValidPlan = workoutPlan && !isError(workoutPlan);
    const isDev = (import.meta as any).env.DEV;
    
    if (!isDev && hasValidPlan && isWithinLastWeek(data.lastWorkoutPlanDate)) {
      alert("CHRONO-LOCK ACTIVE: You have already generated a workout protocol this week. New training matrices can be initialized every 7 days.");
      return;
    }

    try {
      setIsGeneratingPlan(true);
      const plan = await generateWorkoutPlan(data.profile);
      setWorkoutPlan(plan);
      
      // Only update the date if it's a valid plan
      const isSuccess = plan && !plan.toUpperCase().includes('ERROR') && !plan.toUpperCase().includes('QUOTA') && !plan.toUpperCase().includes('INVALID');
      
      setData((prev: AppData) => ({ 
        ...prev, 
        cachedWorkoutPlan: plan,
        lastWorkoutPlanDate: (isSuccess && !isDev) ? new Date().toISOString() : prev.lastWorkoutPlanDate
      }));
    } catch (error) {
      console.error("Gym-E Workout Plan Error:", error);
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const handleGenerateMealPlan = async () => {
    const hasValidPlan = mealPlan && !isError(mealPlan);
    const isDev = (import.meta as any).env.DEV;

    if (!isDev && hasValidPlan && isWithinLastWeek(data.lastMealPlanDate)) {
      alert("NUTRITION LOCK: Your weekly meal matrix is already active. Synchronization of a new plan is available once per week.");
      return;
    }

    try {
      setIsGeneratingPlan(true);
      const plan = await generateMealPlan(data.profile);
      setMealPlan(plan);
      
      const isSuccess = plan && !plan.toUpperCase().includes('ERROR') && !plan.toUpperCase().includes('QUOTA') && !plan.toUpperCase().includes('INVALID');

      setData((prev: AppData) => ({ 
        ...prev, 
        cachedMealPlan: plan,
        lastMealPlanDate: (isSuccess && !isDev) ? new Date().toISOString() : prev.lastMealPlanDate
      }));
    } catch (error) {
      console.error("Gym-E Meal Plan Error:", error);
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const handleGenerateSupplementPlan = async () => {
    const hasValidPlan = supplementPlan && !isError(supplementPlan);
    const isDev = (import.meta as any).env.DEV;

    if (!isDev && hasValidPlan && isWithinLastWeek(data.lastSupplementPlanDate)) {
      alert("BIO-LOCK: Your supplement protocol is currently active. Nutritional optimization cycles reset every 7 days.");
      return;
    }

    try {
      setIsGeneratingPlan(true);
      const plan = await generateSupplementPlan(data.profile);
      setSupplementPlan(plan);
      
      const isSuccess = plan && !plan.toUpperCase().includes('ERROR') && !plan.toUpperCase().includes('QUOTA') && !plan.toUpperCase().includes('INVALID');

      setData((prev: AppData) => ({ 
        ...prev, 
        cachedSupplementPlan: plan,
        lastSupplementPlanDate: (isSuccess && !isDev) ? new Date().toISOString() : prev.lastSupplementPlanDate
      }));
    } catch (error) {
      console.error("Gym-E Supplement Plan Error:", error);
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const dailyQueryCount = data.lastApiQueryDate === new Date().toDateString() ? (data.apiQueryCount || 0) : 0;
  const aiLimitReached = dailyQueryCount >= 5;

  const renderCoachResponse = (text: string) => {
    if (!text) return null;

    const normalized = text
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const sections = normalized
      .split(/\n\s*\n/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (sections.length <= 1) {
      return <Markdown>{normalized}</Markdown>;
    }

    return (
      <div className="space-y-3">
        {sections.map((section, idx) => {
          const clean = section.replace(/^#+\s*/, '');
          const [firstLine, ...restLines] = clean.split('\n');
          const looksLikeHeading = firstLine.length <= 80 && /[:：]$/.test(firstLine.trim());
          const title = looksLikeHeading ? firstLine.replace(/[:：]$/, '') : idx === 0 ? 'Gym-E Summary' : `Action Block ${idx}`;
          const body = looksLikeHeading ? restLines.join('\n').trim() : section;

          return (
            <div key={idx} className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-lime">
                {title}
              </div>
              <div className="text-sm leading-relaxed text-white/75">
                <Markdown>{body || section}</Markdown>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-4xl font-black tracking-tight">Gym-E <span className="text-lime">Advisor</span></h2>
          <div className="flex items-center gap-2 mt-2">
            <div className="w-2 h-2 rounded-full bg-lime animate-pulse shadow-[0_0_8px_rgba(215,255,0,0.8)]" />
            <div className="label-small text-lime">Active Intelligence Protocol</div>
          </div>
        </div>
        
        <div className="flex p-1 bg-white/[0.03] border border-border rounded-2xl w-fit overflow-x-auto max-w-full">
          {[
            { id: 'chat', label: 'Consult', icon: <MessageSquare size={14} /> },
            { id: 'workout', label: 'Workout', icon: <Dumbbell size={14} /> },
            { id: 'meal', label: 'Diet', icon: <Soup size={14} /> },
            { id: 'supplement', label: 'Supps', icon: <Pill size={14} /> }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap ${
                activeSubTab === tab.id ? 'bg-lime text-dark shadow-lg shadow-lime/20' : 'text-white/30 hover:text-white'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <CoachMetric label="Mode" value={coachContext.coachMode} tone={coachContext.coachMode === 'Recovery' ? 'pink' : coachContext.coachMode === 'Performance' ? 'lime' : 'sky'} />
        <CoachMetric label="Recovery" value={`${coachContext.recoveryScore}%`} tone={coachContext.recoveryScore >= 75 ? 'lime' : coachContext.recoveryScore >= 55 ? 'sky' : 'pink'} />
        <CoachMetric label="Fatigue" value={coachContext.fatigueStatus.replace(' Fatigue', '')} tone={coachContext.fatigueStatus === 'High Fatigue' ? 'pink' : 'lime'} />
        <CoachMetric label="7D Load" value={`${Math.round(coachContext.weeklyLoad)} kcal`} tone="sky" />
      </section>

      <div className="rounded-3xl border border-lime/20 bg-lime/10 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.25em] text-lime mb-1">Coach V2 Decision Layer</div>
          <p className="text-sm font-bold text-white/80">{coachTone}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => askWithPrompt('Generate my best workout recommendation for today using my recovery, fatigue, nutrition and recent workouts.')}
            disabled={loading || aiLimitReached}
            className="px-4 py-3 rounded-xl bg-lime text-dark text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
          >
            {loading ? 'Analyzing...' : 'Today Workout'}
          </button>
          <button
            onClick={() => askWithPrompt('Fix my diet for the rest of today using my current calories, protein, macros and goal.')}
            disabled={loading || aiLimitReached}
            className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
          >
            {loading ? 'Analyzing...' : 'Fix Diet'}
          </button>
          <button
            onClick={() => askWithPrompt('Give me a recovery protocol for tonight based on my recovery score, fatigue and training load.')}
            disabled={loading || aiLimitReached}
            className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
          >
            {loading ? 'Analyzing...' : 'Recover Me'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        <AnimatePresence mode="wait">
          {activeSubTab === 'chat' && (
            <motion.div 
              key="chat"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="stat-card min-h-[400px] flex flex-col relative overflow-hidden bg-[#111]">
                <div className="absolute top-0 right-0 p-8 opacity-5 text-white pointer-events-none">
                  <Brain size={120} />
                </div>
                
                <div className="ai-tag mb-4">Metabolic Intelligence Hub</div>
                
                <div className="flex-1 text-sm leading-relaxed overflow-auto pr-2 custom-scrollbar relative z-10 mb-6">
                  {!response && !loading ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-20 text-center space-y-4">
                      <Brain size={48} />
                      <p className="max-w-xs font-medium">Ready to analyze your metabolic data and provide performance insights.</p>
                    </div>
                  ) : (
                    <div className="markdown-body">
                      {loading ? (
                        <div className="rounded-2xl border border-lime/20 bg-lime/10 p-5">
                          <div className="flex items-center gap-3 text-lime text-xs font-black uppercase tracking-widest">
                            <RefreshCw size={16} className="animate-spin" />
                            Gym-E is analyzing your live data...
                          </div>
                          <div className="mt-4 space-y-3">
                            <div className="h-4 bg-white/10 rounded-full w-3/4 animate-pulse" />
                            <div className="h-4 bg-white/10 rounded-full w-full animate-pulse" />
                            <div className="h-4 bg-white/10 rounded-full w-2/3 animate-pulse" />
                          </div>
                        </div>
                      ) : (
                        renderCoachResponse(response)
                      )}
                    </div>
                  )}
                </div>

                <div className="relative z-10">
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center px-1">
                      <div className="text-[10px] font-black uppercase tracking-widest text-white/30">
                        AI Queries Used: <span className={aiLimitReached ? 'text-pink' : 'text-lime'}>
                          {dailyQueryCount} / 5
                        </span>
                      </div>
                      {aiLimitReached && (
                        <div className="text-[9px] font-bold text-pink uppercase tracking-tighter">Daily AI limit reached</div>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <input 
                        value={question}
                        onChange={e => setQuestion(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAsk()}
                        disabled={loading || aiLimitReached}
                        placeholder={aiLimitReached ? "Daily AI limit reached. Try again tomorrow." : "Ask about nutrition, training splits, or recovery..."}
                        className="flex-1 bg-white/[0.05] border border-border rounded-2xl px-6 py-4 text-sm font-bold focus:outline-none focus:border-lime transition-all disabled:opacity-50"
                      />
                      <button 
                        onClick={handleAsk}
                        disabled={loading || !question || aiLimitReached}
                        className="px-5 py-4 bg-lime text-dark rounded-2xl shadow-xl shadow-lime/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2 font-black text-xs uppercase tracking-widest"
                      >
                        {loading ? <RefreshCw className="animate-spin" size={18} /> : <Send size={18} />}
                        {loading ? 'Wait' : 'Ask'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <QuickAction icon={<Utensils />} label="Optimize my protein intake" onClick={() => askWithPrompt("How should I optimize my protein intake for my current goal, weight, meals and protein gap?")} />
                <QuickAction icon={<Activity />} label="Training recovery tips" onClick={() => askWithPrompt("Based on my recent workouts, recovery and weekly load, what should I train today?")} />
                <QuickAction icon={<Brain />} label="Focus & motivation" onClick={() => askWithPrompt("I am feeling demotivated. Give me tactical advice based on my current app data and today's status.")} />
                <QuickAction icon={<Dumbbell />} label="Plateau breaking" onClick={() => askWithPrompt("I feel like I have hit a plateau. Analyze my calories, protein, workouts and recovery and suggest adjustments.")} />
                <QuickAction icon={<Pill />} label="Supplement protocol" onClick={() => setActiveSubTab('supplement')} />
                <QuickAction icon={<Info />} label="Metabolic flexibility" onClick={() => askWithPrompt("Explain how I can improve metabolic flexibility using my current diet, workouts and recovery status.")} />
              </div>
            </motion.div>
          )}

          {activeSubTab === 'workout' && (
            <motion.div 
              key="workout"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="stat-card bg-[#111] min-h-[500px] flex flex-col">
                <div className="flex justify-between items-center mb-6">
                  <div className="ai-tag">Dynamic Training Protocol</div>
                  <button 
                    onClick={handleGenerateWorkoutPlan}
                    disabled={isGeneratingPlan}
                    className="flex items-center gap-2 px-4 py-2 bg-lime/10 border border-lime/20 text-lime rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-lime/20 transition-all disabled:opacity-50"
                  >
                    {isGeneratingPlan ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    Refresh Plan
                  </button>
                </div>

                <div className="flex-1 overflow-auto custom-scrollbar p-6 bg-white/[0.02] rounded-2xl border border-white/5 backdrop-blur-sm">
                  {isError(workoutPlan) && !isGeneratingPlan ? (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-6 py-12">
                      <div className="w-20 h-20 rounded-full bg-lime/5 flex items-center justify-center border border-lime/10">
                        <Dumbbell size={32} className="text-lime" />
                      </div>
                      <div className="space-y-2 font-bold px-4">
                        <h3 className="text-xl text-pink uppercase tracking-tighter">AI Plan Ready</h3>
                        <p className="text-sm max-w-sm mt-2 opacity-50 leading-relaxed">
                          Generate your personalized training protocol based on today’s recovery, fatigue and goal.
                        </p>
                      </div>
                      <button 
                        onClick={handleGenerateWorkoutPlan}
                        className="px-10 py-5 bg-lime text-dark font-black rounded-2xl uppercase text-[11px] tracking-[0.25em] shadow-2xl shadow-lime/20 hover:scale-105 active:scale-95 transition-all"
                      >
                        {workoutPlan ? 'Regenerate Plan' : 'Generate Plan'}
                      </button>
                    </div>
                  ) : isGeneratingPlan ? (
                    <div className="space-y-6 py-8">
                       {[1, 2, 3, 4, 5].map(i => (
                         <div key={i} className="h-4 bg-white/5 rounded-full w-full animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
                       ))}
                    </div>
                  ) : (
                    <div className="markdown-body">
                      <Markdown>{workoutPlan}</Markdown>
                    </div>
                  )}
                </div>

                <div className="mt-8 p-6 bg-white/[0.02] border border-border rounded-2xl flex items-start gap-4">
                  <div className="p-2 bg-sky/10 rounded-xl">
                    <Sparkles className="text-sky" size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-sky mb-1">Gym-E Note</p>
                    <p className="text-xs text-white/40 leading-relaxed italic">
                      This plan is calculated based on your {data.profile.mode} status and {data.profile.goal} objective. Adjust intensity based on weekly progress.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeSubTab === 'meal' && (
            <motion.div 
              key="meal"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="stat-card bg-[#111] min-h-[500px] flex flex-col">
                <div className="flex justify-between items-center mb-6">
                  <div className="ai-tag">Metabolic Feeding Schedule</div>
                  <button 
                    onClick={handleGenerateMealPlan}
                    disabled={isGeneratingPlan}
                    className="flex items-center gap-2 px-4 py-2 bg-lime/10 border border-lime/20 text-lime rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-lime/20 transition-all disabled:opacity-50"
                  >
                    {isGeneratingPlan ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    Refresh Plan
                  </button>
                </div>

                <div className="flex-1 overflow-auto custom-scrollbar p-6 bg-white/[0.02] rounded-2xl border border-white/5 backdrop-blur-sm">
                  {isError(mealPlan) && !isGeneratingPlan ? (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-6 py-12">
                      <div className="w-20 h-20 rounded-full bg-lime/5 flex items-center justify-center border border-lime/10">
                        <Soup size={32} className="text-lime" />
                      </div>
                      <div className="space-y-2 font-bold px-4">
                        <h3 className="text-xl text-pink uppercase tracking-tighter">AI Meal Plan Ready</h3>
                        <p className="text-sm max-w-sm mt-2 opacity-50 leading-relaxed">
                          {mealPlan || `Configure your ${data.profile.diet} nutrition strategy for maximal ${data.profile.goal}.`}
                        </p>
                      </div>
                      <button 
                        onClick={handleGenerateMealPlan}
                        className="px-10 py-5 bg-lime text-dark font-black rounded-2xl uppercase text-[11px] tracking-[0.25em] shadow-2xl shadow-lime/20 hover:scale-105 active:scale-95 transition-all"
                      >
                        {mealPlan ? 'Regenerate Meal Plan' : 'Generate Meal Plan'}
                      </button>
                    </div>
                  ) : isGeneratingPlan ? (
                    <div className="space-y-6 py-8">
                       {[1, 2, 3, 4, 5].map(i => (
                         <div key={i} className="h-4 bg-white/5 rounded-full w-full animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
                       ))}
                    </div>
                  ) : (
                    <div className="markdown-body">
                      <Markdown>{mealPlan}</Markdown>
                    </div>
                  )}
                </div>

                <div className="mt-8 p-6 bg-white/[0.02] border border-border rounded-2xl flex items-start gap-4">
                  <div className="p-2 bg-pink/10 rounded-xl">
                    <Activity className="text-pink" size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-pink mb-1">AI Nutritionist</p>
                    <p className="text-xs text-white/40 leading-relaxed italic">
                      Prioritize whole foods. These macros are balanced to support your {data.profile.activity} activity level.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeSubTab === 'supplement' && (
            <motion.div 
              key="supplement"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="stat-card bg-[#111] min-h-[500px] flex flex-col">
                <div className="flex justify-between items-center mb-6">
                  <div className="ai-tag">Supplement Optimization Protocol</div>
                  <button 
                    onClick={handleGenerateSupplementPlan}
                    disabled={isGeneratingPlan}
                    className="flex items-center gap-2 px-4 py-2 bg-lime/10 border border-lime/20 text-lime rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-lime/20 transition-all disabled:opacity-50"
                  >
                    {isGeneratingPlan ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    Refresh Plan
                  </button>
                </div>

                <div className="flex-1 overflow-auto custom-scrollbar p-6 bg-white/[0.02] rounded-2xl border border-white/5 backdrop-blur-sm">
                  {isError(supplementPlan) && !isGeneratingPlan ? (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-6 py-12">
                      <div className="w-20 h-20 rounded-full bg-lime/5 flex items-center justify-center border border-lime/10">
                        <Pill size={32} className="text-lime" />
                      </div>
                      <div className="space-y-2 font-bold px-4">
                        <h3 className="text-xl text-pink uppercase tracking-tighter">AI Supplement Plan Ready</h3>
                        <p className="text-sm max-w-sm mt-2 opacity-50 leading-relaxed">
                          {supplementPlan || `Launch your tailored supplement strategy optimized for ${data.profile.goal}.`}
                        </p>
                      </div>
                      <button 
                        onClick={handleGenerateSupplementPlan}
                        className="px-10 py-5 bg-lime text-dark font-black rounded-2xl uppercase text-[11px] tracking-[0.25em] shadow-2xl shadow-lime/20 hover:scale-105 active:scale-95 transition-all"
                      >
                        {supplementPlan ? 'Regenerate Supplement Plan' : 'Generate Supplement Plan'}
                      </button>
                    </div>
                  ) : isGeneratingPlan ? (
                    <div className="space-y-6 py-8">
                       {[1, 2, 3, 4, 5].map(i => (
                         <div key={i} className="h-4 bg-white/5 rounded-full w-full animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
                       ))}
                    </div>
                  ) : (
                    <div className="markdown-body">
                      <Markdown>{supplementPlan}</Markdown>
                    </div>
                  )}
                </div>

                <div className="mt-8 p-6 bg-white/[0.02] border border-border rounded-2xl flex items-start gap-4">
                  <div className="p-2 bg-sky/10 rounded-xl">
                    <Info className="text-sky" size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-sky mb-1">Safety First</p>
                    <p className="text-xs text-white/40 leading-relaxed italic">
                      Supplements are intended to support a balanced diet, not replace it. Consult with a healthcare professional before altering your protocol.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}


function CoachMetric({ label, value, tone = 'lime' }: { label: string; value: string; tone?: 'lime' | 'sky' | 'pink' }) {
  const toneClass = tone === 'pink' ? 'text-pink border-pink/20 bg-pink/10' : tone === 'sky' ? 'text-sky border-sky/20 bg-sky/10' : 'text-lime border-lime/20 bg-lime/10';

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="text-[9px] font-black uppercase tracking-[0.25em] opacity-70 mb-2">{label}</div>
      <div className="text-lg font-black tracking-tight">{value}</div>
    </div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: any, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="p-4 bg-white/[0.02] border border-border rounded-2xl flex items-center gap-4 hover:border-lime/40 hover:bg-white/[0.04] transition-all text-left"
    >
      <div className="p-2 bg-lime/10 rounded-xl text-lime shrink-0">
        {React.cloneElement(icon, { size: 18 })}
      </div>
      <span className="text-xs font-bold text-white/70">{label}</span>
      <ChevronRight size={16} className="ml-auto text-white/20" />
    </button>
  );
}
