/**
 * PROD0-55: Frame Extraction & Temporal Downsampling — Default Configuration
 *
 * Single source of truth for all tunable capture parameters.
 * Import DEFAULT_CAPTURE_CONFIG everywhere a config baseline is needed.
 *
 * Overrides should be passed via the startCapture() API, never mutated directly.
 */

import type { FrameCaptureConfig, ImageFormat } from '../types/frameCapture';

// ---------------------------------------------------------------------------
// WebP support detection (run once at module load)
// ---------------------------------------------------------------------------

/**
 * Detect whether the current browser supports WebP encoding via canvas.
 *
 * Mechanism: Create a tiny off-screen canvas, call toDataURL('image/webp'),
 * and check whether the returned data-URI actually begins with the WebP
 * prefix. Browsers that don't support WebP silently fall back to PNG/JPEG,
 * producing a PNG data-URI instead.
 *
 * This check is synchronous and runs once at module initialisation time so
 * the rest of the pipeline can treat SUPPORTED_FORMAT as a constant.
 */
function detectWebPSupport(): boolean {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    // In SSR / test environments there is no DOM — default to JPEG.
    return false;
  }
}

/**
 * Resolved image format for this browser session.
 * WebP is strongly preferred for its 25-35% size advantage at equal quality.
 * JPEG is the universally supported fallback.
 */
export const SUPPORTED_FORMAT: ImageFormat = detectWebPSupport()
  ? 'image/webp'
  : 'image/jpeg';

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

/**
 * Production-ready defaults for the frame capture pipeline.
 *
 * Key engineering decisions encoded here:
 *
 * targetWidth / targetHeight (640 × 480)
 *   Safe resolution that every webcam supports. Provides enough pixel density
 *   for accurate face detection and embedding while keeping blob sizes small.
 *   Upgrade to 960×540 if the deployment camera is high-quality and bandwidth
 *   allows; change only this config, not the extraction logic.
 *
 * frameSkipN (5  →  every 5th decoded frame  →  6 FPS effective at 30 FPS source)
 *   Implements your team's agreed downsampling strategy: "use every 5th frame".
 *   The rVFC callback fires once per actual decoded camera frame. We count those
 *   callbacks and only draw + encode the frame when (count % frameSkipN === 0).
 *   This is frame-number-based — not time-based — so there is no timer drift
 *   and no risk of missing a rotation pose between timer ticks.
 *
 *   Tune this value to change effective capture rate:
 *     frameSkipN = 3  →  10 FPS  (lots of overlap, heavier backend load)
 *     frameSkipN = 5  →   6 FPS  ← default (team spec)
 *     frameSkipN = 6  →   5 FPS
 *     frameSkipN = 10 →   3 FPS  (thin coverage, light backend load)
 *
 * maxFrames (24)
 *   At 6 captured FPS, 24 frames = 4 seconds of 180° turn coverage.
 *   The rVFC loop is cancelled automatically once this count is reached.
 *
 * imageQuality (0.88)
 *   Conservative mid-point of the 0.85–0.92 recommended range.
 *   Preserves sufficient high-frequency texture (skin pores, hair edges) that
 *   embedding models like ArcFace rely on. Values below 0.80 cause DCT block
 *   artefacts that measurably degrade embedding cosine-similarity scores.
 *
 * mirrorPreview (false)
 *   Captured frames are NOT mirrored. Only the live <video> preview should be
 *   CSS-mirrored (transform: scaleX(-1)) for a natural selfie feel. Sending
 *   an unmirrored image to the backend avoids confusion during alignment.
 */
export const DEFAULT_CAPTURE_CONFIG: Readonly<FrameCaptureConfig> = Object.freeze({
  targetWidth: 640,
  targetHeight: 480,
  frameSkipN: 5,   // every 5th decoded frame → 6 FPS effective at 30 FPS source
  maxFrames: 60,   // 60 frames ÷ 6 FPS = 10 seconds of capture
  imageFormat: SUPPORTED_FORMAT,
  imageQuality: 0.88,
  mirrorPreview: false,
});

// ---------------------------------------------------------------------------
// getUserMedia constraints factory
// ---------------------------------------------------------------------------

/**
 * Build MediaStreamConstraints that match our target resolution.
 *
 * We use `ideal` (not `exact`) for width/height so that getUserMedia does not
 * reject the promise if the camera cannot provide exactly 640×480. The browser
 * will select the closest supported mode, and the canvas draw step will handle
 * any remaining scaling without aspect-ratio distortion.
 *
 * facingMode 'user' selects the front-facing camera on mobile devices and
 * works transparently on desktop webcams.
 */
export function buildMediaConstraints(
  config: FrameCaptureConfig,
): MediaStreamConstraints {
  return {
    video: {
      width: { ideal: config.targetWidth },
      height: { ideal: config.targetHeight },
      facingMode: 'user',
      // Request 30 FPS so our temporal sampling always has enough source frames.
      frameRate: { ideal: 30, max: 30 },
    },
    audio: false, // Registration pipeline is video-only
  };
}
