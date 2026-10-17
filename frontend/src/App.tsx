import { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { Clock, Crown, FlipHorizontal } from 'lucide-react';
import spotleLogo from '../../Assets/Spotle_Logo.png';

type ViewState = 'LANDING' | 'LOBBY' | 'PLAYING' | 'SCOREBOARD';
type GamePhase = 'idle' | 'flashing' | 'verifying' | 'won';

const mockPlayers = [
  { id: 'alex', name: 'Alex', isLocal: true },
  { id: 'bot-1', name: 'Bot 1', isLocal: false },
  { id: 'bot-2', name: 'Bot 2', isLocal: false },
  { id: 'bot-3', name: 'Bot 3', isLocal: false },
];

const arcadeButtonClass =
  'w-full border-4 border-spotle-navy bg-spotle-coral px-6 py-4 text-sm text-spotle-navy shadow-[0_6px_0_#1f2532] transition-transform active:scale-95';

const initialScores: Record<string, number> = {
  alex: 0,
  'bot-1': 0,
  'bot-2': 0,
  'bot-3': 0,
};

const currentTarget = {
  name: 'Coffee Mug',
  imageUrl: 'https://placehold.co/320x320?text=Coffee%20Mug',
};

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

export default function App() {
  const [currentView, setCurrentView] = useState<ViewState>('LANDING');
  const [round, setRound] = useState(1);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [playerName, setPlayerName] = useState('Alex');
  const [scores, setScores] = useState(initialScores);
  const [phase, setPhase] = useState<GamePhase>('idle');
  const [reactionTime, setReactionTime] = useState<number | null>(null);
  const roundLocked = useRef(false);

  useEffect(() => {
    if (currentView !== 'PLAYING') return;

    const intervalId = window.setInterval(() => {
      setElapsedSeconds((seconds) => seconds + 1);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [currentView]);

  useEffect(() => {
    if (phase === 'flashing') {
      const timeoutId = window.setTimeout(() => setPhase('verifying'), 500);
      return () => window.clearTimeout(timeoutId);
    }

    if (phase === 'verifying') {
      const timeoutId = window.setTimeout(() => {
        setScores((currentScores) => ({
          ...currentScores,
          alex: (currentScores.alex ?? 0) + 1,
        }));
        setPhase('won');
        confetti({
          particleCount: 120,
          spread: 75,
          startVelocity: 50,
          origin: { x: 0.5, y: 0 },
        });
      }, 1000);

      return () => window.clearTimeout(timeoutId);
    }

    if (phase === 'won') {
      const timeoutId = window.setTimeout(() => {
        setCurrentView('SCOREBOARD');
      }, 2500);

      return () => window.clearTimeout(timeoutId);
    }
  }, [phase]);

  function startNewGame() {
    setRound(1);
    setElapsedSeconds(0);
    setScores(initialScores);
    setReactionTime(null);
    setPhase('idle');
    roundLocked.current = false;
    setCurrentView('PLAYING');
  }

  function claimWin() {
    if (roundLocked.current || currentView !== 'PLAYING') return;

    roundLocked.current = true;
    setReactionTime(elapsedSeconds);
    setPhase('flashing');
  }

  function startNextRound() {
    if (round >= 10) {
      setRound(1);
      setScores(initialScores);
    } else {
      setRound((currentRound) => currentRound + 1);
    }

    setElapsedSeconds(0);
    setReactionTime(null);
    setPhase('idle');
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
            className="-translate-y-3 w-full max-w-xs"
          />
          <label className="w-full text-left text-xs">
            Your Name
            <input
              type="text"
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
              placeholder="Enter your name"
              className="mt-3 w-full border-4 border-spotle-navy bg-white px-4 py-4 text-sm text-spotle-navy placeholder:text-spotle-navy/50 focus:outline-4 focus:outline-spotle-coral"
            />
          </label>
          <button
            type="button"
            onClick={() => setCurrentView('LOBBY')}
            className={arcadeButtonClass}
          >
            Create Game
          </button>
          <button
            type="button"
            onClick={() => setCurrentView('LOBBY')}
            className={arcadeButtonClass}
          >
            Join Game
          </button>
        </div>
      );
      break;
    case 'LOBBY':
      viewContent = (
        <div className="flex w-full max-w-lg flex-col items-center gap-8">
          <p className="text-lg">PIN: 847291</p>
          <ul className="grid w-full grid-cols-2 gap-4">
            {Array.from({ length: 4 }, (_, index) => {
              const player = mockPlayers[index];

              return (
                <li
                  key={player?.id ?? `empty-${index}`}
                  className="flex aspect-square items-center justify-center border-4 border-spotle-navy p-3 text-center text-xs"
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
            onClick={startNewGame}
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
        playerList={mockPlayers}
        playerName={playerName}
        round={round}
        elapsedSeconds={elapsedSeconds}
        targetName={currentTarget.name}
        targetImageUrl={currentTarget.imageUrl}
        phase={phase}
        reactionTime={reactionTime}
        onFoundIt={claimWin}
      />
    );
  }

  if (currentView === 'SCOREBOARD') {
    return (
      <ScoreboardScreen
        playerList={mockPlayers}
        playerName={playerName}
        scores={scores}
        round={round}
        onNextRound={startNextRound}
      />
    );
  }

  return (
    <div className="min-h-screen bg-spotle-cream font-pixel text-spotle-navy">
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 p-6 text-center">
        <section className="flex flex-col items-center gap-6" aria-live="polite">
          {viewContent}
        </section>
      </main>
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
  reactionTime,
  onFoundIt,
}: {
  playerList: typeof mockPlayers;
  playerName: string;
  round: number;
  elapsedSeconds: number;
  targetName: string;
  targetImageUrl: string;
  phase: GamePhase;
  reactionTime: number | null;
  onFoundIt: () => void;
}) {
  const winnerId = phase === 'won' ? 'alex' : null;

  return (
    <main className="relative h-dvh min-h-[480px] w-full overflow-hidden bg-spotle-navy font-pixel text-spotle-cream">
      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
        {playerList.map((player, index) => (
          <section
            key={player.id}
            className={`relative min-h-0 min-w-0 border-4 bg-slate-800 ${
              player.id === winnerId
                ? 'z-10 border-emerald-400 shadow-[inset_0_0_24px_#4ade80,0_0_24px_#4ade80]'
                : index % 2 === 0
                  ? 'border-spotle-coral'
                  : 'border-spotle-navy'
            }`}
            aria-label={`${player.isLocal ? playerName || 'Alex' : player.name}'s video feed`}
          >
            <p className="absolute left-3 top-3 z-10 max-w-[calc(100%-1.5rem)] truncate border-2 border-spotle-navy bg-spotle-cream px-2 py-2 text-[9px] text-spotle-navy sm:text-xs">
              {player.isLocal ? playerName.trim() || 'Alex' : player.name}
            </p>
            {player.id === winnerId && (
              <>
                <Crown
                  aria-label="Winner"
                  className="absolute right-3 top-3 z-10 h-8 w-8 fill-yellow-300 text-yellow-300 drop-shadow-[0_0_8px_#fde047]"
                />
                <p className="absolute inset-x-0 bottom-5 z-10 text-center text-[9px] text-yellow-200 sm:text-xs">
                  {formatTime(reactionTime ?? 0)}
                </p>
              </>
            )}
          </section>
        ))}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-5 z-10 text-center text-[10px] text-spotle-cream sm:text-xs">
        ROUND {round} / 10
      </div>

      <figure className="pointer-events-none absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 border-4 border-spotle-navy bg-spotle-cream p-2 text-center text-[9px] text-spotle-navy shadow-[6px_6px_0_#e4785e] sm:text-xs">
        <img
          src={targetImageUrl}
          alt={targetName}
          className="h-24 w-24 object-cover sm:h-32 sm:w-32"
        />
        <figcaption>TARGET: {targetName}</figcaption>
      </figure>

      <nav
        aria-label="Game controls"
        className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between border-t-4 border-spotle-navy bg-spotle-cream/95 px-4 py-3 text-spotle-navy backdrop-blur sm:px-8"
      >
        <button
          type="button"
          aria-label="Flip camera"
          className="flex h-14 w-14 items-center justify-center border-4 border-spotle-navy bg-spotle-coral shadow-[0_4px_0_#1f2532] transition-transform active:scale-95"
        >
          <FlipHorizontal aria-hidden="true" className="h-7 w-7" />
        </button>

        <button
          type="button"
          onClick={onFoundIt}
          aria-label="Found it"
          disabled={phase !== 'idle'}
          className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-spotle-navy bg-spotle-coral px-2 text-center text-[9px] leading-tight text-spotle-navy shadow-[0_6px_0_#1f2532] transition-transform active:scale-95 disabled:opacity-60 sm:h-24 sm:w-24 sm:text-[10px]"
        >
          FOUND IT!
        </button>

        <div className="flex min-w-14 items-center justify-end gap-2 text-[10px] sm:text-xs">
          <Clock aria-hidden="true" className="h-6 w-6 shrink-0" />
          <span aria-label={`Elapsed time ${formatTime(elapsedSeconds)}`}>
            {formatTime(elapsedSeconds)}
          </span>
        </div>
      </nav>

      {phase === 'flashing' && (
        <div className="pointer-events-none fixed inset-0 z-40 animate-flash" />
      )}

      {(phase === 'flashing' || phase === 'verifying') && (
        <div
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
          role="status"
          aria-live="assertive"
        >
          <p className="border-4 border-spotle-navy bg-spotle-cream px-6 py-5 text-sm text-spotle-navy shadow-[6px_6px_0_#1f2532]">
            Verifying...
          </p>
        </div>
      )}
    </main>
  );
}

function ScoreboardScreen({
  playerList,
  playerName,
  scores,
  round,
  onNextRound,
}: {
  playerList: typeof mockPlayers;
  playerName: string;
  scores: Record<string, number>;
  round: number;
  onNextRound: () => void;
}) {
  const rankedPlayers = [...playerList]
    .map((player) => ({
      ...player,
      displayName: player.isLocal ? playerName.trim() || 'Alex' : player.name,
      score: scores[player.id] ?? 0,
    }))
    .sort((a, b) => b.score - a.score);

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-spotle-navy p-6 font-pixel text-spotle-navy">
      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 blur-md">
        {playerList.map((player, index) => (
          <div
            key={player.id}
            className={`relative border-4 bg-slate-800 ${
              index % 2 === 0 ? 'border-spotle-coral' : 'border-spotle-navy'
            }`}
            aria-hidden="true"
          >
            <span className="absolute left-3 top-3 text-xs text-spotle-cream">
              {player.isLocal ? playerName.trim() || 'Alex' : player.name}
            </span>
          </div>
        ))}
      </div>
      <div className="absolute inset-0 bg-spotle-navy/45" />

      <section className="relative z-10 w-full max-w-lg rounded-2xl border-4 border-spotle-navy bg-spotle-cream p-6 shadow-[8px_8px_0_#e4785e] sm:p-8">
        <h1 className="text-center text-lg">Scoreboard</h1>
        <p className="mt-5 text-center text-xs">Round {round} of 10</p>
        <ol className="mt-8 space-y-3">
          {rankedPlayers.map((player, index) => (
            <li
              key={player.id}
              className="flex items-center justify-between gap-4 border-2 border-spotle-navy bg-white px-4 py-3 text-[10px] sm:text-xs"
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
