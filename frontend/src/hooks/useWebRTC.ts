import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Peer, { type MediaConnection } from 'peerjs';
import { captureVideoFrame, type CaptureFrameOptions } from '../utils/captureFrame';
import { apiUrl, serverOrigin } from '../utils/serverUrl';
import {
  evaluatePair,
  shouldKeepCall,
  streamHasLiveTrack,
  MAX_DIAL_ATTEMPTS,
  WATCHDOG_INTERVAL_MS,
  type CallOrigin,
  type PairDiagnostics,
  type PairState,
  type TrackedCall,
} from './rtcConnection';

export type FacingMode = 'user' | 'environment';

/**
 * Which camera a player starts on.
 *
 * 'user' (selfie) because the first thing anyone sees is the lobby, where the
 * point is seeing each other's faces. Players flip to the rear camera with the
 * flip button once they are actually hunting.
 */
const INITIAL_FACING_MODE: FacingMode = 'user';

export interface RemotePeer {
  playerId: string;
  peerId: string;
  name: string;
}

export interface RemoteMedia {
  playerId: string;
  peerId: string;
  name: string;
  stream: MediaStream;
}

/** Voice chat capture. Echo cancellation matters: everyone is on speakers. */
const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

const VIDEO_CONSTRAINTS = (facingMode: FacingMode): MediaTrackConstraints => ({
  facingMode: { ideal: facingMode },
  width: { ideal: 640, max: 960 },
  height: { ideal: 480, max: 720 },
  frameRate: { ideal: 15, max: 24 },
});

interface RtcConfigResponse {
  iceServers: RTCIceServer[];
  peerPath: string | null;
  hasTurn: boolean;
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

/**
 * iOS (and iPadOS pretending to be a Mac) needs its own remote-audio path.
 * See the gain-stage comment further down for why.
 */
function isWebKitMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iP(hone|ad|od)/.test(ua)) return true;
  // iPadOS 13+ reports as Macintosh; touch support is the usual tell.
  return /Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document;
}

/**
 * How much to amplify remote voices through the WebAudio stage on iOS.
 * Only ever applied on top of the normal element playback, so it can make
 * the call louder but never quieter.
 */
const IOS_REMOTE_GAIN = 2.5;

/**
 * Fetches ICE servers and the broker path from our server.
 *
 * Falls back to PeerJS's own defaults if the request fails, so a server
 * hiccup degrades to the previous behaviour rather than killing the camera.
 */
async function loadRtcConfig(): Promise<RtcConfigResponse | null> {
  try {
    const res = await fetch(apiUrl('/api/rtc-config'), { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as RtcConfigResponse;
  } catch {
    return null;
  }
}

/**
 * PeerJS options.
 *
 * Every client in a room MUST end up on the same signalling broker, so this
 * is deliberately not negotiable per client: either the server told us a
 * peerPath (everyone uses ours) or it did not (everyone uses the PeerJS
 * cloud). The choice is the server's, identical for all players.
 */
function peerOptions(config: RtcConfigResponse | null) {
  const iceServers = config?.iceServers;
  const base = iceServers ? { config: { iceServers } } : {};

  if (!config?.peerPath) return base;

  const origin = serverOrigin();
  const secure = origin.protocol === 'https:';
  const port = origin.port ? Number(origin.port) : secure ? 443 : 80;
  return {
    ...base,
    host: origin.hostname,
    port,
    path: config.peerPath,
    secure,
  };
}

/**
 * PeerJS mesh (2-4 players) + a single local camera track.
 *
 * Flip camera: stop the old track, then getUserMedia once, then
 * RTCRtpSender.replaceTrack() on every live call. Never keep two
 * camera streams open at the same time.
 *
 * Connection management (dial, glare, retry) lives in ./rtcConnection.
 */
export function useWebRTC(options: {
  enabled: boolean;
  /**
   * Master voice-chat switch (Settings -> Voice chat). When false the local
   * mic is muted AND remote audio is silenced - you neither speak nor hear.
   */
  voiceEnabled?: boolean;
  localName: string;
  localPlayerId: string;
  remotePeers: RemotePeer[];
  onLocalPeerId?: (peerId: string) => void;
}) {
  const {
    enabled,
    voiceEnabled = true,
    localName,
    localPlayerId,
    remotePeers,
    onLocalPeerId,
  } = options;

  const [localPeerId, setLocalPeerId] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteMedia, setRemoteMedia] = useState<Record<string, RemoteMedia>>({});
  const [facingMode, setFacingMode] = useState<FacingMode>(INITIAL_FACING_MODE);
  const [error, setError] = useState<string | null>(null);
  const [isFlipping, setIsFlipping] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [micAvailable, setMicAvailable] = useState(false);
  const [brokerKind, setBrokerKind] = useState<'own' | 'cloud' | null>(null);
  const [meshDiagnostics, setMeshDiagnostics] = useState<PairDiagnostics[]>([]);
  const videoEnabledRef = useRef(true);

  const localVideoEl = useRef<HTMLVideoElement | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const callsRef = useRef<Map<string, TrackedCall>>(new Map());
  const remotePeersRef = useRef(remotePeers);
  const onPeerIdRef = useRef(onLocalPeerId);
  const localNameRef = useRef(localName);
  const localPlayerIdRef = useRef(localPlayerId);
  const facingRef = useRef<FacingMode>(INITIAL_FACING_MODE);
  const remoteAudioRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  /** Per-peer dial bookkeeping, used by the watchdog. */
  const knownSinceRef = useRef<Map<string, number>>(new Map());
  const attemptsRef = useRef<Map<string, number>>(new Map());
  const lastAttemptAtRef = useRef<Map<string, number>>(new Map());
  const pairStateRef = useRef<Map<string, PairState>>(new Map());
  const remoteMediaRef = useRef<Record<string, RemoteMedia>>({});
  const rtcConfigRef = useRef<RtcConfigResponse | null>(null);

  /** iOS remote-audio gain stage. */
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainStageRef = useRef<Map<string, { src: MediaStreamAudioSourceNode; gain: GainNode }>>(
    new Map(),
  );

  remotePeersRef.current = remotePeers;
  onPeerIdRef.current = onLocalPeerId;
  localNameRef.current = localName;
  localPlayerIdRef.current = localPlayerId;
  remoteMediaRef.current = remoteMedia;

  const attachLocalVideo = useCallback((stream: MediaStream) => {
    const el = localVideoEl.current;
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
  }, []);

  /**
   * Ref handed to the local <video>.
   *
   * It looks like a normal ref object, but assigning `.current` also attaches
   * the live stream. That matters because the camera starts in the LOBBY,
   * where no <video> is rendered yet: the stream arrives while the ref is
   * still null, and nothing re-attached it when the game screen later mounted
   * the element. The result was a black local tile until something called
   * attachLocalVideo again - which is why hitting "flip camera" appeared to
   * fix it. Attaching on mount removes the ordering problem entirely.
   */
  const localVideoRef = useMemo(
    () => ({
      get current(): HTMLVideoElement | null {
        return localVideoEl.current;
      },
      set current(el: HTMLVideoElement | null) {
        localVideoEl.current = el;
        const stream = streamRef.current;
        if (el && stream && el.srcObject !== stream) {
          el.srcObject = stream;
        }
      },
    }),
    [],
  );

  const replaceVideoTrackOnCalls = useCallback(async (newTrack: MediaStreamTrack) => {
    const replacements: Promise<void>[] = [];
    for (const tracked of callsRef.current.values()) {
      const sender = tracked.call.peerConnection
        ?.getSenders()
        .find((s) => s.track?.kind === 'video');
      if (sender) {
        replacements.push(sender.replaceTrack(newTrack).then(() => undefined));
      }
    }
    await Promise.all(replacements);
  }, []);

  const rememberRemote = useCallback((peerId: string, stream: MediaStream) => {
    const match = remotePeersRef.current.find((p) => p.peerId === peerId);
    setRemoteMedia((prev) => {
      const existing = prev[peerId];
      const next: RemoteMedia = {
        // Identity can arrive after the media does - PeerJS signalling often
        // beats the socket roster - so keep refreshing it from the roster
        // rather than freezing whatever was known at the first frame.
        playerId: match?.playerId ?? existing?.playerId ?? peerId,
        peerId,
        name: match?.name ?? existing?.name ?? 'Player',
        stream,
      };
      if (
        existing
        && existing.stream === stream
        && existing.playerId === next.playerId
        && existing.name === next.name
      ) {
        return prev;
      }
      return { ...prev, [peerId]: next };
    });
  }, []);

  const forgetRemote = useCallback((peerId: string) => {
    setRemoteMedia((prev) => {
      if (!(peerId in prev)) return prev;
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  /** Closes and forgets a pair's call without touching its retry budget. */
  const teardownCall = useCallback((peerId: string) => {
    const tracked = callsRef.current.get(peerId);
    if (tracked) {
      try {
        tracked.call.close();
      } catch {
        /* already closed */
      }
      callsRef.current.delete(peerId);
    }
  }, []);

  const dropRemote = useCallback(
    (peerId: string) => {
      teardownCall(peerId);
      forgetRemote(peerId);
    },
    [forgetRemote, teardownCall],
  );

  /**
   * Adopts a call as THE connection for a peer, resolving glare.
   *
   * When both sides dialled, both ends independently keep the call made by
   * the smaller peer id (see shouldKeepCall), so exactly one connection
   * survives per pair and the UI can never end up bound to the dead one.
   */
  const adoptCall = useCallback((call: MediaConnection, origin: CallOrigin): boolean => {
    const peerId = call.peer;
    const myId = peerRef.current?.id ?? '';
    const existing = callsRef.current.get(peerId);

    if (existing && existing.call !== call) {
      if (!shouldKeepCall(origin, myId, peerId)) {
        // The other side's call is the agreed winner; drop ours quietly.
        try {
          call.close();
        } catch {
          /* nothing to close */
        }
        return false;
      }
      try {
        existing.call.close();
      } catch {
        /* already gone */
      }
    }

    callsRef.current.set(peerId, { call, origin, startedAt: Date.now() });
    return true;
  }, []);

  const bindCall = useCallback(
    (call: MediaConnection, origin: CallOrigin) => {
      if (!adoptCall(call, origin)) return;

      call.on('stream', (stream) => {
        // Only trust the stream from the call we actually kept.
        if (callsRef.current.get(call.peer)?.call !== call) return;
        stream.getVideoTracks().forEach((track) => {
          track.onunmute = () => rememberRemote(call.peer, stream);
        });
        rememberRemote(call.peer, stream);
      });

      call.on('close', () => {
        if (callsRef.current.get(call.peer)?.call !== call) return;
        dropRemote(call.peer);
      });

      call.on('error', (err) => {
        console.warn('[webrtc] call error', call.peer, err);
        if (callsRef.current.get(call.peer)?.call !== call) return;
        dropRemote(call.peer);
      });

      // ICE failure is the signal the old code ignored. Clearing the call here
      // lets the watchdog re-dial instead of leaving the pair dark forever.
      const pc = call.peerConnection;
      if (pc) {
        pc.addEventListener('iceconnectionstatechange', () => {
          if (callsRef.current.get(call.peer)?.call !== call) return;
          if (pc.iceConnectionState === 'failed') {
            console.warn('[webrtc] ice failed, will re-dial', call.peer);
            dropRemote(call.peer);
          }
        });
      }
    },
    [adoptCall, dropRemote, rememberRemote],
  );

  /** Opens a call to a peer. The caller has already decided this is wanted. */
  const dialPeer = useCallback(
    (remotePeerId: string) => {
      const peer = peerRef.current;
      const stream = streamRef.current;
      if (!peer?.id || !stream || stream.getVideoTracks().length === 0) return;
      if (remotePeerId === peer.id) return;

      teardownCall(remotePeerId);
      attemptsRef.current.set(remotePeerId, (attemptsRef.current.get(remotePeerId) ?? 0) + 1);
      lastAttemptAtRef.current.set(remotePeerId, Date.now());

      try {
        const call = peer.call(remotePeerId, stream, {
          metadata: { playerId: localPlayerIdRef.current, name: localNameRef.current },
        });
        bindCall(call, 'outgoing');
      } catch (err) {
        console.warn('[webrtc] dial failed', remotePeerId, err);
      }
    },
    [bindCall, teardownCall],
  );

  /* ------------------------------------------------------------------ */
  /* Camera + peer lifecycle                                            */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    /** Creates a Peer, falling back to the public broker once if ours fails. */
    function createPeer() {
      const peer = new Peer(peerOptions(rtcConfigRef.current) as never);
      peerRef.current = peer;
      setBrokerKind(rtcConfigRef.current?.peerPath ? 'own' : 'cloud');

      peer.on('open', (id) => {
        if (cancelled) return;
        setLocalPeerId(id);
        setError(null);
        onPeerIdRef.current?.(id);
        // The watchdog does the actual dialling from here.
      });

      peer.on('call', (call) => {
        const live = streamRef.current;
        if (!live || live.getVideoTracks().length === 0) {
          // Our camera is not up yet. Answer as soon as it is rather than
          // dropping the call - the peer has no way to know to retry.
          const waitForCamera = window.setInterval(() => {
            const readyStream = streamRef.current;
            if (cancelled) {
              window.clearInterval(waitForCamera);
              call.close();
              return;
            }
            if (readyStream && readyStream.getVideoTracks().length > 0) {
              window.clearInterval(waitForCamera);
              call.answer(readyStream);
              bindCall(call, 'incoming');
            }
          }, 250);
          window.setTimeout(() => window.clearInterval(waitForCamera), 10_000);
          return;
        }
        call.answer(live);
        bindCall(call, 'incoming');
      });

      peer.on('error', (err) => {
        if (cancelled) return;
        const type = (err as { type?: string }).type;

        // "That peer is not online yet" is normal while a room fills up. The
        // watchdog retries, so it must not clear state or alarm the user -
        // the old code surfaced it as a camera error AND left a dead entry in
        // the call map that blocked every later attempt to reach that player.
        if (type === 'peer-unavailable') {
          const match = /([A-Za-z0-9_-]{6,})/.exec(err.message ?? '');
          if (match) teardownCall(match[1]!);
          return;
        }

        // DO NOT fall back to a different signalling broker here.
        //
        // This used to switch to the PeerJS cloud when our own broker had a
        // problem, which looked like a safe belt-and-braces move and was in
        // fact the opposite: two clients on two different brokers can never
        // discover each other, however good their network is. One player
        // having a single socket hiccup would silently drop them onto
        // another signalling network and make them invisible to the whole
        // room, permanently - each side reporting the other as "not online".
        //
        // Our broker is the same process that serves the game, so if the
        // room's socket is up the broker is reachable. A transient failure
        // is a reconnect, not a reason to change networks: peer.reconnect()
        // below retries the SAME broker and keeps the same id.
        const brokerProblem =
          type === 'server-error'
          || type === 'socket-error'
          || type === 'socket-closed'
          || type === 'network';
        if (brokerProblem) {
          console.warn('[webrtc] broker connection problem, reconnecting:', type, err.message);
          if (!peer.destroyed && peer.disconnected) peer.reconnect();
          return;
        }

        console.warn('[webrtc] peer error', type, err.message);
        setError(err.message || 'WebRTC connection error.');
      });

      peer.on('disconnected', () => {
        if (!cancelled && !peer.destroyed) {
          peer.reconnect();
        }
      });
    }

    async function start() {
      setError(null);

      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        setError('This browser does not support camera access. Please use Chrome or Edge on localhost.');
        return;
      }

      // Create the AudioContext BEFORE getUserMedia. On iOS this is reported
      // to matter for whether remote audio ends up audible at all.
      if (isWebKitMobile() && !audioCtxRef.current) {
        try {
          const Ctor = window.AudioContext
            || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          if (Ctor) audioCtxRef.current = new Ctor();
        } catch {
          /* no WebAudio; element playback still applies */
        }
      }

      // Ask the server which ICE servers and broker to use. Never fatal.
      rtcConfigRef.current = await loadRtcConfig();
      if (cancelled) return;

      try {
        // Ask for mic + camera together (one getUserMedia call - a second
        // concurrent one freezes mobile WebRTC). If the mic is denied or
        // missing, retry video-only: losing voice must never lose video.
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: AUDIO_CONSTRAINTS,
            video: VIDEO_CONSTRAINTS(facingRef.current),
          });
        } catch (micError) {
          console.warn('[webrtc] mic unavailable, continuing without voice:', micError);
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: VIDEO_CONSTRAINTS(facingRef.current),
          });
        }

        // iOS puts the page into a "call" audio session as soon as a mic is
        // live, which routes playback to the EARPIECE and is why voice chat
        // sounds faint on a phone. audioSession is the only lever the web
        // platform exposes, and it is not enough on its own: every category
        // that permits recording defaults to the receiver, and there is no
        // web equivalent of AVAudioSession's defaultToSpeaker. Kept because
        // it is harmless and correct, but the thing that actually raises the
        // volume is the WebAudio gain stage further down.
        try {
          const audioSession = (navigator as unknown as {
            audioSession?: { type: string };
          }).audioSession;
          if (audioSession) audioSession.type = 'play-and-record';
        } catch {
          /* unsupported browser */
        }

        const audioTracks = stream.getAudioTracks();
        stream.getVideoTracks().forEach((track) => {
          track.enabled = videoEnabledRef.current;
        });
        setMicAvailable(audioTracks.length > 0);
        setMicEnabled(audioTracks.length > 0 ? audioTracks[0]!.enabled : false);
        if (cancelled) {
          stopStream(stream);
          return;
        }

        streamRef.current = stream;
        setLocalStream(stream);
        attachLocalVideo(stream);

        createPeer();
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : 'Could not access the camera.';
        setError(
          message.includes('Permission') || message.includes('NotAllowed')
            ? 'Camera permission was blocked. Allow camera access and reload.'
            : message,
        );
      }
    }

    void start();

    return () => {
      cancelled = true;
      for (const tracked of callsRef.current.values()) {
        try {
          tracked.call.close();
        } catch {
          /* already closed */
        }
      }
      callsRef.current.clear();
      knownSinceRef.current.clear();
      attemptsRef.current.clear();
      lastAttemptAtRef.current.clear();
      pairStateRef.current.clear();
      peerRef.current?.destroy();
      peerRef.current = null;
      stopStream(streamRef.current);
      streamRef.current = null;
      setLocalStream(null);
      setLocalPeerId(null);
      setRemoteMedia({});
      setBrokerKind(null);
      setMeshDiagnostics([]);
    };
  }, [enabled, attachLocalVideo, bindCall, teardownCall]);

  /* ------------------------------------------------------------------ */
  /* Watchdog: the thing that makes a partial mesh heal itself          */
  /* ------------------------------------------------------------------ */

  // Record when each peer first appeared, so the polite wait has a baseline.
  useEffect(() => {
    const known = knownSinceRef.current;
    const now = Date.now();
    const live = new Set<string>();
    for (const remote of remotePeers) {
      if (!remote.peerId) continue;
      live.add(remote.peerId);
      if (!known.has(remote.peerId)) known.set(remote.peerId, now);
    }
    // Forget players who left, and tear down their calls.
    for (const peerId of [...known.keys()]) {
      if (!live.has(peerId)) {
        known.delete(peerId);
        attemptsRef.current.delete(peerId);
        lastAttemptAtRef.current.delete(peerId);
        pairStateRef.current.delete(peerId);
        dropRemote(peerId);
      }
    }
  }, [remotePeers, dropRemote]);

  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      const peer = peerRef.current;
      if (!peer?.id || !streamRef.current) return;

      const now = Date.now();
      const diagnostics: PairDiagnostics[] = [];

      for (const remote of remotePeersRef.current) {
        if (!remote.peerId || remote.peerId === peer.id) continue;

        const tracked = callsRef.current.get(remote.peerId) ?? null;
        const media = remoteMediaRef.current[remote.peerId];
        const hasVideo = media ? streamHasLiveTrack(media.stream, 'video') : false;
        const hasAudio = media ? streamHasLiveTrack(media.stream, 'audio') : false;
        const iceState = tracked?.call.peerConnection?.iceConnectionState ?? null;
        const attempts = attemptsRef.current.get(remote.peerId) ?? 0;

        const { action, reason } = evaluatePair({
          now,
          localPeerId: peer.id,
          remotePeerId: remote.peerId,
          knownSince: knownSinceRef.current.get(remote.peerId) ?? now,
          tracked: tracked ? { origin: tracked.origin, startedAt: tracked.startedAt } : null,
          hasLiveMedia: hasVideo,
          iceState,
          attempts,
          lastAttemptAt: lastAttemptAtRef.current.get(remote.peerId) ?? null,
        });

        let state: PairState = hasVideo ? 'live' : tracked ? 'dialling' : 'idle';
        if (action === 'dial' || action === 'redial') {
          if (reason === 'retry-after-cooldown') {
            // Fresh budget rather than a permanent write-off.
            attemptsRef.current.set(remote.peerId, 0);
          }
          if (action === 'redial') {
            console.warn(
              `[webrtc] re-dialling ${remote.peerId} (${reason}), attempt ${attempts + 1}`,
            );
            state = 'retrying';
          }
          dialPeer(remote.peerId);
        } else if (reason === 'exhausted') {
          state = 'exhausted';
        }

        pairStateRef.current.set(remote.peerId, state);
        diagnostics.push({
          peerId: remote.peerId,
          state,
          attempts: attemptsRef.current.get(remote.peerId) ?? 0,
          iceState,
          hasVideo,
          hasAudio,
        });
      }

      setMeshDiagnostics((prev) => {
        const same =
          prev.length === diagnostics.length
          && prev.every((row, i) => {
            const next = diagnostics[i]!;
            return (
              row.peerId === next.peerId
              && row.state === next.state
              && row.attempts === next.attempts
              && row.iceState === next.iceState
              && row.hasVideo === next.hasVideo
              && row.hasAudio === next.hasAudio
            );
          });
        return same ? prev : diagnostics;
      });
    };

    // Run once promptly so the first dial is not delayed a whole interval.
    const kickoff = window.setTimeout(tick, 150);
    const interval = window.setInterval(tick, WATCHDOG_INTERVAL_MS);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(interval);
    };
  }, [enabled, dialPeer, localPeerId]);

  useEffect(() => {
    if (localStream) attachLocalVideo(localStream);
  }, [localStream, attachLocalVideo]);

  /* ------------------------------------------------------------------ */
  /* Camera flip                                                        */
  /* ------------------------------------------------------------------ */

  const flipCamera = useCallback(async () => {
    const current = streamRef.current;
    if (!current || isFlipping) return;

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      setError('This browser does not support camera access. Please use Chrome or Edge on localhost.');
      return;
    }

    const nextFacing: FacingMode = facingRef.current === 'user' ? 'environment' : 'user';
    setIsFlipping(true);
    setError(null);

    const oldTrack = current.getVideoTracks()[0];
    // Stop first so mobile browsers are not holding two live cameras.
    oldTrack?.stop();

    try {
      const replacement = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: VIDEO_CONSTRAINTS(nextFacing),
      });
      const newTrack = replacement.getVideoTracks()[0];
      if (!newTrack) {
        throw new Error('No video track on the flipped camera.');
      }
      newTrack.enabled = videoEnabledRef.current;

      if (oldTrack) current.removeTrack(oldTrack);
      current.addTrack(newTrack);
      await replaceVideoTrackOnCalls(newTrack);

      facingRef.current = nextFacing;
      setFacingMode(nextFacing);
      streamRef.current = current;
      setLocalStream(current);
      attachLocalVideo(current);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not flip camera.';
      setError(message);
      // Try to restore the previous facing if the flip failed.
      try {
        const fallback = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: VIDEO_CONSTRAINTS(facingRef.current),
        });
        const restoreTrack = fallback.getVideoTracks()[0];
        if (restoreTrack) {
          restoreTrack.enabled = videoEnabledRef.current;
          current.addTrack(restoreTrack);
          await replaceVideoTrackOnCalls(restoreTrack);
          streamRef.current = current;
          setLocalStream(current);
          attachLocalVideo(current);
        }
      } catch {
        setError('Camera flip failed and the original camera could not be restored.');
      }
    } finally {
      setIsFlipping(false);
    }
  }, [attachLocalVideo, isFlipping, replaceVideoTrackOnCalls]);

  /* ------------------------------------------------------------------ */
  /* Microphone                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Flips the user's mic preference. It does not touch tracks directly - the
   * effects below are the single writer, so the preference and the master
   * voice switch can never fight over track.enabled.
   */
  const toggleMic = useCallback(() => {
    setMicEnabled((on) => !on);
  }, []);

  const setVideoEnabled = useCallback((nextEnabled: boolean) => {
    videoEnabledRef.current = nextEnabled;
    streamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = nextEnabled;
    });
  }, []);

  /**
   * Whether the mic is actually transmitting. Turning voice chat off mutes
   * you regardless of your own mic preference, and turning it back on
   * restores whatever you had chosen.
   */
  const micActive = voiceEnabled && micEnabled;

  // Outgoing audio. Mute by flipping `enabled` rather than stopping the
  // track: stopping forces a renegotiation the peer must re-accept, while
  // `enabled` stops sending samples and resumes instantly.
  useEffect(() => {
    const tracks = streamRef.current?.getAudioTracks() ?? [];
    for (const track of tracks) track.enabled = micActive;
  }, [micActive, localStream]);

  // Incoming audio: silenced whenever voice chat is switched off.
  useEffect(() => {
    for (const media of Object.values(remoteMedia)) {
      for (const track of media.stream.getAudioTracks()) {
        track.enabled = voiceEnabled;
      }
    }
  }, [voiceEnabled, remoteMedia]);

  /* ------------------------------------------------------------------ */
  /* Remote audio playback                                              */
  /* ------------------------------------------------------------------ */

  /**
   * Play remote audio through dedicated HTMLAudioElements rather than the
   * <video> tiles.
   *
   * Two reasons. The tiles unmount when the lobby gives way to the round, so
   * tile-based audio cuts out exactly when the game starts. And mobile
   * Safari refuses to autoplay UNMUTED media outside a user gesture, so the
   * tile's play() was being rejected and silently swallowed - you saw video
   * but heard nothing. These elements live outside React's tree, survive
   * every view change, and are retried on the first user gesture.
   *
   * Chromium additionally needs a remote stream attached to a media element
   * for it to be audible at all, so this element stays the primary path on
   * every platform.
   */
  useEffect(() => {
    const els = remoteAudioRef.current;

    for (const [peerId, media] of Object.entries(remoteMedia)) {
      let el = els.get(peerId);
      if (!el) {
        el = new Audio();
        el.autoplay = true;
        // Keeps iOS from taking the video fullscreen / pausing on route change.
        el.setAttribute('playsinline', '');
        els.set(peerId, el);
      }
      if (el.srcObject !== media.stream) el.srcObject = media.stream;
      void el.play().catch(() => {
        /* blocked until a gesture; the listener below retries */
      });
    }

    // Drop players who left so their audio stops.
    for (const [peerId, el] of els) {
      if (!remoteMedia[peerId]) {
        el.pause();
        el.srcObject = null;
        els.delete(peerId);
      }
    }
  }, [remoteMedia]);

  /**
   * iOS only: ALSO play remote audio through a WebAudio gain stage.
   *
   * On iOS a page holding a live microphone is placed in a recording audio
   * session, and that session routes playback to the earpiece at call volume.
   * Nothing the web platform exposes changes the route: `audioSession` picks
   * the category, but every category that allows recording defaults to the
   * receiver and `defaultToSpeaker` has no web equivalent. The workaround
   * reported repeatedly against WebKit bugs 230902 / 198545 / 202405 is to
   * run the remote track through an AudioContext, which several developers
   * specifically credit with fixing low remote volume on iOS devices.
   *
   * This is deliberately ADDITIVE and iOS-only. The HTMLAudioElement above
   * keeps playing on every platform, so if the WebAudio path turns out to be
   * silent on some iOS version - a long-standing Safari bug with
   * MediaStreamAudioSourceNode fed from a remote peer connection - the call
   * is no quieter than before. It can only add volume. Running it on desktop
   * as well would double every voice, so it is gated.
   */
  useEffect(() => {
    if (!isWebKitMobile()) return;
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const stage = gainStageRef.current;

    for (const [peerId, media] of Object.entries(remoteMedia)) {
      if (stage.has(peerId)) continue;
      if (media.stream.getAudioTracks().length === 0) continue;
      try {
        const src = ctx.createMediaStreamSource(media.stream);
        const gain = ctx.createGain();
        gain.gain.value = voiceEnabled ? IOS_REMOTE_GAIN : 0;
        src.connect(gain);
        gain.connect(ctx.destination);
        stage.set(peerId, { src, gain });
      } catch (err) {
        console.warn('[webrtc] ios gain stage unavailable', err);
      }
    }

    for (const [peerId, nodes] of [...stage.entries()]) {
      if (!remoteMedia[peerId]) {
        try {
          nodes.src.disconnect();
          nodes.gain.disconnect();
        } catch {
          /* already disconnected */
        }
        stage.delete(peerId);
      }
    }
  }, [remoteMedia, voiceEnabled]);

  // Keep the gain stage in step with the master voice switch.
  useEffect(() => {
    for (const nodes of gainStageRef.current.values()) {
      nodes.gain.gain.value = voiceEnabled ? IOS_REMOTE_GAIN : 0;
    }
  }, [voiceEnabled]);

  // Mobile browsers only allow unmuted playback to start from a gesture, and
  // an AudioContext created before any gesture starts out suspended.
  useEffect(() => {
    const retry = () => {
      void audioCtxRef.current?.resume().catch(() => {});
      for (const el of remoteAudioRef.current.values()) {
        void el.play().catch(() => {});
      }
    };
    document.addEventListener('pointerdown', retry);
    document.addEventListener('touchend', retry);
    return () => {
      document.removeEventListener('pointerdown', retry);
      document.removeEventListener('touchend', retry);
    };
  }, []);

  // Stop every remote audio element and gain node when the hook tears down.
  useEffect(() => {
    const els = remoteAudioRef.current;
    const stage = gainStageRef.current;
    return () => {
      for (const el of els.values()) {
        el.pause();
        el.srcObject = null;
      }
      els.clear();
      for (const nodes of stage.values()) {
        try {
          nodes.src.disconnect();
          nodes.gain.disconnect();
        } catch {
          /* already disconnected */
        }
      }
      stage.clear();
    };
  }, []);

  const captureJpeg = useCallback((captureOptions: CaptureFrameOptions = {}) => {
    const video = localVideoEl.current;
    if (!video) {
      throw new Error('Local video is not mounted.');
    }
    return captureVideoFrame(video, captureOptions);
  }, []);

  return {
    localPeerId,
    localStream,
    localVideoRef,
    remoteMedia,
    facingMode,
    error,
    isFlipping,
    cameraReady: Boolean(localStream),
    micEnabled,
    micActive,
    micAvailable,
    toggleMic,
    setVideoEnabled,
    flipCamera,
    captureJpeg,
    /** Which signalling broker is in use: our server, or the PeerJS cloud. */
    brokerKind,
    /** Per-peer connection health, for in-app mesh diagnostics. */
    meshDiagnostics,
    maxDialAttempts: MAX_DIAL_ATTEMPTS,
  };
}
