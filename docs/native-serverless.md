# Serverless LAN Discovery & Signaling (Native/Electron)

This document describes how to run the walkie‑talkie fully on a local network without any signaling server, using UDP broadcast/multicast or mDNS for peer discovery and exchanging WebRTC SDP/ICE.

Important: Browsers (PWAs) cannot send UDP or multicast packets from page JavaScript. Use this approach for:
- Native mobile/desktop apps, or
- Electron apps (use Node in main/preload), or
- A small companion process that runs on each device.

## Why this works well for LAN
- No internet required; everything is inside the Wi‑Fi/hotspot.
- No single point of failure; peers discover each other dynamically.
- Low latency; media stays peer‑to‑peer with host/mDNS ICE candidates only.

## Discovery patterns
- UDP broadcast: send a DISCOVER packet to `255.255.255.255:<port>`
- UDP multicast: join a multicast group (e.g., `224.0.0.251:<port>`) and send DISCOVER
- mDNS: advertise a service (e.g., `_wtalk._udp.local`) and query for peers

## Message flow
1. A → broadcast `DISCOVER { room, nick, nonce }`
2. B → unicast `OFFER { sdp, ice, room, nick }`
3. A → unicast `ANSWER { sdp, ice }`
4. WebRTC connects P2P; push‑to‑talk streams audio directly

## Security notes
- Scope to trusted LANs; consider a shared room secret in messages
- Rotate nonces and ignore mismatched rooms
- Limit ICE to host candidates for LAN‑only behavior

## Minimal UDP demo (Node)
Use this demo on two machines in the same LAN to see broadcast + reply. This is not production signaling; it just shows the pattern.

Run on each machine in separate terminals:

Sender (discovers peers):
```powershell
node scripts/udp-discovery-demo.cjs send 41234
```

Responder (answers DISCOVER):
```powershell
node scripts/udp-discovery-demo.cjs respond 41234
```

Replace `41234` with a port your LAN allows. On Windows, you may need to allow Node through the firewall.

Next steps to integrate with WebRTC:
- Replace the `payload` in demo messages with SDP and ICE candidates from your WebRTC stack
- In Electron, do UDP in the main process and pass signaling to the renderer via IPC
- On native mobile, use platform UDP/mDNS libraries, then feed signaling to WebRTC
