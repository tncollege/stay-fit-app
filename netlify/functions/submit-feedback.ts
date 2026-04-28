import { createClient } from '@supabase/supabase-js';

export const handler = async (event: any) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
    const { message, email, metadata } = JSON.parse(event.body || '{}');
    if (!message) return { statusCode: 400, body: 'Feedback required' };

    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return { statusCode: 500, body: 'Feedback service not configured' };

    const supabase = createClient(url, key);
    const { error } = await supabase.from('feedback').insert({
      message,
      email: email || null,
      metadata: metadata || {}
    });
    if (error) throw error;

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Feedback failed' }) };
  }
};
