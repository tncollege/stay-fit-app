import React, { useState } from 'react';
import { submitFeedback } from '../services/feedbackService';

export default function FeedbackForm({ email }: { email?: string | null }) {
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setStatus('saving');
    try {
      await submitFeedback(message.trim(), email || null, { source: 'app', userAgent: navigator.userAgent });
      setMessage('');
      setStatus('saved');
      window.setTimeout(() => setStatus('idle'), 2500);
    } catch {
      setStatus('error');
      window.setTimeout(() => setStatus('idle'), 3000);
    }
  };

  return (
    <div className="stat-card">
      <h3 className="label-small text-pink mb-4">Feedback</h3>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tell us what to improve..." className="w-full min-h-28 p-4 bg-white/[0.03] border border-border rounded-2xl text-sm font-bold focus:outline-none focus:border-pink" />
      <button onClick={handleSubmit} disabled={status === 'saving' || !message.trim()} className="mt-4 w-full py-4 bg-lime text-dark font-black rounded-2xl uppercase text-xs tracking-widest disabled:opacity-40">
        {status === 'saving' ? 'Sending...' : status === 'saved' ? 'Feedback sent ✅' : 'Submit Feedback'}
      </button>
      {status === 'error' && <p className="mt-3 text-xs font-bold text-pink">Unable to send feedback. Please try again.</p>}
    </div>
  );
}
