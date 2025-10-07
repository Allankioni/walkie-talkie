import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';

export type PackedSignal = string;

export type SignalPayload = {
  v: 1;
  t: 'offer' | 'answer';
  s: RTCSessionDescriptionInit;
};

export function packSignal(payload: SignalPayload): PackedSignal {
  const json = JSON.stringify(payload);
  return 'wt://' + compressToEncodedURIComponent(json);
}

export function unpackSignal(packed: PackedSignal): SignalPayload {
  const trimmed = packed.startsWith('wt://') ? packed.slice(5) : packed;
  const json = decompressFromEncodedURIComponent(trimmed);
  if (!json) throw new Error('Invalid or corrupted QR payload');
  const obj = JSON.parse(json) as SignalPayload;
  if (obj.v !== 1 || (obj.t !== 'offer' && obj.t !== 'answer') || !obj.s) {
    throw new Error('Unsupported signal payload');
  }
  return obj;
}
