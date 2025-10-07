"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import type { Result } from '@zxing/library';

type Props = {
  onDecode: (text: string) => void;
  onClose?: () => void;
  hint?: string;
};

export default function QRScanner({ onDecode, onClose, hint }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState<string>("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [status, setStatus] = useState<"scanning" | "found">("scanning");

  const playBeep = () => {
    try {
      const win = window as unknown as { webkitAudioContext?: typeof AudioContext; AudioContext: typeof AudioContext };
      const AC = win.AudioContext || win.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 1000;
      o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
      o.start();
      o.stop(ctx.currentTime + 0.12);
    } catch {}
  };

  const hints = useMemo(() => {
    const m = new Map();
    m.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
    m.set(DecodeHintType.TRY_HARDER, true);
    return m;
  }, []);

  useEffect(() => {
    let reader: BrowserMultiFormatReader | null = null;
    const start = async () => {
      try {
        reader = new BrowserMultiFormatReader(hints);
        if (!selectedId) {
          controlsRef.current = await reader.decodeFromConstraints(
            { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
            videoRef.current!,
            (result: Result | undefined, _e: unknown, controls: IScannerControls) => {
              if (result) {
                setStatus('found');
                try { navigator.vibrate?.(50); } catch {}
                playBeep();
                onDecode(result.getText());
                controls.stop();
              }
            }
          );
        } else {
          controlsRef.current = await reader.decodeFromVideoDevice(
            selectedId,
            videoRef.current!,
            (result: Result | undefined, _e: unknown, controls: IScannerControls) => {
              if (result) {
                setStatus('found');
                try { navigator.vibrate?.(50); } catch {}
                playBeep();
                onDecode(result.getText());
                controls.stop();
              }
            }
          );
        }
        try {
          const list = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
          setDevices(list);
        } catch {}
        try {
          const stream = videoRef.current?.srcObject as MediaStream | null;
          const track = stream?.getVideoTracks?.()[0];
          const caps = track?.getCapabilities?.();
          setTorchAvailable(!!caps && 'torch' in caps);
        } catch {}
      } catch (e: unknown) {
        console.error(e);
        const err = e as { message?: unknown };
        const msg = typeof err?.message === 'string' ? err.message : String(e);
        setError(msg);
      }
    };
    setStatus('scanning');
    start();
    return () => {
      try { controlsRef.current?.stop(); } catch {}
      controlsRef.current = null;
      reader = null;
    };
  }, [onDecode, hints, selectedId]);

  const applyTorch = async (on: boolean) => {
    try {
      const stream = videoRef.current?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks?.()[0];
      if (!track) return;
      const torchConstraints = { advanced: [{ torch: on } as unknown as MediaTrackConstraintSet] } as MediaTrackConstraints;
      await track.applyConstraints(torchConstraints);
      setTorchOn(on);
    } catch (e) {
      console.warn('Torch not supported', e);
    }
  };

  const onPickFile = async (file: File) => {
    try {
      const url = URL.createObjectURL(file);
      const reader = new BrowserMultiFormatReader(hints);
      const result = await reader.decodeFromImageUrl(url);
      URL.revokeObjectURL(url);
      if (result) onDecode(result.getText());
    } catch (e) {
      console.error(e);
      setError('Failed to decode image');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0b1220] text-white shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-medium">Scan QR</h3>
          <button className="px-2 py-1 text-xs rounded-md bg-white/10 border border-white/10" onClick={onClose}>Close</button>
        </div>
        <div className="p-4 space-y-3">
          {hint && <div className="text-xs text-white/60">{hint}</div>}
          <div className="flex items-center gap-2 text-xs">
            {devices.length > 0 && (
              <>
                <label className="text-white/60">Camera</label>
                <select className="bg-white/10 border border-white/10 rounded px-2 py-1" value={selectedId || ''} onChange={(e) => setSelectedId(e.target.value || undefined)}>
                  <option value="">Auto (rear)</option>
                  {devices.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0,4)}`}</option>
                  ))}
                </select>
              </>
            )}
            {torchAvailable && (
              <button className="ml-auto px-2 py-1 rounded bg-white/10 border border-white/10" onClick={() => applyTorch(!torchOn)}>{torchOn ? 'Torch Off' : 'Torch On'}</button>
            )}
          </div>
          <div className="relative aspect-video w-full overflow-hidden rounded-md bg-black">
            <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
            {/* Reticle overlay */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative w-[70%] max-w-[380px] aspect-square">
                {/* Corner lines */}
                <div className="absolute inset-0">
                  <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-green-400 rounded-tl-sm" />
                  <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-green-400 rounded-tr-sm" />
                  <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-green-400 rounded-bl-sm" />
                  <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-green-400 rounded-br-sm" />
                </div>
                {/* Center dot */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-green-400/70" />
              </div>
            </div>
            {/* Status banner */}
            <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-xs px-2 py-1 rounded bg-black/60 text-white" aria-live="polite">
              {status === 'found' ? 'QR code detected' : 'Scanning for QR… Hold steady'}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <label className="px-2 py-1 rounded bg-white/10 border border-white/10 cursor-pointer">
              Upload image…
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickFile(f); }} />
            </label>
            <span className="text-white/40">If the camera struggles, upload a screenshot/photo of the QR.</span>
          </div>
          {error && <div className="text-xs text-red-400 mt-2">{error}</div>}
        </div>
      </div>
    </div>
  );
}
