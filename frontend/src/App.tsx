import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import confetti from 'canvas-confetti';
import {
  Clock,
  Crown,
  Mic,
  MicOff,
  Settings,
  SwitchCamera,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import spotleLogo from './assets/Spotle_Logo.png';
import dogMouthClosed from './assets/Spot_mouth_closed.png';
import dogMouthOpen from './assets/Spot_mouth_open.png';
import inkRunning from './assets/Ink_running.gif';
import inkSitting from './assets/Ink_sit.png';
import inkHouse from './assets/Ink_house.png';
import grassTexture from './assets/isometric-pixel-art-grass-tile-22c1.png';
import gatorLogo from './assets/Gator.webp';
import hornsDownImage from './assets/Screenshot 2026-10-17 at 6.35.02 PM.png';
import inkPaw from './assets/Ink_paw.png';
import routeMarker from './assets/route.png';
import xMarksTheSpot from './assets/X_marks_the_spot.png';
import treasureChest from './assets/Treasure_Chest.png';
import { useGameSocket } from './hooks/useGameSocket';
import { useWebRTC, type RemotePeer } from './hooks/useWebRTC';
import { LobbyCamTile } from './components/LobbyCamTile';
import { EmojiDisplay } from './components/EmojiDisplay';
import { ThemePicker } from './components/ThemePicker';
import type { GameMode, Player, RoundData } from '@shared/game';
import { getTheme, isPlayerHuntMode } from '@shared/game';
import correctAudioSrc from './assets/sounds/CorrectImage.mp3';
import wrongAudioSrc from './assets/sounds/WrongImage.mp3';
import flashAudioSrc from './assets/sounds/cameraFlash8Bit.mp3';
import barkAudioSrc from './assets/sounds/yodguard-friendly-small-dog-bark-2-535476.mp3';

const maxPlayers = 4;
const mobileDogSpeed = 2;
const desktopDogSpeed = 3.2;
const pawPrintSpacing = 40;
const maxPawPrints = 100;

type LobbyPoint = { x: number; y: number };
type PawPrint = LobbyPoint & { id: number; angle: number };
type PastChest = LobbyPoint & { id: number };
type RouteMarker = LobbyPoint & {
  id: number;
  angle: number;
  distanceAlong: number;
  passed?: boolean;
};

const arcadeButtonClass =
  'w-full rounded-full border-4 border-spotle-cream bg-spotle-navy px-6 py-4 text-xl text-spotle-coral transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-50';

const lobbyButtonClass =
  'w-full shrink-0 rounded-full border-4 border-spotle-cream bg-spotle-navy px-5 py-2.5 text-base text-spotle-coral transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:px-6 sm:py-4 sm:text-xl';

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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHornsDownOpen, setIsHornsDownOpen] = useState(false);
  const [soundEffectsMuted, setSoundEffectsMuted] = useState(false);
  const [voiceChatMuted, setVoiceChatMuted] = useState(false);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
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
  const [activeX, setActiveX] = useState<LobbyPoint | null>(null);
  const [pastChests, setPastChests] = useState<PastChest[]>([]);
  const [pawPrints, setPawPrints] = useState<PawPrint[]>([]);
  const [routeMarkers, setRouteMarkers] = useState<RouteMarker[]>([]);
  const [isMoving, setIsMoving] = useState(false);

  const flashAudio = useRef(new Audio(flashAudioSrc));
  const barkAudio = useRef(new Audio(barkAudioSrc));
  const correctAudio = useRef(new Audio(correctAudioSrc));
  const wrongAudio = useRef(new Audio(wrongAudioSrc));
  const lobbyRef = useRef<HTMLDivElement | null>(null);
  const dogRef = useRef<HTMLDivElement | null>(null);
  const runningSpriteRef = useRef<HTMLImageElement | null>(null);
  const mobileHouseRef = useRef<HTMLImageElement | null>(null);
  const desktopHouseRef = useRef<HTMLImageElement | null>(null);
  const dogPositionRef = useRef<LobbyPoint>({ x: 0, y: 0 });
  const dogScaleRef = useRef(1);
  const targetPositionRef = useRef<LobbyPoint | null>(null);
  const routeControlRef = useRef<LobbyPoint>({ x: 0, y: 0 });
  const routeProgressRef = useRef(0);
  const routeLengthRef = useRef(0);
  const routeStartRef = useRef<LobbyPoint>({ x: 0, y: 0 });
  const miniGameItemIdRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const barkTimerRef = useRef<number | null>(null);
  const barkAudioUnlockedRef = useRef(false);
  const settleTimerRef = useRef<number | null>(null);
  const lastPrintPositionRef = useRef<LobbyPoint | null>(null);
  const nextRouteMarkerRef = useRef(0);
  const routeMarkerDistancesRef = useRef<number[]>([]);
  const dogPositionInitializedRef = useRef(false);

  const room = game.room;
  const me = room && game.playerId ? room.players[game.playerId] : undefined;
  const players = useMemo(() => (room ? Object.values(room.players) : []), [room]);
  const isHost = Boolean(me?.isHost);
  const round = game.round;
  const inRoom = Boolean(room);
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
        if (prev === null) return null;

        // When reaching 0 ("GO!"), clear the interval but keep countdownNumber = 0
        if (prev === 1) {
          window.clearInterval(interval);
          
          // Wait 1 extra second displaying "GO!" before hiding the overlay
          window.setTimeout(() => {
            setCountdownNumber(null);
          }, 1000);

          return 0; // Display "GO!"
        }

        return prev - 1; // 3 -> 2 -> 1
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [room?.status, round?.roundNumber]);
  useEffect(() => {
    const verdict = game.lastVerdict;
    if (!verdict) return;

    if (verdict.playerId === game.playerId && !soundEffectsMuted) {
      if (verdict.verdict.verified) {
        correctAudio.current.currentTime = 0;
        correctAudio.current.play().catch((err) => console.warn("Correct audio blocked:", err));
      } else {
        wrongAudio.current.currentTime = 0;
        wrongAudio.current.play().catch((err) => console.warn("Wrong audio blocked:", err));
      }
    }
  }, [game.lastVerdict, game.playerId, soundEffectsMuted]);
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
    voiceEnabled: !voiceChatMuted,
  });

  useEffect(() => {
    const muted = soundEffectsMuted;
    flashAudio.current.muted = muted;
    barkAudio.current.muted = muted;
    correctAudio.current.muted = muted;
    wrongAudio.current.muted = muted;
  }, [soundEffectsMuted]);

  // Audio track state lives in useWebRTC, which applies both the master
  // voice switch and the per-user mic preference in one place.

  useEffect(() => {
    if (soundEffectsMuted) {
      if (barkTimerRef.current !== null) {
        window.clearTimeout(barkTimerRef.current);
        barkTimerRef.current = null;
      }
      barkAudio.current.pause();
      barkAudio.current.currentTime = 0;
      return;
    }
    if (!inRoom && barkAudioUnlockedRef.current) {
      scheduleRandomHomeBark();
    }
  }, [soundEffectsMuted, inRoom]);

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
    if (inRoom) {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (idleTimerRef.current !== null) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      if (barkTimerRef.current !== null) {
        window.clearTimeout(barkTimerRef.current);
        barkTimerRef.current = null;
      }
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
      setIsMoving(false);
      return;
    }

    const lobby = lobbyRef.current;
    if (!lobby) return;

    initializeDogNearHouse();
    scheduleIdleReturn();

  }, [inRoom]);

  useEffect(
    () => () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
      if (idleTimerRef.current !== null) {
        window.clearTimeout(idleTimerRef.current);
      }
      if (barkTimerRef.current !== null) {
        window.clearTimeout(barkTimerRef.current);
      }
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
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
      if (!soundEffectsMuted) {
        flashAudio.current.currentTime = 0;
        flashAudio.current.play().catch((err) => console.warn("Flash audio blocked:", err));
      }

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

  function getHousePosition() {
    const lobby = lobbyRef.current;
    if (!lobby) return null;
    const house = [mobileHouseRef.current, desktopHouseRef.current].find(
      (candidate) =>
        candidate
        && candidate.naturalWidth > 0
        && candidate.getBoundingClientRect().width > 0,
    );
    if (!house) return null;

    const lobbyBounds = lobby.getBoundingClientRect();
    const houseBounds = house.getBoundingClientRect();
    return {
      x: houseBounds.left - lobbyBounds.left + houseBounds.width / 2,
      y: houseBounds.top - lobbyBounds.top + houseBounds.height / 2,
      width: houseBounds.width,
      height: houseBounds.height,
    };
  }

  function playHomeBark() {
    const audio = barkAudio.current;
    if (soundEffectsMuted || !barkAudioUnlockedRef.current || !audio.paused) return;
    audio.volume = 0.28;
    audio.currentTime = 0;
    void audio.play().catch((error) => console.warn('Bark audio blocked:', error));
  }

  function scheduleRandomHomeBark() {
    if (barkTimerRef.current !== null) {
      window.clearTimeout(barkTimerRef.current);
    }
    barkTimerRef.current = window.setTimeout(() => {
      barkTimerRef.current = null;
      if (inRoom) return;
      playHomeBark();
      scheduleRandomHomeBark();
    }, 30_000 + Math.random() * 25_000);
  }

  function enableHomeBarks() {
    barkAudioUnlockedRef.current = true;
    if (!inRoom && barkTimerRef.current === null && !soundEffectsMuted) {
      scheduleRandomHomeBark();
    }
  }

  function initializeDogNearHouse() {
    const lobby = lobbyRef.current;
    const house = getHousePosition();
    if (!lobby || !house || dogPositionInitializedRef.current) return;

    dogPositionRef.current = {
      x: Math.min(lobby.clientWidth - 24, house.x + house.width * 0.55),
      y: Math.min(lobby.clientHeight - 24, house.y + house.height * 0.25),
    };
    dogPositionInitializedRef.current = true;
    if (dogRef.current) {
      dogRef.current.style.transform =
        `translate(-50%, -50%) translate(${dogPositionRef.current.x}px, ${dogPositionRef.current.y}px) scaleX(${dogScaleRef.current})`;
    }
  }

  function startDogMovement(target: LobbyPoint, returningToHouse = false) {
    const lobby = lobbyRef.current;
    if (!lobby) return;
    initializeDogNearHouse();

    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
    }

    setIsMoving(true);
    targetPositionRef.current = target;
    const start = dogPositionRef.current;
    routeStartRef.current = start;
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    const directDistance = Math.hypot(dx, dy);
    const nx = directDistance === 0 ? 0 : -dy / directDistance;
    const ny = directDistance === 0 ? 0 : dx / directDistance;
    const midX = (start.x + target.x) / 2;
    const midY = (start.y + target.y) / 2;
    const offsetMag = directDistance < 240
      ? 0
      : (Math.random() < 0.25 ? 0 : 20 + Math.random() * 60)
        * (Math.random() > 0.5 ? 1 : -1);
    routeControlRef.current = {
      x: midX + nx * offsetMag,
      y: midY + ny * offsetMag,
    };
    routeProgressRef.current = 0;
    const routeSamples: Array<{ point: LobbyPoint; distance: number; angle: number }> = [
      {
        point: start,
        distance: 0,
        angle: Math.atan2(
          2 * (routeControlRef.current.y - start.y),
          2 * (routeControlRef.current.x - start.x),
        ),
      },
    ];
    let sampledPathLength = 0;
    let previousPoint = start;
    for (let sample = 1; sample <= 48; sample += 1) {
      const t = sample / 48;
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
      routeSamples.push({
        point,
        distance: sampledPathLength,
        angle: Math.atan2(
          2 * inverseT * (routeControlRef.current.y - start.y)
            + 2 * t * (target.y - routeControlRef.current.y),
          2 * inverseT * (routeControlRef.current.x - start.x)
            + 2 * t * (target.x - routeControlRef.current.x),
        ),
      });
      previousPoint = point;
    }
    routeLengthRef.current = sampledPathLength;
    const markerGap = 28;
    const markers: RouteMarker[] = [];
    for (
      let markerDistance = markerGap;
      markerDistance < sampledPathLength;
      markerDistance += markerGap
    ) {
      const sampleIndex = routeSamples.findIndex((sample) => sample.distance >= markerDistance);
      const after = routeSamples[Math.max(sampleIndex, 0)];
      const before = routeSamples[Math.max(sampleIndex - 1, 0)];
      const segmentDistance = after.distance - before.distance;
      const segmentProgress = segmentDistance > 0
        ? (markerDistance - before.distance) / segmentDistance
        : 0;
      markers.push({
        id: miniGameItemIdRef.current++,
        x: before.point.x + (after.point.x - before.point.x) * segmentProgress,
        y: before.point.y + (after.point.y - before.point.y) * segmentProgress,
        angle: (before.angle + (after.angle - before.angle) * segmentProgress) * 180 / Math.PI,
        distanceAlong: markerDistance,
      });
    }
    routeMarkerDistancesRef.current = markers.map((marker) => marker.distanceAlong);
    nextRouteMarkerRef.current = 0;
    setRouteMarkers(markers);
    const initialTangent = Math.atan2(
      routeControlRef.current.y - start.y,
      routeControlRef.current.x - start.x,
    );
    lastPrintPositionRef.current = start;
    setPawPrints((prints) => [
      ...prints,
      {
        id: miniGameItemIdRef.current++,
        x: start.x,
        y: start.y,
        angle: (initialTangent * 180) / Math.PI,
      },
    ].slice(-maxPawPrints));
    setActiveX(returningToHouse ? null : target);
    const speed = window.matchMedia('(min-width: 768px)').matches
      ? desktopDogSpeed
      : mobileDogSpeed;

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
        dogScaleRef.current = destination.x < current.x ? -1 : 1;
        dog.style.transform =
          `translate(-50%, -50%) translate(${destination.x}px, ${destination.y}px) scaleX(${dogScaleRef.current})`;
        if (runningSpriteRef.current) runningSpriteRef.current.style.transform = '';
        animationFrameRef.current = null;
        targetPositionRef.current = null;
        setActiveX(null);
        if (!returningToHouse) {
          playHomeBark();
          setPastChests((chests) => [
            ...chests,
            { ...destination, id: miniGameItemIdRef.current++ },
          ]);
          const arrival = destination;
          settleTimerRef.current = window.setTimeout(() => {
            settleTimerRef.current = null;
            const currentLobby = lobbyRef.current;
            if (!currentLobby) return;
            const sitOffset = 84;
            const margin = 52;
            const candidates = [
              { x: arrival.x + sitOffset, y: arrival.y },
              { x: arrival.x - sitOffset, y: arrival.y },
              { x: arrival.x, y: arrival.y - sitOffset },
              { x: arrival.x, y: arrival.y + sitOffset },
            ].map((point) => ({
              x: Math.max(margin, Math.min(currentLobby.clientWidth - margin, point.x)),
              y: Math.max(margin, Math.min(currentLobby.clientHeight - margin, point.y)),
            }));
            const sitPosition = candidates.find(
              (point) => Math.hypot(point.x - arrival.x, point.y - arrival.y) >= sitOffset,
            ) ?? candidates.reduce((farthest, point) =>
              Math.hypot(point.x - arrival.x, point.y - arrival.y)
                > Math.hypot(farthest.x - arrival.x, farthest.y - arrival.y)
                ? point
                : farthest,
            );
            startDogMovement(sitPosition, true);
          }, 1000);
        } else {
          setIsMoving(false);
        }
        return;
      }

      const oldProgress = routeProgressRef.current;
      routeProgressRef.current = Math.min(
        1,
        oldProgress + speed / routeLengthRef.current,
      );
      const t = routeProgressRef.current;
      const distanceTravelled = t * routeLengthRef.current;
      const markersBeforeMovement = nextRouteMarkerRef.current;
      while (
        nextRouteMarkerRef.current < routeMarkerDistancesRef.current.length
        && routeMarkerDistancesRef.current[nextRouteMarkerRef.current] <= distanceTravelled
      ) {
        nextRouteMarkerRef.current += 1;
      }
      if (nextRouteMarkerRef.current > markersBeforeMovement) {
        setRouteMarkers((markers) => markers.map((marker) =>
          marker.distanceAlong <= distanceTravelled ? { ...marker, passed: true } : marker,
        ));
      }
      const inverseT = 1 - t;
      const control = routeControlRef.current;
      const startPoint = routeStartRef.current;
      const next = {
        x: inverseT * inverseT * startPoint.x
          + 2 * inverseT * t * control.x
          + t * t * destination.x,
        y: inverseT * inverseT * startPoint.y
          + 2 * inverseT * t * control.y
          + t * t * destination.y,
      };
      const tangentX = 2 * inverseT * (control.x - startPoint.x)
        + 2 * t * (destination.x - control.x);
      const tangentY = 2 * inverseT * (control.y - startPoint.y)
        + 2 * t * (destination.y - control.y);
      const angle = Math.atan2(tangentY, tangentX);
      dogPositionRef.current = next;
      dogScaleRef.current = destination.x < current.x ? -1 : 1;
      dog.style.transform =
        `translate(-50%, -50%) translate(${next.x}px, ${next.y}px) scaleX(${dogScaleRef.current})`;
      const gaitPhase = routeProgressRef.current * routeLengthRef.current * 0.14;
      const sideJiggle = Math.sin(gaitPhase) * 0.8;
      const verticalBounce = -Math.abs(Math.sin(gaitPhase)) * 1.8;
      if (runningSpriteRef.current) {
        runningSpriteRef.current.style.transform =
          `translate(${sideJiggle}px, ${verticalBounce}px)`;
      }

      const lastPrintPosition = lastPrintPositionRef.current;
      if (
        lastPrintPosition
        && Math.hypot(next.x - lastPrintPosition.x, next.y - lastPrintPosition.y)
          >= pawPrintSpacing
      ) {
        setPawPrints((prints) => [
          ...prints,
          {
            id: miniGameItemIdRef.current++,
            x: next.x,
            y: next.y,
            angle: (angle * 180) / Math.PI,
          },
        ].slice(-maxPawPrints));
        lastPrintPositionRef.current = next;
      }

      animationFrameRef.current = window.requestAnimationFrame(animateDog);
    };

    animationFrameRef.current = window.requestAnimationFrame(animateDog);
  }

  function scheduleIdleReturn() {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = window.setTimeout(() => {
      idleTimerRef.current = null;
      const house = getHousePosition();
      if (!house) return;
      startDogMovement(
        {
          x: house.x + house.width * 0.55 + (Math.random() * 40 - 20),
          y: house.y + house.height * 0.25 + (Math.random() * 30 - 15),
        },
        true,
      );
    }, 10_000);
  }

  function handleLobbyClick(event: ReactMouseEvent<HTMLDivElement>) {
    const lobby = lobbyRef.current;
    if (!lobby) return;
    if (
      event.target instanceof Element
      && event.target.closest('button, input, textarea, select, label, form, a, [data-no-dog-move]')
    ) {
      return;
    }

    const bounds = lobby.getBoundingClientRect();
    const target = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };

    scheduleIdleReturn();
    startDogMovement(target);
  }

  function renderInkMiniGame(includeDog = true) {
    return (
      <>
        {routeMarkers.map((marker) => (
          <img
            key={marker.id}
            src={routeMarker}
            alt=""
            aria-hidden="true"
            onTransitionEnd={(event) => {
              if (marker.passed && event.propertyName === 'opacity') {
                setRouteMarkers((markers) => markers.filter((item) => item.id !== marker.id));
              }
            }}
            className={`pointer-events-none absolute z-0 h-4 w-4 select-none object-contain mix-blend-multiply transition-opacity duration-1500 ${marker.passed ? 'opacity-0' : 'opacity-50'}`}
            style={{
              left: marker.x,
              top: marker.y,
              transform: `translate(-50%, -50%) rotate(${marker.angle + 90}deg)`,
            }}
          />
        ))}

        {pastChests.map((chest) => (
          <img
            key={chest.id}
            src={treasureChest}
            alt=""
            aria-hidden="true"
            onAnimationEnd={() =>
              setPastChests((chests) => chests.filter((item) => item.id !== chest.id))
            }
            className="animate-fade-out-print pointer-events-none absolute z-10 h-20 w-20 select-none object-contain mix-blend-darken"
            style={{
              left: chest.x,
              top: chest.y,
              transform: 'translate(-50%, -50%)',
            }}
          />
        ))}

        {pawPrints.map((paw) => (
          <img
            key={paw.id}
            src={inkPaw}
            alt=""
            aria-hidden="true"
            onAnimationEnd={() =>
              setPawPrints((prints) => prints.filter((print) => print.id !== paw.id))
            }
            className="animate-fade-out-print pointer-events-none absolute z-0 h-8 w-8 select-none object-contain mix-blend-darken"
            style={{
              left: paw.x,
              top: paw.y,
              transform: `translate(-50%, -50%) rotate(${paw.angle}deg)`,
            }}
          />
        ))}

        {activeX && (
          <img
            src={xMarksTheSpot}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute z-10 h-24 w-24 select-none object-contain mix-blend-darken md:h-28 md:w-28"
            style={{
              left: activeX.x,
              top: activeX.y,
              transform: 'translate(-50%, -50%)',
            }}
          />
        )}

        {includeDog && renderInkDog()}
      </>
    );
  }

  function renderInkDog() {
    return (
        <div
          ref={dogRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 z-10 h-48 w-48"
          style={{
            transform: `translate(-50%, -50%) translate(${dogPositionRef.current.x}px, ${dogPositionRef.current.y}px) scaleX(${dogScaleRef.current})`,
          }}
        >
          <img
            ref={runningSpriteRef}
            src={inkRunning}
            alt=""
            className={`absolute inset-0 h-full w-full select-none object-contain transition-opacity duration-200 ${isMoving ? 'opacity-100' : 'opacity-0'}`}
            style={{ willChange: 'transform' }}
          />
          <img
            src={inkSitting}
            alt=""
            className={`absolute left-1/2 top-1/2 h-[104px] w-[104px] -translate-x-1/2 -translate-y-1/2 select-none object-contain mix-blend-multiply transition-opacity duration-200 ${isMoving ? 'opacity-0' : 'opacity-100'}`}
          />
        </div>
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
        onPointerDown={enableHomeBarks}
        className="relative h-dvh min-h-[100dvh] w-full overflow-hidden bg-spotle-cream font-pixel text-spotle-navy"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 isolate overflow-hidden"
        >
          <div
            className="absolute inset-0 bg-repeat opacity-[0.15]"
            style={{ backgroundImage: `url(${grassTexture})`, backgroundSize: '176px 176px' }}
          />
          <img
            ref={desktopHouseRef}
            src={inkHouse}
            alt=""
            aria-hidden="true"
            onLoad={initializeDogNearHouse}
            className="absolute bottom-6 left-6 z-10 hidden h-auto w-96 select-none object-contain mix-blend-multiply md:block md:w-[432px]"
          />
          <img
            ref={mobileHouseRef}
            src={inkHouse}
            alt=""
            aria-hidden="true"
            onLoad={initializeDogNearHouse}
            className="absolute left-1/2 top-3 z-10 h-auto w-72 -translate-x-1/2 select-none object-contain mix-blend-multiply md:hidden"
          />
          {renderInkMiniGame(false)}
        </div>
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60]">
          {renderInkDog()}
        </div>
        <main data-lobby-ui className="relative z-50 mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col items-center justify-center gap-3 px-4 py-2 pt-36 text-center sm:gap-8 sm:p-6 sm:pt-6">
          <section className="flex w-full flex-col items-center gap-3 sm:gap-6" aria-live="polite">
            <div className="flex w-full max-w-sm flex-col items-center gap-3 sm:gap-5">
              <img src={spotleLogo} alt="Spotle" className="relative top-2 w-full max-w-md" />
              <label className="w-full text-center text-lg sm:text-xl">
                Your Name
                <input
                  type="text"
                  value={playerName}
                  onChange={(event) => setPlayerName(event.target.value)}
                  placeholder="Enter your name"
                  className="mt-2 block w-full rounded-[2rem] border-4 border-spotle-navy bg-spotle-navy px-6 py-4 text-center text-xl leading-7 text-spotle-coral placeholder:text-spotle-cream/70 focus:outline-4 focus:outline-spotle-navy"
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

        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          aria-label="Open settings and credits"
          className="fixed left-4 top-4 z-[60] flex h-14 w-14 items-center justify-center rounded-full border-4 border-spotle-navy bg-spotle-coral text-spotle-navy shadow-lg transition-transform active:scale-95 md:bottom-6 md:left-auto md:right-6 md:top-auto md:h-16 md:w-16"
        >
          <Settings aria-hidden="true" className="h-7 w-7 md:h-8 md:w-8" />
        </button>

        {isSettingsOpen && (
          <div
            data-no-dog-move
            className="fixed inset-0 z-[70] flex items-center justify-center bg-spotle-navy/70 p-4 backdrop-blur-sm"
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="settings-title"
              className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-[2rem] border-4 border-spotle-navy bg-spotle-cream p-5 text-spotle-navy shadow-2xl sm:p-8"
            >
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                aria-label="Close settings"
                className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full border-2 border-spotle-navy bg-spotle-coral transition-transform active:scale-95"
              >
                <X aria-hidden="true" className="h-6 w-6" />
              </button>
              <h2 id="settings-title" className="pr-12 text-2xl sm:text-3xl">Settings & Credits</h2>

              <div className="mt-6 space-y-3">
                <button
                  type="button"
                  aria-pressed={soundEffectsMuted}
                  onClick={() => setSoundEffectsMuted((muted) => !muted)}
                  className="flex w-full items-center justify-between gap-4 rounded-2xl border-2 border-spotle-navy bg-white/60 p-4 text-left transition-colors hover:bg-white"
                >
                  <span className="flex items-center gap-3 text-base sm:text-lg">
                    {soundEffectsMuted
                      ? <VolumeX aria-hidden="true" className="h-6 w-6 shrink-0" />
                      : <Volume2 aria-hidden="true" className="h-6 w-6 shrink-0" />}
                    Sound effects
                  </span>
                  <span className="text-sm">{soundEffectsMuted ? 'Muted' : 'On'}</span>
                </button>
                <button
                  type="button"
                  aria-pressed={voiceChatMuted}
                  onClick={() => setVoiceChatMuted((muted) => !muted)}
                  className="flex w-full items-center justify-between gap-4 rounded-2xl border-2 border-spotle-navy bg-white/60 p-4 text-left transition-colors hover:bg-white"
                >
                  <span className="flex items-center gap-3 text-base sm:text-lg">
                    {voiceChatMuted
                      ? <MicOff aria-hidden="true" className="h-6 w-6 shrink-0" />
                      : <Mic aria-hidden="true" className="h-6 w-6 shrink-0" />}
                    Voice chat
                  </span>
                  <span className="text-sm">{voiceChatMuted ? 'Muted' : 'On'}</span>
                </button>
              </div>

              <div className="mt-7 border-t-2 border-spotle-navy/15 pt-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-xl">Made at SwampHacks XII</h3>
                    <p className="mt-2 text-sm leading-relaxed text-spotle-navy/75 sm:text-base">
                      Built by four UF sophomores with Gator spirit.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsHornsDownOpen(true)}
                    aria-label="Show the Gator horns-down photo"
                    className="shrink-0 rounded-xl p-1 transition-transform active:scale-95"
                  >
                    <img src={gatorLogo} alt="Florida Gators logo — click for a surprise" className="h-16 w-16 object-contain sm:h-20 sm:w-20" />
                  </button>
                </div>
                <ul className="mt-5 grid grid-cols-2 gap-2 text-sm sm:text-base">
                  {['Alexander Schunko', 'Angel Reyes', 'Jayden Valera', 'Mason Levy'].map((name) => (
                    <li key={name} className="rounded-xl bg-spotle-navy/5 px-3 py-2">{name}</li>
                  ))}
                </ul>
                <p className="mt-5 text-center text-lg text-spotle-coral">Go Gators!</p>
              </div>
            </section>
          </div>
        )}

        {isHornsDownOpen && (
          <div
            data-no-dog-move
            className="fixed inset-0 z-[80] flex items-center justify-center bg-spotle-navy/85 p-4 backdrop-blur-sm"
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-label="Horns-down Gator surprise"
              className="relative w-full max-w-xl rounded-2xl border-4 border-spotle-cream bg-spotle-cream p-3 shadow-2xl"
            >
              <button
                type="button"
                onClick={() => setIsHornsDownOpen(false)}
                aria-label="Close photo"
                className="absolute -right-3 -top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full border-2 border-spotle-navy bg-spotle-coral text-spotle-navy"
              >
                <X aria-hidden="true" className="h-6 w-6" />
              </button>
              <img
                src={hornsDownImage}
                alt="A playful horns-down photo from the SwampHacks team"
                className="max-h-[80dvh] w-full rounded-xl object-contain"
              />
            </section>
          </div>
        )}

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
        className="relative min-h-screen overflow-hidden bg-spotle-cream font-pixel text-spotle-navy"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        >
          <div
            className="absolute inset-0 bg-repeat opacity-[0.15]"
            style={{ backgroundImage: `url(${grassTexture})`, backgroundSize: '176px 176px' }}
          />
        </div>
        <main data-lobby-ui className="relative z-50 mx-auto flex h-[100dvh] w-full max-w-3xl flex-col items-center justify-center overflow-hidden p-3 text-center sm:h-auto sm:min-h-screen sm:overflow-visible sm:p-6">
          <div className="flex h-full w-[min(92vw,28rem)] flex-col items-center justify-center gap-2 py-2 sm:h-auto sm:gap-5 sm:py-4">
            <p className="shrink-0 rounded-full border-4 border-spotle-cream bg-spotle-navy px-6 py-2 text-xl text-spotle-coral sm:px-8 sm:py-4 sm:text-2xl">
              PIN: {room!.roomCode}
            </p>
            {/* The grid is the only flexible row: it gives up height first so
                the PIN and the buttons always stay on screen. Capped at its own
                width so tiles stay square on roomy screens. */}
            <ul className="grid min-h-0 w-full flex-1 max-h-[min(92vw,28rem)] grid-cols-[repeat(2,minmax(0,1fr))] grid-rows-2 place-items-center gap-2 sm:max-h-none sm:flex-none sm:gap-3">
              {Array.from({ length: maxPlayers }, (_, index) => {
                const player = players[index];
                return (
                  <li
                    key={player?.id ?? `empty-${index}`}
                    className="aspect-square h-full w-auto max-w-full min-h-0 min-w-0 overflow-hidden break-words rounded-[1.5rem] border-4 border-spotle-cream bg-spotle-navy text-center text-base text-spotle-coral sm:h-auto sm:w-full sm:max-w-none sm:rounded-[2rem] sm:text-lg"
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
                        isLocal={player.id === game.playerId}
                        micEnabled={webrtc.micActive}
                        onToggleMic={
                          player.id === game.playerId && webrtc.micAvailable && !voiceChatMuted
                            ? webrtc.toggleMic
                            : undefined
                        }
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
              <p className="shrink-0 text-sm text-red-700 sm:text-base">{webrtc.error}</p>
            )}
            <p className="shrink-0 text-sm text-spotle-navy/70 sm:text-base">
              {webrtc.cameraReady ? 'Camera ready' : 'Starting camera…'}
            </p>
            {webrtc.cameraReady && !webrtc.micAvailable && (
              /* In-app browsers (the Google app, Instagram, etc.) block the
                 mic outright and give no permission prompt to change. The
                 only fix is opening the site in a real browser. */
              <p className="shrink-0 px-2 text-sm leading-tight text-red-700">
                No microphone — voice chat is off. If you opened this from
                another app, tap ⋯ and choose “Open in Safari” or “Open in
                Chrome”.
              </p>
            )}

            {isHost ? (
              <button
                type="button"
                onClick={game.startGame}
                disabled={players.length < (isPlayerHuntMode(room!.settings.mode) ? 2 : 1)}
                className={`${lobbyButtonClass} relative z-50`}
              >
                START GAME
              </button>
            ) : (
              <p className="shrink-0 text-base sm:text-xl">Waiting for the host to start…</p>
            )}
            <div className="grid w-full grid-cols-3 gap-1 sm:gap-2">
              {(['OBJECTS', 'ME', 'HIDE_N_SEEK'] as GameMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => game.setMode(mode)}
                  disabled={!isHost}
                  aria-pressed={room!.settings.mode === mode}
                  className={`${lobbyButtonClass} px-1 text-xs sm:px-3 sm:text-base ${room!.settings.mode === mode ? 'bg-spotle-coral text-spotle-navy disabled:opacity-100' : ''} relative z-50`}
                >
                  {mode === 'OBJECTS' ? 'CLASSIC' : mode === 'ME' ? 'ASSASSIN' : 'HIDE N SEEK'}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setIsThemeModalOpen(true)}
              disabled={isPlayerHuntMode(room!.settings.mode)}
              className={`${lobbyButtonClass} relative z-50`}
            >
              {isPlayerHuntMode(room!.settings.mode) ? 'Player Hunt' : getTheme(room!.settings.theme)?.name ?? 'Themes'}
            </button>
            {isPlayerHuntMode(room!.settings.mode) && (
              <p className="shrink-0 text-sm text-spotle-navy/70">
                Players will hunt each other! Selfies are required before the round starts.
              </p>
            )}
            <button type="button" onClick={leaveGame} className={`${lobbyButtonClass} relative z-50`}>
              Leave
            </button>

            {isThemeModalOpen && (
              <ThemePicker
                selected={room!.settings.theme}
                onSelect={game.setTheme}
                onClose={() => setIsThemeModalOpen(false)}
              />
            )}
          </div>
        </main>
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60]">
          {renderInkDog()}
        </div>
      </div>
    );
  }

  if (room!.status === 'SELFIE_REGISTRATION') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-spotle-cream p-6 text-center font-pixel text-spotle-navy">
        <h1 className="text-3xl">Register Your Face</h1>
        <p className="max-w-lg text-base">Take a live selfie so the referee can verify player hunts. Your image stays private to the game server.</p>
        <div className="relative aspect-square w-full max-w-sm overflow-hidden rounded-[1.5rem] border-4 border-spotle-navy bg-spotle-navy">
          {webrtc.localStream ? (
            <video
              ref={webrtc.localVideoRef}
              autoPlay
              muted
              playsInline
              aria-label="Selfie camera preview"
              className={`h-full w-full object-cover ${webrtc.facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center p-3 text-center text-spotle-coral">
              Starting camera…
            </div>
          )}
          <p className="absolute inset-x-0 bottom-0 truncate bg-spotle-navy/80 px-2 py-1 text-center text-sm text-spotle-coral">
            {me?.name ?? 'You'}
          </p>
        </div>
        {webrtc.error && <p className="text-sm text-red-700">{webrtc.error}</p>}
        {game.error && <p className="text-sm text-red-700">{game.error}</p>}
        {me?.selfieReady ? (
          <p className="text-lg">Selfie registered. Waiting for the other players…</p>
        ) : (
          <button
            type="button"
            disabled={!webrtc.cameraReady}
            onClick={() => {
              try {
                game.submitSelfie(webrtc.captureJpeg({ maxWidth: 400, quality: 0.7 }));
            } catch (error) {
                setCaptureError(error instanceof Error ? error.message : 'Could not capture a selfie.');
              }
            }}
            className={arcadeButtonClass}
          >
            TAKE REFERENCE SELFIE
          </button>
        )}
        {captureError && <p className="text-sm text-red-700">{captureError}</p>}
        <p className="text-sm">{players.filter((player) => player.selfieReady).length} / {players.length} ready</p>
      </main>
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
      micEnabled={webrtc.micActive}
      onToggleMic={webrtc.micAvailable && !voiceChatMuted ? webrtc.toggleMic : undefined}
      onFoundIt={handleFoundIt}
      onGiveUp={handleGiveUp}
    />
  );
}

/* ==================================================================== */

function PlayerTile({
  player,
  isLocal,
  micEnabled,
  onToggleMic,
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
  micEnabled?: boolean;
  onToggleMic?: () => void;
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
          // Muted on purpose: voice is played by useWebRTC's dedicated audio
          // elements so it survives view changes and mobile autoplay rules.
          muted
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

      {isLocal ? (
        <button
          type="button"
          onClick={onToggleMic}
          disabled={!onToggleMic}
          aria-pressed={!micEnabled}
          aria-label={
            !onToggleMic
              ? 'Microphone off - voice chat is disabled in Settings'
              : micEnabled
                ? 'Mute your microphone'
                : 'Unmute your microphone'
          }
          title={
            !onToggleMic
              ? 'Voice chat is off in Settings'
              : micEnabled
                ? 'Click to mute your mic'
                : 'Click to unmute your mic'
          }
          className={`absolute top-2 z-20 flex max-w-[calc(100%-1rem)] items-center gap-2 truncate rounded-full border-2 border-spotle-cream bg-spotle-coral px-4 py-2 text-xl text-spotle-navy transition-transform active:scale-95 md:text-2xl ${
            nameOnRight ? 'right-2' : 'left-2'
          }`}
        >
          {micEnabled ? (
            <Mic aria-hidden="true" className="h-5 w-5 shrink-0 md:h-6 md:w-6" />
          ) : (
            <MicOff aria-hidden="true" className="h-5 w-5 shrink-0 text-red-700 md:h-6 md:w-6" />
          )}
          <span className="truncate">You</span>
        </button>
      ) : (
        <p className={`absolute top-2 z-20 max-w-[calc(100%-1rem)] truncate rounded-full border-2 border-spotle-cream bg-spotle-coral px-4 py-2 text-xl text-spotle-navy md:text-2xl ${
          nameOnRight ? 'right-2 text-right' : 'left-2 text-left'
        }`}>
          {isLocal ? 'You' : player.name}
        </p>
      )}

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

function TargetBadge({ round, playerCount }: { round: RoundData; playerCount: number }) {
  const isPlayerHunt = isPlayerHuntMode(round.mode);
  const targetName = isPlayerHunt
    ? round.targetObject.replace(/^Hunt\s+/i, '').replace(/!$/, '')
    : round.targetObject;
  const positionClass = playerCount === 1
    ? 'right-4 top-4'
    : playerCount === 2
      ? 'bottom-[9rem] left-1/2 -translate-x-1/2'
      : 'left-1/2 top-[calc((100dvh-8rem)/2)] -translate-x-1/2 -translate-y-1/2';
  return (
    <div className={`pointer-events-none absolute z-50 w-[min(80vw,13rem)] select-none sm:w-[min(34vw,15rem)] ${positionClass}`}>
      <div className="mx-auto flex flex-col items-center justify-center rounded-2xl bg-spotle-navy/90 px-3 py-3 text-center text-spotle-coral shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-md sm:px-5 sm:py-4">
        <div className="my-1 flex min-h-20 items-center justify-center sm:min-h-24">
          {isPlayerHunt && round.targetPlayerSelfie ? (
            <img
              src={round.targetPlayerSelfie}
              alt={`Target player ${targetName}`}
              className="h-20 w-20 animate-pulse rounded-full object-cover shadow-[0_0_20px_rgba(220,38,38,0.8)] sm:h-24 sm:w-24"
            />
          ) : (
            <EmojiDisplay emoji={round.emoji} name={targetName} />
          )}
        </div>
        <span className="mt-2 text-[10px] font-black uppercase tracking-widest text-spotle-coral sm:text-xs">
          {isPlayerHunt ? 'Hunt Player' : 'Target Item'}
        </span>
        <h2 className="mt-0.5 max-w-full break-words px-2 text-sm font-extrabold leading-snug text-white drop-shadow-sm sm:text-lg">
          {targetName}
        </h2>
      </div>
    </div>
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
  micEnabled,
  onToggleMic,
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
  micEnabled?: boolean;
  onToggleMic?: () => void;
  onFoundIt: () => void;
  onGiveUp: () => void;
}) {
  return (
    <main className="relative h-dvh min-h-[480px] w-full overflow-hidden bg-spotle-cream font-pixel text-spotle-navy">
      <div
        className={`absolute inset-x-0 top-0 grid h-[calc(100dvh-8rem)] min-h-0 gap-0 p-0 ${getGridClass(players.length)}`}
      >
        {Array.from({ length: players.length }, (_, index) => {
          const player = players[index];
          if (!player) return null;
          const isLocal = player.id === localPlayerId;

          return (
            <PlayerTile
              key={player.id}
              player={player}
              isLocal={isLocal}
              micEnabled={micEnabled}
              onToggleMic={isLocal ? onToggleMic : undefined}
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

      {round && <TargetBadge round={round} playerCount={players.length} />}

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
              {countdownNumber > 0 ? countdownNumber : 'GO!'}
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
