/**
 * PROD0-55: Frame Extraction & Temporal Downsampling — Webcam Preview Component
 *
 * A thin, presentational component that:
 *   - Attaches a MediaStream to a <video> element for live preview
 *   - Applies CSS mirror transform so the user sees a natural selfie view
 *   - Does NOT perform any frame extraction (that is the hook's responsibility)
 *
 * Separation of concerns:
 *   WebcamPreview  →  rendering the live feed (display only)
 *   useFrameCapture →  capturing and downsampling frames (logic only)
 *
 * The consumer passes `stream` (from useFrameCapture().previewStream) as a prop.
 * When stream is null (idle / error), the component renders a placeholder.
 */

import React, { useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WebcamPreviewProps {
  /** Live MediaStream from useFrameCapture(). Null when no session is active. */
  stream: MediaStream | null;

  /**
   * Mirror the preview horizontally (default: true).
   * TRUE  → selfie/mirror mode (natural for the student facing the kiosk).
   * FALSE → raw camera orientation (matches what the backend receives).
   *
   * Important: This CSS transform does NOT affect the captured frames.
   * The capture canvas always draws the unmirrored image.
   */
  mirror?: boolean;

  /** Width in pixels. Should match config.targetWidth for accurate framing. */
  width?: number;

  /** Height in pixels. Should match config.targetHeight for accurate framing. */
  height?: number;

  /** Optional additional class name for custom container styling. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const WebcamPreview: React.FC<WebcamPreviewProps> = ({
  stream,
  mirror = true,
  width = 640,
  height = 480,
  className = '',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  /**
   * Synchronise the <video> element's srcObject with the stream prop.
   *
   * We use useEffect (not event handlers) because:
   *   - srcObject assignment is a side effect, not a render concern
   *   - useEffect runs after the DOM node is available (ref is populated)
   *   - The dependency array [stream] ensures we re-run when the stream changes
   *
   * We do NOT call stream.stop() here — the hook (useFrameCapture) owns
   * stream lifecycle. This component is purely presentational.
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (stream) {
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;

      // Ignore the returned promise; errors are handled by the hook.
      void video.play();
    } else {
      // Stream removed — pause and clear the source reference.
      video.pause();
      video.srcObject = null;
    }

    // No cleanup needed here: srcObject = null above handles the null case,
    // and stopping the stream is the hook's responsibility.
  }, [stream]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div
      className={`webcam-preview-container ${className}`}
      style={{
        width,
        height,
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#0a0a0a',
        borderRadius: '12px',
      }}
    >
      {/* Live video feed */}
      <video
        ref={videoRef}
        width={width}
        height={height}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          /**
           * Mirror transform for natural selfie view.
           * ONLY applied to the preview element — the capture canvas is unmirrored.
           * This is a pure CSS visual effect; it does not alter pixel data.
           */
          transform: mirror ? 'scaleX(-1)' : 'none',
        }}
        // Accessibility: this is a live feed, not a media asset.
        // Screen readers should not try to narrate it.
        aria-hidden="true"
      />

      {/* Overlay when stream is not yet active */}
      {!stream && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#6b7280',
            fontSize: '14px',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          Camera not active
        </div>
      )}
    </div>
  );
};

export default WebcamPreview;
