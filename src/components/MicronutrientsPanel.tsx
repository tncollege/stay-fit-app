import React from 'react';

const DAILY_VALUES: Record<string, number> = {
  vitaminD: 1000, vitaminC: 75, vitaminB12: 2.4, calcium: 1000,
  iron: 18, magnesium: 400, zinc: 11, omega3: 1000,
};

const LABELS: Record<string, string> = {
  vitaminD: 'Vitamin D', vitaminC: 'Vitamin C', vitaminB12: 'B12',
  calcium: 'Calcium', iron: 'Iron', magnesium: 'Magnesium', zinc: 'Zinc', omega3: 'Omega-3',
};

function collect(items: any[]) {
  const totals: Record<string, number> = {};
  for (const item of items || []) {
    const micros = item.micronutrients || item.micros || item.vitamins || item.data?.micronutrients || item.data?.micros || {};
    for (const [k, v] of Object.entries(micros)) {
      const n = Number(v || 0);
      if (!Number.isNaN(n)) totals[k] = (totals[k] || 0) + n;
    }
    if (item.name && item.value) totals[item.name] = (totals[item.name] || 0) + Number(item.value || 0);
  }
  return Object.entries(totals).map(([key, value]) => {
    const target = DAILY_VALUES[key] || 100;
    return { key, label: LABELS[key] || key, value, percent: Math.min(100, Math.round((value / target) * 100)) };
  });
}

export default function MicronutrientsPanel({ data, viewDate, micronutrients }: any) {
  const rows = collect([
    ...(micronutrients || []),
    ...(data?.micronutrients?.[viewDate] || []),
    ...(data?.supplements?.[viewDate] || []),
    ...(data?.meals?.[viewDate] || []),
  ]).slice(0, 8);

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-5">
        <h3 className="label-small text-sky">Micronutrients</h3>
        <span className="text-[9px] font-black uppercase tracking-widest text-white/25">Food + Supplements</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs font-bold text-white/30">No supplements or micronutrients logged today.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.key} className="space-y-1">
              <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                <span className="text-white/55">{row.label}</span>
                <span className="text-lime">{row.percent}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full rounded-full bg-lime shadow-[0_0_10px_rgba(215,255,0,0.35)]" style={{ width: `${row.percent}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
