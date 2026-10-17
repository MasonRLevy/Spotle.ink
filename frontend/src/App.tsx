import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import confetti from 'canvas-confetti';
import { Clock, Crown, SwitchCamera, X } from 'lucide-react';
import spotleLogo from './assets/Spotle_Logo.png';
import dogMouthClosed from './assets/Spot_mouth_closed.png';
import dogMouthOpen from './assets/Spot_mouth_open.png';
import inkRunning from './assets/Ink_running.gif';
import inkPaw from './assets/Ink_paw.png';
import xMarksTheSpot from './assets/X_marks_the_spot.png';
import treasureChest from './assets/Treasure_Chest.png';
import { useGameSocket } from './hooks/useGameSocket';
import { useWebRTC, type RemotePeer } from './hooks/useWebRTC';
import { LobbyCamTile } from './components/LobbyCamTile';
import type { Player, RoundData } from '@shared/game';
import correctAudioSrc from './assets/sounds/CorrectImage.mp3';
import wrongAudioSrc from './assets/sounds/WrongImage.mp3';
import flashAudioSrc from './assets/sounds/cameraFlash8Bit.mp3';

const maxPlayers = 4;
const dogSpeed = 2;
const pawPrintSpacing = 50;
const maxPawPrints = 100;

type LobbyPoint = { x: number; y: number };
type PawPrint = LobbyPoint & { id: number; angle: number };

const arcadeButtonClass =
  'w-full rounded-full border-4 border-spotle-cream bg-spotle-navy px-6 py-4 text-xl text-spotle-coral transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-50';

const taskbarHeightClass = 'h-32';

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = (seconds % 60).toFixed(1).padStart(4, '0');
  return `${String(minutes).padStart(2, '0')}:${remainingSeconds}`;
}

function getGridClass(playerCount: number) {
  if (playerCount === 1) return 'grid-cols-1 grid-rows-1';
  if (playerCount === 2) return 'grid-cols-2 grid-rows-1';
  return 'grid-cols-2 grid-rows-2';
}

export default function App() {
  const game = useGameSocket();
  const [playerName, setPlayerName] = useState('');
  const [countdownNumber, setCountdownNumber] = useState<number | null>(null); // <-- ADD THIS
  const [joinPin, setJoinPin] = useState('');
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [skippedPlayers, setSkippedPlayers] = useState<string[]>([]);
  const [refereeMessage, setRefereeMessage] = useState<string | null>(null);
  const [refereePlayerId, setRefereePlayerId] = useState<string | null>(null);
  const [isTalking, setIsTalking] = useState(false);
  const [isMouthOpen, setIsMouthOpen] = useState(false);
  const [isRefereeFading, setIsRefereeFading] = useState(false);
  const [targetPosition, setTargetPosition] = useState<LobbyPoint | null>(null);
  const [showTreasureChest, setShowTreasureChest] = useState(true);
  const [pawPrints, setPawPrints] = useState<PawPrint[]>([]);

  const flashAudio = useRef(new Audio(flashAudioSrc));
  const correctAudio = useRef(new Audio(correctAudioSrc));
  const wrongAudio = useRef(new Audio(wrongAudioSrc));
  const lobbyRef = useRef<HTMLDivElement | null>(null);
  const dogRef = useRef<HTMLImageElement | null>(null);
  const dogPositionRef = useRef<LobbyPoint>({ x: 0, y: 0 });
  const dogScaleRef = useRef(1);
  const targetPositionRef = useRef<LobbyPoint | null>(null);
  const routeControlRef = useRef<LobbyPoint>({ x: 0, y: 0 });
  const routeProgressRef = useRef(0);
  const routeLengthRef = useRef(0);
  const routeBendRef = useRef(1);
  const animationFrameRef = useRef<number | null>(null);
  const pawDistanceRef = useRef(0);
  const dogPositionInitializedRef = useRef(false);

  const room = game.room;
  const me = room && game.playerId ? room.players[game.playerId] : undefined;
  const players = useMemo(() => (room ? Object.values(room.players) : []), [room]);
  const isHost = Boolean(me?.isHost);
  const round = game.round;
  const inRoom = Boolean(room);
  const isHomeOrLobby = !inRoom || room?.status === 'LOBBY';
  const allPlayersSettled =
    players.length > 0
    && players.every((player) => player.status === 'FOUND' || player.status === 'SKIPPED');

  useEffect(() => {
    setSkippedPlayers(
      players.filter((player) => player.status === 'SKIPPED').map((player) => player.id),
    );
  }, [players]);

useEffect(() => {
    if (room?.status !== 'COUNTDOWN') {
      setCountdownNumber(null);
      return;
    }

    setCountdownNumber(3);
    const interval = window.setInterval(() => {
      setCountdownNumber((prev) => {
        if (prev === null || prev <= 1) {
          window.clearInterval(interval);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [room?.status]);
  useEffect(() => {
    const verdict = game.lastVerdict;
    if (!verdict) return;

    if (verdict.playerId === game.playerId) {
      if (verdict.verdict.verified) {
        correctAudio.current.currentTime = 0;
        correctAudio.current.play().catch((err) => console.warn("Correct audio blocked:", err));
      } else {
        wrongAudio.current.currentTime = 0;
        wrongAudio.current.play().catch((err) => console.warn("Wrong audio blocked:", err));
      }
    }
  }, [game.lastVerdict, game.playerId]);
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

  useEffect(() => {
    const verdict = game.lastVerdict;
    if (!verdict) {
      setRefereeMessage(null);
      setRefereePlayerId(null);
      setIsTalking(false);
      setIsRefereeFading(false);
      return;
    }

    setRefereePlayerId(verdict.playerId);
    setRefereeMessage(verdict.verdict.commentary || 'Wow, you actually found it!');
    setIsTalking(true);
    setIsRefereeFading(false);

    const fadeTimeout = window.setTimeout(() => setIsRefereeFading(true), 3700);
    const clearTimeoutId = window.setTimeout(() => {
      setRefereeMessage(null);
      setRefereePlayerId(null);
      setIsTalking(false);
      setIsRefereeFading(false);
    }, 4000);

    return () => {
      window.clearTimeout(fadeTimeout);
      window.clearTimeout(clearTimeoutId);
    };
  }, [game.lastVerdict]);

  useEffect(() => {
    if (!isTalking || !refereeMessage) {
      setIsMouthOpen(false);
      return;
    }

    const intervalId = window.setInterval(() => {
      setIsMouthOpen((open) => !open);
    }, 200);

    return () => window.clearInterval(intervalId);
  }, [isTalking, refereeMessage]);

  useEffect(() => {
    if (!isHomeOrLobby) {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const lobby = lobbyRef.current;
    if (!lobby) return;

    if (!dogPositionInitializedRef.current) {
      dogPositionRef.current = {
        x: Math.min(100, lobby.clientWidth / 2),
        y: Math.max(100, lobby.clientHeight - 120),
      };
      dogPositionInitializedRef.current = true;
    }
    if (!targetPositionRef.current) {
      const initialTarget = {
        x: lobby.clientWidth * 0.82,
        y: lobby.clientHeight * 0.38,
      };
      targetPositionRef.current = initialTarget;
      setTargetPosition(initialTarget);
      setShowTreasureChest(true);
    }
    const { x, y } = dogPositionRef.current;
    if (dogRef.current) {
      dogRef.current.style.transform =
        `translate(-50%, -50%) translate(${x}px, ${y}px) scaleX(1)`;
    }
  }, [isHomeOrLobby]);

  useEffect(
    () => () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    },
    [],
  );

  // --- Celebrate only the first accepted find in a round.
  const lastCelebrated = useRef<string | null>(null);
  useEffect(() => {
    const v = game.lastVerdict;
    if (!v || !v.verdict.verified || v.placement !== 1) return;
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
      // Play flash audio effect right when capturing
      flashAudio.current.currentTime = 0;
      flashAudio.current.play().catch((err) => console.warn("Flash audio blocked:", err));

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

  function handleGiveUp() {
    if (
      room?.status !== 'HUNTING'
      || !game.playerId
      || !me
      || me.status === 'FOUND'
      || me.status === 'VERIFYING'
      || me.status === 'SKIPPED'
      || skippedPlayers.includes(game.playerId)
    ) {
      return;
    }

    setSkippedPlayers((current) => [...current, game.playerId!]);
    game.giveUp();
  }

  function handleNextRound() {
    setSkippedPlayers([]);
    game.skip();
  }

  function handleLobbyClick(event: ReactMouseEvent<HTMLDivElement>) {
    const lobby = lobbyRef.current;
    if (!lobby) return;

    const bounds = lobby.getBoundingClientRect();
    const target = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };

    if (!dogPositionInitializedRef.current) {
      dogPositionRef.current = {
        x: Math.min(100, lobby.clientWidth / 2),
        y: Math.max(100, lobby.clientHeight - 120),
      };
      dogPositionInitializedRef.current = true;
    }

    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
    }

    targetPositionRef.current = target;
    const start = dogPositionRef.current;
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    const directDistance = Math.hypot(dx, dy);
    const bendDistance = Math.min(90, Math.max(24, directDistance * 0.18));
    const bendDirection = routeBendRef.current;
    routeBendRef.current *= -1;
    routeControlRef.current = {
      x: (start.x + target.x) / 2 - (dy / (directDistance || 1)) * bendDistance * bendDirection,
      y: (start.y + target.y) / 2 + (dx / (directDistance || 1)) * bendDistance * bendDirection,
    };
    routeProgressRef.current = 0;
    let sampledPathLength = 0;
    let previousPoint = start;
    for (let sample = 1; sample <= 24; sample += 1) {
      const t = sample / 24;
      const inverseT = 1 - t;
      const point = {
        x: inverseT * inverseT * start.x
          + 2 * inverseT * t * routeControlRef.current.x
          + t * t * target.x,
        y: inverseT * inverseT * start.y
          + 2 * inverseT * t * routeControlRef.current.y
          + t * t * target.y,
      };
      sampledPathLength += Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y);
      previousPoint = point;
    }
    routeLengthRef.current = sampledPathLength;
    pawDistanceRef.current = 0;
    setTargetPosition(target);

    const animateDog = () => {
      const current = dogPositionRef.current;
      const destination = targetPositionRef.current;
      const dog = dogRef.current;
      if (!destination || !dog) {
        animationFrameRef.current = null;
        return;
      }

      if (routeLengthRef.current < 5 || routeProgressRef.current >= 1) {
        dogPositionRef.current = destination;
        dog.style.transform =
          `translate(-50%, -50%) translate(${destination.x}px, ${destination.y}px) scaleX(1)`;
        animationFrameRef.current = null;
        setShowTreasureChest(true);
        return;
      }

      const oldProgress = routeProgressRef.current;
      routeProgressRef.current = Math.min(
        1,
        oldProgress + dogSpeed / routeLengthRef.current,
      );
      const t = routeProgressRef.current;
      const inverseT = 1 - t;
      const control = routeControlRef.current;
      const next = {
        x: inverseT * inverseT * start.x
          + 2 * inverseT * t * control.x
          + t * t * destination.x,
        y: inverseT * inverseT * start.y
          + 2 * inverseT * t * control.y
          + t * t * destination.y,
      };
      const dx = next.x - current.x;
      const dy = next.y - current.y;
      const step = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      dogPositionRef.current = next;
      if (Math.abs(dx) > 0.01) dogScaleRef.current = dx < 0 ? -1 : 1;
      dog.style.transform =
        `translate(-50%, -50%) translate(${next.x}px, ${next.y}px) scaleX(${dogScaleRef.current})`;

      pawDistanceRef.current += step;
      while (pawDistanceRef.current >= pawPrintSpacing) {
        pawDistanceRef.current -= pawPrintSpacing;
        setPawPrints((prints) => [
          ...prints,
          {
            id: performance.now(),
            x: next.x,
            y: next.y,
            angle: (angle * 180) / Math.PI,
          },
        ].slice(-maxPawPrints));
      }

      animationFrameRef.current = window.requestAnimationFrame(animateDog);
    };

    animationFrameRef.current = window.requestAnimationFrame(animateDog);
  }

  function renderInkMiniGame() {
    return (
      <>
        {pawPrints.map((paw) => (
          <img
            key={paw.id}
            src={inkPaw}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute z-0 h-8 w-8 select-none object-contain"
            style={{
              left: paw.x,
              top: paw.y,
              transform: `translate(-50%, -50%) rotate(${paw.angle}deg)`,
            }}
          />
        ))}

        {targetPosition && (
          <>
            <img
              src={xMarksTheSpot}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute z-10 h-24 w-24 select-none object-contain md:h-28 md:w-28"
              style={{
                left: targetPosition.x,
                top: targetPosition.y,
                transform: 'translate(-50%, -50%)',
              }}
            />
            {showTreasureChest && (
              <img
                src={treasureChest}
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute z-10 h-16 w-16 select-none object-contain md:h-20 md:w-20"
                style={{
                  left: targetPosition.x,
                  top: targetPosition.y,
                  transform: 'translate(-50%, -50%)',
                }}
              />
            )}
          </>
        )}

        <img
          ref={dogRef}
          src={inkRunning}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 z-10 h-32 w-24 select-none object-contain"
          style={{
            transform: `translate(-50%, -50%) translate(${dogPositionRef.current.x}px, ${dogPositionRef.current.y}px) scaleX(${dogScaleRef.current})`,
          }}
        />
      </>
    );
  }

  function leaveGame() {
    window.location.reload();
  }

  /* ----------------------------- LANDING ----------------------------- */
  if (!inRoom) {
    return (
      <div
        ref={lobbyRef}
        onClick={handleLobbyClick}
        className="relative min-h-screen overflow-hidden bg-spotle-cream font-pixel text-spotle-navy"
      >
        {renderInkMiniGame()}
        <main data-lobby-ui className="relative z-20 mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-8 p-6 text-center">
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
          <div data-lobby-ui className="fixed inset-0 z-50 flex items-center justify-center bg-spotle-navy/70 p-6">
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
      <div
        ref={lobbyRef}
        onClick={handleLobbyClick}
        className="relative min-h-screen overflow-hidden bg-spotle-cream font-pixel text-spotle-navy"
      >
        {renderInkMiniGame()}

        <main data-lobby-ui className="relative z-20 mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-8 p-6 text-center">
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
                    className="aspect-square min-h-0 min-w-0 w-full overflow-hidden break-words rounded-[2rem] border-4 border-spotle-cream bg-spotle-navy text-center text-lg text-spotle-coral"
                  >
                    {player ? (
                      <LobbyCamTile
                        stream={
                          player.id === game.playerId
                            ? webrtc.localStream
                            : webrtc.remoteMedia[player.peerId]?.stream
                              ?? Object.values(webrtc.remoteMedia).find(
                                (m) => m.playerId === player.id,
                              )?.stream
                        }
                        label={`${player.name}${player.isHost ? ' (Host)' : ''}`}
                        mirrored={player.id === game.playerId && webrtc.facingMode === 'user'}
                        placeholder={
                          player.id === game.playerId ? 'Starting camera…' : 'Connecting…'
                        }
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center p-3">
                        Waiting for player
                      </div>
                    )}
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
                className={`${arcadeButtonClass} relative z-50`}
              >
                START GAME
              </button>
            ) : (
              <p className="text-xl">Waiting for the host to start…</p>
            )}
            <button type="button" onClick={leaveGame} className={`${arcadeButtonClass} relative z-50`}>
              Leave
            </button>
          </div>
        </main>
      </div>
    );
  }

  /* --------------------------- SCOREBOARD ---------------------------- */
  if (
    (room!.status === 'ROUND_RESULT' || room!.status === 'GAME_OVER')
    && allPlayersSettled
    && !refereeMessage
  ) {
    return (
      <ScoreboardScreen
        players={players}
        round={round?.roundNumber ?? 1}
        totalRounds={room!.settings.totalRounds}
        isFinal={room!.status === 'GAME_OVER'}
        isHost={isHost}
        onNextRound={handleNextRound}
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
      skippedPlayers={skippedPlayers}
      round={round}
      totalRounds={room!.settings.totalRounds}
      elapsedSeconds={elapsedSeconds}
      isCountdown={room!.status === 'COUNTDOWN'}
      countdownNumber={countdownNumber}
      canPress={me?.status === 'SEARCHING'}
      canSkip={
        room!.status === 'HUNTING'
        && Boolean(me)
        && me?.status !== 'FOUND'
        && me?.status !== 'VERIFYING'
        && me?.status !== 'SKIPPED'
        && !skippedPlayers.includes(game.playerId ?? '')
      }
      flashing={flashing}
      refereeMessage={refereeMessage}
      refereePlayerId={refereePlayerId}
      isTalking={isTalking}
      isMouthOpen={isMouthOpen}
      isRefereeFading={isRefereeFading}
      captureError={captureError ?? webrtc.error}
      localVideoRef={webrtc.localVideoRef}
      localStream={webrtc.localStream}
      remoteMedia={webrtc.remoteMedia}
      facingMode={webrtc.facingMode}
      isFlipping={webrtc.isFlipping}
      onFlipCamera={webrtc.flipCamera}
      onFoundIt={handleFoundIt}
      onGiveUp={handleGiveUp}
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
  isFlashing,
  nameOnRight,
  isSkipped,
  refereeMessage,
  isTalking,
  isMouthOpen,
  isRefereeFading,
}: {
  player: Player;
  isLocal: boolean;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  localStream: MediaStream | null;
  stream: MediaStream | undefined;
  facingMode: 'user' | 'environment';
  showCrown: boolean;
  isFlashing: boolean;
  nameOnRight: boolean;
  isSkipped: boolean;
  refereeMessage: string | null;
  isTalking: boolean;
  isMouthOpen: boolean;
  isRefereeFading: boolean;
}) {
  const statusOverlay =
    player.status === 'VERIFYING'
      ? 'VERIFYING...'
      : player.status === 'PENALIZED'
        ? 'COOLDOWN'
        : null;
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (isLocal || !remoteVideoRef.current || !stream) return;
    const video = remoteVideoRef.current;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }

    const handleCanPlay = () => {
      void video.play().catch((err) => {
        console.warn('[video] autoplay blocked for remote tile', err);
      });
    };

    video.addEventListener('loadedmetadata', handleCanPlay);
    if (video.readyState >= 1) {
      handleCanPlay();
    }

    return () => {
      video.removeEventListener('loadedmetadata', handleCanPlay);
    };
  }, [isLocal, stream]);

  return (
    <section
      className={`relative min-h-0 min-w-0 overflow-hidden border-2 border-spotle-cream bg-spotle-navy ${
        showCrown ? 'z-[5]' : ''
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
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="h-full w-full object-cover"
        />
      ) : null}

      {showCrown && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 border-[12px] border-green-500 shadow-[inset_0_0_28px_#4ade80]"
        />
      )}

      {isFlashing && (
        <div className="pointer-events-none absolute inset-0 z-[1] animate-flash" />
      )}

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

      <p className={`absolute top-2 z-20 max-w-[calc(100%-1rem)] truncate rounded-full border-2 border-spotle-cream bg-spotle-coral px-4 py-2 text-xl text-spotle-navy md:text-2xl ${
        nameOnRight ? 'right-2 text-right' : 'left-2 text-left'
      }`}>
        {isLocal ? 'You' : player.name}
      </p>

      {showCrown && (
        <Crown
          aria-label="Round winner"
          className="absolute left-1/2 top-1/2 z-20 h-16 w-16 -translate-x-1/2 -translate-y-1/2 fill-yellow-300 text-yellow-300 drop-shadow-[0_0_16px_#fde047] md:h-24 md:w-24"
        />
      )}

      {player.reactionMs !== undefined && !refereeMessage && (
        <p className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full border-2 border-spotle-cream bg-spotle-coral px-5 py-3 text-lg text-spotle-navy md:text-2xl">
          {(player.reactionMs / 1000).toFixed(1)}s
        </p>
      )}

      {statusOverlay && (
        <div
          className="absolute inset-0 z-[1] flex items-center justify-center bg-spotle-navy/80"
          role="status"
        >
          <p className="rounded-full border-4 border-spotle-cream bg-spotle-coral px-5 py-4 text-center text-xl text-spotle-navy md:text-2xl">
            {statusOverlay}
          </p>
        </div>
      )}

      {isSkipped && (
        <div className="absolute inset-0 z-[1] flex items-center justify-center bg-spotle-navy/75" role="status">
          <p className="border-4 border-red-600 bg-spotle-cream px-5 py-4 text-center text-2xl text-red-700 md:text-4xl">
            SKIPPED
          </p>
        </div>
      )}

      {refereeMessage && (
        <div
          className={`absolute inset-0 z-30 grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-center gap-2 bg-spotle-navy/80 p-2 transition-opacity duration-300 sm:gap-4 sm:p-4 ${
            isRefereeFading ? 'opacity-0' : 'opacity-100'
          }`}
          role="status"
          aria-live="polite"
        >
          <img
            src={isTalking && isMouthOpen ? dogMouthOpen : dogMouthClosed}
            alt="Spotle referee dog"
            className="max-h-full w-full object-contain"
          />
          <p className="break-words border-4 border-spotle-cream bg-spotle-coral p-2 text-center text-xs leading-relaxed text-spotle-navy sm:p-4 sm:text-base md:text-xl">
            {refereeMessage}
          </p>
        </div>
      )}
    </section>
  );
}

function TargetPanel({ round }: { round: RoundData | null }) {
  if (!round) return null;
  return (
    <figure className="flex w-24 max-w-full flex-col items-center overflow-hidden rounded-t-full rounded-b-2xl border-4 border-spotle-cream bg-spotle-navy text-center text-xs text-spotle-coral md:w-56 md:text-lg">
      <img
        src={round.targetIconUrl}
        alt={round.targetObject}
        className="aspect-square w-full bg-spotle-cream object-contain p-2"
      />
      <figcaption className="w-full px-2 py-2 md:px-4 md:py-3">
        {round.targetObject}
        {round.imageAttribution && (
          <span className="mt-1 block text-[9px] leading-tight md:text-xs">
            Photo:{" "}
            <a href={round.imageAttribution.sourceUrl} target="_blank" rel="noreferrer" className="underline">
              {round.imageAttribution.author}, {round.imageAttribution.license}
            </a>{" "}
            <a href={round.imageAttribution.licenseUrl} target="_blank" rel="noreferrer" className="underline">
              license
            </a>
          </span>
        )}
      </figcaption>
    </figure>
  );
}

function PlayingScreen({
  players,
  localPlayerId,
  skippedPlayers,
  round,
  totalRounds,
  elapsedSeconds,
  isCountdown,
  countdownNumber,
  canPress,
  canSkip,
  flashing,
  refereeMessage,
  refereePlayerId,
  isTalking,
  isMouthOpen,
  isRefereeFading,
  captureError,
  localVideoRef,
  localStream,
  remoteMedia,
  facingMode,
  isFlipping,
  onFlipCamera,
  onFoundIt,
  onGiveUp,
}: {
  players: Player[];
  localPlayerId: string | null;
  skippedPlayers: string[];
  round: RoundData | null;
  totalRounds: number;
  elapsedSeconds: number;
  isCountdown: boolean;
  countdownNumber: number | null;
  canPress: boolean;
  canSkip: boolean;
  flashing: boolean;
  refereeMessage: string | null;
  refereePlayerId: string | null;
  isTalking: boolean;
  isMouthOpen: boolean;
  isRefereeFading: boolean;
  captureError: string | null;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  localStream: MediaStream | null;
  remoteMedia: Record<string, { playerId: string; peerId: string; stream: MediaStream }>;
  facingMode: 'user' | 'environment';
  isFlipping: boolean;
  onFlipCamera: () => void;
  onFoundIt: () => void;
  onGiveUp: () => void;
}) {
  const hasTargetCell = players.length === 3;

  return (
    <main className="relative h-dvh min-h-[480px] w-full overflow-hidden bg-spotle-cream font-pixel text-spotle-navy">
      <div
        className={`absolute inset-x-0 top-0 grid h-[calc(100dvh-8rem)] min-h-0 gap-0 p-0 ${getGridClass(players.length)}`}
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
                    {round.imageAttribution && (
                      <p className="max-w-full text-xs leading-tight">
                        Photo:{" "}
                        <a href={round.imageAttribution.sourceUrl} target="_blank" rel="noreferrer" className="underline">
                          {round.imageAttribution.author}, {round.imageAttribution.license}
                        </a>{" "}
                        <a href={round.imageAttribution.licenseUrl} target="_blank" rel="noreferrer" className="underline">
                          license
                        </a>
                      </p>
                    )}
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
              isFlashing={flashing && isLocal}
              nameOnRight={
                (players.length === 2 && index === 1)
                || (players.length >= 3 && (index === 1 || index === 3))
              }
              isSkipped={skippedPlayers.includes(player.id) || player.status === 'SKIPPED'}
              refereeMessage={
                refereePlayerId === player.id && player.status !== 'SKIPPED'
                  ? refereeMessage
                  : null
              }
              isTalking={isTalking && refereePlayerId === player.id}
              isMouthOpen={isMouthOpen}
              isRefereeFading={isRefereeFading}
            />
          );
        })}
      </div>

      {players.length >= 3 && players.length === maxPlayers && (
        <div         className="pointer-events-none absolute inset-x-0 top-[calc((100dvh-8rem)/2)] z-50 flex -translate-y-1/2 justify-center">
          <TargetPanel round={round} />
        </div>
      )}

      {players.length <= 2
        && !refereeMessage
        && !captureError
        && !players.some((player) => player.status === 'VERIFYING') && (
        <div
          className={`pointer-events-none absolute z-50 ${
            players.length === 2
              ? 'bottom-[9rem] left-1/2 -translate-x-1/2'
              : 'right-4 top-4'
          }`}
        >
          <TargetPanel round={round} />
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-4 z-40 flex justify-center px-4">
        <div className="rounded-3xl border-4 border-spotle-cream bg-spotle-coral px-3 py-2 text-center text-sm text-spotle-navy md:px-8 md:py-3 md:text-4xl">
          ROUND {round?.roundNumber ?? 1} / {totalRounds}
        </div>
      </div>

      {captureError && (
        <div className="pointer-events-none absolute inset-x-0 bottom-32 z-30 flex justify-center px-4">
          <p className="max-w-xl rounded-2xl border-4 border-spotle-cream bg-red-600 px-4 py-2 text-center text-base text-white">
            {captureError}
          </p>
        </div>
      )}

      <nav
        aria-label="Game controls"
        className={`fixed inset-x-0 bottom-0 z-30 grid ${taskbarHeightClass} grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-t-4 border-spotle-navy bg-spotle-cream px-3 pb-4 pt-2 text-spotle-navy sm:gap-6 sm:px-8`}
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
          {canSkip && (
            <button
              type="button"
              onClick={onGiveUp}
              aria-label="Give up this round"
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

      {isCountdown && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-spotle-navy/85 gap-4">
          <p className="text-center text-4xl text-spotle-coral md:text-6xl">GET READY!</p>
          {countdownNumber !== null && (
            <p className="text-center text-8xl text-spotle-cream animate-pulse font-bold">
              {countdownNumber}
            </p>
          )}
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
