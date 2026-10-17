import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Peer, { type MediaConnection } from 'peerjs';
import { captureVideoFrame, type CaptureFrameOptions } from '../utils/captureFrame';

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

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

/**
 * PeerJS mesh (2–4 players) + a single local camera track.
 *
 * Flip camera: stop the old track, then getUserMedia once, then
 * RTCRtpSender.replaceTrack() on every live call. Never keep two
 * camera streams open at the same time.
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

  const localVideoEl = useRef<HTMLVideoElement | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const callsRef = useRef<Map<string, MediaConnection>>(new Map());
  const remotePeersRef = useRef(remotePeers);
  const onPeerIdRef = useRef(onLocalPeerId);
  const localNameRef = useRef(localName);
  const localPlayerIdRef = useRef(localPlayerId);
  const facingRef = useRef<FacingMode>(INITIAL_FACING_MODE);
  const fallbackTimersRef = useRef<number[]>([]);
  const remoteAudioRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  remotePeersRef.current = remotePeers;
  onPeerIdRef.current = onLocalPeerId;
  localNameRef.current = localName;
  localPlayerIdRef.current = localPlayerId;

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
    for (const call of callsRef.current.values()) {
      const sender = call.peerConnection
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
    setRemoteMedia((prev) => ({
      ...prev,
      [peerId]: {
        playerId: match?.playerId ?? peerId,
        peerId,
        name: match?.name ?? 'Player',
        stream,
      },
    }));
  }, []);

  const dropRemote = useCallback((peerId: string) => {
    callsRef.current.get(peerId)?.close();
    callsRef.current.delete(peerId);
    setRemoteMedia((prev) => {
      if (!(peerId in prev)) return prev;
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  const bindCall = useCallback(
    (call: MediaConnection) => {
      callsRef.current.set(call.peer, call);
      call.on('stream', (stream) => {
        stream.getVideoTracks().forEach((track) => {
          track.onunmute = () => rememberRemote(call.peer, stream);
        });
        rememberRemote(call.peer, stream);
      });
      call.on('close', () => dropRemote(call.peer));
      call.on('error', (err) => {
        console.warn('[webrtc] call error', call.peer, err);
        dropRemote(call.peer);
      });
    },
    [dropRemote, rememberRemote],
  );

  const callRemoteIfNeeded = useCallback(
    (remote: RemotePeer, peer: Peer) => {
      if (!remote.peerId || remote.peerId === peer.id) return;
      if (callsRef.current.has(remote.peerId)) return;

      const openCall = () => {
        const liveStream = streamRef.current;
        const livePeer = peerRef.current;
        if (!liveStream || liveStream.getVideoTracks().length === 0 || !livePeer?.id) {
          fallbackTimersRef.current.push(
            window.setTimeout(() => {
              if (peerRef.current) {
                callRemoteIfNeeded(remote, peerRef.current);
              }
            }, 250),
          );
          return;
        }
        if (callsRef.current.has(remote.peerId)) return;
        const call = livePeer.call(remote.peerId, liveStream, {
          metadata: { playerId: localPlayerIdRef.current, name: localNameRef.current },
        });
        bindCall(call);
      };

      // Smaller ID calls first so a full room broadcast does not open two meshes.
      if (peer.id.localeCompare(remote.peerId) <= 0) {
        openCall();
        return;
      }

      // If the other side never received our ID, call after a short wait.
      fallbackTimersRef.current.push(window.setTimeout(openCall, 2000));
    },
    [bindCall],
  );

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function start() {
      setError(null);

      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        setError('This browser does not support camera access. Please use Chrome or Edge on localhost.');
        return;
      }

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

        // iOS routes WebRTC audio to the earpiece ("call mode") unless told
        // otherwise, which makes everyone sound faint. Safari 17+ exposes
        // audioSession; 'play-and-record' is the correct category for voice
        // chat and routes to the loudspeaker. Harmless where unsupported.
        try {
          const audioSession = (navigator as unknown as {
            audioSession?: { type: string };
          }).audioSession;
          if (audioSession) audioSession.type = 'play-and-record';
        } catch {
          /* unsupported browser */
        }

        const audioTracks = stream.getAudioTracks();
        setMicAvailable(audioTracks.length > 0);
        setMicEnabled(audioTracks.length > 0 ? audioTracks[0]!.enabled : false);
        if (cancelled) {
          stopStream(stream);
          return;
        }

        streamRef.current = stream;
        setLocalStream(stream);
        attachLocalVideo(stream);

        const peer = new Peer({
          debug: 1,
        });
        peerRef.current = peer;

        peer.on('open', (id) => {
          if (cancelled) return;
          setLocalPeerId(id);
          onPeerIdRef.current?.(id);
          for (const remote of remotePeersRef.current) {
            callRemoteIfNeeded(remote, peer);
          }
        });

        peer.on('call', (call) => {
          const live = streamRef.current;
          if (!live || live.getVideoTracks().length === 0) {
            window.setTimeout(() => {
              const readyStream = streamRef.current;
              if (readyStream && readyStream.getVideoTracks().length > 0) {
                call.answer(readyStream);
                bindCall(call);
                return;
              }
              call.close();
            }, 250);
            return;
          }
          call.answer(live);
          bindCall(call);
        });

        peer.on('error', (err) => {
          if (cancelled) return;
          if (err.type === 'peer-unavailable') {
            setError('That Peer ID is not online yet. Ask them to start their camera, then connect again.');
            return;
          }
          setError(err.message || 'WebRTC connection error.');
        });

        peer.on('disconnected', () => {
          if (!cancelled && !peer.destroyed) {
            peer.reconnect();
          }
        });
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
      fallbackTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      fallbackTimersRef.current = [];
      for (const call of callsRef.current.values()) {
        call.close();
      }
      callsRef.current.clear();
      peerRef.current?.destroy();
      peerRef.current = null;
      stopStream(streamRef.current);
      streamRef.current = null;
      setLocalStream(null);
      setLocalPeerId(null);
      setRemoteMedia({});
    };
  }, [enabled, attachLocalVideo, bindCall, callRemoteIfNeeded]);

  useEffect(() => {
    const peer = peerRef.current;
    const stream = streamRef.current;
    if (!enabled || !peer?.id || !stream) return;
    for (const remote of remotePeers) {
      callRemoteIfNeeded(remote, peer);
    }
  }, [enabled, remotePeers, localPeerId, callRemoteIfNeeded]);

  useEffect(() => {
    if (localStream) attachLocalVideo(localStream);
  }, [localStream, attachLocalVideo]);

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

  /**
   * Flips the user's mic preference. It does not touch tracks directly - the
   * effects below are the single writer, so the preference and the master
   * voice switch can never fight over track.enabled.
   */
  const toggleMic = useCallback(() => {
    setMicEnabled((on) => !on);
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

  // Mobile browsers only allow unmuted playback to start from a gesture.
  useEffect(() => {
    const retry = () => {
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

  // Stop every remote audio element when the hook tears down.
  useEffect(() => {
    const els = remoteAudioRef.current;
    return () => {
      for (const el of els.values()) {
        el.pause();
        el.srcObject = null;
      }
      els.clear();
    };
  }, []);

  const captureJpeg = useCallback((options: CaptureFrameOptions = {}) => {
    const video = localVideoEl.current;
    if (!video) {
      throw new Error('Local video is not mounted.');
    }
    return captureVideoFrame(video, options);
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
    flipCamera,
    captureJpeg,
  };
}
