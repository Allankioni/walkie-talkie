# Deployment Options

## 1) Pure LAN (single server)
- Run `npm run dev` or `npm start` on a machine in the LAN.
- Clients connect to `https://<LAN-IP>:3000` (use SSL_CERT_PATH/SSL_KEY_PATH to enable HTTPS).
- No external ICE servers required.

## 2) Fully offline / air-gapped hotspot
To keep the experience completely offline, host **both** the PWA and the Socket.IO signaling server inside the same LAN/hotspot. No connectivity to the wider internet is required.

### Option A – Laptop or Raspberry Pi as hub
1. Clone the repo to the device that will stay in the hotspot.
2. Install dependencies once: `npm install`
3. Start the bundled Next.js + Socket.IO server:
  ```bash
  npm run dev      # for quick tests
  npm run build && NODE_ENV=production npm run start   # for long sessions
  ```
4. Other clients join the same hotspot and open `http://<hub-ip>:3000`
5. Because everything lives on the same box, no TLS certificate is required. (Use `local-ssl-proxy` only if mobile browsers insist on HTTPS for getUserMedia.)

### Option B – Android phone as self-contained hub (Termux)
1. In Termux install Node and Git: `pkg install nodejs-lts git`
2. Clone the repo or copy the built `/out` directory (from `npm run build && npx next export`).
3. Serve the static build with any tiny HTTP server:
  ```bash
  cd walkie-talkie
  npm run build
  npx next export -o out
  npx serve out --listen 0.0.0.0:3000   # lightweight static server
  ```
4. In a second Termux session run the signaling relay:
  ```bash
  node scripts/termux-signaling-server.cjs --port 41234 --host 0.0.0.0
  ```
5. On the phone (and optionally other devices) set:
  ```bash
  export NEXT_PUBLIC_SIGNALING_URL=http://127.0.0.1:41234
  ```
  When other devices join the hotspot, they use the phone’s LAN IP for both the static site (`http://192.168.x.x:3000`) and the signaling URL.
6. Keep Termux awake with `termux-wake-lock` and disable battery optimization.
7. Everything stays inside the hotspot; no internet routing, certificates, or cloud services.

**Need `wss://` for HTTPS clients?** Generate a self-signed cert with `openssl`, trust it on each device, and launch the relay with `--cert`/`--key`. This keeps traffic inside the hotspot while satisfying browser security for secure origins.

> Tip: if you prefer not to run a Node web server on the phone, you can sideload the PWA bundle (from `out/`) into any static-file viewer or even Android WebView apps. Manual pairing via `/manual` still works without sockets.

## 3) Vercel (frontend) + External Signaling (backend)
If you later decide to go online, host the frontend on Vercel and point it at any HTTPS-capable Socket.IO relay (Fly.io, Render, VPS, Cloudflare Tunnel, etc.). Remember that an HTTPS origin **must** talk to `wss://` signaling; plain `ws://` will be blocked.

### Frontend (Vercel)
- In the Vercel dashboard add these Environment Variables (Production + Preview + Development):
  - `NEXT_PUBLIC_SIGNALING_URL`: `https://your-signaling.example.com`
  - `NEXT_PUBLIC_SIGNALING_PATH`: *(optional)* `/socket.io` if your signaling server uses a custom path.
  - `NEXT_PUBLIC_ICE`: *(optional)* JSON array of RTCIceServer entries, e.g.
    ```json
    [
      { "urls": ["stun:stun.l.google.com:19302"] },
      { "urls": ["turn:turn.example.com"], "username": "user", "credential": "pass" }
    ]
    ```
- Redeploy after saving env vars so Next.js exposes them to the client.
- For local development create `.env.local` with the same keys so `npm run dev` behaves like production.

### Backend (signaling server)
- Extract the Socket.IO logic (or use `scripts/termux-signaling-server.cjs`) and host it on any platform that allows websockets (Fly.io, Render, Supabase Edge Functions, a VPS, Cloudflare Tunnel, etc.).
- Serve it over HTTPS for public internet use. HTTPS origins must connect to `wss://` signaling hosts.
- Share the public host/port with clients as the `NEXT_PUBLIC_SIGNALING_URL`.

If the signaling server is offline—by design or accidentally—you can always fall back to the manual QR pairing page (`/manual`) which transfers SDP without sockets.

## 4) All-in-one on a VM/VPS
- Deploy this repo to a VM and run `node server.js` behind a reverse proxy (Caddy/NGINX) with Let’s Encrypt.
- Set `PORT`, proxy websockets to the Node server.

## Environment Variables
- `NEXT_PUBLIC_SIGNALING_URL`: Socket.IO endpoint (frontend).
- `NEXT_PUBLIC_SIGNALING_PATH`: Custom Socket.IO path (frontend).
- `NEXT_PUBLIC_ICE`: JSON string of RTCIceServer entries (frontend).
- `SSL_CERT_PATH`, `SSL_KEY_PATH`: Enable HTTPS for local/server runs (backend Node).

## Notes
- For mobile mic access on the public internet, always use HTTPS.
- For NAT traversal across the internet, configure STUN/TURN in `NEXT_PUBLIC_ICE`.
