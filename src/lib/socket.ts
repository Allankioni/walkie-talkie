import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket() {
  if (socket) return socket;
  // Use external signaling URL if provided (Vercel deployment), else same-origin (LAN)
  const url = process.env.NEXT_PUBLIC_SIGNALING_URL || '/';
  socket = io(url, {
    transports: ['websocket'],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    // If your Socket.IO server uses a custom path, set NEXT_PUBLIC_SIGNALING_PATH
    path: process.env.NEXT_PUBLIC_SIGNALING_PATH || undefined,
  });
  return socket;
}
