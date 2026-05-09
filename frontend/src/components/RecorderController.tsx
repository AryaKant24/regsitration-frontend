import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useFrameCapture } from '../hooks/useFrameCapture';
import { DEFAULT_CAPTURE_CONFIG } from '../utils/captureConfig';
import { buildRegistrationPayload, logPayloadSummary } from '../utils/payloadBuilder';
import { uploadFaceFrames } from '../api/client';
import type { StudentMetadata } from '../types/studentMetadata';
import { CameraPreview } from './CameraPreview';
import { ProgressIndicator } from './ProgressIndicator';
import './RecorderController.css';

// ---------------------------------------------------------------------------
// Helper: blob → object URL lifecycle
// ---------------------------------------------------------------------------

function useBlobUrls(blobs: Blob[]): string[] {
  const [urls, setUrls] = useState<string[]>([]);
  const activeUrlsRef = useRef<string[]>([]);

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
    return () => { activeUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)); };
  }, []);

  return urls;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RecorderControllerProps {
  /** Student metadata collected in Step 1 — injected into the upload payload. */
  studentMetadata: StudentMetadata;
  /** Called when user clicks "Change Details" to go back to Step 1. */
  onRetake?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * RecorderController
 *
 * Step 2 of registration. Full face-capture flow:
 *   1. Landing     — instructions + "Start Video Capture"
 *   2. Previewing  — live camera + "Begin Recording"
 *   3. Capturing   — live feed + progress ring + frame counter
 *   4. Complete    — thumbnails + payload builder + download
 *
 * studentMetadata (name, PRN) is forwarded to
 * buildRegistrationPayload() to produce the multipart/form-data payload.
 */
export function RecorderController({ studentMetadata, onRetake }: RecorderControllerProps) {
  const {
    sessionState,
    frames,
    previewStream: captureStream,
    error: captureError,
    startCapture,
    stopCapture,
    resetSession,
  } = useFrameCapture();

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const [captureResult, setCaptureResult] = useState<ReturnType<typeof stopCapture>>(null);
  const [saveStatus, setSaveStatus]     = useState<'idle' | 'saving'    | 'success' | 'error'>('idle');
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  const isCapturing = sessionState === 'capturing';
  const isAcquiring = sessionState === 'acquiring';
  const isComplete  = sessionState === 'complete';
  const isIdle      = sessionState === 'idle';
  const isError     = sessionState === 'error' || previewError !== null;
  const displayError = previewError ?? captureError;

  const activeStream = isPreview ? localStream : captureStream;

  const progress = DEFAULT_CAPTURE_CONFIG.maxFrames > 0
    ? Math.min(frames.length / DEFAULT_CAPTURE_CONFIG.maxFrames, 1)
    : 0;

  const frameBlobs = useMemo(
    () => (isComplete ? frames.map((f) => f.blob) : []),
    [isComplete, frames],
  );
  const thumbnailUrls = useBlobUrls(frameBlobs);

  // ── Preview stream cleanup ─────────────────────────────────────────────
  const cleanupPreview = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }
    setIsPreview(false);
  }, []);

  useEffect(() => () => cleanupPreview(), [cleanupPreview]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleStartPreview = async () => {
    try {
      setPreviewError(null);
      setCaptureResult(null);
      setSaveStatus('idle');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', frameRate: { ideal: 30 }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsPreview(true);
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      setPreviewError(
        e.name === 'NotAllowedError'  ? 'Camera access was denied. Please allow camera permissions and try again.'
        : e.name === 'NotFoundError' ? 'No camera found. Please connect a camera and try again.'
        : `Camera error: ${e.message ?? 'Unknown error'}`,
      );
    }
  };

  const handleBeginCapture = async () => {
    cleanupPreview();
    setCaptureResult(null);
    setSaveStatus('idle');
    setUploadStatus('idle');
    await startCapture();
  };

  const handleStop = () => {
    const result = stopCapture();
    if (result) {
      setCaptureResult(result);
      console.info('[PROD0-55] Frame batch ready for upload:', {
        frameCount:  result.frames.length,
        effectiveFps: result.effectiveFps,
        durationMs:  result.durationMs,
        totalSizeKB: Math.round(result.frames.reduce((s, f) => s + f.sizeBytes, 0) / 1024),
        student:     { name: studentMetadata.name, prn: studentMetadata.prn },
        config:      result.config,
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

  /** Build multipart FormData payload and send it to the backend. */
  const handleBuildPayload = async () => {
    if (!captureResult || captureResult.frames.length === 0) return;

    setUploadStatus('uploading');
    setUploadMessage(null);

    try {
      const formData = buildRegistrationPayload(captureResult.frames, studentMetadata);
      logPayloadSummary(formData);

      const response = await uploadFaceFrames(formData);
      setUploadStatus('success');
      setUploadMessage(response.message || 'Upload completed successfully.');
      console.info('[PROD0-56] Backend response:', response);

      setTimeout(() => {
        setUploadStatus('idle');
        setUploadMessage(null);
      }, 4000);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed due to an unknown error.';
      console.error('[PROD0-56] Upload failed:', errorMessage);
      setUploadStatus('error');
      setUploadMessage(errorMessage);
      setTimeout(() => setUploadStatus('idle'), 5000);
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
      type DirPickerWindow = Window & { showDirectoryPicker: (o?: object) => Promise<FileSystemDirectoryHandle> };
      const dirHandle = await (window as unknown as DirPickerWindow).showDirectoryPicker({ mode: 'readwrite' });
      await Promise.all(captureResult.frames.map(async (frame) => {
        const ext = frame.mimeType.split('/')[1] === 'jpeg' ? 'jpg' : frame.mimeType.split('/')[1];
        const name = `frame_${String(frame.index + 1).padStart(3, '0')}.${ext}`;
        const fh = await dirHandle.getFileHandle(name, { create: true });
        const w  = await fh.createWritable();
        await w.write(frame.blob);
        await w.close();
      }));
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'AbortError') { setSaveStatus('idle'); return; }
      console.error('[PROD0-55] Failed to save frames:', err);
      setSaveStatus('error');
    }
  };

  // Auto-finalise when session reaches 'complete' without manual stop
  useEffect(() => {
    if (sessionState === 'complete' && !captureResult) handleStop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionState]);

  // Auto-upload immediately once captureResult is available
  useEffect(() => {
    if (captureResult && captureResult.frames.length > 0 && uploadStatus === 'idle') {
      handleBuildPayload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureResult]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section className="recorder" id="video-capture">
      <div className="recorder__container">

        {/* Student identity pill */}
        <div className="recorder__student-pill">
          <span className="recorder__student-pill-label">Registering:</span>
          <strong>{studentMetadata.name}</strong>
          <span className="recorder__student-pill-sep">·</span>
          PRN {studentMetadata.prn}
          {onRetake && (
            <button className="recorder__student-pill-change" onClick={onRetake} type="button">
              Change
            </button>
          )}
        </div>

        {/* ---- IDLE ---- */}
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
              We'll capture {DEFAULT_CAPTURE_CONFIG.maxFrames} frames of your face for identity
              verification. Please ensure you are in a well-lit environment and slowly turn your
              head during capture.
            </p>
            <div className="recorder__landing-steps">
              {['Allow camera access', 'Position yourself in the frame', 'Click record — frames are captured automatically'].map((text, i) => (
                <div className="recorder__step" key={i}>
                  <span className="recorder__step-num">{i + 1}</span>
                  <span className="recorder__step-text">{text}</span>
                </div>
              ))}
            </div>
            <button className="recorder__btn recorder__btn--primary" onClick={handleStartPreview} id="btn-start-capture">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M4 5a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" stroke="currentColor" strokeWidth="1.5" />
                <path d="M12 6.5l3-1.5v8l-3-1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Start Video Capture
            </button>
          </div>
        )}

        {/* ---- ERROR ---- */}
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
            <button className="recorder__btn recorder__btn--primary" onClick={handleStartPreview}>Try Again</button>
          </div>
        )}

        {/* ---- PREVIEWING ---- */}
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
              <button className="recorder__btn recorder__btn--secondary" onClick={handleCancelPreview}>Cancel</button>
              <button className="recorder__btn recorder__btn--record" onClick={handleBeginCapture} id="btn-begin-recording">
                <span className="recorder__btn-record-dot" />
                Begin Recording
              </button>
            </div>
          </div>
        )}

        {/* ---- ACQUIRING ---- */}
        {isAcquiring && (
          <div className="recorder__capture">
            <div className="recorder__capture-header">
              <span className="recorder__status-badge recorder__status-badge--preview">
                <span className="recorder__status-dot recorder__status-dot--live" />
                Starting capture…
              </span>
              <p className="recorder__capture-hint">Initializing frame capture pipeline.</p>
            </div>
            <CameraPreview stream={null} isRecording={false} />
          </div>
        )}

        {/* ---- CAPTURING ---- */}
        {isCapturing && (
          <div className="recorder__capture">
            <div className="recorder__capture-header">
              <span className="recorder__status-badge recorder__status-badge--recording">
                <span className="recorder__status-dot recorder__status-dot--rec" />
                Recording in progress
              </span>
              <p className="recorder__capture-hint">Please turn your head slowly. Frames are captured automatically.</p>
            </div>
            <CameraPreview stream={captureStream} isRecording={true}>
              <ProgressIndicator current={frames.length} total={DEFAULT_CAPTURE_CONFIG.maxFrames} />
            </CameraPreview>
            <div className="recorder__frame-counter">
              <div className="recorder__frame-bar-track">
                <div className="recorder__frame-bar-fill" style={{ width: `${progress * 100}%` }} />
              </div>
              <span className="recorder__frame-count-text">
                {frames.length} / {DEFAULT_CAPTURE_CONFIG.maxFrames} frames
              </span>
            </div>
            <div className="recorder__capture-actions">
              <button className="recorder__btn recorder__btn--secondary" onClick={handleReset}>Cancel</button>
              <button className="recorder__btn recorder__btn--record" onClick={handleStop} id="btn-stop-capture">
                <span className="recorder__btn-record-dot" />
                Stop Early
              </button>
            </div>
          </div>
        )}

        {/* ---- COMPLETE ---- */}
        {isComplete && (
          <div className="recorder__complete">
            <div className="recorder__complete-icon">
              <svg viewBox="0 0 56 56" width="56" height="56" fill="none">
                <circle cx="28" cy="28" r="26" stroke="var(--color-success)" strokeWidth="2" />
                <path d="M18 29l7 7 13-13" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="recorder__check-path" />
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
                  <strong>{Math.round(captureResult.frames.reduce((s, f) => s + f.sizeBytes, 0) / 1024)} KB</strong>
                </>
              ) : 'Your face has been captured successfully.'}
            </p>

            {/* Upload status feedback strip */}
            {uploadStatus === 'uploading' && (
              <div className="recorder__upload-feedback recorder__upload-feedback--uploading">
                <span className="recorder__spinner">◌</span>{' '}Sending frames to backend for processing…
              </div>
            )}
            {uploadStatus === 'success' && uploadMessage && (
              <div className="recorder__upload-feedback recorder__upload-feedback--success">
                ✓ {uploadMessage}
              </div>
            )}
            {uploadStatus === 'error' && uploadMessage && (
              <div className="recorder__upload-feedback recorder__upload-feedback--error">
                ⚠ {uploadMessage}
              </div>
            )}

            {thumbnailUrls.length > 0 && (
              <div className="recorder__thumbnails">
                <p className="recorder__thumbnails-label">Captured frames ({thumbnailUrls.length})</p>
                <div className="recorder__thumbnails-grid">
                  {thumbnailUrls.map((url, i) => (
                    <img key={i} src={url} alt={`Frame ${i + 1}`} className="recorder__thumbnail" />
                  ))}
                </div>
              </div>
            )}

            <div className="recorder__complete-actions">
              <button className="recorder__btn recorder__btn--secondary" onClick={handleReset} id="btn-retake">
                Retake
              </button>
              {onRetake && (
                <button className="recorder__btn recorder__btn--secondary" onClick={onRetake} id="btn-change-details">
                  Change Details
                </button>
              )}
              {captureResult && (
                <button
                  className={`recorder__btn recorder__btn--save ${saveStatus === 'success' ? 'recorder__btn--save-success' : saveStatus === 'error' ? 'recorder__btn--save-error' : ''}`}
                  onClick={handleSaveToPC}
                  disabled={saveStatus === 'saving'}
                  id="btn-save-to-pc"
                >
                  {saveStatus === 'saving'   ? <><span className="recorder__spinner">◌</span> Saving…</>
                   : saveStatus === 'success' ? '✓ Saved to PC'
                   : saveStatus === 'error'   ? '⚠ Save Failed'
                   : (<><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2v8M4 7l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M2 12v2h12v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg> Download Frames</>)}
                </button>
              )}
              {captureResult && uploadStatus === 'error' && (
                <button
                  className="recorder__btn recorder__btn--primary"
                  onClick={handleBuildPayload}
                  disabled={uploadStatus === 'uploading'}
                  id="btn-retry-upload"
                >
                  Retry Upload
                </button>
              )}
            </div>
          </div>
        )}

      </div>
    </section>
  );
}
