/**
 * WebRTC connection settings, served to the browser at /api/rtc-config.
 *
 * Why this is server-side rather than hard-coded in the client:
 *
 *   1. TURN credentials must never be baked into the bundle, and a TURN
 *      server can be swapped on Render without a frontend rebuild.
 *   2. The client needs to know which PeerJS broker to use, and that differs
 *      between localhost, a LAN IP and spotle.ink.
 *
 * Partial mesh failures ("I can see player 2 but not player 3") are almost
 * always one of two things: the signalling broker dropped a message, or the
 * two networks could not find a working ICE path. PeerJS's defaults make both
 * more likely than they need to be - it ships ONE stun server plus a shared
 * public TURN on port 3478 only, with no TLS/443 fallback. Campus and
 * corporate wifi routinely block UDP 3478, and that blocks exactly the pairs
 * that need a relay while leaving the easy pairs working. Hence the symptom.
 *
 * CONFIGURING A REAL TURN SERVER (do this before judging)
 * -------------------------------------------------------
 * Two supported styles, checked in this order:
 *
 *   A. Ephemeral credentials from a provider's REST API - the normal way for
 *      Metered, Twilio and friends. Set ONE variable:
 *
 *        TURN_CREDENTIAL_URL=https://<app>.metered.live/api/v1/turn/credentials?apiKey=<key>
 *
 *      The endpoint must return a JSON array of RTCIceServer objects (that is
 *      exactly what Metered returns). We fetch it, cache it, and hand it to
 *      the client. Nothing secret ever reaches the browser except the
 *      short-lived credential the provider minted for it.
 *
 *   B. Static credentials - for a self-hosted coturn, or any fixed login:
 *
 *        TURN_URLS=turns:turn.example.com:443?transport=tcp,turn:turn.example.com:3478
 *        TURN_USERNAME=spotle
 *        TURN_CREDENTIAL=<secret>
 *
 * Whichever you use, INCLUDE A TLS/443 URL. That is the whole point: it is
 * the one that survives restrictive wifi. Verify it afterwards by opening
 * /rtc-check on a phone on the venue network - it reports whether a `relay`
 * candidate was actually obtained, which is the only thing that matters.
 */

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface RtcConfig {
  iceServers: IceServer[];
  /** Mount path of our own PeerJS broker, or null to use the public cloud. */
  peerPath: string | null;
  /** Where the relay came from, so /rtc-check can say so plainly. */
  turnSource: 'provider-api' | 'static-env' | 'public-fallback';
}

/**
 * Public STUN servers. More than one matters: if the first is unreachable or
 * rate-limited the candidate gathering silently comes back short, and a pair
 * that needed a server-reflexive candidate fails while others succeed.
 */
const STUN_URLS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun.cloudflare.com:3478',
];

/**
 * PeerJS's own public relay - what the app used implicitly before any of
 * this existed. Shared by every PeerJS app in the world, rate-limited
 * accordingly, and offered on port 3478 only with no TLS/443 fallback. It is
 * a last resort, not a plan: configure a real one.
 */
const PUBLIC_FALLBACK_TURN: IceServer = {
  urls: [
    'turn:eu-0.turn.peerjs.com:3478',
    'turn:us-0.turn.peerjs.com:3478',
  ],
  username: 'peerjs',
  credential: 'peerjsp',
};

function envStaticTurn(): IceServer | null {
  const urls = process.env.TURN_URLS?.trim();
  const username = process.env.TURN_USERNAME?.trim();
  const credential = process.env.TURN_CREDENTIAL?.trim();
  if (!urls || !username || !credential) return null;
  const list = urls.split(',').map((url) => url.trim()).filter(Boolean);
  if (list.length === 0) return null;
  return { urls: list, username, credential };
}

/* ------------------------------------------------------------------ */
/* Provider-issued ephemeral credentials                               */
/* ------------------------------------------------------------------ */

interface CachedTurn {
  servers: IceServer[];
  fetchedAt: number;
}

let cache: CachedTurn | null = null;
let inFlight: Promise<IceServer[] | null> | null = null;

/**
 * Providers mint short-lived credentials, so refetch periodically. Ten
 * minutes is well inside every provider's TTL and keeps the request rate
 * trivial even with a room full of players reloading.
 */
const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 4000;

function looksLikeIceServer(value: unknown): value is IceServer {
  if (typeof value !== 'object' || value === null) return false;
  const urls = (value as { urls?: unknown }).urls;
  return typeof urls === 'string' || (Array.isArray(urls) && urls.every((u) => typeof u === 'string'));
}

/**
 * Fetches ICE servers from the provider's API.
 *
 * Never throws and never blocks startup: if the provider is slow or down we
 * fall back to the public relay rather than leaving players with no relay at
 * all. A stale cache is preferred over a failed fetch for the same reason.
 */
async function fetchProviderTurn(url: string): Promise<IceServer[] | null> {
  const fresh = cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS;
  if (fresh) return cache!.servers;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const body: unknown = await res.json();
      // Metered returns a bare array; others wrap it in { iceServers: [...] }.
      const raw = Array.isArray(body)
        ? body
        : (body as { iceServers?: unknown }).iceServers;
      const servers = Array.isArray(raw) ? raw.filter(looksLikeIceServer) : [];
      if (servers.length === 0) throw new Error('no usable iceServers in response');

      cache = { servers, fetchedAt: Date.now() };
      return servers;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`[rtc] TURN_CREDENTIAL_URL fetch failed (${reason}); using ${cache ? 'stale cache' : 'public fallback'}.`);
      return cache?.servers ?? null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export async function getRtcConfig(): Promise<RtcConfig> {
  const iceServers: IceServer[] = [{ urls: STUN_URLS }];
  let turnSource: RtcConfig['turnSource'] = 'public-fallback';

  const providerUrl = process.env.TURN_CREDENTIAL_URL?.trim();
  const staticTurn = envStaticTurn();

  if (providerUrl) {
    const provided = await fetchProviderTurn(providerUrl);
    if (provided) {
      iceServers.push(...provided);
      turnSource = 'provider-api';
    } else {
      iceServers.push(PUBLIC_FALLBACK_TURN);
    }
  } else if (staticTurn) {
    iceServers.push(staticTurn);
    turnSource = 'static-env';
  } else {
    iceServers.push(PUBLIC_FALLBACK_TURN);
  }

  return {
    iceServers,
    peerPath: process.env.SPOTLE_DISABLE_PEER_SERVER === '1' ? null : '/peerjs',
    turnSource,
  };
}

/** Logged at boot so the team can see which relay the live site is using. */
export function describeRtcConfig(): string {
  if (process.env.TURN_CREDENTIAL_URL?.trim()) {
    return '  TURN relay      : provider API (TURN_CREDENTIAL_URL) - verify with /rtc-check';
  }
  const staticTurn = envStaticTurn();
  if (staticTurn) {
    const urls = Array.isArray(staticTurn.urls) ? staticTurn.urls : [staticTurn.urls];
    const hasTls = urls.some((url) => url.startsWith('turns:') || url.includes(':443'));
    return hasTls
      ? '  TURN relay      : dedicated, static credentials (TLS/443 present) - verify with /rtc-check'
      : '  TURN relay      : dedicated, static credentials - WARNING: no TLS/443 url, restrictive wifi will still block some pairs';
  }
  return '  TURN relay      : PeerJS public (shared, rate-limited, no TLS/443) - set TURN_CREDENTIAL_URL or TURN_URLS before judging';
}
