let ctx: AudioContext | null = null;

function ensureCtx(): AudioContext {
  const win = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  if (!ctx) ctx = new (win.AudioContext || win.webkitAudioContext!)();
  return ctx!;
}

export function playStatic(durationMs = 140, volume = 0.02) {
  try {
    const ac = ensureCtx();
    const noise = ac.createBuffer(1, ac.sampleRate * (durationMs / 1000), ac.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = noise;
    const gain = ac.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(ac.destination);
    src.start();
    src.stop(ac.currentTime + durationMs / 1000);
  } catch {}
}

export async function resumeAudio() {
  try {
    const ac = ensureCtx();
    if (ac.state === 'suspended') await ac.resume();
  } catch {}
}
