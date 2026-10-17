export interface CaptureFrameOptions {
  /** JPEG quality 0–1. Spec default is 0.8. */
  quality?: number;
  /** Downscale longest side for Gemini upload bandwidth. */
  maxWidth?: number;
}

/**
 * Grab a JPEG still from the live <video> element.
 * Never call getUserMedia() here — that freezes mobile WebRTC.
 */
export function captureVideoFrame(
  video: HTMLVideoElement,
  options: CaptureFrameOptions = {},
): string {
  const { quality = 0.8, maxWidth = 640 } = options;

  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) {
    throw new Error('Camera frame is not ready yet. Wait a moment and try again.');
  }

  const scale = Math.min(1, maxWidth / video.videoWidth);
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not create an offscreen canvas for capture.');
  }

  ctx.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

/** Approximate payload size in KB for debugging uploads. */
export function estimateJpegKilobytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.round((b64.length * 0.75) / 1024);
}
