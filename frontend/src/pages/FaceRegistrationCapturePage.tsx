/**
 * PROD0-55: Frame Extraction & Temporal Downsampling — Demo Integration Page
 *
 * This page wires together all PROD0-55 modules as a working demonstration:
 *   useFrameCapture hook → WebcamPreview → CaptureProgress → frame batch
 *
 * Scope of this page:
 *   ✅ Start / Stop / Reset capture session
 *   ✅ Show live webcam preview
 *   ✅ Show real-time frame count and progress
 *   ✅ Display captured frame thumbnails (blob → object URL → <img>)
 *   ✅ Log FrameCaptureResult to console for handoff to upload layer
 *
 *   ❌ Upload to backend (PROD0-56+)
 *   ❌ Face validation / embedding (backend)
 *   ❌ Student metadata form (separate page/task)
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { FrameCaptureResult } from '../types/frameCapture';
import { DEFAULT_CAPTURE_CONFIG } from '../utils/captureConfig';
import { useFrameCapture } from '../hooks/useFrameCapture';
import WebcamPreview from '../components/WebcamPreview';
import CaptureProgress from '../components/CaptureProgress';

// ---------------------------------------------------------------------------
// Helper: Object URL lifecycle management for thumbnail display
// ---------------------------------------------------------------------------

/**
 * Convert a Blob to an object URL for rendering in an <img> tag.
 *
 * Memory management: Object URLs must be revoked when no longer needed,
 * otherwise they persist until the page is navigated away. We track them in
 * a ref and revoke them all in the cleanup effect below.
 *
 * We do NOT use URL.createObjectURL() inside the render path (no side effects
 * during render) — conversion happens in a useEffect.
 */
function useBlobUrls(blobs: Blob[]): string[] {
  const [urls, setUrls] = useState<string[]>([]);
  // Tracks the URLs currently shown in the DOM so we can revoke them
  // only when we have new replacements ready — never before.
  const activeUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    if (blobs.length === 0) {
      // Session was reset — revoke whatever was showing and clear state.
      activeUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      activeUrlsRef.current = [];
      setUrls([]);
      return;
    }

    // Create new Object URLs from the stable blob references.
    const newUrls = blobs.map((blob) => URL.createObjectURL(blob));

    // Revoke the PREVIOUS batch only after new URLs are ready.
    // This is the correct order: create first, then revoke old ones.
    // The old pattern (revoke in cleanup) fired BEFORE the new render
    // painted the <img> tags, causing broken image icons.
    activeUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    activeUrlsRef.current = newUrls;

    setUrls(newUrls);

    // No cleanup return here intentionally:
    // Revoking on re-run is handled above (revoke before setUrls).
    // Revoking on unmount is handled by the separate unmount effect below.
  }, [blobs]);

  // Separate unmount-only cleanup to revoke any remaining URLs when the
  // component is destroyed. An empty dependency array ensures this fires
  // exactly once — on unmount — never during re-renders.
  useEffect(() => {
    return () => {
      activeUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return urls;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

const FaceRegistrationCapturePage: React.FC = () => {
  const {
    sessionState,
    frames,
    previewStream,
    error,
    startCapture,
    stopCapture,
    resetSession,
  } = useFrameCapture();

  const [captureResult, setCaptureResult] = useState<FrameCaptureResult | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');


  // Derive boolean flags immediately so they are available to the useMemo below.
  const isCapturing = sessionState === 'capturing';
  const isAcquiring = sessionState === 'acquiring';
  const isComplete  = sessionState === 'complete';
  const isIdle      = sessionState === 'idle';

  // Build the blob array only when the session is complete and memoize it
  // so the reference stays stable between re-renders.
  //
  // Root cause of the previous bug:
  //   frames.map(...) on every render creates a NEW array reference each time
  //   even if the blobs inside are identical. useBlobUrls's useEffect treats
  //   any new reference as a change, fires every render, revokes the URLs
  //   before <img> can paint them, and calls setUrls() again — causing an
  //   infinite re-render loop and broken thumbnails.
  //
  // Fix: useMemo with [isComplete, frames] as dependencies.
  //   - During capture: isComplete=false → always returns [] → no URLs generated
  //   - On completion:  isComplete flips to true, frames is the final stable
  //     array → memoized blob array is created once and never recreated
  const frameBlobs = useMemo(
    () => (isComplete ? frames.map((f) => f.blob) : []),
    [isComplete, frames], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const thumbnailUrls = useBlobUrls(frameBlobs);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleStart = async (): Promise<void> => {
    setCaptureResult(null);
    await startCapture(); // Uses DEFAULT_CAPTURE_CONFIG
  };

  const handleStop = (): void => {
    const result = stopCapture();
    if (result) {
      setCaptureResult(result);
      // This is the handoff point to PROD0-56 (upload layer).
      // Replace this console.log with your upload function call.
      console.info('[PROD0-55] Frame batch ready for upload:', {
        frameCount: result.frames.length,
        effectiveFps: result.effectiveFps,
        durationMs: result.durationMs,
        totalSizeKB: Math.round(
          result.frames.reduce((sum, f) => sum + f.sizeBytes, 0) / 1024,
        ),
        config: result.config,
      });
    }
  };

  const handleReset = (): void => {
    setCaptureResult(null);
    setSaveStatus('idle');
    resetSession();
  };

  const handleSaveToPC = async (): Promise<void> => {
    if (!captureResult || captureResult.frames.length === 0) return;

    try {
      setSaveStatus('saving');
      
      // Request directory access from user
      if (!('showDirectoryPicker' in window)) {
        alert('Your browser does not support the File System Access API. Please use Chrome, Edge, or Opera.');
        setSaveStatus('error');
        return;
      }

      const directoryHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
      });

      // Write each frame to the selected directory
      for (const frame of captureResult.frames) {
        const extension = frame.mimeType.split('/')[1] === 'jpeg' ? 'jpg' : frame.mimeType.split('/')[1];
        const fileName = `frame_${String(frame.index + 1).padStart(3, '0')}.${extension}`;
        
        const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(frame.blob);
        await writable.close();
      }

      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      // AbortError is thrown when user cancels the picker
      if ((err as Error).name === 'AbortError') {
        setSaveStatus('idle');
        return;
      }
      console.error('[PROD0-55] Failed to save frames:', err);
      setSaveStatus('error');
    }
  };

  // Auto-capture result on completion
  useEffect(() => {
    if (sessionState === 'complete' && !captureResult) {
      handleStop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionState]);

  // ── Render ────────────────────────────────────────────────────────────────


  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#030712',
        color: '#f9fafb',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '32px 24px',
        boxSizing: 'border-box',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1
          style={{
            fontSize: '22px',
            fontWeight: 700,
            color: '#f9fafb',
            marginBottom: '4px',
          }}
        >
          Face Registration — Frame Capture
        </h1>
        <p
          style={{
            fontSize: '13px',
            color: '#6b7280',
            marginBottom: '28px',
          }}
        >
          PROD0-55 · Every {DEFAULT_CAPTURE_CONFIG.frameSkipN}th decoded frame · ~{Math.round(30 / DEFAULT_CAPTURE_CONFIG.frameSkipN)} FPS effective ·{' '}
          {DEFAULT_CAPTURE_CONFIG.targetWidth}×{DEFAULT_CAPTURE_CONFIG.targetHeight} ·{' '}
          {DEFAULT_CAPTURE_CONFIG.imageFormat === 'image/webp' ? 'WebP' : 'JPEG'} q
          {DEFAULT_CAPTURE_CONFIG.imageQuality}
        </p>

        {/* ── Webcam preview ──────────────────────────────────────────── */}
        <WebcamPreview
          stream={previewStream}
          mirror={true}
          width={640}
          height={480}
          className="capture-preview"
        />

        {/* ── Progress ────────────────────────────────────────────────── */}
        <div style={{ marginTop: '16px' }}>
          <CaptureProgress
            sessionState={sessionState}
            framesCaptured={frames.length}
            maxFrames={DEFAULT_CAPTURE_CONFIG.maxFrames}
          />
        </div>

        {/* ── Error banner ────────────────────────────────────────────── */}
        {error && (
          <div
            style={{
              marginTop: '12px',
              padding: '10px 14px',
              backgroundColor: '#7f1d1d',
              border: '1px solid #ef4444',
              borderRadius: '8px',
              fontSize: '13px',
              color: '#fca5a5',
            }}
          >
            {error}
          </div>
        )}

        {/* ── Controls ────────────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            marginTop: '20px',
            flexWrap: 'wrap',
          }}
        >
          {/* Start button */}
          <button
            id="btn-start-capture"
            onClick={handleStart}
            disabled={isAcquiring || isCapturing}
            style={{
              padding: '10px 20px',
              backgroundColor:
                isAcquiring || isCapturing ? '#374151' : '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: isAcquiring || isCapturing ? 'not-allowed' : 'pointer',
              transition: 'background-color 200ms',
            }}
          >
            {isAcquiring ? 'Requesting Camera…' : isCapturing ? 'Capturing…' : 'Start Capture'}
          </button>

          {/* Stop button */}
          <button
            id="btn-stop-capture"
            onClick={handleStop}
            disabled={!isCapturing}
            style={{
              padding: '10px 20px',
              backgroundColor: isCapturing ? '#f59e0b' : '#374151',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: isCapturing ? 'pointer' : 'not-allowed',
              transition: 'background-color 200ms',
            }}
          >
            Stop
          </button>

          {/* Reset button */}
          <button
            id="btn-reset-capture"
            onClick={handleReset}
            disabled={isIdle && frames.length === 0}
            style={{
              padding: '10px 20px',
              backgroundColor: '#1f2937',
              color: '#9ca3af',
              border: '1px solid #374151',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: (isIdle && frames.length === 0) ? 'not-allowed' : 'pointer',
              transition: 'background-color 200ms',
            }}
          >
            Reset
          </button>

          {/* Save to PC button */}
          {isComplete && captureResult && (
            <button
              id="btn-save-to-pc"
              onClick={handleSaveToPC}
              disabled={saveStatus === 'saving'}
              style={{
                padding: '10px 20px',
                backgroundColor: 
                  saveStatus === 'success' ? '#065f46' : 
                  saveStatus === 'error' ? '#991b1b' : 
                  '#8b5cf6',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: saveStatus === 'saving' ? 'not-allowed' : 'pointer',
                transition: 'all 200ms ease',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
              }}
            >
              {saveStatus === 'saving' ? (
                <>
                  <span className="spinner">◌</span> Saving…
                </>
              ) : saveStatus === 'success' ? (
                '✓ Saved to PC'
              ) : saveStatus === 'error' ? (
                '⚠ Save Failed'
              ) : (
                'Download Frames to PC'
              )}
            </button>
          )}
        </div>

        {/* ── Result summary ──────────────────────────────────────────── */}
        {captureResult && (
          <div
            style={{
              marginTop: '24px',
              padding: '14px 16px',
              backgroundColor: '#064e3b',
              border: '1px solid #10b981',
              borderRadius: '8px',
              fontSize: '13px',
            }}
          >
            <strong style={{ color: '#6ee7b7' }}>Session Complete</strong>
            <div style={{ marginTop: '8px', color: '#d1fae5', lineHeight: '1.8' }}>
              Frames: <strong>{captureResult.frames.length}</strong> ·{' '}
              Duration: <strong>{(captureResult.durationMs / 1000).toFixed(1)}s</strong> ·{' '}
              Effective FPS: <strong>{captureResult.effectiveFps}</strong> ·{' '}
              Total size:{' '}
              <strong>
                {Math.round(
                  captureResult.frames.reduce((s, f) => s + f.sizeBytes, 0) / 1024,
                )}{' '}
                KB
              </strong>
            </div>
          </div>
        )}

        {/* ── Thumbnail strip ─────────────────────────────────────────── */}
        {isComplete && thumbnailUrls.length > 0 && (
          <div style={{ marginTop: '24px' }}>
            <p
              style={{
                fontSize: '12px',
                color: '#6b7280',
                marginBottom: '10px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Captured frames ({thumbnailUrls.length})
            </p>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px',
              }}
            >
              {thumbnailUrls.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={`Frame ${i}`}
                  width={80}
                  height={60}
                  style={{
                    objectFit: 'cover',
                    borderRadius: '4px',
                    border: '1px solid #1f2937',
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FaceRegistrationCapturePage;
