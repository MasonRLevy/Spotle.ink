import { Mic, MicOff } from 'lucide-react';
import { useEffect, useRef } from 'react';

/**
 * Lobby camera tile - plain, unfiltered live feed.
 *
 * The stream is attached in a ref callback rather than only in an effect, so
 * it lands whether the element mounts before or after the stream arrives.
 * (The camera starts while players are still in the lobby, so both orders
 * genuinely happen.)
 *
 * AUDIO: only the local tile is muted. Muting it prevents hearing yourself
 * echo; leaving remote tiles unmuted is what actually plays voice chat.
 */
interface LobbyCamTileProps {
  stream: MediaStream | null | undefined;
  label: string;
  /** Mirror the image - front-facing cameras read backwards otherwise. */
  mirrored?: boolean;
  /** This tile is the local player: mute playback and allow the mic toggle. */
  isLocal?: boolean;
  /** Current mic state, for the icon. Only meaningful on the local tile. */
  micEnabled?: boolean;
  /** Supplied for the local tile: clicking the name toggles the mic. */
  onToggleMic?: () => void;
  /** Shown when there is no stream yet. */
  placeholder?: string;
}

export function LobbyCamTile({
  stream,
  label,
  mirrored = false,
  isLocal = false,
  micEnabled = true,
  onToggleMic,
  placeholder = 'Waiting for player',
}: LobbyCamTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (stream && video.srcObject !== stream) {
      video.srcObject = stream;
      void video.play().catch(() => {
        /* autoplay can reject before a user gesture; the element retries */
      });
    }
    if (!stream && video.srcObject) {
      video.srcObject = null;
    }
  }, [stream]);

  const canToggle = isLocal && Boolean(onToggleMic);

  return (
    <div className="relative h-full w-full overflow-hidden">
      {stream ? (
        <video
          ref={(el) => {
            videoRef.current = el;
            if (el && stream && el.srcObject !== stream) {
              el.srcObject = stream;
            }
          }}
          autoPlay
          muted={isLocal}
          playsInline
          className={`h-full w-full object-cover ${mirrored ? 'scale-x-[-1]' : ''}`}
          aria-label={`${label} camera`}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-3 text-center">
          {placeholder}
        </div>
      )}

      {isLocal ? (
        // Always show the mic state on your own tile. When voice chat is
        // switched off entirely there is nothing to toggle, but you still
        // need to see that you are muted.
        <button
          type="button"
          onClick={onToggleMic}
          disabled={!canToggle}
          aria-pressed={!micEnabled}
          aria-label={
            !canToggle
              ? `${label} - microphone off`
              : micEnabled
                ? `Mute ${label}`
                : `Unmute ${label}`
          }
          title={
            !canToggle
              ? 'Voice chat is off in Settings'
              : micEnabled
                ? 'Click to mute your mic'
                : 'Click to unmute your mic'
          }
          className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-spotle-navy/80 px-2 py-1 text-center text-sm text-spotle-coral transition-transform active:scale-95 disabled:cursor-default disabled:active:scale-100"
        >
          {micEnabled ? (
            <Mic aria-hidden="true" className="h-4 w-4 shrink-0" />
          ) : (
            <MicOff aria-hidden="true" className="h-4 w-4 shrink-0 text-red-400" />
          )}
          <span className="truncate">{label}</span>
        </button>
      ) : (
        <p className="absolute inset-x-0 bottom-0 truncate bg-spotle-navy/80 px-2 py-1 text-center text-sm text-spotle-coral">
          {label}
        </p>
      )}
    </div>
  );
}
