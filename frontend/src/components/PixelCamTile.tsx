import { useEffect, useRef } from 'react';

/**
 * Lobby camera tile with a deliberate pixel-art look.
 *
 * The feed is redrawn at a low frame rate into a tiny offscreen buffer, colour
 * reduced, and blown back up with image smoothing OFF - that is what produces
 * the chunky pixels. Every `shiftMs` the image jumps a couple of low-res
 * pixels up or down so the tile has a retro wobble instead of sitting still.
 * The shift timer starts when the tile mounts (when that player joined), so
 * players drift out of phase with each other.
 *
 * OVERSCAN: the buffer is deliberately larger than the visible area by
 * `margin` low-res pixels on every side, and the canvas only ever shows the
 * middle. That means the wobble slides real image into view rather than
 * exposing an empty edge.
 *
 * Canvas is used rather than a CSS filter because neither the low frame rate,
 * the palette reduction, nor a true pixel-grid downsample can be done in CSS.
 */
interface PixelCamTileProps {
  stream: MediaStream | null | undefined;
  label: string;
  /** Mirror the image (front-facing cameras read backwards otherwise). */
  mirrored?: boolean;
  /** Redraw rate. Deliberately low for the retro feel. */
  fps?: number;
  /** How often the image jumps. */
  shiftMs?: number;
  /** Total travel of the wobble, in low-res pixels. */
  shiftPixels?: number;
  /** Visible width of the offscreen buffer - smaller means chunkier. */
  resolution?: number;
  /** Colour levels per channel. Lower means a flatter, more poster-like image. */
  colorLevels?: number;
  /** Saturation multiplier applied before the colour reduction. */
  saturation?: number;
  /** Shown when there is no stream yet. */
  placeholder?: string;
}

/**
 * Reduce the frame to a small number of punchy colours.
 *
 * Saturation is pushed up first so the posterised bands land on vivid colours
 * rather than muddy ones, then each channel is snapped to a fixed number of
 * levels. Runs on the tiny buffer (a few hundred pixels), so the per-pixel
 * loop costs nothing.
 */
function stylisePixels(
  ctx: CanvasRenderingContext2D,
  size: number,
  levels: number,
  saturation: number,
): void {
  const image = ctx.getImageData(0, 0, size, size);
  const data = image.data;
  const step = 255 / (levels - 1);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;

    // Perceptual luma, so boosting saturation does not shift brightness.
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const sr = luma + (r - luma) * saturation;
    const sg = luma + (g - luma) * saturation;
    const sb = luma + (b - luma) * saturation;

    data[i] = Math.min(255, Math.max(0, Math.round(sr / step) * step));
    data[i + 1] = Math.min(255, Math.max(0, Math.round(sg / step) * step));
    data[i + 2] = Math.min(255, Math.max(0, Math.round(sb / step) * step));
  }

  ctx.putImageData(image, 0, 0);
}

export function PixelCamTile({
  stream,
  label,
  mirrored = false,
  fps = 8,
  shiftMs = 750,
  shiftPixels = 2,
  resolution = 32,
  colorLevels = 4,
  saturation = 1.45,
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
        /* autoplay can reject before a gesture; the draw loop retries */
      });
    }
    if (!stream && video.srcObject) {
      video.srcObject = null;
    }
  }, [stream]);

  // The up/down jump, phase-anchored to when this tile appeared.
  useEffect(() => {
    if (!stream) return;
    const half = shiftPixels / 2;
    shiftRef.current = -half;
    const id = window.setInterval(() => {
      shiftRef.current = shiftRef.current < 0 ? half : -half;
    }, shiftMs);
    return () => window.clearInterval(id);
  }, [stream, shiftMs, shiftPixels]);

  // Low-frame-rate pixelating draw loop.
  useEffect(() => {
    if (!stream) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    // Hidden border of real image, wide enough that the wobble can never
    // slide an empty edge into view.
    const margin = Math.ceil(shiftPixels / 2) + 1;
    const bufferSize = resolution + margin * 2;

    if (!bufferRef.current) bufferRef.current = document.createElement('canvas');
    const buffer = bufferRef.current;
    buffer.width = bufferSize;
    buffer.height = bufferSize;

    const bufferCtx = buffer.getContext('2d', { willReadFrequently: true });
    const ctx = canvas.getContext('2d');
    if (!bufferCtx || !ctx) return;

    const draw = () => {
      if (!video.videoWidth || video.readyState < 2) return;

      // Centre-crop the video to a square, then widen the crop by the same
      // fraction the margin adds, so the overscan is real picture.
      const side = Math.min(video.videoWidth, video.videoHeight);
      const grow = side * (margin / resolution);
      const srcSide = Math.min(
        Math.min(video.videoWidth, video.videoHeight),
        side + grow * 2,
      );
      const sx = (video.videoWidth - srcSide) / 2;
      const sy = (video.videoHeight - srcSide) / 2;

      bufferCtx.save();
      if (mirrored) {
        bufferCtx.translate(bufferSize, 0);
        bufferCtx.scale(-1, 1);
      }
      bufferCtx.drawImage(video, sx, sy, srcSide, srcSide, 0, 0, bufferSize, bufferSize);
      bufferCtx.restore();

      stylisePixels(bufferCtx, bufferSize, colorLevels, saturation);

      // Blow the tiny buffer up with smoothing off -> hard pixel edges. The
      // canvas shows only the middle, so the margin stays off-screen.
      const scale = canvas.width / resolution;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        buffer,
        -margin * scale,
        (-margin + shiftRef.current) * scale,
        bufferSize * scale,
        bufferSize * scale,
      );
    };

    draw();
    const id = window.setInterval(draw, Math.round(1000 / fps));
    return () => window.clearInterval(id);
  }, [stream, fps, resolution, mirrored, shiftPixels, colorLevels, saturation]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <video ref={videoRef} autoPlay muted playsInline className="hidden" />

      {stream ? (
        <canvas
          ref={canvasRef}
          width={256}
          height={256}
          className="h-full w-full object-cover"
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
