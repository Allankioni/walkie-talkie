import { getSocket } from './socket';

export type Peer = {
  id: string;
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
};

// Configurable ICE servers: for LAN default to host/mDNS only; in internet deployments set NEXT_PUBLIC_ICE to a JSON array of RTCIceServer.
let ICE: RTCIceServer[] = [];
try {
  if (process.env.NEXT_PUBLIC_ICE) {
    ICE = JSON.parse(process.env.NEXT_PUBLIC_ICE) as RTCIceServer[];
  }
} catch {
  console.warn('Invalid NEXT_PUBLIC_ICE JSON, falling back to host/mDNS only');
}

export class WebRTCManager {
  private peers = new Map<string, Peer>();
  private micStream: MediaStream | null = null;
  private room = 'default';
  private nickname = 'Guest';

  constructor(room?: string, nickname?: string) {
    if (room) this.room = room;
    if (nickname) this.nickname = nickname;
  }

  connectPresence() {
    const socket = getSocket();
    if (!socket.connected) socket.connect();
    socket.emit('presence:join', { nickname: this.nickname, room: this.room });
  }

  disconnectPresence() {
    const socket = getSocket();
    socket.emit('presence:leave');
    socket.disconnect();
  }

  async startMic() {
    if (this.micStream) return this.micStream;
    this.micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    return this.micStream;
  }

  stopMic() {
    if (!this.micStream) return;
    this.micStream.getTracks().forEach((t) => t.stop());
    // Remove audio senders from peers
    for (const p of this.peers.values()) {
      p.pc.getSenders().forEach((s) => {
        if (s.track && s.track.kind === 'audio') p.pc.removeTrack(s);
      });
    }
    this.micStream = null;
  }

  private createPeer(remoteId: string) {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const audio = new Audio();
    audio.autoplay = true;
    audio.setAttribute('playsinline', '');
    // Ensure element is in DOM for autoplay policies
    try {
      document.body.appendChild(audio);
    } catch {}

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        getSocket().emit('webrtc:ice', { targetId: remoteId, candidate: e.candidate });
      }
    };

    pc.ontrack = (ev) => {
      const [stream] = ev.streams;
      audio.srcObject = stream;
    };

    this.peers.set(remoteId, { id: remoteId, pc, audio });
    return pc;
  }

  removePeer(remoteId: string) {
    const p = this.peers.get(remoteId);
    if (!p) return;
    p.pc.onicecandidate = null;
    p.pc.ontrack = null;
    p.pc.getSenders().forEach((s) => p.pc.removeTrack(s));
    p.pc.close();
    p.audio.srcObject = null;
    if (p.audio.parentNode) {
      try { p.audio.parentNode.removeChild(p.audio); } catch {}
    }
    this.peers.delete(remoteId);
  }

  getPeer(remoteId: string) {
    return this.peers.get(remoteId)?.pc ?? null;
  }

  getPeerIds(): string[] {
    return Array.from(this.peers.keys());
  }

  async call(remoteId: string) {
    let pc = this.getPeer(remoteId);
    if (!pc) pc = this.createPeer(remoteId);
  // Attach mic tracks if transmitting
  if (this.micStream) this.attachMic(pc!);
    const offer = await pc!.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
    await pc!.setLocalDescription(offer);
    getSocket().emit('webrtc:offer', { targetId: remoteId, sdp: offer });
  }

  async handleOffer(fromId: string, sdp: RTCSessionDescriptionInit) {
    let pc = this.getPeer(fromId);
    if (!pc) pc = this.createPeer(fromId);
  if (this.micStream) this.attachMic(pc!);
    await pc!.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc!.createAnswer();
    await pc!.setLocalDescription(answer);
    getSocket().emit('webrtc:answer', { targetId: fromId, sdp: answer });
  }

  async handleAnswer(fromId: string, sdp: RTCSessionDescriptionInit) {
    const pc = this.getPeer(fromId);
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  }

  private attachMic(pc: RTCPeerConnection) {
    // Remove previous audio senders to prevent duplicates
    pc.getSenders().forEach((s) => {
      if (s.track && s.track.kind === 'audio') pc.removeTrack(s);
    });
    if (!this.micStream) return;
    this.micStream.getTracks()
      .filter((t) => t.kind === 'audio')
      .forEach((t) => pc.addTrack(t, this.micStream!));
  }

  async handleIce(fromId: string, candidate: RTCIceCandidateInit) {
    const pc = this.getPeer(fromId);
    if (!pc) return;
    try {
      await pc.addIceCandidate(candidate);
    } catch (e) {
      console.warn('ICE add error', e);
    }
  }
}
