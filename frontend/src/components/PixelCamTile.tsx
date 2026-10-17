import { useEffect, useRef } from 'react';

/**
 * Lobby camera tile with a deliberate pixel-art look.
 *
 * The feed is redrawn at a low frame rate into a tiny offscreen buffer and
 * blown back up with image smoothing OFF, which is what produces the chunky
 * pixels. Every `shiftMs` the whole image is nudged one low-res pixel up or
 * down, so the tile has a gentle retro wobble instead of sitting perfectly
 * still. The shift timer starts when the tile mounts - i.e. when that player
 * joined - so players drift out of phase with each other.
 *
 * Canvas is used rather than a CSS filter because neither the low frame rate
 * nor a true pixel-grid downsample can be expressed in CSS.
 */
interface PixelCamTileProps {
  stream: MediaStream | null | undefined;
  label: string;
  /** Mirror the image (front-facing cameras read backwards otherwise). */
  mirrored?: boolean;
  /** Redraw rate. Deliberately low for the retro feel. */
  fps?: number;
  /** How often the image jumps one pixel up/down. */
  shiftMs?: number;
  /** Width of the offscreen buffer in pixels - smaller means chunkier. */
  resolution?: number;
  /** Shown when there is no stream yet. */
  placeholder?: string;
}

export function PixelCamTile({
  stream,
  label,
  mirrored = false,
  fps = 8,
  shiftMs = 750,
  resolution = 52,
  placeholder = 'Waiting for player',
}: PixelCamTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bufferRef = useRef<HTMLCanvasElement | null>(null);
  const shiftRef = useRef(0);

  // Keep the hidden <video> fed. A MediaStream can drive several elements at
  // once, so sharing the game's stream here is safe.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (stream && video.srcObject !== stream) {
      video.srcObject = stream;
      void video.play().catch(() => {
        /* autoplay can reject before user gesture; the draw loop retries */
      });
    }
    if (!stream && video.srcObject) {
      video.srcObject = null;
    }
  }, [stream]);

  // The up/down nudge, phase-anchored to when this tile appeared.
  useEffect(() => {
    if (!stream) return;
    const id = window.setInterval(() => {
      shiftRef.current = shiftRef.current === 0 ? 1 : 0;
    }, shiftMs);
    return () => window.clearInterval(id);
  }, [stream, shiftMs]);

  // Low-frame-rate pixelating draw loop.
  useEffect(() => {
    if (!stream) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    if (!bufferRef.current) bufferRef.current = document.createElement('canvas');
    const buffer = bufferRef.current;
    buffer.width = resolution;
    buffer.height = resolution;

    const bufferCtx = buffer.getContext('2d');
    const ctx = canvas.getContext('2d');
    if (!bufferCtx || !ctx) return;

    const draw = () => {
      if (!video.videoWidth || video.readyState < 2) return;

      // Centre-crop to a square so the tile never stretches faces.
      const side = Math.min(video.videoWidth, video.videoHeight);
      const sx = (video.videoWidth - side) / 2;
      const sy = (video.videoHeight - side) / 2;

      bufferCtx.save();
      if (mirrored) {
        bufferCtx.translate(resolution, 0);
        bufferCtx.scale(-1, 1);
      }
      bufferCtx.drawImage(video, sx, sy, side, side, 0, 0, resolution, resolution);
      bufferCtx.restore();

      // Blow the tiny buffer back up with smoothing off -> hard pixel edges.
      const scale = canvas.width / resolution;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        buffer,
        0,
        shiftRef.current * scale, // the one-pixel wobble
        canvas.width,
        canvas.height,
      );
    };

    draw();
    const id = window.setInterval(draw, Math.round(1000 / fps));
    return () => window.clearInterval(id);
  }, [stream, fps, resolution, mirrored]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <video ref={videoRef} autoPlay muted playsInline className="hidden" />

      {stream ? (
        <canvas
          ref={canvasRef}
          width={256}
          height={256}
          className="h-full w-full object-cover"
          // Belt and braces: keep the browser from smoothing on upscale too.
          style={{ imageRendering: 'pixelated' }}
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
