/**
 * Socket.io client for the unified Spotle server.
 *
 * Owns all room/round networking so App.tsx stays a view layer. The server
 * is authoritative: this hook never decides scores or whether a find counts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ThemeId,
  JoinAck,
  RoomState,
  RoundData,
  RoundEndEvent,
  ServerToClientEvents,
  VerdictEvent,
} from '@shared/game';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Where the game server lives, as seen from the browser. */
function serverUrl(): string | undefined {
  const override = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (override) return override;
  if (import.meta.env.DEV) {
    return `${window.location.protocol}//${window.location.hostname}:3001`;
  }
  return undefined; // same-origin
}

export interface UseGameSocket {
  connected: boolean;
  playerId: string | null;
  room: RoomState | null;
  round: RoundData | null;
  lastVerdict: VerdictEvent | null;
  lastRoundEnd: RoundEndEvent | null;
  error: string | null;
  createRoom: (name: string) => Promise<JoinAck>;
  joinRoom: (pin: string, name: string) => Promise<JoinAck>;
  registerPeerId: (peerId: string) => void;
  setTheme: (theme: ThemeId | null) => void;
  startGame: () => void;
  sendAttempt: (imageDataUrl: string) => void;
  giveUp: () => void;
  skip: () => void;
  resetGame: () => void;
  clearVerdict: () => void;
}

export function useGameSocket(): UseGameSocket {
  const socketRef = useRef<GameSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [round, setRound] = useState<RoundData | null>(null);
  const [lastVerdict, setLastVerdict] = useState<VerdictEvent | null>(null);
  const [lastRoundEnd, setLastRoundEnd] = useState<RoundEndEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // In dev we talk to the game server directly rather than through the Vite
    // proxy: the proxy handshakes fine over long-polling but fails the
    // WebSocket upgrade, which both spams the console and leaves the game
    // polling. The server sets CORS origin '*', so a direct connection is fine.
    // In a production build the UI is served by the game server, so same-origin.
    // Override for tunnels/LAN with VITE_SERVER_URL in frontend/.env.local.
    const socket: GameSocket = io(serverUrl());
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setPlayerId(socket.id ?? null);
    });
    socket.on('disconnect', () => setConnected(false));

    socket.on('room:update', (next) => setRoom(next));
    socket.on('round:start', (next) => {
      setRound(next);
      setLastRoundEnd(null);
      setLastVerdict(null);
    });
    socket.on('round:verdict', (event) => setLastVerdict(event));
    socket.on('round:end', (event) => setLastRoundEnd(event));
    socket.on('game:over', (next) => setRoom(next));
    socket.on('game:error', ({ message }) => setError(message));

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const createRoom = useCallback((name: string) => {
    return new Promise<JoinAck>((resolve) => {
      const socket = socketRef.current;
      if (!socket) {
        resolve({ ok: false, error: 'Not connected to the server yet.' });
        return;
      }
      socket.emit('room:create', { name }, (res) => {
        if (res.ok && res.room) {
          setRoom(res.room);
          setPlayerId(res.playerId ?? socket.id ?? null);
        } else {
          setError(res.error ?? 'Could not create a room.');
        }
        resolve(res);
      });
    });
  }, []);

  const joinRoom = useCallback((pin: string, name: string) => {
    return new Promise<JoinAck>((resolve) => {
      const socket = socketRef.current;
      if (!socket) {
        resolve({ ok: false, error: 'Not connected to the server yet.' });
        return;
      }
      socket.emit('room:join', { pin, name }, (res) => {
        if (res.ok && res.room) {
          setRoom(res.room);
          setPlayerId(res.playerId ?? socket.id ?? null);
          setError(null);
        } else {
          setError(res.error ?? 'Could not join that room.');
        }
        resolve(res);
      });
    });
  }, []);

  const registerPeerId = useCallback((peerId: string) => {
    socketRef.current?.emit('peer:register', { peerId });
  }, []);

  const setTheme = useCallback((theme: ThemeId | null) => {
    socketRef.current?.emit('room:set-theme', { theme });
  }, []);

  const startGame = useCallback(() => {
    socketRef.current?.emit('game:start');
  }, []);

  const sendAttempt = useCallback((imageDataUrl: string) => {
    socketRef.current?.emit('round:attempt', { imageDataUrl });
  }, []);

  const giveUp = useCallback(() => {
    socketRef.current?.emit('round:give-up');
  }, []);

  const skip = useCallback(() => {
    socketRef.current?.emit('round:skip');
  }, []);

  const resetGame = useCallback(() => {
    socketRef.current?.emit('game:reset');
  }, []);

  const clearVerdict = useCallback(() => setLastVerdict(null), []);

  return {
    connected,
    playerId,
    room,
    round,
    lastVerdict,
    lastRoundEnd,
    error,
    createRoom,
    joinRoom,
    registerPeerId,
    setTheme,
    startGame,
    sendAttempt,
    giveUp,
    skip,
    resetGame,
    clearVerdict,
  };
}
