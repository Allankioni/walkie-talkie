import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
let currentUrl = process.env.NEXT_PUBLIC_SIGNALING_URL || '/';
let currentPath = process.env.NEXT_PUBLIC_SIGNALING_PATH || undefined;

function normalizeUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed || trimmed === '/') return '/';
  return trimmed.replace(/\/$/, '');
}

export function setSocketUrl(url: string) {
  const normalized = normalizeUrl(url);
  if (normalized === currentUrl) return;
  currentUrl = normalized;
  if (socket) {
    try {
      socket.disconnect();
    } catch {
      // ignore disconnect issues while swapping endpoints
    }
    socket = null;
  }
}

export function setSocketPath(path?: string) {
  if (path === currentPath) return;
  currentPath = path;
  if (socket) {
    try {
      socket.disconnect();
    } catch {
      // ignore
    }
    socket = null;
  }
}

export function getSocketUrl() {
  return currentUrl;
}

export function resetSocket() {
  if (socket) {
    try {
      socket.disconnect();
    } catch {
      // noop
    }
    socket = null;
  }
}

export function getSocket() {
  if (socket) return socket;
  socket = io(currentUrl, {
    transports: ['websocket'],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    path: currentPath,
  });
  return socket;
}
