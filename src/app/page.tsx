"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useMotionValue, useMotionValueEvent } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { getSocket } from "@/lib/socket";
import { WebRTCManager } from "@/lib/webrtc";
import { playStatic, resumeAudio } from "@/lib/staticNoise";
import { discoverSignalHubs, type HubDiscoveryResult } from "@/lib/discovery";

export default function Home() {
  const {
    users,
    setNickname,
    nickname,
    connectSocket,
    transmitting,
    setTransmitting,
    room,
    changeRoom,
    loadNickname,
    signalUrl,
    setSignalUrl,
    loadSignalUrl,
    signalError,
    clearSignalError,
  } = useAppStore();
  const [nickModal, setNickModal] = useState(false);
  const [nickInput, setNickInput] = useState("");
  const [isHttpsOrigin, setIsHttpsOrigin] = useState(false);
  const [originHost, setOriginHost] = useState("");
  const [latchActive, setLatchActive] = useState(false);
  const [sliderBusy, setSliderBusy] = useState(false);
  const latchRef = useRef(false);
  const rtcRef = useRef<WebRTCManager | null>(null);
  const SLIDER_WIDTH = useMemo(() => 300, []);
  const KNOB_SIZE = useMemo(() => 56, []);
  const sliderRange = useMemo(() => SLIDER_WIDTH - KNOB_SIZE, [SLIDER_WIDTH, KNOB_SIZE]);
  const dragX = useMotionValue(0);
  const [sliderProgress, setSliderProgress] = useState(0);
  const [signalInput, setSignalInput] = useState("");
  const [discoveringHubs, setDiscoveringHubs] = useState(false);
  const [discoveredHubs, setDiscoveredHubs] = useState<HubDiscoveryResult[]>([]);
  const [discoveryMessage, setDiscoveryMessage] = useState<string | null>(null);

  useEffect(() => {
    if (sliderRange <= 0) {
      setSliderProgress(0);
      return;
    }
    const initial = dragX.get();
    setSliderProgress(Math.min(Math.max(initial / sliderRange, 0), 1));
  }, [dragX, sliderRange]);

  useMotionValueEvent(dragX, "change", (latest) => {
    if (sliderRange <= 0) return;
    const normalized = Math.min(Math.max(latest / sliderRange, 0), 1);
    setSliderProgress(normalized);
  });

  const trackGradient = useMemo(() => {
    const themeDark = "#0b1220";
    if (latchActive) {
      const intensity = 0.7 + Math.min(1, sliderProgress) * 0.3;
      return `linear-gradient(90deg, rgba(34,211,238,${intensity.toFixed(2)}), rgba(168,85,247,${intensity.toFixed(2)}))`;
    }
    const glow = Math.min(1, sliderProgress * 1.2);
    const cyanAlpha = (0.25 + glow * 0.5).toFixed(2);
    const fuchsiaAlpha = (0.3 + glow * 0.5).toFixed(2);
    return `linear-gradient(90deg, ${themeDark}, rgba(34,211,238,${cyanAlpha}), rgba(168,85,247,${fuchsiaAlpha}))`;
  }, [latchActive, sliderProgress]);

  const knobGradient = useMemo(() => {
    const base = latchActive ? Math.min(1, 0.7 + sliderProgress * 0.3) : Math.min(1, 0.4 + sliderProgress * 0.6);
    const cyanStop = (0.6 + base * 0.3).toFixed(2);
    const fuchsiaStop = (0.45 + base * 0.35).toFixed(2);
    return `linear-gradient(135deg, rgba(34,211,238,${cyanStop}), rgba(168,85,247,${fuchsiaStop}))`;
  }, [latchActive, sliderProgress]);

  const activeSignal = useMemo(() => {
    const ensureScheme = (url: string) => {
      if (!url) return url;
      if (url.startsWith("http://") || url.startsWith("https://")) return url;
      if (url.startsWith("ws://")) return `http://${url.slice(5)}`;
      if (url.startsWith("wss://")) return `https://${url.slice(6)}`;
      if (url.startsWith("//")) return `https:${url}`;
      if (url.startsWith("/")) return url;
      return `https://${url}`;
    };

    if (signalUrl === "/" || !signalUrl) {
      const host = originHost || (typeof window !== "undefined" ? window.location.host : "");
      return {
        label: host ? `Same origin (${host})` : "Same origin",
        host,
      };
    }

    const normalized = ensureScheme(signalUrl);
    let parsedHost = "";
    try {
      const parsed = new URL(normalized, typeof window !== "undefined" ? window.location.origin : "http://localhost");
      parsedHost = parsed.hostname + (parsed.port ? `:${parsed.port}` : "");
    } catch {
      parsedHost = "";
    }
    return {
      label: signalUrl,
      host: parsedHost,
    };
  }, [signalUrl, originHost]);

  const handleApplySignal = useCallback(() => {
    const candidate = signalInput.trim();
    setSignalUrl(candidate);
    setDiscoveredHubs([]);
    setDiscoveryMessage(candidate ? `Attempting to connect to ${candidate}` : "Using same-origin signaling hub");
    clearSignalError();
  }, [signalInput, setSignalUrl, clearSignalError]);

  const handleUseDiscoveredHub = useCallback((url: string) => {
    setSignalUrl(url);
    setDiscoveredHubs([]);
    setDiscoveryMessage(`Switched to ${url}`);
    clearSignalError();
  }, [setSignalUrl, clearSignalError]);

  const handleDiscoverHubs = useCallback(async () => {
    if (discoveringHubs) return;
    setDiscoveringHubs(true);
    setDiscoveryMessage(null);
    clearSignalError();
    try {
      const preferred = signalUrl && signalUrl !== "/" ? signalUrl : signalInput.trim();
      const results = await discoverSignalHubs({ storedUrl: preferred || undefined });
      setDiscoveredHubs(results);
      if (results.length === 0) {
        setDiscoveryMessage("No hubs responded. Ensure a signaling server is running on this network.");
      }
    } catch (err) {
      setDiscoveryMessage(err instanceof Error ? err.message : "Discovery failed.");
    } finally {
      setDiscoveringHubs(false);
    }
  }, [discoveringHubs, signalInput, signalUrl, clearSignalError]);

  useEffect(() => {
    if (!signalError) return;
    setDiscoveryMessage(signalError);
  }, [signalError]);

  useEffect(() => {
    const socket = getSocket();
    socket.on("webrtc:offer", async ({ fromId, sdp }) => {
      await rtcRef.current?.handleOffer(fromId, sdp);
    });
    socket.on("webrtc:answer", async ({ fromId, sdp }) => {
      await rtcRef.current?.handleAnswer(fromId, sdp);
    });
    socket.on("webrtc:ice", async ({ fromId, candidate }) => {
      await rtcRef.current?.handleIce(fromId, candidate);
    });
    return () => {
      socket.off("webrtc:offer");
      socket.off("webrtc:answer");
      socket.off("webrtc:ice");
    };
  }, []);

  // On mount, load stored nickname and preferred signaling hub
  useEffect(() => {
    loadNickname();
    loadSignalUrl();
  }, [loadNickname, loadSignalUrl]);

  useEffect(() => {
    setSignalInput(signalUrl === "/" ? "" : signalUrl);
  }, [signalUrl]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsHttpsOrigin(window.location.protocol === "https:");
      setOriginHost(window.location.host);
    }
  }, []);

  // When nickname available, connect and hide modal; otherwise show modal
  useEffect(() => {
    if (nickname) {
      if (!rtcRef.current) rtcRef.current = new WebRTCManager("default", nickname);
      connectSocket("default");
      setNickModal(false);
    } else {
      setNickModal(true);
    }
  }, [nickname, connectSocket]);

  // If transmitting and new users appear, call them too
  useEffect(() => {
    if (!transmitting) return;
    const socket = getSocket();
    users.forEach((u) => {
      if (u.id !== socket.id) rtcRef.current?.call(u.id);
    });
  }, [users, transmitting]);

  // Prune disconnected peers when presence list updates
  useEffect(() => {
    const ids = new Set(users.map((u) => u.id));
    const all = rtcRef.current?.getPeerIds() || [];
    all.forEach((id) => {
      if (!ids.has(id)) rtcRef.current?.removePeer(id);
    });
  }, [users]);

  const startTransmit = useCallback(async (): Promise<boolean> => {
    try {
      // Ensure audio context is active after user gesture
      await resumeAudio();
      // HTTPS requirement for mobile getUserMedia (localhost is allowed)
      if (location.protocol !== "https:" && location.hostname !== "localhost") {
        alert("Microphone requires HTTPS on mobile. Use https:// or install a trusted certificate.");
        return false;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        alert("getUserMedia not supported in this browser.");
        return false;
      }
      if (transmitting) return true;
      await rtcRef.current?.startMic();
      const socket = getSocket();
      users.forEach((u) => {
        if (u.id !== socket.id) rtcRef.current?.call(u.id);
      });
      setTransmitting(true);
      playStatic(120);
      return true;
    } catch (e: unknown) {
      console.error(e);
      const err = e as { message?: unknown };
      const msg = typeof err.message === "string" ? err.message : String(e);
      if (msg.includes("denied") || msg.includes("NotAllowedError")) {
        alert("Microphone permission denied. Please allow mic access in browser settings.");
      } else if (msg.includes("NotFoundError")) {
        alert("No microphone found. Please connect a mic.");
      } else if (msg.includes("NotReadableError")) {
        alert("Microphone is in use by another app. Close it and retry.");
      } else {
        alert("Microphone unavailable: " + msg);
      }
      return false;
    }
  }, [transmitting, users, setTransmitting]);

  useEffect(() => {
    latchRef.current = latchActive;
  }, [latchActive]);

  const stopTransmit = useCallback((force = false) => {
    if (latchRef.current && !force) return;
    rtcRef.current?.stopMic();
    setTransmitting(false);
    playStatic(70);
  }, [setTransmitting]);

  const activateLatch = useCallback(async () => {
    if (sliderBusy || latchRef.current) return true;
    setSliderBusy(true);
    const ok = await startTransmit();
    if (ok) {
      setLatchActive(true);
    } else {
      dragX.set(0);
    }
    setSliderBusy(false);
    return ok;
  }, [sliderBusy, startTransmit, dragX]);

  const deactivateLatch = useCallback(() => {
    if (!latchRef.current) return;
    stopTransmit(true);
    setLatchActive(false);
    dragX.set(0);
  }, [stopTransmit, dragX]);

  useEffect(() => {
    if (!transmitting && latchActive) {
      setLatchActive(false);
    }
  }, [transmitting, latchActive]);

  useEffect(() => {
    if (!latchRef.current) return;
    stopTransmit(true);
    setLatchActive(false);
  }, [room, stopTransmit]);

  useEffect(() => {
    dragX.set(latchActive ? sliderRange : 0);
  }, [dragX, latchActive, sliderRange]);

  const handleSliderDragEnd = useCallback(async () => {
    const current = dragX.get();
    if (!latchRef.current) {
      if (current >= sliderRange * 0.8) {
        dragX.set(sliderRange);
        const ok = await activateLatch();
        if (!ok) dragX.set(0);
      } else {
        dragX.set(0);
      }
    } else {
      if (current <= sliderRange * 0.2) {
        deactivateLatch();
      } else {
        dragX.set(sliderRange);
      }
    }
  }, [activateLatch, deactivateLatch, dragX, sliderRange]);

  const submitNick = () => {
    const n = nickInput.trim() || "Guest";
    setNickname(n);
    rtcRef.current = new WebRTCManager("default", n);
    connectSocket("default");
    setNickModal(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b1220] to-[#0f172a] text-white">
      <div className="px-4 py-6 mx-auto max-w-6xl">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-center text-3xl font-semibold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 to-fuchsia-400 sm:text-left">
            Walkie-Talkie
          </h1>
          <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-end">
            <button
              onClick={() => setNickModal(true)}
              className="rounded-md px-3 py-1.5 text-sm bg-white/10 hover:bg-white/15 backdrop-blur-md border border-white/10"
            >
              {nickname ? `@${nickname}` : "Set nickname"}
            </button>
            {/* Install UI removed */}
          </div>
          <div className="flex items-center justify-center gap-2 sm:justify-end">
            <label className="text-xs uppercase tracking-[0.2em] text-white/60">Channel</label>
            <select
              className="rounded-md bg-white/10 border border-white/10 px-2 py-1 text-sm"
              value={room}
              onChange={(e) => changeRoom(e.target.value)}
            >
              {["default", "alpha", "bravo", "charlie"].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </header>

        <main className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <section className="flex flex-col items-center justify-center">
            <div className="relative mt-12 w-full max-w-sm select-none sm:mt-16 md:max-w-md">
              <motion.button
                onPointerDown={startTransmit}
                onPointerUp={() => stopTransmit(false)}
                onPointerCancel={() => stopTransmit(false)}
                onPointerLeave={() => stopTransmit(false)}
                className="relative mx-auto aspect-square w-full max-w-[13rem] rounded-full bg-white/10 border border-white/10 backdrop-blur-md shadow-[0_0_40px_rgba(0,255,255,0.15)] touch-none sm:max-w-[15rem] md:max-w-[18rem]"
                whileTap={{ scale: 0.96 }}
              >
                <motion.div
                  animate={{
                    boxShadow: transmitting
                      ? [
                          "0 0 0 0 rgba(34,211,238,0.6)",
                          "0 0 0 20px rgba(34,211,238,0.0)",
                        ]
                      : "0 0 0 0 rgba(34,211,238,0.0)",
                  }}
                  transition={{ repeat: transmitting ? Infinity : 0, duration: 1.2, ease: "easeOut" }}
                  className="absolute inset-0 rounded-full"
                />
                <div className="absolute inset-1 rounded-full bg-gradient-to-br from-cyan-400/30 to-fuchsia-400/30" />
                <div className="absolute inset-3 rounded-full bg-[#0b1220] flex items-center justify-center">
                  <span className="text-lg font-medium opacity-90">Push to Talk</span>
                </div>
              </motion.button>
              <p className="text-center mt-4 text-sm text-white/70">Hold to transmit. Release to stop.</p>
              <div className="mt-6 flex flex-col items-center gap-2">
                <motion.div
                  className="relative flex h-14 items-center overflow-hidden rounded-full border border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.35)]"
                  style={{ width: SLIDER_WIDTH, background: trackGradient }}
                >
                  <span
                    className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm font-medium transition-colors ${latchActive ? "text-[#0b1220]" : "text-white"}`}
                  >
                    {latchActive ? "Slide left to release" : "Slide to latch microphone"}
                  </span>
                  <motion.div
                    className={`absolute left-0 top-1/2 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full text-2xl font-medium ${sliderBusy ? "pointer-events-none" : "cursor-pointer"}`}
                    drag={sliderBusy ? false : "x"}
                    dragConstraints={{ left: 0, right: sliderRange }}
                    dragElastic={0.05}
                    dragMomentum={false}
                    style={{ x: dragX, touchAction: "none", background: knobGradient }}
                    animate={
                      latchActive
                        ? {
                            scale: [1, 1.07, 1],
                            boxShadow: [
                              "0 8px 24px rgba(2,132,199,0.35)",
                              "0 0 28px rgba(168,85,247,0.45)",
                              "0 8px 24px rgba(2,132,199,0.35)",
                            ],
                          }
                        : { scale: 1, boxShadow: "0 8px 24px rgba(2,132,199,0.35)" }
                    }
                    transition={{ duration: latchActive ? 1.3 : 0.3, repeat: latchActive ? Infinity : 0, ease: "easeInOut" }}
                    onDragEnd={handleSliderDragEnd}
                    aria-label={latchActive ? "Slide left to release microphone" : "Slide right to latch microphone"}
                  >
                    <span className="translate-x-0.5 text-xl text-[#0b1220]">→</span>
                  </motion.div>
                </motion.div>
                <p className="text-xs text-white/60 max-w-sm text-center">
                  Fully slide the handle to the edge to lock the microphone. Slide back to disengage or change channels.
                </p>
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-md p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm uppercase tracking-widest text-white/70">Signal Hub</h2>
                {discoveringHubs && <span className="text-[10px] uppercase tracking-[0.2em] text-cyan-300">Scanning…</span>}
              </div>
              <div className="mt-3 space-y-1 text-xs text-white/60">
                <div>
                  Active URL: <span className="text-white">{activeSignal.label}</span>
                </div>
                <div>
                  Resolved host/IP: <span className="text-white">{activeSignal.host || "Unknown"}</span>
                </div>
              </div>
              <label className="mt-3 flex flex-col gap-1 text-xs text-white/60">
                <span>Override URL</span>
                <input
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-300 focus:bg-white/10"
                  placeholder="/ (same origin)"
                  value={signalInput}
                  onChange={(e) => setSignalInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleApplySignal();
                    }
                  }}
                  spellCheck={false}
                  autoComplete="off"
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={handleApplySignal}
                  className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs font-medium uppercase tracking-[0.15em] text-white transition hover:bg-white/15"
                >
                  Use hub
                </button>
                <button
                  onClick={handleDiscoverHubs}
                  disabled={discoveringHubs}
                  className="rounded-lg border border-cyan-400/40 bg-cyan-500/20 px-3 py-2 text-xs font-medium uppercase tracking-[0.15em] text-cyan-200 transition focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Discover hubs
                </button>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-white/50">
                {isHttpsOrigin
                  ? "Tip: this page is served over HTTPS, so only secure (https://) hubs can respond. If your hotspot server is HTTP, enable TLS or enter the address manually."
                  : "Tip: stay on the same Wi‑Fi/hotspot as the host. The scanner checks common LAN ranges for Socket.IO signaling endpoints."}
              </p>
              {discoveryMessage && (
                <div className="mt-3 space-y-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
                  <p>{discoveryMessage}</p>
                  {signalError && signalUrl !== '/' && (
                    <button
                      onClick={() => {
                        const su = signalUrl;
                        let target = su;
                        if (su.startsWith('ws://')) target = `http://${su.slice(5)}`;
                        else if (su.startsWith('wss://')) target = `https://${su.slice(6)}`;
                        else if (!su.startsWith('http')) target = `https://${su}`;
                        window.open(target, '_blank', 'noopener');
                      }}
                      className="inline-flex items-center justify-center rounded-md border border-amber-300/50 bg-amber-300/20 px-2 py-1 text-[11px] font-medium text-amber-100 transition hover:bg-amber-300/30"
                    >
                      Open hub to trust certificate
                    </button>
                  )}
                </div>
              )}
              {discoveredHubs.length > 0 && (
                <div className="mt-3 space-y-2">
                  {discoveredHubs.map((hub) => (
                    <button
                      key={hub.url}
                      onClick={() => handleUseDiscoveredHub(hub.url)}
                      className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-left transition hover:border-cyan-300 hover:bg-white/15"
                    >
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-medium text-white">{hub.url}</span>
                        <span className="text-xs text-white/60">{hub.latencyMs} ms</span>
                      </div>
                      <div className="mt-1 text-[11px] text-white/60">Users: {typeof hub.users === "number" ? hub.users : "?"}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h2 className="text-sm uppercase tracking-widest text-white/60">Nearby Users</h2>
              <div className="mt-3 grid gap-3">
                {users.length === 0 && (
                  <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-white/60">Waiting for others on the same Wi‑Fi…</div>
                )}
                {users.map((u) => (
                  <div key={u.id} className="rounded-xl border border-white/10 bg-white/[0.06] backdrop-blur-md p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-cyan-300 to-fuchsia-400" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{u.nickname || "User"}</div>
                      <div className="text-xs text-white/60">{u.id.slice(0, 6)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </main>
      </div>

      {nickModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="w-[90%] max-w-md rounded-2xl border border-white/10 bg-[#0b1220] p-6 shadow-2xl">
            <h3 className="text-lg font-semibold">Choose a nickname</h3>
            <p className="text-sm text-white/60 mt-1">Visible to others on your network</p>
            <input
              className="mt-4 w-full rounded-md bg-white/10 border border-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-400"
              placeholder="e.g. Ranger-01"
              value={nickInput}
              onChange={(e) => setNickInput(e.target.value)}
            />
            <div className="mt-4 flex justify-between gap-2">
              <button
                className="px-3 py-2 text-xs rounded-md bg-white/5 border border-white/10 text-white/70 hover:bg-white/10"
                onClick={() => {
                  try { localStorage.removeItem('wt_nickname'); } catch {}
                  setNickname('');
                  setNickInput('');
                }}
                title="Clear saved nickname"
              >
                Clear saved
              </button>
              <div className="flex gap-2">
                <button className="px-4 py-2 text-sm rounded-md bg-white/10 border border-white/10" onClick={() => setNickModal(false)}>
                  Cancel
                </button>
                <button className="px-4 py-2 text-sm rounded-md bg-cyan-500 text-black font-medium" onClick={submitNick}>
                  Join
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
