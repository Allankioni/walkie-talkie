**Setup Termux**
pkg update && pkg upgrade -y
pkg install nodejs-lts git -y
termux-wake-lock
mkdir ~/walkie-talkie-signal && cd ~/walkie-talkie-signal
npm init -y
npm install socket.io
curl -o termux-signaling-server.cjs https://raw.githubusercontent.com/Allankioni/walkie-talkie/master/scripts/termux-signaling-server.cjs
chmod +x termux-signaling-server.cjs

**Run it:**
node termux-signaling-server.cjs --port 41234 --host 0.0.0.0