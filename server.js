// Custom Next.js server with Socket.IO for LAN signaling
const http = require('http');
const https = require('https');
const fs = require('fs');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Presence state in-memory
const users = new Map(); // socketId -> { id, nickname, room }

function buildPresence(room) {
  const list = [];
  for (const [sid, u] of users.entries()) {
    if (!room || u.room === room) list.push({ id: sid, nickname: u.nickname, room: u.room });
  }
  return list;
}

app.prepare().then(() => {
  // Optional HTTPS for mobile getUserMedia requirements (HTTPS is required on phones)
  let server;
  const keyPath = process.env.SSL_KEY_PATH || null;
  const certPath = process.env.SSL_CERT_PATH || null;
  if (keyPath && certPath && fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    const options = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
    server = https.createServer(options, (req, res) => handle(req, res));
    console.log('> Using HTTPS server');
  } else {
    server = http.createServer((req, res) => handle(req, res));
    console.log('> Using HTTP server');
  }

  const io = new Server(server, {
    cors: { origin: true, methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    // Client joins with nickname and optional room
    socket.on('presence:join', ({ nickname, room = 'default' } = {}) => {
      users.set(socket.id, { id: socket.id, nickname: String(nickname || 'Guest'), room });
      socket.join(room);
      io.to(room).emit('presence:list', buildPresence(room));
    });

    socket.on('presence:list:request', (room = 'default') => {
      socket.emit('presence:list', buildPresence(room));
    });

    socket.on('presence:leave', () => {
      const u = users.get(socket.id);
      if (u) {
        const room = u.room;
        users.delete(socket.id);
        socket.leave(room);
        io.to(room).emit('presence:list', buildPresence(room));
      }
    });

    // WebRTC signaling: forward to targetId within same room
    socket.on('webrtc:offer', ({ targetId, sdp }) => {
      const from = users.get(socket.id);
      if (!from) return;
      io.to(targetId).emit('webrtc:offer', { fromId: socket.id, sdp });
    });

    socket.on('webrtc:answer', ({ targetId, sdp }) => {
      const from = users.get(socket.id);
      if (!from) return;
      io.to(targetId).emit('webrtc:answer', { fromId: socket.id, sdp });
    });

    socket.on('webrtc:ice', ({ targetId, candidate }) => {
      const from = users.get(socket.id);
      if (!from) return;
      io.to(targetId).emit('webrtc:ice', { fromId: socket.id, candidate });
    });

    socket.on('disconnect', () => {
      const u = users.get(socket.id);
      if (u) {
        const room = u.room;
        users.delete(socket.id);
        io.to(room).emit('presence:list', buildPresence(room));
      }
    });
  });

  server.listen(port, hostname, () => {
    const proto = server instanceof https.Server ? 'https' : 'http';
    console.log(`> Walkie-Talkie ready on ${proto}://localhost:${port}`);
  });
});
