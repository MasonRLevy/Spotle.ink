import { SwitchCamera, VideoOff } from 'lucide-react';
import { useEffect, type RefObject } from 'react';
import type { Player } from '../types/game';
import type { FacingMode, RemoteMedia } from '../hooks/useWebRTC';

interface VideoGridProps {
  localPlayer: Player;
  players: Player[];
  localStream: MediaStream | null;
  localVideoRef: RefObject<HTMLVideoElement | null>;
  remoteMedia: Record<string, RemoteMedia>;
  facingMode: FacingMode;
  isFlipping: boolean;
  onFlipCamera: () => void;
}

function statusLabel(status: Player['status']): string | null {
  if (status === 'VERIFYING') return 'GEMINI REFEREE CHECKING...';
  if (status === 'PENALIZED') return 'COOLDOWN';
  return null;
}

function RemoteTile({
  player,
  stream,
}: {
  player: Player;
  stream: MediaStream | undefined;
}) {
  const overlay = statusLabel(player.status);

  return (
    <article className="relative overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-white/10">
      {stream ? (
        <video
          className="h-full w-full object-cover"
          autoPlay
          playsInline
          ref={(el) => {
            if (el && el.srcObject !== stream) el.srcObject = stream;
          }}
        />
      ) : (
        <div className="flex aspect-video h-full min-h-40 items-center justify-center bg-zinc-800 text-zinc-400">
          <VideoOff className="mr-2 h-5 w-5" />
          Waiting for {player.name}…
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/80 to-transparent p-3">
        <div>
          <p className="text-sm font-semibold text-white">{player.name}</p>
          <p className="text-xs text-orange-300">{player.score} pts</p>
        </div>
      </div>
      {overlay && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/55 p-4 text-center">
          <p className="rounded-full bg-sky-500 px-3 py-1 text-xs font-bold tracking-wide text-white">
            {overlay}
          </p>
        </div>
      )}
    </article>
  );
}

export function VideoGrid({
  localPlayer,
  players,
  localStream,
  localVideoRef,
  remoteMedia,
  facingMode,
  isFlipping,
  onFlipCamera,
}: VideoGridProps) {
  const others = players.filter((p) => p.id !== localPlayer.id);
  const overlay = statusLabel(localPlayer.status);

  useEffect(() => {
    const el = localVideoRef.current;
    if (el && localStream && el.srcObject !== localStream) {
      el.srcObject = localStream;
    }
  }, [localStream, localVideoRef]);

  return (
    <section
      className={`grid gap-3 ${players.length > 2 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}
      aria-label="Live player cameras"
    >
      <article className="relative overflow-hidden rounded-2xl bg-zinc-900 ring-2 ring-orange-500/80">
        <video
          ref={localVideoRef}
          className={`h-full w-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
          autoPlay
          muted
          playsInline
        />
        {!localStream && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-800 text-zinc-400">
            <VideoOff className="mr-2 h-5 w-5" />
            Starting camera…
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/80 to-transparent p-3">
          <div>
            <p className="text-sm font-semibold text-white">
              {localPlayer.name} <span className="text-orange-400">(You)</span>
            </p>
            <p className="text-xs text-orange-300">{localPlayer.score} pts</p>
          </div>
          <button
            type="button"
            onClick={onFlipCamera}
            disabled={!localStream || isFlipping}
            className="pointer-events-auto inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur hover:bg-white/25 disabled:opacity-50"
          >
            <SwitchCamera className="h-4 w-4" />
            {isFlipping ? 'Flipping…' : facingMode === 'user' ? 'Rear' : 'Front'}
          </button>
        </div>
        {overlay && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/55 p-4 text-center">
            <p className="rounded-full bg-sky-500 px-3 py-1 text-xs font-bold tracking-wide text-white">
              {overlay}
            </p>
          </div>
        )}
      </article>

      {others.map((player) => (
        <RemoteTile
          key={player.id}
          player={player}
          stream={
            remoteMedia[player.peerId]?.stream ??
            Object.values(remoteMedia).find((m) => m.playerId === player.id)?.stream
          }
        />
      ))}
    </section>
  );
}
