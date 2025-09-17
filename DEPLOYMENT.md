# Deployment Options

## 1) Pure LAN (single server)
- Run `npm run dev` or `npm start` on a machine in the LAN.
- Clients connect to `https://<LAN-IP>:3000` (use SSL_CERT_PATH/SSL_KEY_PATH to enable HTTPS).
- No external ICE servers required.

## 2) Vercel (frontend) + External Signaling (backend)
Vercel doesn’t support long-lived custom Node servers with Socket.IO on the same process. Use Vercel for the Next.js frontend and deploy a small Socket.IO signaling server elsewhere:

- Frontend (Vercel):
  - Set env vars:
    - `NEXT_PUBLIC_SIGNALING_URL`: `https://your-signaling.example.com`
    - (Optional) `NEXT_PUBLIC_SIGNALING_PATH`: `/socket.io`
    - (Optional) `NEXT_PUBLIC_ICE`: JSON array of RTCIceServer, e.g.
      ```json
      [
        { "urls": ["stun:stun.l.google.com:19302"] },
        { "urls": ["turn:turn.example.com"], "username": "user", "credential": "pass" }
      ]
      ```
- Backend (signaling server):
  - Extract `server.js` Socket.IO logic into a tiny server (Node/Express/Fly/Dokku/Render/VPS).
  - Enable HTTPS on the signaling domain (public CA).

## 3) All-in-one on a VM/VPS
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
