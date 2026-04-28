export async function sendWelcomeEmail(email: string) {
  try {
    await fetch('/.netlify/functions/send-welcome', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
  } catch {
    console.warn('Welcome email could not be sent right now.');
  }
}
