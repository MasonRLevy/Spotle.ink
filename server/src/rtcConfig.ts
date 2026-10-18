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
  /** True when a relay is configured, so the client can report it. */
  hasTurn: boolean;
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
 * PeerJS's own public relay. Shared by every PeerJS app in the world and
 * rate-limited accordingly, so it is a last resort rather than a plan - but
 * it is better than having no relay at all, and it is what the app already
 * relied on implicitly.
 */
const PUBLIC_FALLBACK_TURN: IceServer = {
  urls: [
    'turn:eu-0.turn.peerjs.com:3478',
    'turn:us-0.turn.peerjs.com:3478',
  ],
  username: 'peerjs',
  credential: 'peerjsp',
};

function envTurn(): IceServer | null {
  const urls = process.env.TURN_URLS?.trim();
  const username = process.env.TURN_USERNAME?.trim();
  const credential = process.env.TURN_CREDENTIAL?.trim();
  if (!urls || !username || !credential) return null;
  return {
    urls: urls.split(',').map((url) => url.trim()).filter(Boolean),
    username,
    credential,
  };
}

export function getRtcConfig(): RtcConfig {
  const turn = envTurn();
  const iceServers: IceServer[] = [{ urls: STUN_URLS }];

  if (turn) {
    // A dedicated TURN (e.g. Twilio, Metered, coturn) - include TLS/443 URLs
    // in TURN_URLS so restrictive networks still get a relay.
    iceServers.push(turn);
  } else {
    iceServers.push(PUBLIC_FALLBACK_TURN);
  }

  return {
    iceServers,
    peerPath: process.env.SPOTLE_DISABLE_PEER_SERVER === '1' ? null : '/peerjs',
    hasTurn: true,
  };
}

/** Logged at boot so the team can see which relay the live site is using. */
export function describeRtcConfig(): string {
  return envTurn()
    ? '  TURN relay      : dedicated (TURN_URLS set)'
    : '  TURN relay      : PeerJS public (shared, rate-limited) - set TURN_URLS for a dedicated one';
}
