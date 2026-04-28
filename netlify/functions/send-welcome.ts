import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export const handler = async (event: any) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
    const { email } = JSON.parse(event.body || '{}');
    if (!email) return { statusCode: 400, body: 'Email required' };

    await resend.emails.send({
      from: 'STAYFITINLIFE <no-reply@stayfitinlife.com>',
      to: email,
      subject: 'Welcome to STAYFITINLIFE 🚀',
      html: `
      <!DOCTYPE html>
      <html><body style="font-family:Arial,sans-serif;background:#0a0a0a;color:#fff;padding:20px;">
      <div style="max-width:600px;margin:auto;background:#111;padding:30px;border-radius:16px;border:1px solid #222;">
        <h1 style="color:#d7ff00;text-align:center;">Welcome to STAYFITINLIFE 🚀</h1>
        <p>Hi,</p>
        <p style="color:#ccc;">Your intelligent fitness system is now active.</p>
        <div style="margin:20px 0;padding:15px;background:#0f0f0f;border-radius:8px;">
          <ul style="line-height:1.8;color:#aaa;">
            <li>📊 Track workouts & performance</li>
            <li>🥗 Monitor nutrition & micronutrients</li>
            <li>📈 Analyze recovery & progress</li>
            <li>🧠 Get AI-driven fitness insights</li>
          </ul>
        </div>
        <p style="color:#ccc;">Stay consistent. Stay strong.</p>
        <p style="margin-top:30px;">— <strong style="color:#d7ff00;">Himanshu Kaushik</strong></p>
        <hr style="margin:30px 0;border-color:#222;" />
        <p style="font-size:12px;color:#555;text-align:center;">STAYFITINLIFE • Your Personal Fitness Intelligence System</p>
      </div></body></html>`
    });

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Email failed' }) };
  }
};
