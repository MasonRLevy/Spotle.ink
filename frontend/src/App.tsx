import { useEffect, useRef, useState, type FormEvent } from 'react';
import confetti from 'canvas-confetti';
import { Clock, Crown, SwitchCamera, X } from 'lucide-react';
import spotleLogo from '../../Assets/Spotle_Logo.png';
import coffeeMugImage from './assets/coffee-mug.png';

type ViewState = 'LANDING' | 'LOBBY' | 'PLAYING' | 'SCOREBOARD';
type GamePhase = 'idle' | 'flashing' | 'verifying' | 'won';
type GamePlayer = { id: string; name: string; isLocal: boolean };

const localPlayer: GamePlayer = { id: 'alex', name: 'Alex', isLocal: true };
const maxPlayers = 4;

const arcadeButtonClass =
  'w-full rounded-full border-4 border-spotle-cream bg-spotle-navy px-6 py-4 text-xl text-spotle-coral transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-50';

const initialScores: Record<string, number> = {
  alex: 0,
  'bot-1': 0,
  'bot-2': 0,
  'bot-3': 0,
};

const currentTarget = {
  name: 'Coffee Mug',
  imageUrl: coffeeMugImage,
};

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
  const [currentView, setCurrentView] = useState<ViewState>('LANDING');
  const [round, setRound] = useState(1);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [playerName, setPlayerName] = useState('');
  const [joinPin, setJoinPin] = useState('');
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [players, setPlayers] = useState<GamePlayer[]>([localPlayer]);
  const [scores, setScores] = useState(initialScores);
  const [phase, setPhase] = useState<GamePhase>('idle');
  const [reactionTimes, setReactionTimes] = useState<Record<string, number>>({});
  const [activeVerifyingTime, setActiveVerifyingTime] = useState<number | null>(null);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [foundPlayerIds, setFoundPlayerIds] = useState<string[]>([]);
  const [activeVerifyingId, setActiveVerifyingId] = useState<string | null>(null);
  const roundLocked = useRef(false);

  useEffect(() => {
    if (currentView !== 'PLAYING') return;

    const intervalId = window.setInterval(() => {
      setElapsedSeconds((seconds) => Math.round((seconds + 0.1) * 10) / 10);
    }, 100);

    return () => window.clearInterval(intervalId);
  }, [currentView]);

  useEffect(() => {
    if (phase === 'flashing') {
      const timeoutId = window.setTimeout(() => setPhase('verifying'), 500);
      return () => window.clearTimeout(timeoutId);
    }

    if (phase === 'verifying') {
      const timeoutId = window.setTimeout(() => {
        if (!activeVerifyingId) return;

        const nextFoundPlayerIds = foundPlayerIds.includes(activeVerifyingId)
          ? foundPlayerIds
          : [...foundPlayerIds, activeVerifyingId];
        setFoundPlayerIds(nextFoundPlayerIds);
        const nextReactionTimes = {
          ...reactionTimes,
          [activeVerifyingId]: activeVerifyingTime ?? 0,
        };
        setReactionTimes(nextReactionTimes);

        if (Object.keys(reactionTimes).length === 0) {
          setWinnerId(activeVerifyingId);
        }

        const pointsForPlace = [4, 3, 2, 1][foundPlayerIds.length] ?? 0;
        setScores((currentScores) => ({
          ...currentScores,
          [activeVerifyingId]:
            (currentScores[activeVerifyingId] ?? 0) + pointsForPlace,
        }));

        if (activeVerifyingId === localPlayer.id) {
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
        }

        setActiveVerifyingId(null);
        setActiveVerifyingTime(null);
        setPhase(nextFoundPlayerIds.length === players.length ? 'won' : 'idle');
      }, 1000);

      return () => window.clearTimeout(timeoutId);
    }

    if (phase === 'won' && players.every((player) => foundPlayerIds.includes(player.id))) {
      const timeoutId = window.setTimeout(() => {
        setCurrentView('SCOREBOARD');
      }, 2500);

      return () => window.clearTimeout(timeoutId);
    }
  }, [
    activeVerifyingId,
    activeVerifyingTime,
    foundPlayerIds,
    phase,
    players,
    reactionTimes,
  ]);

  function startNewGame() {
    if (!playerName.trim() || players.length < 1 || players.length > maxPlayers) return;

    setRound(1);
    setElapsedSeconds(0);
    setScores(initialScores);
    setReactionTimes({});
    setActiveVerifyingTime(null);
    setWinnerId(null);
    setPhase('idle');
    setFoundPlayerIds([]);
    setActiveVerifyingId(null);
    roundLocked.current = false;
    setCurrentView('PLAYING');
  }

  function exitGame() {
    setRound(1);
    setElapsedSeconds(0);
    setPlayers([localPlayer]);
    setScores(initialScores);
    setReactionTimes({});
    setActiveVerifyingTime(null);
    setWinnerId(null);
    setPhase('idle');
    setFoundPlayerIds([]);
    setActiveVerifyingId(null);
    setJoinPin('');
    setIsJoinModalOpen(false);
    roundLocked.current = false;
    setCurrentView('LANDING');
  }

  function addOpponent() {
    setPlayers((currentPlayers) => {
      if (currentPlayers.length >= maxPlayers) return currentPlayers;

      const botNumber = currentPlayers.length;
      return [
        ...currentPlayers,
        { id: `bot-${botNumber}`, name: `Bot ${botNumber}`, isLocal: false },
      ];
    });
  }

  function submitJoinGame(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!playerName.trim() || !/^\d{6}$/.test(joinPin)) return;

    setIsJoinModalOpen(false);
    setCurrentView('LOBBY');
  }

  function handleFoundIt() {
    if (currentView !== 'PLAYING' || phase !== 'idle') return;

    const nextPlayer = players.find((player) => !foundPlayerIds.includes(player.id));
    if (!nextPlayer) return;

    if (nextPlayer.id === localPlayer.id && !roundLocked.current) {
      roundLocked.current = true;
    }

    setActiveVerifyingId(nextPlayer.id);
    setActiveVerifyingTime(elapsedSeconds);
    setPhase('flashing');
  }

  function handleSkip() {
    if (currentView !== 'PLAYING' || phase !== 'idle' || elapsedSeconds < 30) return;

    setPhase('idle');
    setActiveVerifyingId(null);
    setCurrentView('SCOREBOARD');
  }

  function startNextRound() {
    if (round >= 10) {
      setRound(1);
      setScores(initialScores);
    } else {
      setRound((currentRound) => currentRound + 1);
    }

    setElapsedSeconds(0);
    setReactionTimes({});
    setActiveVerifyingTime(null);
    setWinnerId(null);
    setPhase('idle');
    setFoundPlayerIds([]);
    setActiveVerifyingId(null);
    roundLocked.current = false;
    setCurrentView('PLAYING');
  }

  let viewContent;
  switch (currentView) {
    case 'LANDING':
      viewContent = (
        <div className="flex w-full max-w-sm flex-col items-center gap-5">
          <img
            src={spotleLogo}
            alt="Spotle"
            className="-translate-y-3 w-full max-w-md"
          />
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
            onClick={() => setCurrentView('LOBBY')}
            disabled={!playerName.trim()}
            className={arcadeButtonClass}
          >
            Create Game
          </button>
          <button
            type="button"
            onClick={() => {
              setJoinPin('');
              setIsJoinModalOpen(true);
            }}
            disabled={!playerName.trim()}
            className={arcadeButtonClass}
          >
            Join Game
          </button>
        </div>
      );
      break;
    case 'LOBBY':
      viewContent = (
        <div className="flex min-h-[calc(100dvh-3rem)] w-[min(90vw,28rem)] shrink-0 flex-col items-center justify-center gap-6 py-6">
          <p className="rounded-full border-4 border-spotle-cream bg-spotle-navy px-8 py-4 text-2xl text-spotle-coral">PIN: 847291</p>
          <ul className="grid w-full shrink-0 grid-cols-[repeat(2,minmax(0,1fr))] gap-3">
            {Array.from({ length: 4 }, (_, index) => {
              const player = players[index];

              return (
                <li
                  key={player?.id ?? `empty-${index}`}
                  className="flex aspect-square min-h-0 min-w-0 w-full items-center justify-center break-words rounded-[2rem] border-4 border-spotle-cream bg-spotle-navy p-3 text-center text-lg text-spotle-coral"
                >
                  {player
                    ? player.isLocal
                      ? playerName.trim() || 'Alex'
                      : player.name
                    : 'Waiting for player'}
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={addOpponent}
            disabled={players.length >= maxPlayers}
            className={arcadeButtonClass}
          >
            {players.length >= maxPlayers ? 'All Players Joined' : 'Add Player/Bot'}
          </button>
          <button
            type="button"
            onClick={startNewGame}
            disabled={!playerName.trim() || players.length > maxPlayers}
            className={arcadeButtonClass}
          >
            START GAME
          </button>
        </div>
      );
      break;
    case 'PLAYING':
      viewContent = null;
      break;
    case 'SCOREBOARD':
      viewContent = null;
      break;
  }

  if (currentView === 'PLAYING') {
    return (
      <PlayingScreen
        playerList={players}
        playerName={playerName}
        round={round}
        elapsedSeconds={elapsedSeconds}
        targetName={currentTarget.name}
        targetImageUrl={currentTarget.imageUrl}
        phase={phase}
        reactionTimes={reactionTimes}
        winnerId={winnerId}
        foundPlayerIds={foundPlayerIds}
        activeVerifyingId={activeVerifyingId}
        onFoundIt={handleFoundIt}
        onSkip={handleSkip}
      />
    );
  }

  if (currentView === 'SCOREBOARD') {
    return (
      <ScoreboardScreen
        playerList={players}
        playerName={playerName}
        scores={scores}
        round={round}
        onNextRound={startNextRound}
        onExit={exitGame}
      />
    );
  }

  return (
    <div className="min-h-screen bg-spotle-cream font-pixel text-spotle-navy">
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-8 p-6 text-center">
        <section className="flex w-full flex-col items-center gap-6" aria-live="polite">
          {viewContent}
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
                onChange={(event) => setJoinPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                placeholder="______"
                className="mt-3 w-full rounded-[2rem] border-4 border-spotle-navy bg-spotle-cream px-6 py-5 text-center text-2xl tracking-[0.4em] text-spotle-navy"
              />
            </label>
            <button
              type="submit"
              disabled={!playerName.trim() || !/^\d{6}$/.test(joinPin)}
              className={`${arcadeButtonClass} mt-6`}
            >
              Submit
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

function PlayingScreen({
  playerList,
  playerName,
  round,
  elapsedSeconds,
  targetName,
  targetImageUrl,
  phase,
  reactionTimes,
  winnerId,
  foundPlayerIds,
  activeVerifyingId,
  onFoundIt,
  onSkip,
}: {
  playerList: GamePlayer[];
  playerName: string;
  round: number;
  elapsedSeconds: number;
  targetName: string;
  targetImageUrl: string;
  phase: GamePhase;
  reactionTimes: Record<string, number>;
  winnerId: string | null;
  foundPlayerIds: string[];
  activeVerifyingId: string | null;
  onFoundIt: () => void;
  onSkip: () => void;
}) {
  const hasTargetCell = playerList.length === 3;

  return (
    <main className="relative h-dvh min-h-[480px] w-full overflow-hidden bg-spotle-cream font-pixel text-spotle-navy">
      <div
        className={`absolute inset-x-0 top-0 grid h-[calc(100dvh-7rem)] min-h-0 gap-0 p-0 ${getGridClass(playerList.length)}`}
      >
        {Array.from({ length: hasTargetCell ? maxPlayers : playerList.length }, (_, index) => {
          const player = playerList[index];

          if (hasTargetCell && index === maxPlayers - 1) {
            return (
              <div
                key="target-cell"
                className="flex min-h-0 min-w-0 flex-col items-center justify-center gap-2 border-2 border-spotle-cream bg-spotle-cream p-3 text-center text-lg text-spotle-navy md:text-2xl lg:text-3xl"
                aria-label={`Target item: ${targetName}`}
              >
                <img
                  src={targetImageUrl}
                  alt={targetName}
                  className="max-h-[72%] w-3/4 flex-1 object-contain"
                />
                <p className="max-w-full rounded-full bg-spotle-navy px-5 py-3 text-spotle-coral">
                  {targetName}
                </p>
              </div>
            );
          }

          if (!player) return null;

          const playerFound = foundPlayerIds.includes(player.id);

          return (
            <section
              key={player.id}
              className={`relative min-h-0 min-w-0 overflow-hidden border-2 border-spotle-cream bg-spotle-navy ${
                player.id === winnerId
                  ? 'z-10 border-8 border-green-400 shadow-[0_0_28px_#4ade80,inset_0_0_18px_#4ade80]'
                  : ''
              }`}
              aria-label={`${player.isLocal ? playerName || 'Alex' : player.name}'s video feed`}
            >
              <p
                className={`absolute z-10 max-w-[calc(100%-1rem)] truncate rounded-full border-2 border-spotle-cream bg-spotle-coral px-4 py-2 text-xl text-spotle-navy md:text-2xl lg:text-3xl ${
                  playerList.length === 3 && index === 1
                    ? 'right-2 top-2 text-right'
                    : playerList.length === maxPlayers && (index === 1 || index === 3)
                      ? 'right-2 top-2 text-right'
                      : 'left-2 top-2 text-left'
                }`}
              >
                {player.isLocal ? playerName.trim() || 'Alex' : player.name}
              </p>
              {player.id === winnerId && (
                <>
                  <Crown
                    aria-label="Winner"
                    className="absolute left-1/2 top-1/2 z-10 h-16 w-16 -translate-x-1/2 -translate-y-1/2 fill-yellow-300 text-yellow-300 drop-shadow-[0_0_16px_#fde047] md:h-24 md:w-24"
                  />
                </>
              )}
              {playerFound && reactionTimes[player.id] !== undefined && (
                <p
                  className={`absolute z-10 rounded-full border-2 border-spotle-cream bg-spotle-coral px-5 py-3 text-lg text-spotle-navy md:text-2xl lg:text-3xl ${
                    playerList.length === 2
                      ? 'left-2 top-20'
                      : 'bottom-4 left-1/2 -translate-x-1/2'
                  }`}
                >
                  {reactionTimes[player.id].toFixed(1)}s
                </p>
              )}
              {activeVerifyingId === player.id
                && (phase === 'flashing' || phase === 'verifying') && (
                  <div
                    className="absolute inset-0 z-20 flex items-center justify-center bg-spotle-navy/80"
                    role="status"
                    aria-live="assertive"
                  >
                    <p className="rounded-full border-4 border-spotle-cream bg-spotle-coral px-5 py-4 text-center text-xl text-spotle-navy md:text-2xl">
                      VERIFYING...
                    </p>
                  </div>
                )}
            </section>
          );
        })}
      </div>

      {(playerList.length === 2 || playerList.length === maxPlayers) && (
        <div className="pointer-events-none absolute inset-x-0 top-[calc((100dvh-7rem)/2)] z-20 flex -translate-y-1/2 justify-center">
          <TargetPanel targetName={targetName} targetImageUrl={targetImageUrl} />
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center px-4">
        <div className="rounded-3xl border-4 border-spotle-cream bg-spotle-coral px-5 py-3 text-center text-2xl text-spotle-navy md:px-8 md:text-4xl lg:text-5xl">
          ROUND {round} / 10
        </div>
      </div>

      <nav
        aria-label="Game controls"
        className={`fixed inset-x-0 bottom-0 z-30 grid ${taskbarHeightClass} grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-t-4 border-spotle-navy bg-spotle-cream px-3 py-3 text-spotle-navy sm:gap-6 sm:px-8`}
      >
        <button
          type="button"
          aria-label="Flip camera"
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-spotle-navy bg-spotle-cream text-spotle-navy transition-transform active:scale-95 sm:h-20 sm:w-20 md:h-24 md:w-24"
        >
          <SwitchCamera aria-hidden="true" className="h-10 w-10 md:h-12 md:w-12" />
        </button>

        {elapsedSeconds >= 30 ? (
          <div className="mx-auto flex w-full max-w-2xl items-center justify-center gap-2 sm:gap-5">
            <button
              type="button"
              onClick={onFoundIt}
              aria-label="Found it"
              disabled={phase !== 'idle'}
              className="h-20 min-w-0 flex-1 rounded-3xl border-4 border-spotle-navy bg-spotle-coral px-2 text-center text-lg text-spotle-navy transition-transform active:scale-95 disabled:opacity-60 sm:h-24 sm:px-3 sm:text-3xl md:text-4xl"
            >
              FOUND IT!
            </button>
            <button
              type="button"
              onClick={onSkip}
              aria-label="Skip this player and show scoreboard"
              className="h-20 shrink-0 rounded-3xl border-4 border-spotle-navy bg-spotle-navy px-3 text-center text-lg text-spotle-coral transition-transform active:scale-95 sm:h-24 sm:px-8 sm:text-3xl"
            >
              SKIP
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onFoundIt}
            aria-label="Found it"
            disabled={phase !== 'idle'}
            className="h-20 w-full max-w-md justify-self-center rounded-3xl border-4 border-spotle-navy bg-spotle-coral px-2 text-center text-xl text-spotle-navy transition-transform active:scale-95 disabled:opacity-60 sm:h-24 sm:px-4 sm:text-4xl md:max-w-xl md:text-4xl lg:max-w-2xl lg:text-5xl"
          >
            FOUND IT!
          </button>
        )}

        <div className="flex shrink-0 items-center justify-end gap-1 text-sm sm:gap-2 sm:text-xl md:text-2xl">
          <Clock aria-hidden="true" className="h-7 w-7 shrink-0 sm:h-9 sm:w-9" />
          <span aria-label={`Elapsed time ${formatTime(elapsedSeconds)}`} className="min-w-[4ch]">
            {formatTime(elapsedSeconds)}
          </span>
        </div>
      </nav>

      {phase === 'flashing' && (
        <div className="pointer-events-none fixed inset-0 z-40 animate-flash" />
      )}

    </main>
  );
}

function TargetPanel({
  targetName,
  targetImageUrl,
}: {
  targetName: string;
  targetImageUrl: string;
}) {
  return (
    <figure className="flex w-32 max-w-full flex-col items-center overflow-hidden rounded-t-full rounded-b-2xl border-4 border-spotle-cream bg-spotle-navy text-center text-sm text-spotle-coral md:w-36 md:text-base lg:w-40 lg:text-lg">
      <img src={targetImageUrl} alt={targetName} className="aspect-square w-full object-cover" />
      <figcaption className="w-full px-3 py-3">{targetName}</figcaption>
    </figure>
  );
}

function ScoreboardScreen({
  playerList,
  playerName,
  scores,
  round,
  onNextRound,
  onExit,
}: {
  playerList: GamePlayer[];
  playerName: string;
  scores: Record<string, number>;
  round: number;
  onNextRound: () => void;
  onExit: () => void;
}) {
  const rankedPlayers = [...playerList]
    .map((player) => ({
      ...player,
      displayName: player.isLocal ? playerName.trim() || 'Alex' : player.name,
      score: scores[player.id] ?? 0,
    }))
    .sort((a, b) => b.score - a.score);

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
      <div className={`absolute inset-0 grid blur-md ${getGridClass(playerList.length)}`}>
        {playerList.map((player) => (
          <div
            key={player.id}
            className="relative min-h-0 min-w-0 border-4 border-spotle-cream bg-spotle-navy"
            aria-hidden="true"
          >
            <span className="absolute left-4 top-4 text-xl text-spotle-coral">
              {player.isLocal ? playerName.trim() || 'Alex' : player.name}
            </span>
          </div>
        ))}
      </div>
      <div className="absolute inset-0 bg-spotle-cream/45" />

      <section className="relative z-10 w-full max-w-lg rounded-[2rem] border-4 border-spotle-cream bg-spotle-navy p-6 text-spotle-coral sm:p-8">
        <h1 className="text-center text-2xl">Scoreboard</h1>
        <p className="mt-5 text-center text-xl">Round {round} of 10</p>
        <ol className="mt-8 space-y-3">
          {rankedPlayers.map((player, index) => (
            <li
              key={player.id}
              className="flex items-center justify-between gap-4 rounded-full border-2 border-spotle-cream bg-spotle-coral px-5 py-4 text-base text-spotle-navy"
            >
              <span>
                {index + 1}. {player.displayName}
              </span>
              <span>{player.score} {player.score === 1 ? 'point' : 'points'}</span>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={onNextRound}
          className={`${arcadeButtonClass} mt-8`}
        >
          Next Round
        </button>
      </section>
    </main>
  );
}
