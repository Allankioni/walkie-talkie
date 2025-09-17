"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { getSocket } from "@/lib/socket";
import { WebRTCManager } from "@/lib/webrtc";
import { playStatic, resumeAudio } from "@/lib/staticNoise";

export default function Home() {
  const { users, setNickname, nickname, connectSocket, transmitting, setTransmitting, room, changeRoom, loadNickname } = useAppStore();
  const [nickModal, setNickModal] = useState(false);
  const [nickInput, setNickInput] = useState("");
  const [mounted, setMounted] = useState(false);
  const rtcRef = useRef<WebRTCManager | null>(null);

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

  // On mount, load stored nickname; modal opens if none
  useEffect(() => {
    loadNickname();
  }, [loadNickname]);

  useEffect(() => {
    setMounted(true);
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

  const startTransmit = async () => {
    try {
      // Ensure audio context is active after user gesture
      await resumeAudio();
      // HTTPS requirement for mobile getUserMedia (localhost is allowed)
      if (location.protocol !== "https:" && location.hostname !== "localhost") {
        alert("Microphone requires HTTPS on mobile. Use https:// or install a trusted certificate.");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        alert("getUserMedia not supported in this browser.");
        return;
      }
      await rtcRef.current?.startMic();
      const socket = getSocket();
      users.forEach((u) => {
        if (u.id !== socket.id) rtcRef.current?.call(u.id);
      });
      setTransmitting(true);
      playStatic(120);
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
    }
  };

  const stopTransmit = () => {
    rtcRef.current?.stopMic();
    setTransmitting(false);
    playStatic(70);
  };

  const submitNick = () => {
    const n = nickInput.trim() || "Guest";
    setNickname(n);
    rtcRef.current = new WebRTCManager("default", n);
    connectSocket("default");
    setNickModal(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b1220] to-[#0f172a] text-white">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 to-fuchsia-400">Walkie-Talkie</h1>
          <div className="flex gap-2 items-center">
            <button
              onClick={() => setNickModal(true)}
              className="rounded-md px-3 py-1.5 text-sm bg-white/10 hover:bg-white/15 backdrop-blur-md border border-white/10"
            >
              {nickname ? `@${nickname}` : "Set nickname"}
            </button>
            {/* Install UI removed */}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-white/60">Channel</label>
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

        <main className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <section className="md:col-span-2 flex flex-col items-center justify-center">
            <div className="relative mt-16 select-none">
              <motion.button
                onPointerDown={startTransmit}
                onPointerUp={stopTransmit}
                onPointerCancel={stopTransmit}
                onPointerLeave={stopTransmit}
                className="relative w-56 h-56 rounded-full bg-white/10 border border-white/10 backdrop-blur-md shadow-[0_0_40px_rgba(0,255,255,0.15)] touch-none"
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
            </div>
          </section>

          <aside className="md:col-span-1">
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
