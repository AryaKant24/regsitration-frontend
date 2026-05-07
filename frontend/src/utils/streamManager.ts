/**
 * PROD0-55: Frame Extraction & Temporal Downsampling — MediaStream Manager
 *
 * Owns the lifecycle of the raw webcam MediaStream:
 *   - Acquiring the stream via getUserMedia
 *   - Attaching the stream to an HTMLVideoElement
 *   - Releasing all tracks on cleanup
 *
 * Isolated from the sampling logic so either layer can be swapped out
 * independently (e.g., replace getUserMedia with a pre-recorded test stream).
 *
 * IMPORTANT: Every MediaStreamTrack holds an OS-level resource (camera lock).
 * Failing to call stopAllTracks() will keep the camera indicator LED on and
 * prevent other applications from accessing the camera. Always call
 * stopAllTracks() when the session ends.
 */

import type { FrameCaptureConfig } from '../types/frameCapture';
import { buildMediaConstraints } from './captureConfig';

// ---------------------------------------------------------------------------
// Stream acquisition
// ---------------------------------------------------------------------------

/**
 * Request a live webcam stream matching our resolution/frame-rate constraints.
 *
 * Uses `ideal` constraints (not `exact`) so the browser selects the closest
 * supported camera mode rather than rejecting the promise outright.
 *
 * Throws:
 *   - DOMException (NotAllowedError) if the user denies camera permission
 *   - DOMException (NotFoundError) if no camera is available
 *   - DOMException (OverconstrainedError) if constraints are impossible to satisfy
 *
 * Callers should surface these errors with user-friendly messages.
 */
export async function acquireStream(
  config: FrameCaptureConfig,
): Promise<MediaStream> {
  const constraints = buildMediaConstraints(config);

  // navigator.mediaDevices is undefined in non-HTTPS contexts (except localhost).
  // This is enforced by the browser, not our code — ensure kiosk is served over HTTPS.
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      '[StreamManager] getUserMedia is not available. Ensure the page is served over HTTPS.',
    );
  }

  return navigator.mediaDevices.getUserMedia(constraints);
}

// ---------------------------------------------------------------------------
// Video element attachment
// ---------------------------------------------------------------------------

/**
 * Bind a MediaStream to an HTMLVideoElement so that drawImage() on a canvas
 * can access the current camera frame.
 *
 * Design notes:
 *   - Setting srcObject directly (not .src = URL.createObjectURL()) avoids
 *     creating a MediaObjectURL that must be manually revoked.
 *   - autoplay = true is required; without it the <video> element won't paint
 *     frames, and canvas.drawImage() will produce a black image.
 *   - muted = true is required for autoplay to work in Chrome without user
 *     interaction (autoplay policy). Safe here because audio: false anyway.
 *   - playsInline = true prevents iOS Safari from entering full-screen mode.
 *
 * @returns Promise that resolves once the video element has loaded enough
 *          data for drawImage to produce a valid frame (loadeddata event).
 */
export function attachStreamToVideo(
  video: HTMLVideoElement,
  stream: MediaStream,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;

    // 'loadeddata' fires when the browser has decoded the first video frame.
    // This is the earliest point at which drawImage() will produce a non-black image.
    video.addEventListener('loadeddata', () => resolve(), { once: true });

    // Guard against cases where the stream is rejected or the element errors.
    video.addEventListener('error', (ev) => {
      reject(new Error(`[StreamManager] Video element error: ${ev.message}`));
    }, { once: true });

    // Begin playback. The promise from .play() is intentionally ignored here
    // because we resolve on 'loadeddata', which is more reliable.
    video.play().catch((err: Error) => {
      reject(new Error(`[StreamManager] video.play() failed: ${err.message}`));
    });
  });
}

// ---------------------------------------------------------------------------
// Track cleanup
// ---------------------------------------------------------------------------

/**
 * Stop all tracks on a MediaStream and release the camera resource.
 *
 * Iterating tracks and calling .stop() individually is the correct approach:
 *   - stream.stop() is deprecated and removed in modern browsers
 *   - getTracks() returns both audio and video tracks; safe to stop all
 *
 * After this call the camera LED should turn off within ~100 ms.
 */
export function stopAllTracks(stream: MediaStream): void {
  stream.getTracks().forEach((track) => {
    track.stop();
  });
}

/**
 * Detach a stream from a video element and release the object reference.
 * Call this after stopAllTracks() to fully sever the video element from
 * the camera resource.
 */
export function detachStreamFromVideo(video: HTMLVideoElement): void {
  video.pause();
  video.srcObject = null;
}
