import React, { useMemo, useState } from 'react';
import {
  resetPassword,
  signIn,
  signInWithApple,
  signInWithGoogle,
  signUp,
  updatePassword,
  signOut,
} from '../services/authService';

type AuthMode = 'login' | 'forgot' | 'reset';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export default function Auth({ onAuth }: { onAuth: () => void }) {
  const initialMode = useMemo<AuthMode>(() => {
    const url = new URL(window.location.href);
    const isRecovery =
      url.pathname === '/reset-password' ||
      url.hash.includes('type=recovery') ||
      url.searchParams.get('type') === 'recovery';

    return isRecovery ? 'reset' : 'login';
  }, []);

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) return alert('Please enter email and password.');

    setLoading(true);
    try {
      await signIn(email, password);
      onAuth();
    } catch (error) {
      alert(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup() {
    if (!email || !password) return alert('Please enter email and password.');
    if (password.length < 6) return alert('Password must be at least 6 characters.');

    setLoading(true);
    try {
      await signUp(email, password);
      alert('Account created. Check your email if confirmation is enabled, then login.');
    } catch (error) {
      alert(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!email) return alert('Please enter your email first.');

    setLoading(true);
    try {
      await resetPassword(email);
      alert('Password reset link sent. Check your email.');
      setMode('login');
    } catch (error) {
      alert(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdatePassword() {
    if (!newPassword) return alert('Please enter a new password.');
    if (newPassword.length < 6) return alert('Password must be at least 6 characters.');

    setLoading(true);
    try {
      await updatePassword(newPassword);
      await signOut();
      alert('Password updated. Please login again.');
      window.history.replaceState({}, document.title, '/');
      setMode('login');
      setNewPassword('');
    } catch (error) {
      alert(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: 'google' | 'apple') {
    setLoading(true);
    try {
      const result = provider === 'google' ? await signInWithGoogle() : await signInWithApple();
      if (result.error) throw result.error;
    } catch (error) {
      alert(getErrorMessage(error));
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white p-6">
      <div className="w-full max-w-md bg-white/5 border border-white/10 rounded-3xl p-8 space-y-5 shadow-2xl">
        <div>
          <h1 className="text-3xl font-black text-lime">STAYFITINLIFE</h1>
          <p className="text-xs text-white/40 mt-2 uppercase tracking-widest">
            {mode === 'reset' ? 'Set a new password' : mode === 'forgot' ? 'Recover your account' : 'Login to continue'}
          </p>
        </div>

        {mode === 'reset' ? (
          <>
            <input
              className="w-full p-4 rounded-xl bg-black border border-white/10 focus:outline-none focus:border-lime"
              placeholder="New password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />

            <button
              onClick={handleUpdatePassword}
              disabled={loading}
              className="w-full p-4 rounded-xl bg-lime text-black font-black disabled:opacity-50"
            >
              {loading ? 'UPDATING...' : 'UPDATE PASSWORD'}
            </button>
          </>
        ) : (
          <>
            <input
              className="w-full p-4 rounded-xl bg-black border border-white/10 focus:outline-none focus:border-lime"
              placeholder="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value.trim())}
            />

            {mode === 'login' && (
              <input
                className="w-full p-4 rounded-xl bg-black border border-white/10 focus:outline-none focus:border-lime"
                placeholder="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}

            {mode === 'forgot' ? (
              <button
                onClick={handleForgotPassword}
                disabled={loading}
                className="w-full p-4 rounded-xl bg-lime text-black font-black disabled:opacity-50"
              >
                {loading ? 'SENDING...' : 'SEND RESET LINK'}
              </button>
            ) : (
              <>
                <button
                  onClick={handleLogin}
                  disabled={loading}
                  className="w-full p-4 rounded-xl bg-lime text-black font-black disabled:opacity-50"
                >
                  {loading ? 'LOGGING IN...' : 'LOGIN'}
                </button>

                <button
                  onClick={handleSignup}
                  disabled={loading}
                  className="w-full p-4 rounded-xl border border-lime text-lime font-black disabled:opacity-50"
                >
                  CREATE ACCOUNT
                </button>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={() => handleOAuth('google')}
                    disabled={loading}
                    className="p-3 rounded-xl bg-white text-black font-black text-xs uppercase tracking-widest disabled:opacity-50"
                  >
                    Google Login
                  </button>
                  <button
                    onClick={() => handleOAuth('apple')}
                    disabled={loading}
                    className="p-3 rounded-xl bg-white/10 border border-white/20 text-white font-black text-xs uppercase tracking-widest disabled:opacity-50"
                  >
                    Apple Login
                  </button>
                </div>
              </>
            )}
          </>
        )}

        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-white/40">
          {mode === 'login' ? (
            <button onClick={() => setMode('forgot')} className="hover:text-lime transition-colors">
              Forgot password?
            </button>
          ) : (
            <button onClick={() => setMode('login')} className="hover:text-lime transition-colors">
              Back to login
            </button>
          )}
          <span>Powered by Supabase</span>
        </div>
      </div>
    </div>
  );
}
