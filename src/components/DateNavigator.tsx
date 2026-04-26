import React from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { format, addDays, subDays, parseISO } from 'date-fns';

interface DateNavigatorProps {
  viewDate: string;
  setViewDate: (date: string) => void;
}

export default function DateNavigator({ viewDate, setViewDate }: DateNavigatorProps) {
  const currentDate = parseISO(viewDate);
  const isToday = format(new Date(), 'yyyy-MM-dd') === viewDate;

  const handlePrev = () => {
    const prevDate = subDays(currentDate, 1);
    setViewDate(format(prevDate, 'yyyy-MM-dd'));
  };

  const handleNext = () => {
    const nextDate = addDays(currentDate, 1);
    setViewDate(format(nextDate, 'yyyy-MM-dd'));
  };

  const handleToday = () => {
    setViewDate(format(new Date(), 'yyyy-MM-dd'));
  };

  return (
    <div className="flex items-center gap-4 bg-white/[0.03] border border-border p-2 rounded-2xl w-fit">
      <button 
        onClick={handlePrev}
        className="p-2 hover:bg-white/5 rounded-xl transition-all text-white/40 hover:text-white"
      >
        <ChevronLeft size={20} />
      </button>
      
      <div className="flex items-center gap-3 px-4 min-w-[160px] justify-center">
        <Calendar size={16} className="text-lime opacity-40" />
        <span className="text-sm font-black uppercase tracking-widest">
          {isToday ? 'Today' : format(currentDate, 'MMM dd, yyyy')}
        </span>
      </div>

      <button 
        onClick={handleNext}
        className="p-2 hover:bg-white/5 rounded-xl transition-all text-white/40 hover:text-white"
      >
        <ChevronRight size={20} />
      </button>

      {!isToday && (
        <button 
          onClick={handleToday}
          className="ml-2 px-4 py-2 bg-lime/10 text-lime rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-lime/20 transition-all border border-lime/20"
        >
          Reset to Today
        </button>
      )}
    </div>
  );
}
