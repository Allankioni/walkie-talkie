import { create } from 'zustand';
import { getSocket } from '@/lib/socket';

type User = { id: string; nickname: string; room?: string };

type State = {
  nickname: string;
  users: User[];
  transmitting: boolean;
  room: string;
  setNickname: (n: string) => void;
  loadNickname: () => void;
  setTransmitting: (v: boolean) => void;
  setRoom: (r: string) => void;
  connectSocket: (room?: string) => void;
  changeRoom: (room: string) => void;
};

export const useAppStore = create<State>((set, get) => ({
  nickname: '',
  users: [],
  transmitting: false,
  room: 'default',
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
  setTransmitting: (v) => set({ transmitting: v }),
  setRoom: (r) => set({ room: r }),
  connectSocket: (room) => {
    const r = room || get().room;
    const socket = getSocket();
    if (!socket.hasListeners('presence:list')) {
      socket.on('presence:list', (list: User[]) => set({ users: list.filter((u) => u.id !== socket.id) }));
      socket.on('connect', () => socket.emit('presence:list:request', r));
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
