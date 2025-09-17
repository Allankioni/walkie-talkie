"use client";
import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export default function PWAControls() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">("desktop");

  useEffect(() => {
    const media = window.matchMedia('(display-mode: standalone)');
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      const dismissed = typeof window !== 'undefined' && sessionStorage.getItem('wt_install_dismissed');
      // Determine installed state without relying on React state to avoid deps
      const nav = window.navigator as unknown as { standalone?: boolean };
      const isInstalled = media.matches || nav.standalone === true;
      // Only auto-show for Android users as requested
      const ua = navigator.userAgent || "";
      const isAndroid = /Android/i.test(ua);
      if (isAndroid && !dismissed && !isInstalled) setShowInstallModal(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    const setupSW = async () => {
      // Ensure the service worker is registered so installability criteria are met
      try {
        if ("serviceWorker" in navigator) {
          const existing = await navigator.serviceWorker.getRegistration();
          if (!existing) {
            await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
          }
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            // no-op: page will use update banner to refresh
          });
        }
      } catch {}
      if (!("serviceWorker" in navigator)) return;
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return;
      if (reg.waiting) setUpdateReady(true);

      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller) {
            setUpdateReady(true);
          }
        });
      });
    };
    setupSW();

    const checkInstalled = () => {
      const nav = window.navigator as unknown as { standalone?: boolean };
      setInstalled(media.matches || nav.standalone === true);
    };
    checkInstalled();
    // Detect platform for instruction copy
    const ua = navigator.userAgent || "";
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const isAndroid = /Android/i.test(ua);
    setPlatform(isIOS ? "ios" : isAndroid ? "android" : "desktop");

    // Auto-open modal on first visit even if beforeinstallprompt hasn't fired yet (Android only)
  const dismissed = typeof window !== 'undefined' && sessionStorage.getItem('wt_install_dismissed');
    const nav2 = window.navigator as unknown as { standalone?: boolean };
    const isInstalledNow = media.matches || nav2.standalone === true;
  const uaNow = navigator.userAgent || "";
  const isAndroidNow = /Android/i.test(uaNow);
  if (isAndroidNow && !dismissed && !isInstalledNow) setShowInstallModal(true);
    media.addEventListener?.('change', checkInstalled);
    const onAppInstalled = () => setInstalled(true);
    window.addEventListener('appinstalled', onAppInstalled);

    const onOpenInstall = () => {
      if (deferredPrompt) {
        // Trigger native prompt
        install();
      } else {
        // Open instructions modal
        setShowInstallModal(true);
      }
    };
    window.addEventListener('wt-open-install', onOpenInstall as EventListener);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      media.removeEventListener?.('change', checkInstalled);
      window.removeEventListener('appinstalled', onAppInstalled);
      window.removeEventListener('wt-open-install', onOpenInstall as EventListener);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } finally {
      setDeferredPrompt(null);
      setShowInstallModal(false);
    }
  };

  const refresh = async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) reg.waiting?.postMessage({ type: "SKIP_WAITING" });
    window.location.reload();
  };

  const dismissInstall = () => {
    try { sessionStorage.setItem('wt_install_dismissed', '1'); } catch {}
    setShowInstallModal(false);
  };

  if (!deferredPrompt && !updateReady && !showInstallModal) return null;

  return (
    <>
      {/* Update banner bottom-right */}
      <div className="fixed bottom-4 right-4 z-50">
        {updateReady && (
          <button onClick={refresh} className="px-3 py-2 rounded-md bg-amber-400 text-black text-sm shadow">
            Update available — Refresh
          </button>
        )}
      </div>

      {/* Auto-open install modal on first eligible load */}
      {showInstallModal && !installed && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="w-[90%] max-w-sm rounded-2xl border border-white/10 bg-[#0b1220] p-5 shadow-2xl text-white">
            <h3 className="text-lg font-semibold">Install Walkie‑Talkie?</h3>
            <p className="text-sm text-white/70 mt-1">Add to your home screen for faster access and a full‑screen experience.</p>
            {!deferredPrompt && (
              <div className="text-xs text-white/60 mt-3">
                {platform === 'ios' && (
                  <>
                    <p>On iOS Safari: tap the Share icon, then choose &quot;Add to Home Screen&quot;.</p>
                  </>
                )}
                {platform !== 'ios' && (
                  <>
                    <p>
                      If you don’t see an install button, open your browser menu and choose &quot;Install app&quot; or &quot;Add to Home screen&quot;.
                    </p>
                  </>
                )}
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button className="px-4 py-2 text-sm rounded-md bg-white/10 border border-white/10" onClick={dismissInstall}>Not now</button>
              <button className="px-4 py-2 text-sm rounded-md bg-cyan-500 text-black font-medium" onClick={install}>
                {deferredPrompt ? 'Install' : (platform === 'ios' ? 'How to install' : 'Install (via browser menu)')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
