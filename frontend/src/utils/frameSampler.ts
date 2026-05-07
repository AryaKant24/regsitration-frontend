/**
 * PROD0-55: Frame Extraction & Temporal Downsampling — rVFC Frame Sampler
 *
 * Implements the team-agreed strategy: "capture every 5th decoded frame".
 *
 * Core mechanism: requestVideoFrameCallback (rVFC)
 * ─────────────────────────────────────────────────
 * rVFC is a browser API that fires a callback exactly once per decoded video
 * frame, before that frame is composited to the screen. This gives us a
 * frame-number-accurate hook into the camera stream — something setInterval
 * can never provide because it is driven by the system clock, not frame delivery.
 *
 * How the skip logic works
 * ─────────────────────────
 * rVFC provides `metadata.presentedFrames` — a monotonically increasing integer
 * that the browser increments by 1 for every frame it decodes. We use this as
 * our authoritative frame counter:
 *
 *   presentedFrames:  1   2   3   4   5   6   7   8   9  10  11 …
 *   frameSkipN = 5:   -   -   -   -   ✓   -   -   -   -   ✓   -  …
 *   condition:        presentedFrames % frameSkipN === 0
 *
 * At 30 FPS with frameSkipN = 5 you get exactly frames 5, 10, 15, 20… — a
 * guaranteed 6 FPS of non-overlapping, evenly-spaced captures covering every
 * angular position of the 180° turn.
 *
 * Why NOT setInterval?
 * ─────────────────────
 * setInterval(250ms) fires a wall-clock timer. If the student's face rotates
 * from 30° to 90° during the 250ms gap, that range is entirely uncaptured.
 * With rVFC, every decoded frame is observed — we just decide which ones to keep.
 *
 * Important note on async safety
 * ────────────────────────────────
 * canvas.drawImage(video) MUST happen synchronously inside the rVFC callback
 * (before we return), because the video element may advance to the next frame
 * before an async continuation runs.
 *
 * canvas.toBlob() is called immediately after drawImage() while still inside
 * the callback. Per the spec, toBlob() captures the canvas pixel state at the
 * moment it is called — subsequent draws to the same canvas do not corrupt
 * the blob being encoded. The encoding itself then proceeds asynchronously.
 *
 * Browser support
 * ────────────────
 * requestVideoFrameCallback is available in:
 *   Chrome  86+  ✅
 *   Edge    86+  ✅
 *   Safari  15.4+ ✅
 *   Firefox 132+ ✅
 * A runtime check is included; the sampler throws a clear error on unsupported browsers.
 */

import type { CapturedFrame, FrameCaptureConfig } from '../types/frameCapture';
import { OffscreenCanvasManager, encodeCanvasToBlob, drawVideoFrameToCanvas } from './frameExtractor';

// ---------------------------------------------------------------------------
// rVFC TypeScript shim
// ---------------------------------------------------------------------------
// TypeScript's lib.dom.d.ts includes requestVideoFrameCallback in TS 4.4+.
// The declaration is included here as a belt-and-suspenders guard so the
// file compiles even if an older @types/web is present in the project.

declare global {
  interface VideoFrameCallbackMetadata {
    /** Monotonically increasing count of frames presented by this video element. */
    presentedFrames: number;
    /** Media timestamp (in seconds) of the frame. */
    mediaTime: number;
    /** Expected display time of the frame. */
    expectedDisplayTime: DOMHighResTimeStamp;
  }

  interface HTMLVideoElement {
    requestVideoFrameCallback(
      callback: (now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => void,
    ): number;
    cancelVideoFrameCallback(handle: number): void;
  }
}

// ---------------------------------------------------------------------------
// Callbacks & options
// ---------------------------------------------------------------------------

export interface SamplerCallbacks {
  /**
   * Fired after each successfully extracted + encoded frame.
   * Use to update UI (e.g. "Frame 5 / 24 captured").
   */
  onFrameCaptured: (frame: CapturedFrame) => void;

  /**
   * Fired once when maxFrames is reached (session complete).
   * The rVFC loop is already cancelled at this point.
   */
  onComplete: (frames: CapturedFrame[]) => void;

  /**
   * Fired if a frame extraction fails (e.g. canvas.toBlob returns null).
   * Non-fatal by default — the loop continues to the next frame.
   */
  onError: (error: Error, frameIndex: number) => void;
}

export interface SamplerOptions {
  /**
   * Cancel the rVFC loop and stop the session if any frame extraction fails.
   * Default: false (skip the bad frame and continue).
   */
  stopOnError?: boolean;
}

// ---------------------------------------------------------------------------
// FrameSampler
// ---------------------------------------------------------------------------

export class FrameSampler {
  private readonly video: HTMLVideoElement;
  private readonly config: FrameCaptureConfig;
  private readonly callbacks: SamplerCallbacks;
  private readonly options: Required<SamplerOptions>;
  private readonly canvasManager: OffscreenCanvasManager;

  /** All successfully captured + encoded frames for this session. */
  private readonly frames: CapturedFrame[] = [];

  /** rVFC handle returned by requestVideoFrameCallback. Used to cancel the loop. */
  private rvcHandle: number | null = null;

  /** Whether stop() has been called. Guards against re-entrant stop calls. */
  private stopped = false;

  /** Wall-clock time when start() was called. */
  private sessionStartMs: number | null = null;

  constructor(
    video: HTMLVideoElement,
    config: FrameCaptureConfig,
    callbacks: SamplerCallbacks,
    options: SamplerOptions = {},
  ) {
    // Fail fast: check browser support before doing anything else.
    if (typeof video.requestVideoFrameCallback !== 'function') {
      throw new Error(
        '[FrameSampler] requestVideoFrameCallback is not supported in this browser. ' +
        'Chrome 86+, Firefox 132+, or Safari 15.4+ required.',
      );
    }

    this.video = video;
    this.config = config;
    this.callbacks = callbacks;
    this.options = { stopOnError: options.stopOnError ?? false };

    // One canvas per session — sized once, reused across all frame captures.
    this.canvasManager = new OffscreenCanvasManager(config.targetWidth, config.targetHeight);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Begin observing decoded video frames.
   * The first rVFC fires on the very next frame the browser decodes — no delay.
   * Calling start() more than once is a no-op.
   */
  start(): void {
    if (this.rvcHandle !== null || this.stopped) return;
    this.sessionStartMs = Date.now();
    this.scheduleNextCallback();
  }

  /**
   * Cancel the rVFC loop and release canvas memory.
   * Safe to call multiple times (idempotent).
   */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;

    if (this.rvcHandle !== null) {
      this.video.cancelVideoFrameCallback(this.rvcHandle);
      this.rvcHandle = null;
    }

    // canvas.width = 0 releases the pixel buffer (~1.2 MB at 640×480)
    // before the GC collects the object.
    this.canvasManager.destroy();
  }

  /**
   * Return a shallow copy of all captured frames.
   * Copying prevents external mutation of internal state.
   */
  getFrames(): CapturedFrame[] {
    return [...this.frames];
  }

  /** Elapsed session time in ms. Returns 0 before start(). */
  getElapsedMs(): number {
    return this.sessionStartMs != null ? Date.now() - this.sessionStartMs : 0;
  }

  // ── Private rVFC loop ───────────────────────────────────────────────────────

  /**
   * Register the next rVFC callback.
   * Each callback registration fires ONCE (rVFC is not self-repeating).
   * We re-register from inside the callback to create a loop.
   */
  private scheduleNextCallback(): void {
    this.rvcHandle = this.video.requestVideoFrameCallback(
      (now, metadata) => { void this.onVideoFrame(now, metadata); },
    );
  }

  /**
   * Called by the browser for every single decoded frame.
   *
   * Decision flow per frame:
   *   1. Guard: already stopped? → exit.
   *   2. Guard: maxFrames reached? → auto-stop, call onComplete.
   *   3. Skip check: is this frame's number divisible by frameSkipN?
   *      NO  → re-register rVFC, continue to next frame.
   *      YES → capture this frame (draw + encode), then re-register rVFC.
   *
   * The canvas draw happens SYNCHRONOUSLY here (step 3, before we return).
   * The toBlob encoding is ASYNC but captures the pixel state at call time,
   * so re-using the canvas for subsequent frames does not corrupt this blob.
   */
  private async onVideoFrame(
    now: DOMHighResTimeStamp,
    metadata: VideoFrameCallbackMetadata,
  ): Promise<void> {
    this.rvcHandle = null; // Callback has fired; handle is now invalid.

    // ── Guard: session stopped ──────────────────────────────────────────────
    if (this.stopped) return;

    // ── Guard: maxFrames reached (belt-and-suspenders) ──────────────────────
    if (this.frames.length >= this.config.maxFrames) {
      this.stop();
      this.callbacks.onComplete([...this.frames]);
      return;
    }

    // ── Skip check: only act on every Nth frame ──────────────────────────────
    //
    // metadata.presentedFrames is a monotonically increasing integer —
    // the browser increments it for every frame decoded, regardless of
    // whether we call rVFC again. This makes it a reliable frame counter.
    //
    // Example with frameSkipN = 5:
    //   presentedFrames: 1  2  3  4  5  6  7  8  9  10  11  12  13  14  15
    //   captured?:       -  -  -  -  ✓  -  -  -  -   ✓   -   -   -   -   ✓
    const shouldCapture = metadata.presentedFrames % this.config.frameSkipN === 0;

    if (!shouldCapture) {
      // Not a "keep" frame — re-register and move on.
      if (!this.stopped) this.scheduleNextCallback();
      return;
    }

    // ── Capture this frame ───────────────────────────────────────────────────

    // SYNCHRONOUS: Draw the video's current frame to the canvas RIGHT NOW.
    // This must happen before we yield (await) anything, because the video
    // element may advance to the next frame once we leave the synchronous path.
    const capturedAtMs = Date.now();
    const frameIndex = this.frames.length;

    try {
      drawVideoFrameToCanvas(this.canvasManager.getContext(), this.video, this.config);
    } catch (drawErr) {
      // drawImage failed (e.g. video not ready) — skip this frame, try next.
      const error = drawErr instanceof Error ? drawErr : new Error(String(drawErr));
      this.callbacks.onError(error, frameIndex);
      if (this.options.stopOnError) { this.stop(); return; }
      if (!this.stopped) this.scheduleNextCallback();
      return;
    }

    // Re-register rVFC NOW (before the async await below) so the browser
    // keeps delivering frame callbacks without a gap while toBlob() encodes.
    if (!this.stopped) this.scheduleNextCallback();

    // ASYNC: Encode the canvas snapshot to a compressed Blob.
    // toBlob() captures the canvas pixel state at the moment it is called
    // (the draw above). Subsequent draws to this canvas do NOT affect this blob.
    try {
      const blob = await encodeCanvasToBlob(
        this.canvasManager.getCanvas(),
        this.config.imageFormat,
        this.config.imageQuality,
      );

      const frame: CapturedFrame = {
        index: frameIndex,
        sourceFrameNumber: metadata.presentedFrames, // audit: which raw frame this was
        capturedAtMs,
        blob,
        mimeType: this.config.imageFormat,
        width: this.config.targetWidth,
        height: this.config.targetHeight,
        sizeBytes: blob.size,
      };

      this.frames.push(frame);
      this.callbacks.onFrameCaptured(frame);

      // Check completion after pushing.
      if (this.frames.length >= this.config.maxFrames) {
        this.stop();
        this.callbacks.onComplete([...this.frames]);
      }
    } catch (blobErr) {
      const error = blobErr instanceof Error ? blobErr : new Error(String(blobErr));
      this.callbacks.onError(error, frameIndex);
      if (this.options.stopOnError) this.stop();
      // rVFC was already re-registered above, so the loop continues automatically.
    }
  }
}
