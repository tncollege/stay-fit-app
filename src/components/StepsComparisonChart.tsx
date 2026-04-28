import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

function lastNDays(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    return { iso: d.toISOString().slice(0, 10), label: d.toLocaleDateString('en-US', { weekday: 'short' }) };
  });
}

export default function StepsComparisonChart({ steps = {}, days = 7 }: { steps?: Record<string, number>; days?: number }) {
  const chartData = lastNDays(days).map((d) => ({ day: d.label, steps: Number(steps[d.iso] || 0) }));
  return (
    <div className="stat-card">
      <h3 className="label-small text-sky mb-5">Steps Comparison</h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="day" stroke="rgba(255,255,255,0.35)" fontSize={10} />
            <YAxis stroke="rgba(255,255,255,0.35)" fontSize={10} width={42} />
            <Tooltip contentStyle={{ background: '#111', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, color: '#fff' }} />
            <Line type="monotone" dataKey="steps" stroke="#d7ff00" strokeWidth={3} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
