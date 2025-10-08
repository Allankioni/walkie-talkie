#!/usr/bin/env node
/**
 * Minimal Socket.IO signaling server tuned for Termux or other lightweight environments.
 *
 * Usage:
 *   node scripts/termux-signaling-server.cjs --port 41234 --host 0.0.0.0
 *
 * Environment variables:
 *   PORT                - Port to listen on (default 41234)
 *   HOST                - Host/interface to bind to (default 0.0.0.0)
 *   ALLOW_ORIGINS       - Comma-separated list of allowed origins for CORS (default "*")
 *
 * The server keeps a presence list per room and relays WebRTC offers/answers/ICE candidates
 * between peers. Designed to run on a phone via Termux so laptops/tablets on the same Wi-Fi
 * can pair without any external infrastructure.
 */

const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const { Server } = require('socket.io');

const args = process.argv.slice(2);
const cliOptions = {};
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--help' || arg === '-h') {
    printHelp();
    process.exit(0);
  }
  if (arg.startsWith('--port=')) {
    cliOptions.port = Number(arg.split('=')[1]);
    continue;
  }
  if (arg === '--port') {
    cliOptions.port = Number(args[i + 1]);
    i += 1;
    continue;
  }
  if (arg.startsWith('--host=')) {
    cliOptions.host = arg.split('=')[1];
    continue;
  }
  if (arg === '--host') {
    cliOptions.host = args[i + 1];
    i += 1;
    continue;
  }
  if (arg.startsWith('--allow-origins=')) {
    cliOptions.allowOrigins = arg
      .split('=')[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    continue;
  }
  if (arg === '--allow-origins') {
    cliOptions.allowOrigins = args[i + 1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    i += 1;
    continue;
  }
  if (arg.startsWith('--cert=')) {
    cliOptions.certPath = arg.split('=')[1];
    continue;
  }
  if (arg === '--cert') {
    cliOptions.certPath = args[i + 1];
    i += 1;
    continue;
  }
  if (arg.startsWith('--key=')) {
    cliOptions.keyPath = arg.split('=')[1];
    continue;
  }
  if (arg === '--key') {
    cliOptions.keyPath = args[i + 1];
    i += 1;
    continue;
  }
  if (arg.startsWith('--ca=')) {
    cliOptions.caPath = arg.split('=')[1];
    continue;
  }
  if (arg === '--ca') {
    cliOptions.caPath = args[i + 1];
    i += 1;
    continue;
  }
  console.warn(`Unknown argument: ${arg}`);
}

const options = {
  port: Number.isFinite(cliOptions.port) ? cliOptions.port : Number(process.env.PORT || 41234),
  host: cliOptions.host || process.env.HOST || '0.0.0.0',
  allowOrigins: Array.isArray(cliOptions.allowOrigins)
    ? cliOptions.allowOrigins
    : process.env.ALLOW_ORIGINS
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean),
  certPath: cliOptions.certPath || process.env.SSL_CERT_PATH || null,
  keyPath: cliOptions.keyPath || process.env.SSL_KEY_PATH || null,
  caPath: cliOptions.caPath || process.env.SSL_CA_PATH || null,
};

if (!Number.isFinite(options.port)) {
  console.error('Invalid port. Provide a numeric port via --port or PORT env variable.');
  process.exit(1);
}

const corsOrigins = options.allowOrigins && options.allowOrigins.length > 0 ? options.allowOrigins : '*';

const users = new Map(); // socketId -> { id, nickname, room }

function buildPresence(room) {
  const list = [];
  for (const [sid, user] of users.entries()) {
    if (!room || user.room === room) {
      list.push({ id: sid, nickname: user.nickname, room: user.room });
    }
  }
  return list;
}

const handler = (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', users: users.size }));
    return;
  }
  if (req.url === '/presence') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ rooms: groupPresenceByRoom() }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Walkie-Talkie signaling server is running. Use /health or /presence for status.');
};

let server;
let scheme = 'http';
if (options.certPath && options.keyPath) {
  try {
    const tlsOptions = {
      key: fs.readFileSync(options.keyPath),
      cert: fs.readFileSync(options.certPath),
    };
    if (options.caPath) {
      tlsOptions.ca = fs.readFileSync(options.caPath);
    }
    server = https.createServer(tlsOptions, handler);
    scheme = 'https';
  } catch (err) {
    console.error('Failed to load TLS cert/key. Falling back to HTTP.', err);
    server = http.createServer(handler);
  }
} else {
  server = http.createServer(handler);
}

const io = new Server(server, {
  cors: { origin: corsOrigins, methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
});

io.on('connection', (socket) => {
  console.log(`[+] ${socket.id} connected`);

  socket.on('presence:join', ({ nickname, room = 'default' } = {}) => {
    const safeNickname = typeof nickname === 'string' && nickname.trim().length > 0 ? nickname.trim() : 'Guest';
    users.set(socket.id, { id: socket.id, nickname: safeNickname, room });
    socket.join(room);
    io.to(room).emit('presence:list', buildPresence(room));
    console.log(`[=] ${socket.id} joined room "${room}" as ${safeNickname}`);
  });

  socket.on('presence:list:request', (room = 'default') => {
    socket.emit('presence:list', buildPresence(room));
  });

  socket.on('presence:leave', () => {
    const user = users.get(socket.id);
    if (!user) return;
    users.delete(socket.id);
    socket.leave(user.room);
    io.to(user.room).emit('presence:list', buildPresence(user.room));
    console.log(`[-] ${socket.id} left room "${user.room}"`);
  });

  socket.on('webrtc:offer', ({ targetId, sdp }) => {
    if (!targetId || !sdp) return;
    const sender = users.get(socket.id);
    if (!sender) return;
    io.to(targetId).emit('webrtc:offer', { fromId: socket.id, sdp });
  });

  socket.on('webrtc:answer', ({ targetId, sdp }) => {
    if (!targetId || !sdp) return;
    const sender = users.get(socket.id);
    if (!sender) return;
    io.to(targetId).emit('webrtc:answer', { fromId: socket.id, sdp });
  });

  socket.on('webrtc:ice', ({ targetId, candidate }) => {
    if (!targetId || !candidate) return;
    const sender = users.get(socket.id);
    if (!sender) return;
    io.to(targetId).emit('webrtc:ice', { fromId: socket.id, candidate });
  });

  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (!user) return;
    users.delete(socket.id);
    io.to(user.room).emit('presence:list', buildPresence(user.room));
    console.log(`[-] ${socket.id} disconnected`);
  });
});

server.listen(options.port, options.host, () => {
  const ipAddresses = getLocalIPs();
  console.log('----------------------------------------');
  console.log('Walkie-Talkie signaling server (Termux mode)');
  console.log(`Listening on ${scheme}://${options.host}:${options.port}`);
  if (ipAddresses.length > 0) {
    console.log('Reachable LAN addresses:');
    ipAddresses.forEach((ip) => {
      console.log(`  → ${scheme}://${ip}:${options.port}`);
    });
  }
  console.log('Use /health for status. Press Ctrl+C to stop.');
  console.log('----------------------------------------');
});

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  server.close(() => process.exit(0));
});

function groupPresenceByRoom() {
  const rooms = new Map();
  for (const user of users.values()) {
    if (!rooms.has(user.room)) rooms.set(user.room, []);
    rooms.get(user.room).push({ id: user.id, nickname: user.nickname });
  }
  return Object.fromEntries(rooms.entries());
}

function getLocalIPs() {
  const ips = [];
  const interfaces = os.networkInterfaces();
  for (const infos of Object.values(interfaces)) {
    if (!infos) continue;
    for (const info of infos) {
      if (info.family === 'IPv4' && !info.internal) {
        ips.push(info.address);
      }
    }
  }
  return ips;
}

function printHelp() {
  console.log(`Usage: node scripts/termux-signaling-server.cjs [options]\n\n` +
    'Options:\n' +
    '  --port <number>           Port to listen on (default 41234 or $PORT)\n' +
    '  --host <address>          Interface to bind (default 0.0.0.0 or $HOST)\n' +
    '  --allow-origins <list>    Comma-separated origins for CORS (default "*")\n' +
    '  --cert <path>             Enable HTTPS/WSS with certificate (or $SSL_CERT_PATH)\n' +
    '  --key <path>              Private key path for HTTPS (or $SSL_KEY_PATH)\n' +
    '  --ca <path>               Optional CA bundle to present (or $SSL_CA_PATH)\n' +
    '  -h, --help                Show this message\n');
}
