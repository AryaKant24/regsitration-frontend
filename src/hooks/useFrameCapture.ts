/**
 * PROD0-55: Frame Extraction & Temporal Downsampling — React Hook
 *
 * useFrameCapture is the single integration point between React UI and the
 * frame capture pipeline. It:
 *   - Manages the full session state machine (idle → acquiring → capturing → complete)
 *   - Orchestrates StreamManager + FrameSampler
 *   - Ensures cleanup on unmount (prevents memory leaks in strict mode)
 *   - Exposes a minimal, typed API surface to consuming components
 *
 * Consumer example:
 * ─────────────────
 *   const { sessionState, frames, previewStream, startCapture, stopCapture, resetSession } =
 *     useFrameCapture();
 *
 *   // Attach previewStream to a <video> element via a separate useEffect or ref callback.
 *   // The hook does NOT render any DOM — it is purely logic.
 *
 * Architecture note — why is the video element owned by the hook, not the component?
 *   The hook needs to call video.play() and listen for 'loadeddata' before the
 *   FrameSampler starts. Owning the element internally (via useRef) prevents
 *   timing issues that arise when the component creates the element and the hook
 *   observes it via a forwarded ref.
 *   The consumer receives `previewStream` and attaches it to their own <video>
 *   element for display only — the hook's internal element is never rendered.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  CapturedFrame,
  CaptureSessionState,
  FrameCaptureConfig,
  FrameCaptureResult,
  UseFrameCaptureReturn,
} from '../types/frameCapture';
import { DEFAULT_CAPTURE_CONFIG } from '../utils/captureConfig';
import { FrameSampler } from '../utils/frameSampler';
import {
  acquireStream,
  attachStreamToVideo,
  detachStreamFromVideo,
  stopAllTracks,
} from '../utils/streamManager';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFrameCapture(): UseFrameCaptureReturn {
  // ── State ────────────────────────────────────────────────────────────────
  const [sessionState, setSessionState] = useState<CaptureSessionState>('idle');
  const [frames, setFrames] = useState<CapturedFrame[]>([]);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Refs (not state — changes must not trigger re-renders) ───────────────

  /** The active MediaStream from getUserMedia. */
  const streamRef = useRef<MediaStream | null>(null);

  /**
   * An internal, off-screen HTMLVideoElement used purely for drawImage().
   * This is never rendered to the DOM.
   *
   * Why a separate video element instead of reusing the consumer's preview <video>?
   *   The consumer's preview element may be muted/mirrored/styled in ways that
   *   affect what drawImage() sees. Using a dedicated element gives us a clean,
   *   unmodified feed.
   */
  const internalVideoRef = useRef<HTMLVideoElement | null>(null);

  /** The active FrameSampler instance. */
  const samplerRef = useRef<FrameSampler | null>(null);

  /** Config snapshot for the active session (used in stopCapture). */
  const activeConfigRef = useRef<FrameCaptureConfig>(DEFAULT_CAPTURE_CONFIG);

  /** Wall-clock time when startCapture() succeeded. */
  const sessionStartMsRef = useRef<number>(0);

  // ── Internal video element lifecycle ─────────────────────────────────────

  /**
   * Create or retrieve the internal video element.
   * It lives for the lifetime of the hook (component mount) not the session,
   * so we don't recreate it on every startCapture() call.
   */
  const getInternalVideo = useCallback((): HTMLVideoElement => {
    if (!internalVideoRef.current) {
      const video = document.createElement('video');
      // Required for drawImage() to receive real frames:
      video.muted = true;
      video.playsInline = true;
      internalVideoRef.current = video;
    }
    return internalVideoRef.current;
  }, []);

  // ── Cleanup helper ────────────────────────────────────────────────────────

  /**
   * Full cleanup: stop sampler + release camera + detach video element.
   * Called on resetSession(), on unmount, and implicitly at session end.
   *
   * Order matters:
   *   1. Stop the sampler (clears interval, releases canvas backing store)
   *   2. Stop media tracks (releases OS camera lock)
   *   3. Detach stream from internal video element
   *   4. Clear our stream reference
   *   5. Update React state
   */
  const cleanupSession = useCallback(() => {
    if (samplerRef.current) {
      samplerRef.current.stop();
      samplerRef.current = null;
    }

    if (streamRef.current) {
      stopAllTracks(streamRef.current);
      streamRef.current = null;
    }

    const video = internalVideoRef.current;
    if (video) {
      detachStreamFromVideo(video);
    }

    setPreviewStream(null);
  }, []);

  // ── Unmount cleanup ───────────────────────────────────────────────────────

  /**
   * React Strict Mode in development calls useEffect cleanup twice to detect
   * side-effect bugs. cleanupSession() is idempotent (checks refs before
   * operating), so it is safe in strict mode.
   */
  useEffect(() => {
    return () => {
      cleanupSession();
    };
  }, [cleanupSession]);

  // ── startCapture ─────────────────────────────────────────────────────────

  const startCapture = useCallback(
    async (overrides?: Partial<FrameCaptureConfig>): Promise<void> => {
      // Reset any previous error and frames before starting.
      setError(null);
      setFrames([]);
      setSessionState('acquiring');

      // Merge caller overrides with production defaults.
      const config: FrameCaptureConfig = {
        ...DEFAULT_CAPTURE_CONFIG,
        ...overrides,
      };
      activeConfigRef.current = config;

      try {
        // Step 1: Acquire the camera stream.
        const stream = await acquireStream(config);
        streamRef.current = stream;

        // Expose stream to consumer so they can attach it to their preview <video>.
        setPreviewStream(stream);

        // Step 2: Attach stream to internal video for drawImage() use.
        const video = getInternalVideo();
        await attachStreamToVideo(video, stream);

        // Step 3: Start the temporal sampling loop.
        sessionStartMsRef.current = Date.now();
        setSessionState('capturing');

        const sampler = new FrameSampler(video, config, {
          onFrameCaptured: (frame) => {
            // Append to state using functional updater to avoid stale closures.
            setFrames((prev) => [...prev, frame]);
          },
          onComplete: (allFrames) => {
            setFrames(allFrames);
            setSessionState('complete');
            // Don't call cleanupSession() here — the caller may still need
            // to read frames from state before uploading.
          },
          onError: (err, frameIndex) => {
            console.warn(
              `[useFrameCapture] Frame ${frameIndex} extraction failed:`,
              err.message,
            );
            // Non-fatal: session continues. Only transition to error state
            // if stopOnError is set in SamplerOptions.
          },
        });

        samplerRef.current = sampler;
        sampler.start();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setSessionState('error');
        cleanupSession();
      }
    },
    [cleanupSession, getInternalVideo],
  );

  // ── stopCapture ───────────────────────────────────────────────────────────

  /**
   * Manually stop capture before maxFrames is reached.
   * Returns a FrameCaptureResult snapshot for immediate consumption,
   * or null if there is no active session.
   *
   * Note: this does NOT release the camera. Call resetSession() for that.
   * This allows the caller to review frames before deciding to re-capture.
   */
  const stopCapture = useCallback((): FrameCaptureResult | null => {
    if (!samplerRef.current) return null;

    samplerRef.current.stop();
    const capturedFrames = samplerRef.current.getFrames();
    const durationMs = Date.now() - sessionStartMsRef.current;

    setSessionState('complete');

    if (capturedFrames.length === 0) {
      return {
        frames: [],
        durationMs,
        config: activeConfigRef.current,
        effectiveFps: 0,
      };
    }

    // Compute effective FPS from actual timestamps (more accurate than dividing
    // by captureIntervalMs, which may drift slightly due to JS timer imprecision).
    const firstTs = capturedFrames[0].capturedAtMs;
    const lastTs = capturedFrames[capturedFrames.length - 1].capturedAtMs;
    const spanMs = lastTs - firstTs || 1; // avoid division by zero
    const effectiveFps =
      ((capturedFrames.length - 1) / spanMs) * 1000;

    const result: FrameCaptureResult = {
      frames: capturedFrames,
      durationMs,
      config: activeConfigRef.current,
      effectiveFps: Math.round(effectiveFps * 10) / 10, // 1 decimal place
    };

    return result;
  }, []);

  // ── resetSession ─────────────────────────────────────────────────────────

  /**
   * Discard all frames and return to 'idle'. Releases the camera lock.
   * Call this when the user cancels, when registration is complete, or
   * before navigating away from the capture page.
   */
  const resetSession = useCallback((): void => {
    cleanupSession();
    setFrames([]);
    setError(null);
    setSessionState('idle');
  }, [cleanupSession]);

  // ── Return ────────────────────────────────────────────────────────────────

  return {
    sessionState,
    frames,
    previewStream,
    error,
    startCapture,
    stopCapture,
    resetSession,
  };
}
