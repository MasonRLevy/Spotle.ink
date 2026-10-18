/**
 * Where the game server lives, as seen from the browser.
 *
 * Shared by useGameSocket (Socket.io) and useWebRTC (/api/rtc-config and the
 * PeerJS broker) so the two can never disagree about which host is the
 * server - they used to each have their own copy of this rule.
 *
 * In dev we talk to the game server directly rather than through the Vite
 * proxy: the proxy handshakes fine over long-polling but fails the WebSocket
 * upgrade, which both spams the console and leaves the game polling. The
 * server sets CORS origin '*', so a direct connection is fine. In a
 * production build the UI is served by the game server, so same-origin.
 * Override for tunnels/LAN with VITE_SERVER_URL in frontend/.env.local.
 */
export function serverUrl(): string | undefined {
  const override = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (override) return override;
  if (import.meta.env.DEV) {
    return `${window.location.protocol}//${window.location.hostname}:3001`;
  }
  return undefined; // same-origin
}

/** Absolute URL for a server path, honouring the dev/prod split above. */
export function apiUrl(path: string): string {
  const base = serverUrl();
  return base ? `${base.replace(/\/$/, '')}${path}` : path;
}

/** The server's origin as a URL, for deriving PeerJS host/port/secure. */
export function serverOrigin(): URL {
  return new URL(serverUrl() ?? window.location.origin, window.location.origin);
}
