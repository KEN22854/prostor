import type { Awareness } from 'y-protocols/awareness';
import type { AwarenessState } from '@prostor/shared';

/**
 * Созвон на доске: каждый участник соединён с каждым (mesh, WebRTC).
 * Для команд до 6–8 человек это проще и быстрее медиасервера: звук и видео
 * идут напрямую, сервер Простора только передаёт сигналы (SDP, ICE).
 *
 * Согласование — «perfect negotiation» (W3C): обе стороны могут слать
 * предложения, коллизии разрешает «вежливость» по clientID. Кто в созвоне —
 * видно из awareness (поле call), поэтому новый участник сам находит остальных.
 */
export type CallMedia = { audio: boolean; video: boolean; screen: boolean };

export interface CallParticipant {
  clientId: number;
  userId: string;
  name: string;
  color: string;
  media: CallMedia;
  stream: MediaStream | null;
  self: boolean;
}

interface Signaling {
  clientId: number;
  awareness: Awareness;
  send: (to: number, payload: string) => boolean;
  subscribe: (listener: (from: number, payload: string) => void) => () => void;
}

type Signal =
  { t: 'description'; d: RTCSessionDescriptionInit } | { t: 'candidate'; c: RTCIceCandidateInit };

interface Peer {
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  stream: MediaStream;
  videoSender: RTCRtpSender | null;
}

export class CallManager {
  private readonly peers = new Map<number, Peer>();
  private local: MediaStream | null = null;
  private camera: MediaStreamTrack | null = null;
  private screen: MediaStreamTrack | null = null;
  private media: CallMedia = { audio: true, video: false, screen: false };
  private unsubscribe: (() => void) | null = null;
  private joined = false;
  private version = 0;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly signaling: Signaling,
    private readonly iceServers: RTCIceServer[],
  ) {
    signaling.awareness.on('change', this.onAwareness);
  }

  // ─────────────── Для React (useSyncExternalStore) ───────────────

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getVersion = (): number => this.version;
  private emit(): void {
    this.version++;
    for (const l of this.listeners) l();
  }

  get inCall(): boolean {
    return this.joined;
  }
  get localMedia(): CallMedia {
    return this.media;
  }
  get localStream(): MediaStream | null {
    return this.local;
  }

  /** Все, кто в созвоне (включая себя), — для плиток */
  participants(): CallParticipant[] {
    const out: CallParticipant[] = [];
    this.signaling.awareness.getStates().forEach((raw, clientId) => {
      const state = raw as Partial<AwarenessState>;
      if (!state.call || !state.user) return;
      const self = clientId === this.signaling.clientId;
      out.push({
        clientId,
        userId: state.user.id,
        name: state.user.name,
        color: state.user.color,
        media: state.call,
        stream: self ? this.local : (this.peers.get(clientId)?.stream ?? null),
        self,
      });
    });
    return out.sort((a, b) => (a.self ? -1 : b.self ? 1 : a.name.localeCompare(b.name)));
  }

  // ─────────────── Вход и выход ───────────────

  async join(withVideo: boolean): Promise<void> {
    if (this.joined) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: withVideo ? { width: 640, height: 480, facingMode: 'user' } : false,
    });
    this.local = stream;
    this.camera = stream.getVideoTracks()[0] ?? null;
    this.media = { audio: true, video: Boolean(this.camera), screen: false };
    this.joined = true;
    this.unsubscribe = this.signaling.subscribe(this.onSignal);
    this.publish();
    this.syncPeers();
    this.emit();
  }

  leave(): void {
    if (!this.joined) return;
    this.joined = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (const id of [...this.peers.keys()]) this.closePeer(id);
    for (const track of this.local?.getTracks() ?? []) track.stop();
    this.screen?.stop();
    this.local = null;
    this.camera = null;
    this.screen = null;
    this.signaling.awareness.setLocalStateField('call', null);
    this.emit();
  }

  destroy(): void {
    this.leave();
    this.signaling.awareness.off('change', this.onAwareness);
    this.listeners.clear();
  }

  // ─────────────── Микрофон, камера, экран ───────────────

  setAudio(on: boolean): void {
    for (const track of this.local?.getAudioTracks() ?? []) track.enabled = on;
    this.media = { ...this.media, audio: on };
    this.publish();
    this.emit();
  }

  async setVideo(on: boolean): Promise<void> {
    if (!this.local) return;
    if (on && !this.camera) {
      const cam = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
      });
      this.camera = cam.getVideoTracks()[0] ?? null;
      if (this.camera && !this.screen) this.local.addTrack(this.camera);
    } else if (!on && this.camera) {
      this.camera.stop();
      this.local.removeTrack(this.camera);
      this.camera = null;
    }
    this.media = { ...this.media, video: Boolean(this.camera) };
    if (!this.screen) await this.replaceVideo(this.camera);
    this.publish();
    this.emit();
  }

  async toggleScreen(): Promise<void> {
    if (!this.local) return;
    if (this.screen) {
      this.stopScreen();
      return;
    }
    const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 } });
    const track = display.getVideoTracks()[0];
    if (!track) return;
    this.screen = track;
    // «Закрыть доступ» в панели браузера — вернуться к камере
    track.addEventListener('ended', () => this.stopScreen());
    if (this.camera) this.local.removeTrack(this.camera);
    this.local.addTrack(track);
    await this.replaceVideo(track);
    this.media = { ...this.media, screen: true };
    this.publish();
    this.emit();
  }

  private stopScreen(): void {
    if (!this.screen || !this.local) return;
    this.local.removeTrack(this.screen);
    this.screen.stop();
    this.screen = null;
    if (this.camera) this.local.addTrack(this.camera);
    void this.replaceVideo(this.camera);
    this.media = { ...this.media, screen: false };
    this.publish();
    this.emit();
  }

  /** Сменить видеодорожку у всех собеседников (без пересогласования, если отправитель уже есть) */
  private async replaceVideo(track: MediaStreamTrack | null): Promise<void> {
    for (const peer of this.peers.values()) {
      if (peer.videoSender) await peer.videoSender.replaceTrack(track);
      else if (track && this.local) peer.videoSender = peer.pc.addTrack(track, this.local);
    }
  }

  private publish(): void {
    this.signaling.awareness.setLocalStateField('call', this.joined ? this.media : null);
  }

  // ─────────────── Пиры ───────────────

  private readonly onAwareness = (): void => {
    if (this.joined) this.syncPeers();
    this.emit();
  };

  /** Соединения — ровно с теми, кто сейчас в созвоне */
  private syncPeers(): void {
    const inCall = new Set<number>();
    this.signaling.awareness.getStates().forEach((raw, clientId) => {
      if (clientId !== this.signaling.clientId && (raw as Partial<AwarenessState>).call)
        inCall.add(clientId);
    });
    for (const id of inCall) if (!this.peers.has(id)) this.createPeer(id);
    for (const id of [...this.peers.keys()]) if (!inCall.has(id)) this.closePeer(id);
  }

  private createPeer(id: number): Peer {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const peer: Peer = {
      pc,
      polite: this.signaling.clientId > id,
      makingOffer: false,
      ignoreOffer: false,
      stream: new MediaStream(),
      videoSender: null,
    };
    this.peers.set(id, peer);
    for (const track of this.local?.getTracks() ?? []) {
      const sender = pc.addTrack(track, this.local!);
      if (track.kind === 'video') peer.videoSender = sender;
    }
    pc.ontrack = ({ track }) => {
      peer.stream.addTrack(track);
      track.addEventListener('ended', () => {
        peer.stream.removeTrack(track);
        this.emit();
      });
      this.emit();
    };
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.send(id, { t: 'candidate', c: candidate.toJSON() });
    };
    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        if (pc.localDescription)
          this.send(id, { t: 'description', d: pc.localDescription.toJSON() });
      } catch (error) {
        console.warn('[call] negotiation failed', error);
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.onconnectionstatechange = () => {
      // Разрыв (смена сети) — перезапускаем ICE, а не весь звонок
      if (pc.connectionState === 'failed') pc.restartIce();
      this.emit();
    };
    return peer;
  }

  private closePeer(id: number): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.pc.close();
    this.peers.delete(id);
  }

  private send(to: number, signal: Signal): void {
    this.signaling.send(to, JSON.stringify(signal));
  }

  private readonly onSignal = (from: number, payload: string): void => {
    void this.handleSignal(from, payload);
  };

  private async handleSignal(from: number, payload: string): Promise<void> {
    if (!this.joined) return;
    let signal: Signal;
    try {
      signal = JSON.parse(payload) as Signal;
    } catch {
      return;
    }
    // Предложение от того, чьё awareness ещё не дошло, — соединяемся сразу
    const peer = this.peers.get(from) ?? this.createPeer(from);
    const { pc } = peer;
    try {
      if (signal.t === 'description') {
        const offerCollision =
          signal.d.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
        peer.ignoreOffer = !peer.polite && offerCollision;
        if (peer.ignoreOffer) return;
        await pc.setRemoteDescription(signal.d);
        if (signal.d.type === 'offer') {
          await pc.setLocalDescription();
          if (pc.localDescription)
            this.send(from, { t: 'description', d: pc.localDescription.toJSON() });
        }
      } else if (signal.t === 'candidate') {
        try {
          await pc.addIceCandidate(signal.c);
        } catch (error) {
          if (!peer.ignoreOffer) throw error;
        }
      }
    } catch (error) {
      console.warn('[call] signal failed', error);
    }
  }
}
