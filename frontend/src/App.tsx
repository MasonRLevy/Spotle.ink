import { useMemo, useState } from 'react';
import { Camera, Copy, Link2, ScanSearch } from 'lucide-react';
import { VideoGrid } from './components/VideoGrid';
import { useWebRTC, type RemotePeer } from './hooks/useWebRTC';
import type { Player } from './types/game';
import { estimateJpegKilobytes } from './utils/captureFrame';

const LOCAL_ID = 'local';

export default function App() {
  const [name, setName] = useState('Player 1');
  const [enabled, setEnabled] = useState(false);
  const [peerDraft, setPeerDraft] = useState('');
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [snapshotKb, setSnapshotKb] = useState<number | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const webrtc = useWebRTC({
    enabled,
    localName: name.trim() || 'Hunter',
    localPlayerId: LOCAL_ID,
    remotePeers,
  });

  const localPlayer: Player = useMemo(
    () => ({
      id: LOCAL_ID,
      peerId: webrtc.localPeerId ?? '',
      name: name.trim() || 'Hunter',
      score: 0,
      status: 'SEARCHING',
    }),
    [name, webrtc.localPeerId],
  );

  const players: Player[] = useMemo(
    () => [
      localPlayer,
      ...remotePeers.map((remote) => ({
        id: remote.playerId,
        peerId: remote.peerId,
        name: remote.name,
        score: 0,
        status: 'SEARCHING' as const,
      })),
    ],
    [localPlayer, remotePeers],
  );

  function addRemotePeer() {
    const peerId = peerDraft.trim();
    if (!peerId) return;
    if (peerId === webrtc.localPeerId) return;
    if (remotePeers.some((p) => p.peerId === peerId)) return;
    setRemotePeers((prev) => [
      ...prev,
      {
        playerId: peerId,
        peerId,
        name: `Hunter ${prev.length + 2}`,
      },
    ]);
    setPeerDraft('');
  }

  async function copyPeerId() {
    if (!webrtc.localPeerId) return;
    await navigator.clipboard.writeText(webrtc.localPeerId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  function onFoundIt() {
    setCaptureError(null);
    try {
      const jpeg = webrtc.captureJpeg();
      setSnapshot(jpeg);
      setSnapshotKb(estimateJpegKilobytes(jpeg));
    } catch (err) {
      setCaptureError(err instanceof Error ? err.message : 'Capture failed.');
    }
  }

  return (
    <div className="min-h-screen bg-[#0b1220] text-zinc-100">
      <header className="border-b border-white/10 bg-[#0021A5] px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-300">
          Spotle.online · Role 2 camera lab
        </p>
        <h1 className="text-2xl font-black tracking-tight">Live Video Mesh</h1>
        <p className="max-w-2xl text-sm text-blue-100">
          Start your camera, share your Peer ID with a teammate, then paste theirs.
          FOUND IT grabs a JPEG from this video element — it never opens a second camera.
        </p>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <VideoGrid
            localPlayer={localPlayer}
            players={players}
            localStream={webrtc.localStream}
            localVideoRef={webrtc.localVideoRef}
            remoteMedia={webrtc.remoteMedia}
            facingMode={webrtc.facingMode}
            isFlipping={webrtc.isFlipping}
            onFlipCamera={() => void webrtc.flipCamera()}
          />

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onFoundIt}
              disabled={!webrtc.cameraReady}
              className="inline-flex items-center gap-2 rounded-xl bg-[#FA4616] px-5 py-3 text-sm font-black uppercase tracking-wide text-white shadow-lg disabled:opacity-50"
            >
              <ScanSearch className="h-4 w-4" />
              Found it
            </button>
          </div>

          {captureError && <p className="text-sm text-red-400">{captureError}</p>}
          {snapshot && (
            <figure className="max-w-sm overflow-hidden rounded-xl ring-1 ring-white/10">
              <img src={snapshot} alt="Captured hunt frame" className="w-full" />
              <figcaption className="bg-black/40 px-3 py-2 text-xs text-zinc-300">
                Canvas JPEG{snapshotKb != null ? ` · ${snapshotKb} KB` : ''} · quality 0.8 · max 640px
              </figcaption>
            </figure>
          )}
        </div>

        <aside className="space-y-4 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
          <label className="block text-sm">
            Nickname
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2"
              value={name}
              disabled={enabled}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <button
            type="button"
            onClick={() => setEnabled((v) => !v)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#0021A5]"
          >
            <Camera className="h-4 w-4" />
            {enabled ? 'Stop camera' : 'Start camera'}
          </button>

          {webrtc.error && <p className="text-sm text-red-400">{webrtc.error}</p>}

          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-400">Your Peer ID</p>
            <div className="mt-1 flex gap-2">
              <code className="flex-1 truncate rounded-lg bg-black/40 px-3 py-2 text-xs">
                {webrtc.localPeerId ?? '—'}
              </code>
              <button
                type="button"
                onClick={() => void copyPeerId()}
                disabled={!webrtc.localPeerId}
                className="rounded-lg bg-white/10 px-3 py-2 disabled:opacity-40"
                aria-label="Copy Peer ID"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            {copied && <p className="mt-1 text-xs text-emerald-400">Copied</p>}
          </div>

          <label className="block text-sm">
            Teammate Peer ID
            <div className="mt-1 flex gap-2">
              <input
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs"
                value={peerDraft}
                placeholder="paste their id"
                onChange={(e) => setPeerDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addRemotePeer();
                }}
              />
              <button
                type="button"
                onClick={addRemotePeer}
                className="rounded-lg bg-[#FA4616] px-3 py-2"
                aria-label="Connect to teammate"
              >
                <Link2 className="h-4 w-4" />
              </button>
            </div>
          </label>

          <ul className="space-y-1 text-xs text-zinc-400">
            {remotePeers.map((peer) => (
              <li key={peer.peerId} className="truncate">
                {peer.name}: {peer.peerId}
              </li>
            ))}
          </ul>

          <p className="text-xs leading-relaxed text-zinc-500">
            Role 3 can drop this lab UI later and pass room <code>players[].peerId</code> into{' '}
            <code>useWebRTC</code>. Capture returns a base64 JPEG for{' '}
            <code>POST /api/verify-object</code>.
          </p>
        </aside>
      </main>
    </div>
  );
}
