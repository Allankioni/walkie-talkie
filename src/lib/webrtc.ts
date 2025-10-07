import { getSocket } from './socket';
import type { SignalPayload } from './manualSignal';

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
  private useSocket = true;

  constructor(room?: string, nickname?: string, useSocket: boolean = true) {
    if (room) this.room = room;
    if (nickname) this.nickname = nickname;
    this.useSocket = useSocket;
  }

  connectPresence() {
    if (!this.useSocket) return;
    const socket = getSocket();
    if (!socket.connected) socket.connect();
    socket.emit('presence:join', { nickname: this.nickname, room: this.room });
  }

  disconnectPresence() {
    if (!this.useSocket) return;
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
      if (!this.useSocket) return; // in manual mode we do not trickle; we bundle in SDP
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
    if (this.useSocket) getSocket().emit('webrtc:offer', { targetId: remoteId, sdp: offer });
  }

  async handleOffer(fromId: string, sdp: RTCSessionDescriptionInit) {
    let pc = this.getPeer(fromId);
    if (!pc) pc = this.createPeer(fromId);
  if (this.micStream) this.attachMic(pc!);
    await pc!.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc!.createAnswer();
    await pc!.setLocalDescription(answer);
    if (this.useSocket) getSocket().emit('webrtc:answer', { targetId: fromId, sdp: answer });
  }

  async handleAnswer(fromId: string, sdp: RTCSessionDescriptionInit) {
    const pc = this.getPeer(fromId);
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  }

  private async awaitIceGatheringComplete(pc: RTCPeerConnection, timeoutMs = 3000): Promise<void> {
    if (pc.iceGatheringState === 'complete') return;
    await new Promise<void>((resolve) => {
      const done = () => {
        pc.removeEventListener('icegatheringstatechange', onChange);
        resolve();
      };
      const onChange = () => {
        if (pc.iceGatheringState === 'complete') done();
      };
      pc.addEventListener('icegatheringstatechange', onChange);
      setTimeout(done, timeoutMs);
    });
  }

  // --- Manual/QR signaling helpers (no socket) ---
  async createOfferManual(): Promise<SignalPayload> {
    const remoteId = 'manual';
    let pc = this.getPeer(remoteId);
    if (!pc) pc = this.createPeer(remoteId);
    if (this.micStream) this.attachMic(pc!);
    const offer = await pc!.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
    await pc!.setLocalDescription(offer);
    await this.awaitIceGatheringComplete(pc!);
    return { v: 1, t: 'offer', s: pc!.localDescription! };
  }

  async acceptOfferManual(payload: SignalPayload): Promise<SignalPayload> {
    if (payload.t !== 'offer') throw new Error('Expected offer');
    const remoteId = 'manual';
    let pc = this.getPeer(remoteId);
    if (!pc) pc = this.createPeer(remoteId);
    if (this.micStream) this.attachMic(pc!);
    await pc!.setRemoteDescription(new RTCSessionDescription(payload.s));
    const answer = await pc!.createAnswer();
    await pc!.setLocalDescription(answer);
    await this.awaitIceGatheringComplete(pc!);
    return { v: 1, t: 'answer', s: pc!.localDescription! };
  }

  async applyAnswerManual(payload: SignalPayload): Promise<void> {
    if (payload.t !== 'answer') throw new Error('Expected answer');
    const pc = this.getPeer('manual');
    if (!pc) throw new Error('Peer not initialized');
    await pc.setRemoteDescription(new RTCSessionDescription(payload.s));
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
