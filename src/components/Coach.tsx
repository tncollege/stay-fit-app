import React, { useState, useEffect } from 'react';
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

  const isWithinLastWeek = (dateString?: string) => {
    if (!dateString) return false;
    const lastDate = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - lastDate.getTime());
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return diffDays < 7;
  };

  const handleAsk = async () => {
    if (!question) return;
    
    const today = new Date().toDateString();
    let queryCount = data.apiQueryCount || 0;
    
    // Reset if it's a new day
    if (data.lastApiQueryDate !== today) {
      queryCount = 0;
    }

    if (queryCount >= 5) {
      setResponse("DAILY QUANTUM LIMIT REACHED: Your allocation of 5 metabolic consulting cycles per day has been depleted. The link will refresh tomorrow.");
      setQuestion('');
      return;
    }

    setLoading(true);
    const ans = await askAiCoach(question, {
      profile: data.profile,
      today: data.meals[getTodayKey()] || [],
      recovery: data.recovery[getTodayKey()] || {},
      insights: []
    });
    
    setResponse(ans);
    setData((prev: AppData) => ({ 
      ...prev, 
      apiQueryCount: queryCount + 1,
      lastApiQueryDate: today
    }));
    setLoading(false);
    setQuestion('');
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
                        <div className="flex flex-col gap-4">
                          <div className="h-4 bg-white/5 rounded-full w-3/4 animate-pulse" />
                          <div className="h-4 bg-white/5 rounded-full w-full animate-pulse" />
                          <div className="h-4 bg-white/5 rounded-full w-2/3 animate-pulse" />
                        </div>
                      ) : (
                        <Markdown>{response}</Markdown>
                      )}
                    </div>
                  )}
                </div>

                <div className="relative z-10">
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center px-1">
                      <div className="text-[10px] font-black uppercase tracking-widest text-white/30">
                        Signal Cycles: <span className={(data.lastApiQueryDate === new Date().toDateString() ? (data.apiQueryCount || 0) : 0) >= 5 ? 'text-pink' : 'text-lime'}>
                          {data.lastApiQueryDate === new Date().toDateString() ? (data.apiQueryCount || 0) : 0}/5
                        </span>
                      </div>
                      {(data.lastApiQueryDate === new Date().toDateString() && (data.apiQueryCount || 0) >= 5) && (
                        <div className="text-[9px] font-bold text-pink uppercase tracking-tighter">Neural Link Restricted</div>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <input 
                        value={question}
                        onChange={e => setQuestion(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAsk()}
                        disabled={loading || (data.lastApiQueryDate === new Date().toDateString() && (data.apiQueryCount || 0) >= 5)}
                        placeholder={(data.lastApiQueryDate === new Date().toDateString() && (data.apiQueryCount || 0) >= 5) ? "Quantum limit reached..." : "Ask about nutrition, training splits, or recovery..."}
                        className="flex-1 bg-white/[0.05] border border-border rounded-2xl px-6 py-4 text-sm font-bold focus:outline-none focus:border-lime transition-all disabled:opacity-50"
                      />
                      <button 
                        onClick={handleAsk}
                        disabled={loading || !question || (data.lastApiQueryDate === new Date().toDateString() && (data.apiQueryCount || 0) >= 5)}
                        className="p-4 bg-lime text-dark rounded-2xl shadow-xl shadow-lime/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none"
                      >
                        {loading ? <RefreshCw className="animate-spin" size={20} /> : <Send size={20} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <QuickAction icon={<Utensils />} label="Optimize my protein intake" onClick={() => setQuestion("How should I optimize my protein intake for my current goal and weight?")} />
                <QuickAction icon={<Activity />} label="Training recovery tips" onClick={() => setQuestion("Based on my recent workouts and recovery, what should I train today?")} />
                <QuickAction icon={<Brain />} label="Focus & motivation" onClick={() => setQuestion("I'm feeling a bit demotivated. Give me some tactical advice to stay focused on my 7-day streak.")} />
                <QuickAction icon={<Dumbbell />} label="Plateau breaking" onClick={() => setQuestion("I feel like I've hit a plateau in my fat loss. What adjustments should I consider?")} />
                <QuickAction icon={<Pill />} label="Supplement protocol" onClick={() => setActiveSubTab('supplement')} />
                <QuickAction icon={<Info />} label="Metabolic flexibility" onClick={() => setQuestion("Explain how I can improve my metabolic flexibility given my current diet profile.")} />
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
                        <h3 className="text-xl text-pink uppercase tracking-tighter">Neural Link Offline</h3>
                        <p className="text-sm max-w-sm mt-2 opacity-50 leading-relaxed">
                          {workoutPlan || `Initialize your AI training protocol tailored to your ${data.profile.goal}.`}
                        </p>
                      </div>
                      <button 
                        onClick={handleGenerateWorkoutPlan}
                        className="px-10 py-5 bg-lime text-dark font-black rounded-2xl uppercase text-[11px] tracking-[0.25em] shadow-2xl shadow-lime/20 hover:scale-105 active:scale-95 transition-all"
                      >
                        {workoutPlan ? 'Re-Initialize Protocol' : 'Sync Training Matrix'}
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
                        <h3 className="text-xl text-pink uppercase tracking-tighter">Metabolic Link Offline</h3>
                        <p className="text-sm max-w-sm mt-2 opacity-50 leading-relaxed">
                          {mealPlan || `Configure your ${data.profile.diet} nutrition strategy for maximal ${data.profile.goal}.`}
                        </p>
                      </div>
                      <button 
                        onClick={handleGenerateMealPlan}
                        className="px-10 py-5 bg-lime text-dark font-black rounded-2xl uppercase text-[11px] tracking-[0.25em] shadow-2xl shadow-lime/20 hover:scale-105 active:scale-95 transition-all"
                      >
                        {mealPlan ? 'Stable Protocol Sync' : 'Sync Nutrition Matrix'}
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
                        <h3 className="text-xl text-pink uppercase tracking-tighter">Bio-Protocol Offline</h3>
                        <p className="text-sm max-w-sm mt-2 opacity-50 leading-relaxed">
                          {supplementPlan || `Launch your tailored supplement strategy optimized for ${data.profile.goal}.`}
                        </p>
                      </div>
                      <button 
                        onClick={handleGenerateSupplementPlan}
                        className="px-10 py-5 bg-lime text-dark font-black rounded-2xl uppercase text-[11px] tracking-[0.25em] shadow-2xl shadow-lime/20 hover:scale-105 active:scale-95 transition-all"
                      >
                        {supplementPlan ? 'Re-Sync Protocol' : 'Launch Supplement Matrix'}
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
