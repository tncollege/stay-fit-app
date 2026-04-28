import { useEffect, useMemo, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export default function PWAInstallPrompt({ isLoggedIn = true }: { isLoggedIn?: boolean }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const ios = useMemo(() => isIOS(), []);

  useEffect(() => {
    if (!isLoggedIn || isStandalone()) return;

    const dismissed = localStorage.getItem('stayfitinlife_install_prompt_dismissed') === 'true';
    const installed = localStorage.getItem('stayfitinlife_installed') === 'true';
    if (dismissed || installed) return;

    const timer = window.setTimeout(() => setShow(true), 1400);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setShow(true);
    };

    const onAppInstalled = () => {
      localStorage.setItem('stayfitinlife_installed', 'true');
      setShow(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, [isLoggedIn]);

  const close = () => {
    localStorage.setItem('stayfitinlife_install_prompt_dismissed', 'true');
    setShow(false);
  };

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') localStorage.setItem('stayfitinlife_installed', 'true');
    setDeferredPrompt(null);
    setShow(false);
  };

  if (!show || isStandalone()) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center px-5">
      <button type="button" aria-label="Close install prompt" onClick={close} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div className="relative w-full max-w-md rounded-[2rem] border border-lime/25 bg-[#10110f] p-7 shadow-2xl shadow-lime/10">
        <div className="mb-5 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-lime text-2xl font-black text-black shadow-lg shadow-lime/25">S</div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-lime">Install App</div>
            <h2 className="text-2xl font-black text-white">Add STAYFITINLIFE to Home Screen</h2>
          </div>
        </div>

        <p className="mb-5 text-sm font-medium leading-6 text-white/55">
          Install the app for faster access, full-screen mode, and a native mobile experience.
        </p>

        {deferredPrompt ? (
          <button type="button" onClick={install} className="mb-3 w-full rounded-2xl bg-lime py-4 text-xs font-black uppercase tracking-[0.22em] text-black shadow-xl shadow-lime/20 active:scale-95">
            Install App
          </button>
        ) : ios ? (
          <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left">
            <div className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-sky">iPhone / iPad</div>
            <ol className="space-y-2 text-xs font-bold leading-5 text-white/65">
              <li>1. Tap the <span className="text-white">Share</span> button in Safari.</li>
              <li>2. Tap <span className="text-white">Add to Home Screen</span>.</li>
              <li>3. Tap <span className="text-white">Add</span>.</li>
            </ol>
          </div>
        ) : (
          <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left">
            <div className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-sky">Android / Chrome</div>
            <ol className="space-y-2 text-xs font-bold leading-5 text-white/65">
              <li>1. Tap the browser menu <span className="text-white">⋮</span>.</li>
              <li>2. Tap <span className="text-white">Install app</span> or <span className="text-white">Add to Home screen</span>.</li>
            </ol>
          </div>
        )}

        <button type="button" onClick={close} className="w-full rounded-2xl border border-white/10 bg-white/[0.03] py-3 text-xs font-black uppercase tracking-[0.2em] text-white/55">
          Maybe Later
        </button>
      </div>
    </div>
  );
}
