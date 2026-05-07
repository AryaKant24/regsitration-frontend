/**
 * PROD0-55: Frame Extraction & Temporal Downsampling — Canvas Frame Extractor
 *
 * Core engine responsible for:
 *   1. Maintaining a single reusable off-screen canvas (memory efficiency)
 *   2. Drawing a live video frame onto the canvas at a target resolution
 *   3. Encoding the canvas contents to a compressed Blob
 *   4. Returning a fully typed CapturedFrame record
 *
 * This module is intentionally framework-agnostic (no React imports).
 * It can be used from a hook, a Web Worker message handler, or a plain class.
 */

import type { CapturedFrame, FrameCaptureConfig } from '../types/frameCapture';

// ---------------------------------------------------------------------------
// Off-screen canvas management
// ---------------------------------------------------------------------------

/**
 * A thin wrapper around an HTMLCanvasElement that is never attached to the DOM.
 * Keeping a single canvas instance across captures avoids repeated allocation
 * and garbage-collection of large canvas backing stores.
 *
 * Memory note:
 *   An RGBA canvas at 640×480 consumes: 640 × 480 × 4 bytes = ~1.2 MB.
 *   Creating a new canvas per frame at 4 FPS would allocate ~5 MB/s of
 *   short-lived heap pressure. Reusing one canvas avoids this entirely.
 */
export class OffscreenCanvasManager {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(width: number, height: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;

    const ctx = this.canvas.getContext('2d', {
      // Hint to the browser that we will read pixels back frequently.
      // This can prevent the browser from offloading the canvas to GPU-only
      // memory, which would make readback expensive.
      willReadFrequently: false,

      // Disable alpha channel. Registration frames don't need transparency,
      // and disabling alpha makes drawImage ~10% faster on Chromium.
      alpha: false,
    });

    if (!ctx) {
      throw new Error('[FrameExtractor] Failed to obtain 2D rendering context.');
    }
    this.ctx = ctx;
  }

  /**
   * Resize the canvas if the config changes mid-session.
   * Changing canvas dimensions implicitly clears the canvas content.
   */
  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Explicit cleanup: break the reference cycle between the canvas element and
   * the 2D context by removing all drawing state. Helps the GC collect the
   * backing store promptly when the session ends.
   *
   * Note: There is no formal "destroy" API for HTMLCanvasElement in browsers.
   * Setting width to 0 is the conventional way to release the backing store.
   */
  destroy(): void {
    this.canvas.width = 0;
    this.canvas.height = 0;
  }
}

// ---------------------------------------------------------------------------
// Frame drawing
// ---------------------------------------------------------------------------

/**
 * Draw a single video frame onto the canvas.
 *
 * @param ctx     - 2D context from the reusable OffscreenCanvasManager
 * @param video   - HTMLVideoElement whose current frame will be drawn
 * @param config  - Capture config (target dimensions used here)
 *
 * Engineering note on scaling:
 *   drawImage with explicit dWidth/dHeight scales the source in one GPU-
 *   accelerated step, producing higher-quality results than a CSS resize and
 *   far cheaper than any manual pixel-loop resampling.
 *
 *   We do NOT apply a horizontal flip here — the canvas always captures
 *   the real-world orientation. Only the live <video> CSS preview should be
 *   mirrored (transform: scaleX(-1)) for user comfort.
 */
export function drawVideoFrameToCanvas(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  config: FrameCaptureConfig,
): void {
  // Guard: if the video has no data yet, skip (avoids drawing a black frame).
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    throw new Error('[FrameExtractor] Video not yet ready (readyState < 2).');
  }

  ctx.drawImage(
    video,
    0, 0,                          // source origin
    video.videoWidth,              // source width (native camera resolution)
    video.videoHeight,             // source height
    0, 0,                          // destination origin
    config.targetWidth,            // destination width (downsampled)
    config.targetHeight,           // destination height
  );
}

// ---------------------------------------------------------------------------
// Blob encoding
// ---------------------------------------------------------------------------

/**
 * Encode the current canvas contents to a compressed Blob asynchronously.
 *
 * Uses the Promise-based canvas.toBlob() API, which is non-blocking and
 * allows the browser to perform encoding on a background thread (in V8/SpiderMonkey).
 *
 * Why not toDataURL()?
 *   toDataURL() is synchronous and returns a base64 string (~33% larger than
 *   binary). Using toBlob() keeps the data in binary form and avoids blocking
 *   the main thread during encoding.
 *
 * @param canvas  - The canvas element to encode
 * @param format  - MIME type ('image/webp' or 'image/jpeg')
 * @param quality - Compression quality (0.0–1.0)
 * @returns       - Encoded Blob (never null in practice; null only if canvas is 0×0)
 */
export function encodeCanvasToBlob(
  canvas: HTMLCanvasElement,
  format: FrameCaptureConfig['imageFormat'],
  quality: number,
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('[FrameExtractor] canvas.toBlob() returned null.'));
          return;
        }
        resolve(blob);
      },
      format,
      quality,
    );
  });
}

// ---------------------------------------------------------------------------
// High-level frame extraction
// ---------------------------------------------------------------------------

/**
 * Extract a single compressed frame from a live HTMLVideoElement.
 *
 * This is the primary public API of this module. It orchestrates:
 *   draw → encode → wrap in CapturedFrame
 *
 * @param video       - Live video element (srcObject = MediaStream)
 * @param canvasManager - Reusable canvas wrapper (shared across captures)
 * @param config      - Active capture configuration
 * @param frameIndex  - Monotonically increasing index within the session
 *
 * @returns Promise<CapturedFrame>
 *
 * Caller responsibility:
 *   - canvasManager must already be sized to config.targetWidth × targetHeight
 *   - video.srcObject must be a live MediaStream
 *   - video must have loaded enough data (readyState >= HAVE_CURRENT_DATA)
 */
export async function extractFrame(
  video: HTMLVideoElement,
  canvasManager: OffscreenCanvasManager,
  config: FrameCaptureConfig,
  frameIndex: number,
): Promise<CapturedFrame> {
  const capturedAtMs = Date.now();

  // Step 1: Paint the current video frame onto the off-screen canvas.
  drawVideoFrameToCanvas(canvasManager.getContext(), video, config);

  // Step 2: Encode the canvas to a compressed Blob (async, non-blocking).
  const blob = await encodeCanvasToBlob(
    canvasManager.getCanvas(),
    config.imageFormat,
    config.imageQuality,
  );

  // Step 3: Wrap in the domain type understood by the rest of the pipeline.
  const frame: CapturedFrame = {
    index: frameIndex,
    capturedAtMs,
    blob,
    mimeType: config.imageFormat,
    width: config.targetWidth,
    height: config.targetHeight,
    sizeBytes: blob.size,
  };

  return frame;
}
