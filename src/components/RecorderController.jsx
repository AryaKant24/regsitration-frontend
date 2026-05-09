import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useFrameCapture } from '../hooks/useFrameCapture';
import { DEFAULT_CAPTURE_CONFIG } from '../utils/captureConfig';
import { buildRegistrationPayload, logPayloadSummary } from '../utils/payloadBuilder';
import { CameraPreview } from './CameraPreview';
import { ProgressIndicator } from './ProgressIndicator';
import './RecorderController.css';

/**
 * useBlobUrls
 *
 * Convert an array of Blobs to Object URLs for rendering in <img> tags.
 * Handles memory management: revokes old URLs when new ones are created,
 * and revokes all on unmount.
 */
function useBlobUrls(blobs) {
  const [urls, setUrls] = useState([]);
  const activeUrlsRef = useRef([]);

  useEffect(() => {
    if (blobs.length === 0) {
      activeUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      activeUrlsRef.current = [];
      setUrls([]);
      return;
    }

    const newUrls = blobs.map((blob) => URL.createObjectURL(blob));
    activeUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    activeUrlsRef.current = newUrls;
    setUrls(newUrls);
  }, [blobs]);

  useEffect(() => {
    return () => {
      activeUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  return urls;
}

/**
 * RecorderController
 *
 * Full page section for face registration with a user-triggered flow:
 *   1. Landing: description + "Start Video Capture" button
 *   2. Previewing: live camera feed + "Begin Recording" button
 *   3. Capturing: live feed + progress ring + frame counter
 *   4. Complete: success message + thumbnails + save to PC
 *
 * The preview step lets the student position themselves before capture begins.
 * Uses the useFrameCapture hook (PROD0-55) for frame extraction & temporal downsampling.
 */
export function RecorderController() {
  const {
    sessionState,
    frames,
    previewStream: captureStream,
    error: captureError,
    startCapture,
    stopCapture,
    resetSession,
  } = useFrameCapture();

  // ── Local preview state (separate from capture hook) ───────────────────
  const [localStream, setLocalStream] = useState(null);
  const [isPreview, setIsPreview] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const localStreamRef = useRef(null);

  const [captureResult, setCaptureResult] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [uploadStatus, setUploadStatus] = useState('idle');

  // Mock student metadata for demonstration purposes
  const [studentMetadata] = useState({
    name: 'Jane Doe',
    prn: '12345678',
    department: 'Computer Science',
    division: 'A',
    rollNumber: '42',
  });

  const isCapturing = sessionState === 'capturing';
  const isAcquiring = sessionState === 'acquiring';
  const isComplete = sessionState === 'complete';
  const isIdle = sessionState === 'idle';
  const isError = sessionState === 'error' || previewError !== null;
  const displayError = previewError || captureError;

  // The stream to show: during preview use localStream, during capture use captureStream
  const activeStream = isPreview ? localStream : captureStream;

  // Compute progress
  const progress = DEFAULT_CAPTURE_CONFIG.maxFrames > 0
    ? Math.min(frames.length / DEFAULT_CAPTURE_CONFIG.maxFrames, 1)
    : 0;

  // Build blob array only when complete
  const frameBlobs = useMemo(
    () => (isComplete ? frames.map((f) => f.blob) : []),
    [isComplete, frames],
  );
  const thumbnailUrls = useBlobUrls(frameBlobs);

  // ── Cleanup preview stream ─────────────────────────────────────────────
  const cleanupPreview = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }
    setIsPreview(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupPreview();
    };
  }, [cleanupPreview]);

  // ── Handlers ────────────────────────────────────────────────────────────

  /** Step 1: Open camera and show live preview (no recording yet) */
  const handleStartPreview = async () => {
    try {
      setPreviewError(null);
      setCaptureResult(null);
      setSaveStatus('idle');

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          frameRate: { ideal: 30 },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      localStreamRef.current = mediaStream;
      setLocalStream(mediaStream);
      setIsPreview(true);
    } catch (err) {
      console.error('Camera access error:', err);
      setPreviewError(
        err.name === 'NotAllowedError'
          ? 'Camera access was denied. Please allow camera permissions and try again.'
          : err.name === 'NotFoundError'
            ? 'No camera found. Please connect a camera and try again.'
            : `Camera error: ${err.message}`
      );
    }
  };

  /** Step 2: Stop preview, start frame capture */
  const handleBeginCapture = async () => {
    // Stop the preview stream (hook will acquire its own)
    cleanupPreview();
    setCaptureResult(null);
    setSaveStatus('idle');
    await startCapture();
  };

  const handleStop = () => {
    const result = stopCapture();
    if (result) {
      setCaptureResult(result);
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

  const handleReset = () => {
    cleanupPreview();
    setCaptureResult(null);
    setSaveStatus('idle');
    setUploadStatus('idle');
    setPreviewError(null);
    resetSession();
  };

  const handleCancelPreview = () => {
    cleanupPreview();
    setPreviewError(null);
  };

  const handleSimulateUpload = async () => {
    if (!captureResult || captureResult.frames.length === 0) return;

    try {
      setUploadStatus('uploading');
      
      // 1. Build the multipart/form-data payload
      const formData = buildRegistrationPayload(captureResult.frames, studentMetadata);
      
      // 2. Log summary to console (for debugging/verification)
      logPayloadSummary(formData);
      
      // 3. Simulate API latency
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      setUploadStatus('success');
      setTimeout(() => setUploadStatus('idle'), 3000);
    } catch (err) {
      console.error('[PROD0-56] Payload build or upload failed:', err);
      setUploadStatus('error');
      setTimeout(() => setUploadStatus('idle'), 3000);
    }
  };

  const handleSaveToPC = async () => {
    if (!captureResult || captureResult.frames.length === 0) return;

    try {
      setSaveStatus('saving');

      if (!('showDirectoryPicker' in window)) {
        alert('Your browser does not support the File System Access API. Please use Chrome, Edge, or Opera.');
        setSaveStatus('error');
        return;
      }

      const directoryHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
      });

      const savePromises = captureResult.frames.map(async (frame) => {
        const extension = frame.mimeType.split('/')[1] === 'jpeg' ? 'jpg' : frame.mimeType.split('/')[1];
        const fileName = `frame_${String(frame.index + 1).padStart(3, '0')}.${extension}`;

        const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(frame.blob);
        await writable.close();
      });

      await Promise.all(savePromises);

      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      if (err.name === 'AbortError') {
        setSaveStatus('idle');
        return;
      }
      console.error('[PROD0-55] Failed to save frames:', err);
      setSaveStatus('error');
    }
  };

  // Auto-finalize result on completion
  useEffect(() => {
    if (sessionState === 'complete' && !captureResult) {
      handleStop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionState]);

  return (
    <section className="recorder" id="video-capture">
      <div className="recorder__container">

        {/* ---- IDLE: Landing state ---- */}
        {isIdle && !isPreview && !isError && (
          <div className="recorder__landing">
            <div className="recorder__landing-icon">
              <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
                <rect width="56" height="56" rx="14" fill="var(--color-primary-light)" />
                <path d="M20 22a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H22a2 2 0 01-2-2V22z" stroke="var(--color-primary)" strokeWidth="2" />
                <path d="M36 25l4-2.5v11L36 31" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="28" cy="27" r="3" stroke="var(--color-primary)" strokeWidth="1.5" />
              </svg>
            </div>
            <h2 className="recorder__landing-title">Face Registration</h2>
            <p className="recorder__landing-desc">
              We'll capture {DEFAULT_CAPTURE_CONFIG.maxFrames} frames of your face for identity verification.
              Please ensure you are in a well-lit environment and slowly turn your head during capture.
            </p>
            <div className="recorder__landing-steps">
              <div className="recorder__step">
                <span className="recorder__step-num">1</span>
                <span className="recorder__step-text">Allow camera access</span>
              </div>
              <div className="recorder__step">
                <span className="recorder__step-num">2</span>
                <span className="recorder__step-text">Position yourself in the frame</span>
              </div>
              <div className="recorder__step">
                <span className="recorder__step-num">3</span>
                <span className="recorder__step-text">Click record — frames are captured automatically</span>
              </div>
            </div>
            <button
              className="recorder__btn recorder__btn--primary"
              onClick={handleStartPreview}
              id="btn-start-capture"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M4 5a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" stroke="currentColor" strokeWidth="1.5" />
                <path d="M12 6.5l3-1.5v8l-3-1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Start Video Capture
            </button>
          </div>
        )}

        {/* ---- ERROR state ---- */}
        {isError && !isPreview && !isCapturing && !isAcquiring && (
          <div className="recorder__error">
            <div className="recorder__error-icon">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <circle cx="24" cy="24" r="22" stroke="var(--color-error)" strokeWidth="2" />
                <path d="M24 14v14" stroke="var(--color-error)" strokeWidth="2" strokeLinecap="round" />
                <circle cx="24" cy="34" r="1.5" fill="var(--color-error)" />
              </svg>
            </div>
            <h3 className="recorder__error-title">Camera Access Failed</h3>
            <p className="recorder__error-text">{displayError}</p>
            <button className="recorder__btn recorder__btn--primary" onClick={handleStartPreview}>
              Try Again
            </button>
          </div>
        )}

        {/* ---- PREVIEWING: Camera feed + Begin Recording button ---- */}
        {isPreview && isIdle && (
          <div className="recorder__capture">
            <div className="recorder__capture-header">
              <span className="recorder__status-badge recorder__status-badge--preview">
                <span className="recorder__status-dot recorder__status-dot--live" />
                Camera Ready
              </span>
              <p className="recorder__capture-hint">
                Position yourself in the center of the frame and click <strong>Begin Recording</strong> when ready.
              </p>
            </div>

            <CameraPreview stream={activeStream} isRecording={false} />

            <div className="recorder__capture-actions">
              <button
                className="recorder__btn recorder__btn--secondary"
                onClick={handleCancelPreview}
              >
                Cancel
              </button>
              <button
                className="recorder__btn recorder__btn--record"
                onClick={handleBeginCapture}
                id="btn-begin-recording"
              >
                <span className="recorder__btn-record-dot" />
                Begin Recording
              </button>
            </div>
          </div>
        )}

        {/* ---- ACQUIRING: Requesting camera for capture ---- */}
        {isAcquiring && (
          <div className="recorder__capture">
            <div className="recorder__capture-header">
              <span className="recorder__status-badge recorder__status-badge--preview">
                <span className="recorder__status-dot recorder__status-dot--live" />
                Starting capture…
              </span>
              <p className="recorder__capture-hint">
                Initializing frame capture pipeline.
              </p>
            </div>
            <CameraPreview stream={null} isRecording={false} />
          </div>
        )}

        {/* ---- CAPTURING: Camera feed + frame progress ---- */}
        {isCapturing && (
          <div className="recorder__capture">
            <div className="recorder__capture-header">
              <span className="recorder__status-badge recorder__status-badge--recording">
                <span className="recorder__status-dot recorder__status-dot--rec" />
                Recording in progress
              </span>
              <p className="recorder__capture-hint">
                Please turn your head slowly. Frames are captured automatically.
              </p>
            </div>

            <CameraPreview stream={captureStream} isRecording={true}>
              <ProgressIndicator
                current={frames.length}
                total={DEFAULT_CAPTURE_CONFIG.maxFrames}
              />
            </CameraPreview>

            {/* Frame counter */}
            <div className="recorder__frame-counter">
              <div className="recorder__frame-bar-track">
                <div
                  className="recorder__frame-bar-fill"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <span className="recorder__frame-count-text">
                {frames.length} / {DEFAULT_CAPTURE_CONFIG.maxFrames} frames
              </span>
            </div>

            <div className="recorder__capture-actions">
              <button
                className="recorder__btn recorder__btn--secondary"
                onClick={handleReset}
              >
                Cancel
              </button>
              <button
                className="recorder__btn recorder__btn--record"
                onClick={handleStop}
                id="btn-stop-capture"
              >
                <span className="recorder__btn-record-dot" />
                Stop Early
              </button>
            </div>
          </div>
        )}

        {/* ---- COMPLETE: Success + thumbnails + save ---- */}
        {isComplete && (
          <div className="recorder__complete">
            <div className="recorder__complete-icon">
              <svg viewBox="0 0 56 56" width="56" height="56" fill="none">
                <circle cx="28" cy="28" r="26" stroke="var(--color-success)" strokeWidth="2" />
                <path
                  d="M18 29l7 7 13-13"
                  stroke="var(--color-success)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="recorder__check-path"
                />
              </svg>
            </div>
            <h2 className="recorder__complete-title">Capture Complete</h2>
            <p className="recorder__complete-desc">
              {captureResult ? (
                <>
                  <strong>{captureResult.frames.length}</strong> frames captured in{' '}
                  <strong>{(captureResult.durationMs / 1000).toFixed(1)}s</strong>
                  {' · '}Effective FPS: <strong>{captureResult.effectiveFps}</strong>
                  {' · '}Total size:{' '}
                  <strong>
                    {Math.round(
                      captureResult.frames.reduce((s, f) => s + f.sizeBytes, 0) / 1024,
                    )}{' '}KB
                  </strong>
                </>
              ) : (
                'Your face has been captured successfully.'
              )}
            </p>

            {/* Thumbnail strip */}
            {thumbnailUrls.length > 0 && (
              <div className="recorder__thumbnails">
                <p className="recorder__thumbnails-label">
                  Captured frames ({thumbnailUrls.length})
                </p>
                <div className="recorder__thumbnails-grid">
                  {thumbnailUrls.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={`Frame ${i + 1}`}
                      className="recorder__thumbnail"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="recorder__complete-actions">
              <button
                className="recorder__btn recorder__btn--secondary"
                onClick={handleReset}
                id="btn-retake"
              >
                Retake
              </button>
              {captureResult && (
                <button
                  className={`recorder__btn recorder__btn--save ${
                    saveStatus === 'success' ? 'recorder__btn--save-success' :
                    saveStatus === 'error' ? 'recorder__btn--save-error' : ''
                  }`}
                  onClick={handleSaveToPC}
                  disabled={saveStatus === 'saving'}
                  id="btn-save-to-pc"
                >
                  {saveStatus === 'saving' ? (
                    <>
                      <span className="recorder__spinner">◌</span> Saving…
                    </>
                  ) : saveStatus === 'success' ? (
                    '✓ Saved to PC'
                  ) : saveStatus === 'error' ? (
                    '⚠ Save Failed'
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M8 2v8M4 7l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M2 12v2h12v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Download Frames
                    </>
                  )}
                </button>
              )}
              {captureResult && (
                <button
                  className={`recorder__btn recorder__btn--primary ${
                    uploadStatus === 'success' ? 'recorder__btn--save-success' :
                    uploadStatus === 'error' ? 'recorder__btn--save-error' : ''
                  }`}
                  onClick={handleSimulateUpload}
                  disabled={uploadStatus === 'uploading'}
                  id="btn-simulate-upload"
                >
                  {uploadStatus === 'uploading' ? (
                    <>
                      <span className="recorder__spinner">◌</span> Building Payload…
                    </>
                  ) : uploadStatus === 'success' ? (
                    '✓ Payload Ready (See Console)'
                  ) : uploadStatus === 'error' ? (
                    '⚠ Build Failed'
                  ) : (
                    'Build Upload Payload'
                  )}
                </button>
              )}
            </div>
          </div>
        )}

      </div>
    </section>
  );
}
