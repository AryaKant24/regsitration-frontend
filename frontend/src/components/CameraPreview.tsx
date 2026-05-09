import { useRef, useEffect } from 'react';
import './CameraPreview.css';

/**
 * CameraPreview
 *
 * Renders a live webcam feed inside a clean card.
 * The video is mirrored horizontally (selfie-style) for natural UX.
 *
 * Props:
 *   - stream: MediaStream | null — the live camera stream
 *   - isRecording: boolean — shows REC indicator
 *   - children: ReactNode — overlay content (progress indicator, etc.)
 *
 * Future extension:
 *   Could overlay frame extraction previews or show sampled frame thumbnails.
 */
export function CameraPreview({ stream, isRecording, children }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (video && stream) {
      video.srcObject = stream;
    }
    return () => {
      if (video) {
        video.srcObject = null;
      }
    };
  }, [stream]);

  return (
    <div className="camera-preview">
      <div className={`camera-preview__viewport ${isRecording ? 'camera-preview__viewport--recording' : ''}`}>
        <video
          ref={videoRef}
          className="camera-preview__video"
          autoPlay
          playsInline
          muted
        />

        {/* Recording indicator */}
        {isRecording && (
          <div className="camera-preview__rec-badge">
            <span className="camera-preview__rec-dot" />
            <span className="camera-preview__rec-text">REC</span>
          </div>
        )}

        {/* Overlay children (progress ring, etc.) */}
        {children}
      </div>
    </div>
  );
}
