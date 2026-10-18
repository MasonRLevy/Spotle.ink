/**
 * WebRTC connection policy, kept out of useWebRTC so it can be reasoned
 * about (and unit tested) on its own.
 *
 * The problem this solves: in real multi-device games the mesh connected
 * only partially - player 1 could see player 2 but not player 3. The old
 * handshake was "the smaller peer id calls immediately; the larger waits 2s
 * and then calls anyway". That has two failure modes:
 *
 *   1. GLARE. If the first call had not arrived within 2s (a slow broker is
 *      enough), both sides dial. You then get TWO RTCPeerConnections for the
 *      one pair, and since calls were stored in a Map keyed by peer id, the
 *      second one silently overwrote the first. Whichever connection the UI
 *      ended up bound to might not be the one carrying media - a black tile
 *      with a perfectly healthy-looking connection behind it.
 *
 *   2. NO RECOVERY. One dial was all you got. If it failed - lost signalling
 *      message, ICE failure, the peer not yet registered with the broker -
 *      nothing ever tried again, because the dead entry stayed in the Map and
 *      made every later attempt return early. A single unlucky moment at join
 *      time meant that pair stayed dark for the whole game.
 *
 * The policy below fixes both: duplicates are resolved to the SAME winner on
 * both ends without any negotiation, and a pair with no media is re-dialled
 * on a timer until it works.
 */
import type { MediaConnection } from 'peerjs';

/** How a call came to exist, which is what makes glare resolvable. */
export type CallOrigin = 'outgoing' | 'incoming';

export interface TrackedCall {
  call: MediaConnection;
  origin: CallOrigin;
  startedAt: number;
}

/**
 * Which of two colliding calls both sides should keep.
 *
 * Both ends run this and reach the same answer because it depends only on the
 * two peer ids: the surviving connection is always the one DIALLED BY the
 * peer with the lexicographically smaller id.
 *
 * So if my id sorts first, my outgoing call wins and the incoming one is
 * dropped; on the other machine the mirror image happens. Exactly one
 * connection survives per pair, chosen without a round trip.
 */
export function shouldKeepCall(
  origin: CallOrigin,
  localPeerId: string,
  remotePeerId: string,
): boolean {
  const localDialsWinner = localPeerId.localeCompare(remotePeerId) < 0;
  return origin === 'outgoing' ? localDialsWinner : !localDialsWinner;
}

/**
 * Whether this side should open the first call to a peer.
 *
 * Only the smaller id dials on sight, which keeps the common case to one
 * connection per pair with no collision at all. The larger id does not sit
 * and hope, though - the watchdog below lets it dial once the polite wait has
 * passed, and any resulting collision is resolved by shouldKeepCall.
 */
export function shouldDialOnSight(localPeerId: string, remotePeerId: string): boolean {
  return localPeerId.localeCompare(remotePeerId) < 0;
}

/** Grace period before the larger id dials anyway, in ms. */
export const POLITE_WAIT_MS = 2500;

/** How often the watchdog re-checks every pair, in ms. */
export const WATCHDOG_INTERVAL_MS = 3000;

/**
 * How long a call may sit without delivering media before it is treated as
 * dead and re-dialled. Generous enough to cover TURN allocation on a slow
 * phone network, short enough that a player is not staring at a black tile.
 */
export const MEDIA_TIMEOUT_MS = 8000;

/** Dial this many times in quick succession before backing off. */
export const MAX_DIAL_ATTEMPTS = 8;

/**
 * After burning the quick-retry budget, wait this long and start again.
 *
 * Giving up permanently was wrong. A pair that fails its first 8 attempts -
 * a phone that joined on a bad cell, a late camera permission, a momentary
 * wifi drop - would stay dark for the entire game with no way back, because
 * the attempt counter was only ever reset when somebody left the room. One
 * unlucky device ended up the single player nobody could see, permanently,
 * while everyone else was fine. Backing off and trying again costs one dial
 * every 20s and makes that recoverable.
 */
export const RETRY_COOLDOWN_MS = 20_000;

export type PairState =
  | 'idle'          // nothing tried yet
  | 'dialling'      // a call is open but no media yet
  | 'live'          // media flowing
  | 'retrying'      // previous attempt gave up, about to dial again
  | 'exhausted';    // out of attempts

export interface PairDiagnostics {
  peerId: string;
  state: PairState;
  attempts: number;
  iceState: string | null;
  hasVideo: boolean;
  hasAudio: boolean;
}

/**
 * Decides what to do with one pair on a watchdog tick.
 *
 * Split out as a pure function so the retry rules can be tested without a
 * browser, a broker or a second machine.
 */
export function evaluatePair(input: {
  now: number;
  localPeerId: string;
  remotePeerId: string;
  /** When the roster first told us about this peer. */
  knownSince: number;
  tracked: { origin: CallOrigin; startedAt: number } | null;
  hasLiveMedia: boolean;
  iceState: string | null;
  attempts: number;
  /** When we last dialled this peer, for the back-off below. */
  lastAttemptAt?: number | null;
}): { action: 'wait' | 'dial' | 'redial'; reason: string } {
  const {
    now, localPeerId, remotePeerId, knownSince, tracked, hasLiveMedia, iceState, attempts,
    lastAttemptAt = null,
  } = input;

  if (hasLiveMedia && iceState !== 'failed' && iceState !== 'closed') {
    return { action: 'wait', reason: 'live' };
  }
  if (attempts >= MAX_DIAL_ATTEMPTS) {
    // Backed off rather than given up: once the cooldown passes, start a
    // fresh budget. The caller resets the counter when it sees this reason.
    if (lastAttemptAt !== null && now - lastAttemptAt >= RETRY_COOLDOWN_MS) {
      return { action: 'redial', reason: 'retry-after-cooldown' };
    }
    return { action: 'wait', reason: 'exhausted' };
  }

  // Never dialled. The smaller id goes immediately; the larger one holds off
  // briefly so the common case never collides at all.
  if (!tracked) {
    if (shouldDialOnSight(localPeerId, remotePeerId)) {
      return { action: 'dial', reason: 'first-dial' };
    }
    return now - knownSince >= POLITE_WAIT_MS
      ? { action: 'dial', reason: 'polite-wait-elapsed' }
      : { action: 'wait', reason: 'polite-wait' };
  }

  // A call exists. ICE told us outright that it is dead.
  if (iceState === 'failed' || iceState === 'closed') {
    return { action: 'redial', reason: `ice-${iceState}` };
  }

  // A call exists but has produced nothing for too long. This is the case the
  // old code had no answer for: a lost offer, or a peer that was not yet
  // registered with the broker when we dialled.
  if (now - tracked.startedAt >= MEDIA_TIMEOUT_MS) {
    return { action: 'redial', reason: 'media-timeout' };
  }

  return { action: 'wait', reason: 'connecting' };
}

/** True when a stream is actually carrying something playable. */
export function streamHasLiveTrack(stream: MediaStream, kind: 'audio' | 'video'): boolean {
  const tracks = kind === 'audio' ? stream.getAudioTracks() : stream.getVideoTracks();
  return tracks.some((track) => track.readyState === 'live');
}
