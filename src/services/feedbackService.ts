export async function submitFeedback(message: string, email?: string | null, metadata?: Record<string, unknown>) {
  const res = await fetch('/.netlify/functions/submit-feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, email, metadata }),
  });
  if (!res.ok) throw new Error('FEEDBACK_FAILED');
  return res.json();
}
