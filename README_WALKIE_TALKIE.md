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
**TO HAVE HTTPS ACCESS USE PROXY**
Simply run run this command in the terminal
```
npx local-ssl-proxy --source 3444 --target 3000  
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

## Termux-based signaling server (Android hotspot)
If you want your Android phone to act as the Socket.IO signaling hub, you can run the lightweight server in `scripts/termux-signaling-server.cjs` directly inside [Termux](https://f-droid.org/en/packages/com.termux/). This keeps the WebRTC pairing flow automatic while your phone serves as the always-on host.

### 1. Prepare Termux
```bash
pkg update && pkg upgrade -y
pkg install nodejs-lts git -y
termux-change-repo   # optional but recommended to pick fast mirrors
termux-wake-lock     # prevents Android from suspending the process (run once per session)
```

### 2. Fetch only what you need
```bash
mkdir ~/walkie-talkie-signal && cd ~/walkie-talkie-signal
npm init -y
npm install socket.io
curl -o termux-signaling-server.cjs https://raw.githubusercontent.com/Allankioni/walkie-talkie/master/scripts/termux-signaling-server.cjs
chmod +x termux-signaling-server.cjs
```

> Instead of `curl`, you can `git clone` the repo if you plan to keep it up to date: `git clone https://github.com/Allankioni/walkie-talkie.git` then `cd walkie-talkie`.

### 3. Run the server
```bash
node termux-signaling-server.cjs --port 41234 --host 0.0.0.0
```

The script prints every reachable LAN IP. Share the `http://<phone-ip>:41234` URL with your Walkie-Talkie clients. For the PWA, set:

```powershell
# In your Next.js/.env or deployment variables
$env:NEXT_PUBLIC_SIGNALING_URL = "http://<phone-ip>:41234"
```

### 4. Keep it awake (optional but helpful)
- Use `termux-wake-lock` (already shown) to prevent sleep.
- Pin the Termux session and disable battery optimizations for Termux in Android settings.
- To auto-start on boot, explore [Termux:Boot](https://f-droid.org/en/packages/com.termux.boot/).

### 5. Health check & presence
- `curl http://<phone-ip>:41234/health` → simple status JSON.
- `curl http://<phone-ip>:41234/presence` → current rooms and nicknames.
- Logs inside Termux show connect/disconnect events.

### Optional: serve WSS/HTTPS without leaving the LAN
If you install the PWA from an HTTPS origin (e.g. Vercel) but still want offline LAN signaling, run the Termux relay with a self-signed certificate that includes the hotspot IP in `subjectAltName` so browsers can connect via `wss://`:

```bash
pkg install openssl
mkdir -p ~/certs && cd ~/certs
cat > signal.cnf <<'EOF'
[ req ]
default_bits       = 2048
prompt             = no
default_md         = sha256
req_extensions     = req_ext
distinguished_name = dn

[ dn ]
C  = US
ST = Offline
L  = Hotspot
O  = WalkieTalkie
OU = Signal
CN = walkie-talkie.local

[ req_ext ]
subjectAltName = @alt_names

[ alt_names ]
DNS.1 = walkie-talkie.local
IP.1  = 192.168.88.48   # replace with your phone's LAN IP
IP.2  = 127.0.0.1
EOF

openssl req -newkey rsa:2048 -nodes -keyout signal.key -x509 -days 365 -out signal.crt \
	-config signal.cnf -extensions req_ext
```

**Important:** edit `IP.1` (and add more `IP.n` entries if needed) to match the actual hotspot/local IPs you plan to use. Without the IP in the SAN list, modern browsers will reject the cert even if you trust it.

Copy `signal.crt` to each client device and trust it (Android: Settings → Security → Install certificates; desktop: OS trust store). Then launch the server with TLS:

```bash
node termux-signaling-server.cjs --port 41234 --host 0.0.0.0 \
	--cert ~/certs/signal.crt --key ~/certs/signal.key
```

Point `NEXT_PUBLIC_SIGNALING_URL` to `https://<phone-ip>:41234`. Because the certificate never leaves your LAN, the setup stays offline—just make sure every device trusts the self-signed cert.

#### Offering the cert as a download
If you prefer to distribute the certificate from the same hotspot instead of sideloading files, copy it into the static assets served by your PWA:

```bash
# Assuming the app is running from the repo root
cp ~/certs/signal.crt ~/walkie-talkie/public/walkie-talkie-signal.crt
```

Users can then visit `http://<hub-ip>:3000/walkie-talkie-signal.crt` (or the exported site’s equivalent path) to download it directly. Android places the file in Downloads; tapping it there installs the CA with far fewer warnings because it comes from the trusted hotspot host. Repeat after regenerating the cert so clients always get the latest version.

> **Security note:** This server is meant for trusted LAN/hotspot use. Anyone who can reach the port can join the room, so keep it off public networks or wrap it behind a VPN.

## Stretch ideas
- Channels/rooms selector
- Static noise start/stop using WebAudio
- Better reconnect and presence avatars
