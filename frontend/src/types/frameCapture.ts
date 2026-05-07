/**
 * PROD0-55: Frame Extraction & Temporal Downsampling — Type Definitions
 *
 * Centralised type contracts for the frame capture pipeline.
 * These types are intentionally decoupled from any backend schema
 * so the frontend module can evolve independently.
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

/**
 * Preferred output image format.
 * WebP is preferred for its superior compression-at-quality ratio.
 * JPEG is used as a fallback in browsers that do not support canvas.toBlob('image/webp').
 */
export type ImageFormat = 'image/webp' | 'image/jpeg';

/**
 * Lifecycle state of a single capture session.
 */
export type CaptureSessionState =
  | 'idle'       // No session is active
  | 'acquiring'  // Waiting for getUserMedia permission / stream
  | 'capturing'  // rVFC loop is running, frames are being sampled every Nth decoded frame
  | 'complete'   // Capture finished successfully; frames ready
  | 'error';     // Unrecoverable error; session must be reset

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * All tunable parameters for the frame capture pipeline.
 * Consumers can override individual fields; defaults are applied via
 * DEFAULT_CAPTURE_CONFIG in captureConfig.ts.
 */
export interface FrameCaptureConfig {
  /**
   * Target width for frames rendered to the off-screen canvas.
   * Recommended: 640 (safe) or 960 (high-detail).
   * Must NOT be zero.
   */
  targetWidth: number;

  /**
   * Target height for frames rendered to the off-screen canvas.
   * Recommended: 480 (safe) or 540 (high-detail).
   * Must NOT be zero.
   */
  targetHeight: number;

  /**
   * How many decoded video frames to skip between captures.
   * The pipeline uses requestVideoFrameCallback (rVFC), which fires once per
   * actual decoded frame from the camera — making this a true frame-number-based
   * skip, not a wall-clock timer.
   *
   * Formula:  effectiveFPS = sourceFPS / frameSkipN
   *
   * Examples at a 30 FPS source stream:
   *   frameSkipN = 5  →  capture every 5th frame  →  6 FPS  (team default)
   *   frameSkipN = 6  →  capture every 6th frame  →  5 FPS
   *   frameSkipN = 10 →  capture every 10th frame →  3 FPS
   *
   * Engineering note: Unlike setInterval (wall-clock timer), rVFC counts real
   * decoded frames. If the camera delivers 30 FPS and frameSkipN = 5, you get
   * exactly frames [5, 10, 15, 20, …] — no timer drift, no missed poses.
   */
  frameSkipN: number;

  /**
   * Maximum number of frames to collect in a single session.
   * The rVFC loop is cancelled once this count is reached.
   * Recommended range: 15–25 frames.
   *
   * At 30 FPS source with frameSkipN = 5 (6 captured FPS):
   *   maxFrames = 18  →  ~3 seconds of turn coverage
   *   maxFrames = 24  →  ~4 seconds of turn coverage  ← default
   */
  maxFrames: number;

  /**
   * MIME type for canvas.toBlob() / toDataURL().
   * Defaults to 'image/webp' with JPEG as runtime fallback.
   */
  imageFormat: ImageFormat;

  /**
   * Compression quality passed to canvas.toBlob() / toDataURL().
   * Range: 0.0 – 1.0
   * Recommended: 0.85–0.92 to preserve facial sharpness.
   *
   * Engineering note: Values below 0.80 introduce blocking artefacts that
   * degrade face-embedding accuracy. Values above 0.95 give diminishing
   * returns with significantly larger file sizes.
   */
  imageQuality: number;

  /**
   * Optional: mirror the canvas horizontally.
   * Mirrors the selfie view so the student sees a natural reflection,
   * while the captured frame is NOT mirrored (correct orientation for backend).
   * Default: false — do NOT mirror the captured image; mirror only the preview.
   */
  mirrorPreview: boolean;
}

// ---------------------------------------------------------------------------
// Captured Frame
// ---------------------------------------------------------------------------

/**
 * A single extracted, compressed frame from the webcam stream.
 * This is the atomic unit consumed by the upload layer (PROD0-56+).
 */
export interface CapturedFrame {
  /**
   * Monotonically increasing index within the current session (0-based).
   * i.e. the 1st kept frame = 0, 2nd = 1, etc.
   */
  index: number;

  /**
   * The raw decoded frame number from the camera stream at which this
   * frame was captured (from VideoFrameCallbackMetadata.presentedFrames).
   * e.g. with frameSkipN=5: sourceFrameNumber will be 5, 10, 15, 20…
   * Useful for QA to verify the skip pattern is working correctly.
   */
  sourceFrameNumber: number;

  /**
   * Absolute epoch timestamp (ms) at which the frame was drawn to the canvas.
   * Useful for ordering and QA; NOT intended as a backend creation timestamp.
   */
  capturedAtMs: number;

  /**
   * Compressed image as a Blob.
   * Format is determined by FrameCaptureConfig.imageFormat.
   * Blob reference is valid until the session is reset/destroyed.
   */
  blob: Blob;

  /**
   * Actual MIME type of the blob (e.g. 'image/webp').
   * May differ from config if the browser fell back to JPEG.
   */
  mimeType: ImageFormat;

  /**
   * Pixel width of the captured image (= config.targetWidth unless overridden).
   */
  width: number;

  /**
   * Pixel height of the captured image (= config.targetHeight unless overridden).
   */
  height: number;

  /**
   * Blob size in bytes. Use for logging/monitoring.
   */
  sizeBytes: number;
}

// ---------------------------------------------------------------------------
// Session Result
// ---------------------------------------------------------------------------

/**
 * The final output of a completed capture session.
 * Handed off to the upload/API layer once the session reaches 'complete'.
 */
export interface FrameCaptureResult {
  /**
   * Ordered list of captured frames (oldest → newest).
   */
  frames: CapturedFrame[];

  /**
   * Total wall-clock duration of the capture session in milliseconds.
   */
  durationMs: number;

  /**
   * Configuration snapshot used during the session (for auditability).
   */
  config: Readonly<FrameCaptureConfig>;

  /**
   * Effective frames-per-second computed from actual capture timestamps.
   */
  effectiveFps: number;
}

// ---------------------------------------------------------------------------
// Hook Return Shape
// ---------------------------------------------------------------------------

/**
 * Public API surface exposed by the useFrameCapture hook.
 * All state is read-only from the consumer's perspective.
 */
export interface UseFrameCaptureReturn {
  /** Current session lifecycle state. */
  sessionState: CaptureSessionState;

  /** Frames collected so far in the active session. */
  frames: CapturedFrame[];

  /** Live preview stream to attach to a <video> element. */
  previewStream: MediaStream | null;

  /** Non-null only when sessionState === 'error'. */
  error: string | null;

  /** Start acquiring the webcam and begin frame sampling. */
  startCapture: (config?: Partial<FrameCaptureConfig>) => Promise<void>;

  /** Stop the interval and finalise the frame batch. */
  stopCapture: () => FrameCaptureResult | null;

  /** Discard all frames and reset to 'idle'. Releases the MediaStream. */
  resetSession: () => void;
}
