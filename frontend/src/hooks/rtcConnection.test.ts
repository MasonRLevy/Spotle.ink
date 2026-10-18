/**
 * Tests for the WebRTC dial/glare/retry policy.
 *
 * These are the paths that a happy-path browser run never reaches: a mesh on
 * one machine always connects first time, which is exactly why the partial
 * mesh bug survived so long. Testing the rules directly covers the collision
 * and failure cases without needing a second machine or a flaky network.
 *
 * Run with: npm run test:rtc
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluatePair,
  shouldDialOnSight,
  shouldKeepCall,
  MAX_DIAL_ATTEMPTS,
  MEDIA_TIMEOUT_MS,
  POLITE_WAIT_MS,
} from './rtcConnection.js';

const A = 'aaaa-1111';
const B = 'zzzz-9999';

test('exactly one side dials on sight, so the common case never collides', () => {
  assert.equal(shouldDialOnSight(A, B), true);
  assert.equal(shouldDialOnSight(B, A), false);
});

test('glare resolves to the same winner on both ends', () => {
  // A dialled B and B dialled A. A sees its own outgoing call plus an
  // incoming one; B sees the mirror image. Both must keep the SAME
  // connection, otherwise each ends up bound to a different PeerConnection
  // and at least one tile stays black.
  const aKeepsItsOutgoing = shouldKeepCall('outgoing', A, B);
  const aKeepsTheIncoming = shouldKeepCall('incoming', A, B);
  const bKeepsItsOutgoing = shouldKeepCall('outgoing', B, A);
  const bKeepsTheIncoming = shouldKeepCall('incoming', B, A);

  // Each side keeps exactly one of the two.
  assert.notEqual(aKeepsItsOutgoing, aKeepsTheIncoming);
  assert.notEqual(bKeepsItsOutgoing, bKeepsTheIncoming);

  // And they agree: the surviving call is the one A dialled.
  assert.equal(aKeepsItsOutgoing, true, 'A keeps the call it dialled');
  assert.equal(bKeepsTheIncoming, true, 'B keeps the call A dialled');
});

test('glare resolution is symmetric for every id ordering', () => {
  const ids = ['a', 'b', 'm', 'z', 'aa', 'zz', '0', '9'];
  for (const x of ids) {
    for (const y of ids) {
      if (x === y) continue;
      // x keeps its outgoing <=> y keeps the incoming from x.
      assert.equal(
        shouldKeepCall('outgoing', x, y),
        shouldKeepCall('incoming', y, x),
        `disagreement between ${x} and ${y}`,
      );
      // Exactly one connection survives the pair.
      assert.notEqual(
        shouldKeepCall('outgoing', x, y),
        shouldKeepCall('outgoing', y, x),
      );
    }
  }
});

const base = {
  now: 100_000,
  localPeerId: A,
  remotePeerId: B,
  knownSince: 100_000,
  tracked: null as { origin: 'outgoing' | 'incoming'; startedAt: number } | null,
  hasLiveMedia: false,
  iceState: null as string | null,
  attempts: 0,
};

test('a live pair is left alone', () => {
  const result = evaluatePair({
    ...base,
    tracked: { origin: 'outgoing', startedAt: 0 },
    hasLiveMedia: true,
    iceState: 'connected',
  });
  assert.equal(result.action, 'wait');
  assert.equal(result.reason, 'live');
});

test('the smaller id dials immediately', () => {
  const result = evaluatePair(base);
  assert.equal(result.action, 'dial');
  assert.equal(result.reason, 'first-dial');
});

test('the larger id waits, then dials anyway', () => {
  const waiting = evaluatePair({ ...base, localPeerId: B, remotePeerId: A });
  assert.equal(waiting.action, 'wait');
  assert.equal(waiting.reason, 'polite-wait');

  // This is the case that used to be unrecoverable: the first dial never
  // arrived, so without this the pair stayed dark for the whole game.
  const elapsed = evaluatePair({
    ...base,
    localPeerId: B,
    remotePeerId: A,
    now: base.knownSince + POLITE_WAIT_MS,
  });
  assert.equal(elapsed.action, 'dial');
  assert.equal(elapsed.reason, 'polite-wait-elapsed');
});

test('ICE failure triggers a re-dial instead of a dead pair', () => {
  const result = evaluatePair({
    ...base,
    tracked: { origin: 'outgoing', startedAt: base.now - 1000 },
    iceState: 'failed',
  });
  assert.equal(result.action, 'redial');
  assert.equal(result.reason, 'ice-failed');
});

test('ICE failure wins even when media was flowing a moment ago', () => {
  const result = evaluatePair({
    ...base,
    tracked: { origin: 'outgoing', startedAt: base.now - 1000 },
    hasLiveMedia: true,
    iceState: 'failed',
  });
  assert.equal(result.action, 'redial');
});

test('a call that never delivers media is re-dialled', () => {
  const connecting = evaluatePair({
    ...base,
    tracked: { origin: 'outgoing', startedAt: base.now - 1000 },
    iceState: 'checking',
  });
  assert.equal(connecting.action, 'wait');
  assert.equal(connecting.reason, 'connecting');

  const stalled = evaluatePair({
    ...base,
    tracked: { origin: 'outgoing', startedAt: base.now - MEDIA_TIMEOUT_MS },
    iceState: 'checking',
  });
  assert.equal(stalled.action, 'redial');
  assert.equal(stalled.reason, 'media-timeout');
});

test('retrying is bounded so a hopeless pair cannot spin forever', () => {
  const result = evaluatePair({
    ...base,
    tracked: { origin: 'outgoing', startedAt: base.now - MEDIA_TIMEOUT_MS },
    iceState: 'failed',
    attempts: MAX_DIAL_ATTEMPTS,
  });
  assert.equal(result.action, 'wait');
  assert.equal(result.reason, 'exhausted');
});

test('a stalled pair recovers within the retry budget', () => {
  // Walk the watchdog forward over a pair whose dials keep failing, and
  // check it keeps trying (rather than giving up after one go, which is what
  // the old single-attempt handshake did) and then settles once media lands.
  let attempts = 0;
  let now = base.now;
  let tracked: { origin: 'outgoing' | 'incoming'; startedAt: number } | null = null;
  let dials = 0;

  for (let tick = 0; tick < 40; tick += 1) {
    const { action } = evaluatePair({
      ...base,
      now,
      knownSince: base.now,
      tracked,
      hasLiveMedia: false,
      iceState: tracked ? 'checking' : null,
      attempts,
    });
    if (action === 'dial' || action === 'redial') {
      dials += 1;
      attempts += 1;
      tracked = { origin: 'outgoing', startedAt: now };
    }
    now += 3000;
  }

  assert.ok(dials > 1, `expected repeated dials, got ${dials}`);
  assert.equal(dials, MAX_DIAL_ATTEMPTS, 'should use exactly the retry budget');

  // Once media arrives the watchdog stops touching it.
  const settled = evaluatePair({
    ...base,
    now,
    tracked,
    hasLiveMedia: true,
    iceState: 'connected',
    attempts,
  });
  assert.equal(settled.action, 'wait');
});
