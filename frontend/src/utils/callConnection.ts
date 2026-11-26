import type { CallSignal, OutgoingSignal } from '../services/callService';

interface CallConnectionCallbacks {
  signal: (signal: OutgoingSignal) => Promise<void>;
  stream: (stream: MediaStream) => void;
  state: (state: RTCPeerConnectionState) => void;
  error: (error: unknown) => void;
}

export class CallConnection {
  readonly peer: RTCPeerConnection;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private offered = false;
  private closed = false;
  private sending = Promise.resolve();

  constructor(stream: MediaStream, iceServers: RTCIceServer[], callbacks: CallConnectionCallbacks) {
    this.peer = new RTCPeerConnection({ iceServers });
    stream.getTracks().forEach(track => this.peer.addTrack(track, stream));
    const remote = new MediaStream();
    this.peer.ontrack = event => {
      if (!remote.getTracks().some(track => track.id === event.track.id)) remote.addTrack(event.track);
      callbacks.stream(remote);
    };
    this.peer.onconnectionstatechange = () => callbacks.state(this.peer.connectionState);
    this.peer.onicecandidate = event => {
      if (event.candidate) this.send({ type: 'candidate', payload: event.candidate.toJSON() }, callbacks);
    };
    this.callbacks = callbacks;
  }

  private callbacks: CallConnectionCallbacks;

  private send(signal: OutgoingSignal, callbacks = this.callbacks) {
    this.sending = this.sending.then(async () => {
      if (!this.closed) await callbacks.signal(signal);
    }).catch(error => { if (!this.closed) callbacks.error(error); });
    return this.sending;
  }

  async offer() {
    if (this.offered || this.closed) return;
    this.offered = true;
    await this.peer.setLocalDescription(await this.peer.createOffer());
    if (!this.closed) await this.send({ type: 'offer', payload: this.peer.localDescription!.toJSON() });
  }

  async receive(signal: CallSignal) {
    if (this.closed) return;
    if (signal.type === 'candidate') {
      if (!this.peer.remoteDescription) this.pendingCandidates.push(signal.payload);
      else await this.peer.addIceCandidate(signal.payload);
      return;
    }
    await this.peer.setRemoteDescription(signal.payload);
    for (const candidate of this.pendingCandidates.splice(0)) await this.peer.addIceCandidate(candidate);
    if (signal.type === 'offer') {
      await this.peer.setLocalDescription(await this.peer.createAnswer());
      if (!this.closed) await this.send({ type: 'answer', payload: this.peer.localDescription!.toJSON() });
    }
  }

  close() {
    this.closed = true;
    this.peer.ontrack = null;
    this.peer.onicecandidate = null;
    this.peer.onconnectionstatechange = null;
    this.peer.close();
  }
}
