import { create } from 'zustand';
import { getSocket, resetSocket, setSocketUrl } from '@/lib/socket';

type User = { id: string; nickname: string; room?: string };

type State = {
  nickname: string;
  users: User[];
  transmitting: boolean;
  room: string;
  signalUrl: string;
  signalError: string | null;
  setNickname: (n: string) => void;
  loadNickname: () => void;
  setTransmitting: (v: boolean) => void;
  setRoom: (r: string) => void;
  setSignalUrl: (url: string) => void;
  loadSignalUrl: () => void;
  clearSignalError: () => void;
  connectSocket: (room?: string) => void;
  changeRoom: (room: string) => void;
};

export const useAppStore = create<State>((set, get) => ({
  nickname: '',
  users: [],
  transmitting: false,
  room: 'default',
  signalUrl: typeof window === 'undefined' ? (process.env.NEXT_PUBLIC_SIGNALING_URL || '/') : '/',
  signalError: null,
  setNickname: (n) => {
    // Persist locally
    try { if (typeof window !== 'undefined') localStorage.setItem('wt_nickname', n); } catch {}
    set({ nickname: n });
  },
  loadNickname: () => {
    try {
      if (typeof window === 'undefined') return;
      const stored = localStorage.getItem('wt_nickname') || '';
      if (stored) set({ nickname: stored });
    } catch {}
  },
  setSignalUrl: (url: string) => {
    const clean = (url || '').trim() || '/';
    const normalized = clean === '/' ? '/' : clean.replace(/\/$/, '');
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('wt_signal_url', normalized);
      }
    } catch {}
    setSocketUrl(normalized);
    set({ signalUrl: normalized });
    resetSocket();
    const activeRoom = get().room;
    const nickname = get().nickname;
    if (nickname) {
      get().connectSocket(activeRoom);
    }
  },
  loadSignalUrl: () => {
    try {
      if (typeof window === 'undefined') return;
      const stored = localStorage.getItem('wt_signal_url');
      const fallback = process.env.NEXT_PUBLIC_SIGNALING_URL || '/';
      const candidate = stored ?? fallback;
      const normalized = (candidate || '').trim() || '/';
      const finalUrl = normalized === '/' ? '/' : normalized.replace(/\/$/, '');
      setSocketUrl(finalUrl);
      set({ signalUrl: finalUrl });
    } catch {
      const fallback = process.env.NEXT_PUBLIC_SIGNALING_URL || '/';
      const finalUrl = (fallback || '').trim() || '/';
      setSocketUrl(finalUrl === '/' ? '/' : finalUrl.replace(/\/$/, ''));
      set({ signalUrl: finalUrl });
    }
  },
  clearSignalError: () => set({ signalError: null }),
  setTransmitting: (v) => set({ transmitting: v }),
  setRoom: (r) => set({ room: r }),
  connectSocket: (room) => {
    const r = room || get().room;
    const socket = getSocket();
    if (!socket.hasListeners('presence:list')) {
      socket.on('presence:list', (list: User[]) => set({ users: list.filter((u) => u.id !== socket.id) }));
      socket.on('connect', () => {
        set({ signalError: null });
        socket.emit('presence:list:request', r);
      });
      socket.on('connect_error', (err) => {
        const activeUrl = get().signalUrl;
        const raw = typeof err?.message === 'string' ? err.message : '';
        let msg = raw || 'Unable to reach signaling hub.';
        if (!msg || msg === 'xhr poll error' || msg === 'websocket error') {
          msg = `Could not open a WebSocket to ${activeUrl}.`;
        }
        if (activeUrl.startsWith('https://')) {
          msg += ' If this hub uses a self-signed certificate, make sure it is trusted on this device.';
        }
        set({ signalError: msg });
      });
      socket.on('disconnect', () => set({ users: [] }));
    }
    if (!socket.connected) socket.connect();
    socket.emit('presence:join', { nickname: get().nickname || 'Guest', room: r });
  },
  changeRoom: (room: string) => {
    const socket = getSocket();
    const current = get().room;
    if (room === current) return;
    set({ room });
    if (socket.connected) socket.emit('presence:leave');
    if (!socket.connected) socket.connect();
    socket.emit('presence:join', { nickname: get().nickname || 'Guest', room });
  },
}));
