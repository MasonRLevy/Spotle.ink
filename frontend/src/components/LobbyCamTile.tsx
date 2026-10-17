import { useEffect, useRef } from 'react';

/**
 * Lobby camera tile - plain, unfiltered live feed.
 *
 * The stream is attached in a ref callback rather than only in an effect, so
 * it lands whether the element mounts before or after the stream arrives.
 * (The camera starts while players are still in the lobby, so both orders
 * genuinely happen.)
 */
interface LobbyCamTileProps {
  stream: MediaStream | null | undefined;
  label: string;
  /** Mirror the image - front-facing cameras read backwards otherwise. */
  mirrored?: boolean;
  /** Shown when there is no stream yet. */
  placeholder?: string;
}

export function LobbyCamTile({
  stream,
  label,
  mirrored = false,
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
          muted
          playsInline
          className={`h-full w-full object-cover ${mirrored ? 'scale-x-[-1]' : ''}`}
          aria-label={`${label} camera`}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-3 text-center">
          {placeholder}
        </div>
      )}

      <p className="absolute inset-x-0 bottom-0 truncate bg-spotle-navy/80 px-2 py-1 text-center text-sm text-spotle-coral">
        {label}
      </p>
    </div>
  );
}
