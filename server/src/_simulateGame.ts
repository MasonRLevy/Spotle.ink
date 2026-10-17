/**
 * Dev-only end-to-end game simulation.
 *
 * Drives the real server over real Socket.io with real photos, so the whole
 * loop can be exercised without four phones and four cameras:
 *   create room -> join -> start -> round -> Gemini verdicts -> placement
 *   scoring -> round end -> scoreboard.
 *
 * Run the server with a pinned target so the fixtures match, then run this:
 *   SPOTLE_FORCE_TARGET=hammer npm start
 *   npm run simulate
 *
 * Fixtures come from gemini-referee/testdata (npm run test:referee:fixtures).
 */
import fs from 'node:fs';
import path from 'node:path';
import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  JoinAck,
  RoomState,
  RoundData,
  ServerToClientEvents,
  VerdictEvent,
} from '../../shared/game.js';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const URL = process.env.SPOTLE_URL || 'http://localhost:3001';
const FIXTURES = path.resolve(import.meta.dirname, '..', 'gemini-referee', 'testdata');

function dataUrl(file: string): string {
  const bytes = fs.readFileSync(path.join(FIXTURES, file));
  const mime = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

function connect(): Promise<GameSocket> {
  return new Promise((resolve, reject) => {
    const socket: GameSocket = io(URL, { transports: ['websocket'] });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`\n  Spotle game simulation -> ${URL}\n`);

  const host = await connect();
  const guest = await connect();

  const verdicts: VerdictEvent[] = [];
  let finalRoom: RoomState | null = null;
  let roundStarted: RoundData | null = null;
  let roundEnded = false;

  for (const [label, socket] of [['Mason', host], ['Riley', guest]] as const) {
    socket.on('round:verdict', (v) => {
      if (socket !== host) return; // log once
      verdicts.push(v);
      const tag = v.verdict.verified
        ? `ACCEPTED  place #${v.placement}  +${v.pointsAwarded}pts  ${v.reactionMs}ms`
        : `REJECTED  ${v.verdict.matchQuality}${v.verdict.isScreenCheat ? ' (SCREEN CHEAT)' : ''}`;
      console.log(`  [verdict] ${v.playerName.padEnd(6)} ${tag}`);
      console.log(`            "${v.verdict.commentary}"`);
    });
    socket.on('room:update', (room) => {
      if (socket === host) finalRoom = room;
    });
    void label;
  }
  host.on('round:start', (r) => {
    roundStarted = r;
    console.log(`  [round]   #${r.roundNumber} target = "${r.targetObject}" (${r.difficulty})`);
  });
  host.on('round:end', (e) => {
    roundEnded = true;
    console.log(`  [round]   ended, finishers in order: ${e.finishers.length}`);
  });

  // 1. Host creates, guest joins.
  const created: JoinAck = await new Promise((res) =>
    host.emit('room:create', { name: 'Mason' }, res),
  );
  if (!created.ok || !created.room) throw new Error(created.error ?? 'create failed');
  const pin = created.room.roomCode;
  console.log(`  [room]    created PIN ${pin}`);

  const joined: JoinAck = await new Promise((res) =>
    guest.emit('room:join', { pin, name: 'Riley' }, res),
  );
  if (!joined.ok) throw new Error(joined.error ?? 'join failed');
  console.log(`  [room]    Riley joined (${Object.keys(joined.room!.players).length} players)\n`);

  // 2. Start the game and wait out the countdown.
  host.emit('game:start');
  for (let i = 0; i < 60 && !roundStarted; i += 1) await wait(250);
  if (!roundStarted) throw new Error('round never started');

  // 3. A wrong answer first (wrench vs hammer) - should be REJECTED.
  console.log('\n  -- Riley submits a wrench (expect rejection + cooldown) --');
  guest.emit('round:attempt', { imageDataUrl: dataUrl('wrench.jpg') });
  await wait(9000);

  // 4. A screen cheat - should be caught.
  console.log('\n  -- Mason photographs a monitor (expect SCREEN CHEAT) --');
  host.emit('round:attempt', { imageDataUrl: dataUrl('screencheat_hammer.png') });
  await wait(10000);

  // 5. Real finds - placement 1 then 2.
  console.log('\n  -- Mason submits the real hammer (expect 1st, +4) --');
  host.emit('round:attempt', { imageDataUrl: dataUrl('hammer.jpg') });
  await wait(9000);

  console.log('\n  -- Riley submits the real hammer (expect 2nd, +3) --');
  guest.emit('round:attempt', { imageDataUrl: dataUrl('hammer.jpg') });
  await wait(12000);

  // 6. Report.
  console.log('\n  ---------------- RESULT ----------------');
  console.log(`  round ended : ${roundEnded}`);
  const room = finalRoom as RoomState | null;
  if (room) {
    console.log(`  status      : ${room.status}`);
    for (const p of Object.values(room.players)) {
      console.log(
        `  ${p.name.padEnd(6)} score=${p.score} placement=${p.placement ?? '-'} status=${p.status}`,
      );
    }
  }

  const accepted = verdicts.filter((v) => v.verdict.verified);
  const cheat = verdicts.filter((v) => v.verdict.isScreenCheat);
  const rejected = verdicts.filter((v) => !v.verdict.verified && !v.verdict.isScreenCheat);

  const checks: Array<[string, boolean]> = [
    ['wrong object rejected', rejected.length >= 1],
    ['screen cheat caught', cheat.length >= 1],
    ['two finds accepted', accepted.length === 2],
    ['placements were 1 then 2', accepted[0]?.placement === 1 && accepted[1]?.placement === 2],
    ['points were 4 then 3', accepted[0]?.pointsAwarded === 4 && accepted[1]?.pointsAwarded === 3],
    ['round ended after all found', roundEnded],
    ['scoreboard reached', room?.status === 'ROUND_RESULT'],
  ];

  console.log('');
  let pass = 0;
  for (const [label, ok] of checks) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
    if (ok) pass += 1;
  }
  console.log(`\n  ${pass}/${checks.length} checks passed\n`);

  host.disconnect();
  guest.disconnect();
  process.exit(pass === checks.length ? 0 : 1);
}

main().catch((err) => {
  console.error('simulation failed:', err);
  process.exit(1);
});
