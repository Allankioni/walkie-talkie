#!/usr/bin/env node
/* eslint-disable no-console */
const dgram = require('dgram');

function usage() {
  console.log('Usage:\n  node scripts/udp-discovery-demo.cjs respond <port>\n  node scripts/udp-discovery-demo.cjs send <port>');
}

const mode = process.argv[2];
const port = Number(process.argv[3]);
if (!mode || !port) {
  usage();
  process.exit(1);
}

const BROADCAST_ADDR = '255.255.255.255';

if (mode === 'respond') {
  const sock = dgram.createSocket('udp4');
  sock.on('error', (err) => { console.error('Socket error:', err); process.exit(1); });
  sock.on('message', (msg, rinfo) => {
    try {
      const data = JSON.parse(msg.toString('utf8'));
      if (data.type === 'DISCOVER') {
        console.log('DISCOVER from', rinfo.address);
        const payload = Buffer.from(JSON.stringify({ type: 'OFFER', host: rinfo.address, ts: Date.now() }));
        sock.send(payload, rinfo.port, rinfo.address);
      }
    } catch {}
  });
  sock.bind(port, () => {
    console.log(`Responder listening on 0.0.0.0:${port}`);
  });
}

if (mode === 'send') {
  const sock = dgram.createSocket('udp4');
  sock.on('message', (msg, rinfo) => {
    console.log('Response from', rinfo.address, ':', msg.toString('utf8'));
  });
  sock.bind(() => {
    sock.setBroadcast(true);
    const payload = Buffer.from(JSON.stringify({ type: 'DISCOVER', ts: Date.now() }));
    sock.send(payload, port, BROADCAST_ADDR, (err) => {
      if (err) console.error(err);
      else console.log(`Sent DISCOVER to ${BROADCAST_ADDR}:${port}`);
    });
  });
}
