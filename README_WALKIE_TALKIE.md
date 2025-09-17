# Walkie-Talkie PWA (Next.js + WebRTC + Socket.IO)

A push-to-talk Progressive Web App for LAN/hotspot. Hold the big button to transmit your microphone to peers with minimal latency using WebRTC; presence and signaling via Socket.IO.

## Quick start (Windows PowerShell)

```powershell
# from the repository root
cd .\walkie-talkie
npm install
npm run dev
# Open in another device on same Wi‑Fi: http://<your-computer-LAN-IP>:3000
```

In production you can run:

```powershell
npm run build
$env:NODE_ENV="production"; npm start
```

## How it works
- Next.js (App Router) serves the PWA UI
- Custom Node server attaches a Socket.IO server at the same origin for signaling
- Users join presence with a nickname; the list updates live
- On press, the app requests mic (once) and starts WebRTC offers to all peers
- On release, outgoing audio tracks are removed and the mic is stopped
- Service worker caches static assets for an offline shell

## Notes
- For pure offline LAN, ICE servers are disabled (host/mDNS only). Ensure devices are on the same subnet.
- iOS may require an onscreen interaction before audio plays; we use playsinline and autoplay on audio elements.
- This app is intended for trusted local use. There is no authentication or encryption beyond WebRTC/SRTP.

## Stretch ideas
- Channels/rooms selector
- Static noise start/stop using WebAudio
- Better reconnect and presence avatars
