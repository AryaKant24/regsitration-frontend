import { useState, useRef, useCallback } from 'react';

/**
 * Recording states for the webcam capture flow.
 *
 * Flow: idle → previewing → recording → complete
 *
 * Future states to consider:
 * - 'extracting' — when frame extraction is added
 * - 'uploading'  — when backend upload is implemented
 */
const STATUS = {
  IDLE:       'idle',
  PREVIEWING: 'previewing',
  RECORDING:  'recording',
  COMPLETE:   'complete',
  ERROR:      'error',
};

/** Recording duration in seconds */
const RECORDING_DURATION = 10;

/** Target frame rate */
const TARGET_FPS = 30;

/**
 * useWebcamRecorder
 *
 * Custom hook that encapsulates the full webcam capture lifecycle.
 * Unlike auto-start, this hook waits for the user to explicitly trigger recording.
 *
 * Usage:
 *   1. Call `startPreview()` to open the camera and show a live feed
 *   2. Call `startRecording()` when the user is ready
 *   3. Recording auto-stops after RECORDING_DURATION seconds
 *   4. The `recordedBlob` is available for downstream processing
 *
 * Future extension points are marked with TODO comments.
 * The hook is structured so that the recorded Blob can later be:
 *   - Decoded into individual frames
 *   - Downsampled (e.g., 1 FPS from 30 FPS)
 *   - Packaged into a multipart/form-data payload for upload
 *
 * @returns {Object} Hook state and controls
 */
export function useWebcamRecorder() {
  const [status, setStatus] = useState(STATUS.IDLE);
  const [secondsLeft, setSecondsLeft] = useState(RECORDING_DURATION);
  const [error, setError] = useState(null);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [stream, setStream] = useState(null);

  // Refs for cleanup
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const countdownRef = useRef(null);

  /**
   * Stops all media tracks and clears timers.
   */
  const cleanup = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setStream(null);
    }
  }, []);

  /**
   * Opens the camera and starts showing a live preview.
   * Does NOT start recording — waits for startRecording() call.
   */
  const startPreview = useCallback(async () => {
    try {
      setError(null);
      setRecordedBlob(null);
      setSecondsLeft(RECORDING_DURATION);
      setStatus(STATUS.IDLE);

      // Request camera access — front-facing, 30 FPS, no audio
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          frameRate: { ideal: TARGET_FPS },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = mediaStream;
      setStream(mediaStream);
      setStatus(STATUS.PREVIEWING);
    } catch (err) {
      console.error('Camera access error:', err);
      setError(
        err.name === 'NotAllowedError'
          ? 'Camera access was denied. Please allow camera permissions and try again.'
          : err.name === 'NotFoundError'
            ? 'No camera found. Please connect a camera and try again.'
            : `Camera error: ${err.message}`
      );
      setStatus(STATUS.ERROR);
    }
  }, []);

  /**
   * Starts recording the webcam stream.
   * Automatically stops after RECORDING_DURATION seconds.
   */
  const startRecording = useCallback(() => {
    const currentStream = streamRef.current;
    if (!currentStream) return;

    // Determine the best supported MIME type
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
        ? 'video/webm;codecs=vp8'
        : 'video/webm';

    const recorder = new MediaRecorder(currentStream, { mimeType });
    mediaRecorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      // Assemble all chunks into a single Blob
      const blob = new Blob(chunksRef.current, { type: mimeType });
      setRecordedBlob(blob);
      setStatus(STATUS.COMPLETE);

      // Stop the camera stream after recording is complete
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        setStream(null);
      }

      // TODO: Extract frames from recorded Blob
      // Potential approach: decode the Blob using a <video> element + <canvas>,
      // seeking through the video at intervals to capture frames.
      //
      // Example pseudocode:
      //   const video = document.createElement('video');
      //   video.src = URL.createObjectURL(blob);
      //   // Seek to each timestamp, draw to canvas, extract ImageData

      // TODO: Downsample frames before upload
      // After frame extraction, select every Nth frame to reduce payload.
      // For example, if recorded at 30 FPS and we want 1 FPS:
      //   const sampledFrames = allFrames.filter((_, i) => i % 30 === 0);

      // TODO: Construct multipart/form-data payload
      // Package the sampled frames (as JPEG/PNG blobs) into FormData:
      //   const formData = new FormData();
      //   sampledFrames.forEach((frame, i) => {
      //     formData.append(`frame_${i}`, frame, `frame_${i}.jpg`);
      //   });
      //   await fetch('/api/upload', { method: 'POST', body: formData });
    };

    // Start recording — collect data every 500ms for smoother chunk assembly
    recorder.start(500);
    setStatus(STATUS.RECORDING);
    setSecondsLeft(RECORDING_DURATION);

    // Countdown timer
    let remaining = RECORDING_DURATION;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setSecondsLeft(remaining);

      if (remaining <= 0) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;

        if (recorder.state === 'recording') {
          recorder.stop();
        }
      }
    }, 1000);
  }, []);

  /**
   * Resets everything back to idle so the user can start over.
   */
  const reset = useCallback(() => {
    cleanup();
    setStatus(STATUS.IDLE);
    setError(null);
    setRecordedBlob(null);
    setSecondsLeft(RECORDING_DURATION);
  }, [cleanup]);

  return {
    /** Current stream for the video element */
    stream,
    /** Current recording status */
    status,
    /** Seconds remaining in the recording countdown */
    secondsLeft,
    /** The recorded video Blob (available after status === 'complete') */
    recordedBlob,
    /** Error message if status === 'error' */
    error,
    /** Total recording duration in seconds */
    totalDuration: RECORDING_DURATION,
    /** Open camera and show live preview */
    startPreview,
    /** Begin recording (must call startPreview first) */
    startRecording,
    /** Reset to idle state */
    reset,
    /** Cleanup resources */
    cleanup,
  };
}

export { STATUS };
