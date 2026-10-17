import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import confetti from 'canvas-confetti';
import { Clock, Crown, SwitchCamera, X } from 'lucide-react';
import spotleLogo from '../../Assets/Spotle_Logo.png';
import { useGameSocket } from './hooks/useGameSocket';
import { useWebRTC, type RemotePeer } from './hooks/useWebRTC';
import type { Player, RoundData, VerdictEvent } from '@shared/game';

const maxPlayers = 4;

const arcadeButtonClass =
  'w-full rounded-full border-4 border-spotle-cream bg-spotle-navy px-6 py-4 text-xl text-spotle-coral transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-50';

const taskbarHeightClass = 'h-28';

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = (seconds % 60).toFixed(1).padStart(4, '0');
  return `${String(minutes).padStart(2, '0')}:${remainingSeconds}`;
}

function getGridClass(playerCount: number) {
  if (playerCount === 1) return 'grid-cols-1 grid-rows-1';
  if (playerCount === 2) return 'grid-cols-1 grid-rows-2';
  return 'grid-cols-2 grid-rows-2';
}

export default function App() {
  const game = useGameSocket();
  const [playerName, setPlayerName] = useState('');
  const [joinPin, setJoinPin] = useState('');
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const room = game.room;
  const me = room && game.playerId ? room.players[game.playerId] : undefined;
  const players = useMemo(() => (room ? Object.values(room.players) : []), [room]);
  const isHost = Boolean(me?.isHost);
  const round = game.round;
  const inRoom = Boolean(room);

  // --- WebRTC: start the camera as soon as we are in a room, so PeerJS has
  // time to mesh before round 1 begins.
  const remotePeers: RemotePeer[] = useMemo(
    () =>
      players
        .filter((p) => p.id !== game.playerId && p.peerId)
        .map((p) => ({ playerId: p.id, peerId: p.peerId, name: p.name })),
    [players, game.playerId],
  );

  const webrtc = useWebRTC({
    enabled: inRoom,
    localName: playerName || 'You',
    localPlayerId: game.playerId ?? 'local',
    remotePeers,
    onLocalPeerId: game.registerPeerId,
  });

  // --- Round stopwatch, driven off the server's authoritative start time.
  useEffect(() => {
    if (!round || room?.status !== 'HUNTING') return;
    const tick = () => setElapsedSeconds((Date.now() - round.startTime) / 1000);
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [round, room?.status]);

  // --- Confetti when our own find is accepted.
  const lastCelebrated = useRef<string | null>(null);
  useEffect(() => {
    const v = game.lastVerdict;
    if (!v || !v.verdict.verified || v.playerId !== game.playerId) return;
    const key = `${round?.roundNumber}-${v.playerId}`;
    if (lastCelebrated.current === key) return;
    lastCelebrated.current = key;

    for (const x of [0.12, 0.5, 0.88]) {
      confetti({
        particleCount: 140,
        scalar: 3,
        spread: 360,
        startVelocity: 60,
        gravity: 2.2,
        decay: 0.9,
        ticks: 220,
        colors: ['#ffffff', '#ffe14a', '#e4785e', '#59c3ff', '#7aff8a'],
        origin: { x, y: 0.55 },
      });
    }
  }, [game.lastVerdict, game.playerId, round?.roundNumber]);

  async function handleCreate() {
    if (!playerName.trim() || busy) return;
    setBusy(true);
    setFormError(null);
    const res = await game.createRoom(playerName.trim());
    if (!res.ok) setFormError(res.error ?? 'Could not create a room.');
    setBusy(false);
  }

  async function submitJoinGame(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!playerName.trim() || !/^\d{6}$/.test(joinPin) || busy) return;
    setBusy(true);
    setFormError(null);
    const res = await game.joinRoom(joinPin, playerName.trim());
    setBusy(false);
    if (res.ok) {
      setIsJoinModalOpen(false);
    } else {
      setFormError(res.error ?? 'Could not join that room.');
    }
  }

  function handleFoundIt() {
    if (room?.status !== 'HUNTING' || me?.status !== 'SEARCHING') return;
    setCaptureError(null);
    try {
      const dataUrl = webrtc.captureJpeg();
      setFlashing(true);
      window.setTimeout(() => setFlashing(false), 500);
      game.sendAttempt(dataUrl);
    } catch (error) {
      setCaptureError(
        error instanceof Error ? error.message : 'Could not grab a camera frame.',
      );
    }
  }

  function leaveGame() {
    window.location.reload();
  }

  /* ----------------------------- LANDING ----------------------------- */
  if (!inRoom) {
    return (
      <div className="min-h-screen bg-spotle-cream font-pixel text-spotle-navy">
        <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-8 p-6 text-center">
          <section className="flex w-full flex-col items-center gap-6" aria-live="polite">
            <div className="flex w-full max-w-sm flex-col items-center gap-5">
              <img src={spotleLogo} alt="Spotle" className="-translate-y-3 w-full max-w-md" />
              <label className="w-full text-center text-xl">
                Your Name
                <input
                  type="text"
                  value={playerName}
                  onChange={(event) => setPlayerName(event.target.value)}
                  placeholder="Enter your name"
                  className="mt-3 w-full rounded-[2rem] border-4 border-spotle-navy bg-spotle-navy px-6 py-5 text-center text-xl text-spotle-coral placeholder:text-spotle-cream/70 focus:outline-4 focus:outline-spotle-navy"
                />
              </label>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!playerName.trim() || busy || !game.connected}
                className={arcadeButtonClass}
              >
                {busy ? 'Creating…' : 'Create Game'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setJoinPin('');
                  setFormError(null);
                  setIsJoinModalOpen(true);
                }}
                disabled={!playerName.trim() || !game.connected}
                className={arcadeButtonClass}
              >
                Join Game
              </button>
              {!game.connected && (
                <p className="text-base text-spotle-navy/70">Connecting to server…</p>
              )}
              {formError && <p className="text-base text-red-700">{formError}</p>}
            </div>
          </section>
        </main>

        {isJoinModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-spotle-navy/70 p-6">
            <form
              onSubmit={submitJoinGame}
              className="w-full max-w-md rounded-[2rem] border-4 border-spotle-navy bg-spotle-cream p-8 text-center"
              aria-labelledby="join-game-title"
            >
              <h2 id="join-game-title" className="text-2xl">Join Game</h2>
              <label className="mt-6 block text-xl">
                6-digit PIN
                <input
                  type="text"
                  value={joinPin}
                  onChange={(event) =>
                    setJoinPin(event.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  placeholder="______"
                  className="mt-3 w-full rounded-[2rem] border-4 border-spotle-navy bg-spotle-cream px-6 py-5 text-center text-2xl tracking-[0.4em] text-spotle-navy"
                />
              </label>
              {formError && <p className="mt-4 text-base text-red-700">{formError}</p>}
              <button
                type="submit"
                disabled={!playerName.trim() || !/^\d{6}$/.test(joinPin) || busy}
                className={`${arcadeButtonClass} mt-6`}
              >
                {busy ? 'Joining…' : 'Submit'}
              </button>
              <button
                type="button"
                onClick={() => setIsJoinModalOpen(false)}
                className={`${arcadeButtonClass} mt-4`}
              >
                Cancel
              </button>
            </form>
          </div>
        )}
      </div>
    );
  }

  /* ------------------------------ LOBBY ------------------------------ */
  if (room!.status === 'LOBBY') {
    return (
      <div className="min-h-screen bg-spotle-cream font-pixel text-spotle-navy">
        <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-8 p-6 text-center">
          <div className="flex min-h-[calc(100dvh-3rem)] w-[min(90vw,28rem)] shrink-0 flex-col items-center justify-center gap-6 py-6">
            <p className="rounded-full border-4 border-spotle-cream bg-spotle-navy px-8 py-4 text-2xl text-spotle-coral">
              PIN: {room!.roomCode}
            </p>
            <ul className="grid w-full shrink-0 grid-cols-[repeat(2,minmax(0,1fr))] gap-3">
              {Array.from({ length: maxPlayers }, (_, index) => {
                const player = players[index];
                return (
                  <li
                    key={player?.id ?? `empty-${index}`}
                    className="flex aspect-square min-h-0 min-w-0 w-full items-center justify-center break-words rounded-[2rem] border-4 border-spotle-cream bg-spotle-navy p-3 text-center text-lg text-spotle-coral"
                  >
                    {player
                      ? `${player.name}${player.isHost ? ' (Host)' : ''}`
                      : 'Waiting for player'}
                  </li>
                );
              })}
            </ul>

            {webrtc.error && (
              <p className="text-base text-red-700">{webrtc.error}</p>
            )}
            <p className="text-base text-spotle-navy/70">
              {webrtc.cameraReady ? 'Camera ready' : 'Starting camera…'}
            </p>

            {isHost ? (
              <button
                type="button"
                onClick={game.startGame}
                disabled={players.length < 1}
                className={arcadeButtonClass}
              >
                START GAME
              </button>
            ) : (
              <p className="text-xl">Waiting for the host to start…</p>
            )}
            <button type="button" onClick={leaveGame} className={arcadeButtonClass}>
              Leave
            </button>
          </div>
        </main>
      </div>
    );
  }

  /* --------------------------- SCOREBOARD ---------------------------- */
  if (room!.status === 'ROUND_RESULT' || room!.status === 'GAME_OVER') {
    return (
      <ScoreboardScreen
        players={players}
        round={round?.roundNumber ?? 1}
        totalRounds={room!.settings.totalRounds}
        isFinal={room!.status === 'GAME_OVER'}
        isHost={isHost}
        onNextRound={game.skip}
        onPlayAgain={game.resetGame}
        onExit={leaveGame}
      />
    );
  }

  /* ---------------------------- PLAYING ------------------------------ */
  return (
    <PlayingScreen
      players={players}
      localPlayerId={game.playerId}
      round={round}
      totalRounds={room!.settings.totalRounds}
      elapsedSeconds={elapsedSeconds}
      isCountdown={room!.status === 'COUNTDOWN'}
      isHost={isHost}
      canPress={me?.status === 'SEARCHING'}
      flashing={flashing}
      verdict={game.lastVerdict}
      captureError={captureError ?? webrtc.error}
      localVideoRef={webrtc.localVideoRef}
      localStream={webrtc.localStream}
      remoteMedia={webrtc.remoteMedia}
      facingMode={webrtc.facingMode}
      isFlipping={webrtc.isFlipping}
      onFlipCamera={webrtc.flipCamera}
      onFoundIt={handleFoundIt}
      onSkip={game.skip}
    />
  );
}

/* ==================================================================== */

function PlayerTile({
  player,
  isLocal,
  localVideoRef,
  localStream,
  stream,
  facingMode,
  showCrown,
}: {
  player: Player;
  isLocal: boolean;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  localStream: MediaStream | null;
  stream: MediaStream | undefined;
  facingMode: 'user' | 'environment';
  showCrown: boolean;
}) {
  const statusOverlay =
    player.status === 'VERIFYING'
      ? 'VERIFYING...'
      : player.status === 'PENALIZED'
        ? 'COOLDOWN'
        : null;

  return (
    <section
      className={`relative min-h-0 min-w-0 overflow-hidden border-2 border-spotle-cream bg-spotle-navy ${
        showCrown
          ? 'z-10 border-8 border-green-400 shadow-[0_0_28px_#4ade80,inset_0_0_18px_#4ade80]'
          : ''
      }`}
      aria-label={`${player.name} video feed`}
    >
      {isLocal ? (
        <video
          ref={localVideoRef}
          autoPlay
          muted
          playsInline
          className={`h-full w-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
        />
      ) : stream ? (
        <video
          autoPlay
          playsInline
          className="h-full w-full object-cover"
          ref={(el) => {
            if (el && el.srcObject !== stream) el.srcObject = stream;
          }}
        />
      ) : null}

      {isLocal && !localStream && (
        <div className="absolute inset-0 flex items-center justify-center text-lg text-spotle-coral">
          Starting camera…
        </div>
      )}
      {!isLocal && !stream && (
        <div className="absolute inset-0 flex items-center justify-center px-3 text-center text-lg text-spotle-coral">
          Waiting for {player.name}…
        </div>
      )}

      <p className="absolute left-2 top-2 z-10 max-w-[calc(100%-1rem)] truncate rounded-full border-2 border-spotle-cream bg-spotle-coral px-4 py-2 text-xl text-spotle-navy md:text-2xl">
        {player.name}
        {isLocal ? ' (You)' : ''}
      </p>

      {showCrown && (
        <Crown
          aria-label="Round winner"
          className="absolute left-1/2 top-1/2 z-10 h-16 w-16 -translate-x-1/2 -translate-y-1/2 fill-yellow-300 text-yellow-300 drop-shadow-[0_0_16px_#fde047] md:h-24 md:w-24"
        />
      )}

      {player.reactionMs !== undefined && (
        <p className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border-2 border-spotle-cream bg-spotle-coral px-5 py-3 text-lg text-spotle-navy md:text-2xl">
          {(player.reactionMs / 1000).toFixed(1)}s
        </p>
      )}

      {statusOverlay && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-spotle-navy/80"
          role="status"
        >
          <p className="rounded-full border-4 border-spotle-cream bg-spotle-coral px-5 py-4 text-center text-xl text-spotle-navy md:text-2xl">
            {statusOverlay}
          </p>
        </div>
      )}
    </section>
  );
}

function TargetPanel({ round }: { round: RoundData | null }) {
  if (!round) return null;
  return (
    <figure className="flex w-32 max-w-full flex-col items-center overflow-hidden rounded-t-full rounded-b-2xl border-4 border-spotle-cream bg-spotle-navy text-center text-sm text-spotle-coral md:w-36 md:text-base lg:w-40 lg:text-lg">
      <img
        src={round.targetIconUrl}
        alt={round.targetObject}
        className="aspect-square w-full bg-spotle-cream object-contain p-2"
      />
      <figcaption className="w-full px-3 py-3">{round.targetObject}</figcaption>
    </figure>
  );
}

function PlayingScreen({
  players,
  localPlayerId,
  round,
  totalRounds,
  elapsedSeconds,
  isCountdown,
  isHost,
  canPress,
  flashing,
  verdict,
  captureError,
  localVideoRef,
  localStream,
  remoteMedia,
  facingMode,
  isFlipping,
  onFlipCamera,
  onFoundIt,
  onSkip,
}: {
  players: Player[];
  localPlayerId: string | null;
  round: RoundData | null;
  totalRounds: number;
  elapsedSeconds: number;
  isCountdown: boolean;
  isHost: boolean;
  canPress: boolean;
  flashing: boolean;
  verdict: VerdictEvent | null;
  captureError: string | null;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  localStream: MediaStream | null;
  remoteMedia: Record<string, { playerId: string; peerId: string; stream: MediaStream }>;
  facingMode: 'user' | 'environment';
  isFlipping: boolean;
  onFlipCamera: () => void;
  onFoundIt: () => void;
  onSkip: () => void;
}) {
  const hasTargetCell = players.length === 3;

  return (
    <main className="relative h-dvh min-h-[480px] w-full overflow-hidden bg-spotle-cream font-pixel text-spotle-navy">
      <div
        className={`absolute inset-x-0 top-0 grid h-[calc(100dvh-7rem)] min-h-0 gap-0 p-0 ${getGridClass(players.length)}`}
      >
        {Array.from({ length: hasTargetCell ? maxPlayers : players.length }, (_, index) => {
          if (hasTargetCell && index === maxPlayers - 1) {
            return (
              <div
                key="target-cell"
                className="flex min-h-0 min-w-0 flex-col items-center justify-center gap-2 border-2 border-spotle-cream bg-spotle-cream p-3 text-center text-lg text-spotle-navy md:text-2xl"
              >
                {round && (
                  <>
                    <img
                      src={round.targetIconUrl}
                      alt={round.targetObject}
                      className="max-h-[72%] w-3/4 flex-1 object-contain"
                    />
                    <p className="max-w-full rounded-full bg-spotle-navy px-5 py-3 text-spotle-coral">
                      {round.targetObject}
                    </p>
                  </>
                )}
              </div>
            );
          }

          const player = players[index];
          if (!player) return null;
          const isLocal = player.id === localPlayerId;

          return (
            <PlayerTile
              key={player.id}
              player={player}
              isLocal={isLocal}
              localVideoRef={localVideoRef}
              localStream={localStream}
              stream={
                remoteMedia[player.peerId]?.stream ??
                Object.values(remoteMedia).find((m) => m.playerId === player.id)?.stream
              }
              facingMode={facingMode}
              showCrown={player.placement === 1}
            />
          );
        })}
      </div>

      {(players.length === 2 || players.length === maxPlayers) && (
        <div className="pointer-events-none absolute inset-x-0 top-[calc((100dvh-7rem)/2)] z-20 flex -translate-y-1/2 justify-center">
          <TargetPanel round={round} />
        </div>
      )}

      {players.length === 1 && (
        <div className="pointer-events-none absolute inset-x-0 top-24 z-20 flex justify-center">
          <TargetPanel round={round} />
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center px-4">
        <div className="rounded-3xl border-4 border-spotle-cream bg-spotle-coral px-5 py-3 text-center text-2xl text-spotle-navy md:px-8 md:text-4xl">
          ROUND {round?.roundNumber ?? 1} / {totalRounds}
        </div>
      </div>

      {verdict && (
        <div className="pointer-events-none absolute inset-x-0 top-24 z-30 flex justify-center px-4">
          <p
            className={`max-w-xl rounded-3xl border-4 px-5 py-3 text-center text-lg md:text-xl ${
              verdict.verdict.verified
                ? 'border-spotle-cream bg-green-500 text-spotle-navy'
                : 'border-spotle-cream bg-spotle-navy text-spotle-coral'
            }`}
          >
            {verdict.playerName}: {verdict.verdict.commentary}
            {verdict.pointsAwarded ? ` (+${verdict.pointsAwarded})` : ''}
          </p>
        </div>
      )}

      {captureError && (
        <div className="pointer-events-none absolute inset-x-0 bottom-32 z-30 flex justify-center px-4">
          <p className="max-w-xl rounded-2xl border-4 border-spotle-cream bg-red-600 px-4 py-2 text-center text-base text-white">
            {captureError}
          </p>
        </div>
      )}

      <nav
        aria-label="Game controls"
        className={`fixed inset-x-0 bottom-0 z-30 grid ${taskbarHeightClass} grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-t-4 border-spotle-navy bg-spotle-cream px-3 py-3 text-spotle-navy sm:gap-6 sm:px-8`}
      >
        <button
          type="button"
          aria-label="Flip camera"
          onClick={onFlipCamera}
          disabled={isFlipping || !localStream}
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-spotle-navy bg-spotle-cream text-spotle-navy transition-transform active:scale-95 disabled:opacity-50 sm:h-20 sm:w-20 md:h-24 md:w-24"
        >
          <SwitchCamera aria-hidden="true" className="h-10 w-10 md:h-12 md:w-12" />
        </button>

        <div className="mx-auto flex w-full max-w-2xl items-center justify-center gap-2 sm:gap-5">
          <button
            type="button"
            onClick={onFoundIt}
            aria-label="Found it"
            disabled={!canPress}
            className="h-20 min-w-0 flex-1 rounded-3xl border-4 border-spotle-navy bg-spotle-coral px-2 text-center text-lg text-spotle-navy transition-transform active:scale-95 disabled:opacity-60 sm:h-24 sm:px-3 sm:text-3xl md:text-4xl"
          >
            FOUND IT!
          </button>
          {isHost && (
            <button
              type="button"
              onClick={onSkip}
              aria-label="Skip this round"
              className="h-20 shrink-0 rounded-3xl border-4 border-spotle-navy bg-spotle-navy px-3 text-center text-lg text-spotle-coral transition-transform active:scale-95 sm:h-24 sm:px-8 sm:text-3xl"
            >
              SKIP
            </button>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-1 text-sm sm:gap-2 sm:text-xl md:text-2xl">
          <Clock aria-hidden="true" className="h-7 w-7 shrink-0 sm:h-9 sm:w-9" />
          <span className="min-w-[4ch]">{formatTime(elapsedSeconds)}</span>
        </div>
      </nav>

      {flashing && <div className="pointer-events-none fixed inset-0 z-40 animate-flash" />}

      {isCountdown && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-spotle-navy/85">
          <p className="text-center text-4xl text-spotle-coral md:text-6xl">GET READY!</p>
        </div>
      )}
    </main>
  );
}

function ScoreboardScreen({
  players,
  round,
  totalRounds,
  isFinal,
  isHost,
  onNextRound,
  onPlayAgain,
  onExit,
}: {
  players: Player[];
  round: number;
  totalRounds: number;
  isFinal: boolean;
  isHost: boolean;
  onNextRound: () => void;
  onPlayAgain: () => void;
  onExit: () => void;
}) {
  const ranked = [...players].sort((a, b) => b.score - a.score);

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-spotle-cream p-6 font-pixel text-spotle-coral">
      <button
        type="button"
        onClick={onExit}
        aria-label="Exit to landing page"
        className="absolute right-4 top-4 z-20 flex h-14 w-14 items-center justify-center rounded-full border-4 border-spotle-navy bg-spotle-coral text-spotle-navy transition-transform active:scale-95 md:h-16 md:w-16"
      >
        <X aria-hidden="true" className="h-8 w-8 md:h-10 md:w-10" />
      </button>

      <div className={`absolute inset-0 grid blur-md ${getGridClass(players.length)}`}>
        {players.map((player) => (
          <div
            key={player.id}
            className="relative min-h-0 min-w-0 border-4 border-spotle-cream bg-spotle-navy"
            aria-hidden="true"
          >
            <span className="absolute left-4 top-4 text-xl text-spotle-coral">{player.name}</span>
          </div>
        ))}
      </div>
      <div className="absolute inset-0 bg-spotle-cream/45" />

      <section className="relative z-10 w-full max-w-lg rounded-[2rem] border-4 border-spotle-cream bg-spotle-navy p-6 text-spotle-coral sm:p-8">
        <h1 className="text-center text-2xl">{isFinal ? 'Final Scores' : 'Scoreboard'}</h1>
        <p className="mt-5 text-center text-xl">
          Round {round} of {totalRounds}
        </p>
        <ol className="mt-8 space-y-3">
          {ranked.map((player, index) => (
            <li
              key={player.id}
              className="flex items-center justify-between gap-4 rounded-full border-2 border-spotle-cream bg-spotle-coral px-5 py-4 text-base text-spotle-navy"
            >
              <span>
                {index + 1}. {player.name}
              </span>
              <span>
                {player.score} {player.score === 1 ? 'point' : 'points'}
              </span>
            </li>
          ))}
        </ol>

        {isHost ? (
          <button
            type="button"
            onClick={isFinal ? onPlayAgain : onNextRound}
            className={`${arcadeButtonClass} mt-8`}
          >
            {isFinal ? 'Play Again' : 'Next Round'}
          </button>
        ) : (
          <p className="mt-8 text-center text-lg">Waiting for the host…</p>
        )}
      </section>
    </main>
  );
}
