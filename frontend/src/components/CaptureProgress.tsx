/**
 * PROD0-55: Frame Extraction & Temporal Downsampling — Capture Progress Bar
 *
 * Shows students visual feedback during the 180-degree turn:
 *   - How many frames have been captured so far
 *   - Overall progress toward the maxFrames target
 *   - Current session state as a status label
 *
 * This component has zero dependency on the capture internals — it only
 * receives props. Styling is inline to keep it self-contained and portable.
 */

import React from 'react';
import type { CaptureSessionState } from '../types/frameCapture';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CaptureProgressProps {
  sessionState: CaptureSessionState;
  framesCaptured: number;
  maxFrames: number;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const STATE_LABELS: Record<CaptureSessionState, string> = {
  idle: 'Ready to start',
  acquiring: 'Requesting camera access…',
  capturing: 'Capturing — please turn slowly',
  complete: 'Capture complete',
  error: 'An error occurred',
};

const STATE_COLORS: Record<CaptureSessionState, string> = {
  idle: '#6b7280',
  acquiring: '#f59e0b',
  capturing: '#3b82f6',
  complete: '#10b981',
  error: '#ef4444',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const CaptureProgress: React.FC<CaptureProgressProps> = ({
  sessionState,
  framesCaptured,
  maxFrames,
}) => {
  const percentage =
    maxFrames > 0 ? Math.min((framesCaptured / maxFrames) * 100, 100) : 0;
  const color = STATE_COLORS[sessionState];
  const label = STATE_LABELS[sessionState];

  return (
    <div
      style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '12px 16px',
        backgroundColor: '#111827',
        borderRadius: '8px',
        border: `1px solid ${color}33`,
      }}
    >
      {/* Status label row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
        }}
      >
        <span style={{ color, fontSize: '13px', fontWeight: 500 }}>
          {label}
        </span>
        {sessionState === 'capturing' || sessionState === 'complete' ? (
          <span style={{ color: '#9ca3af', fontSize: '12px' }}>
            {framesCaptured} / {maxFrames} frames
          </span>
        ) : null}
      </div>

      {/* Progress bar track */}
      <div
        style={{
          width: '100%',
          height: '6px',
          backgroundColor: '#1f2937',
          borderRadius: '3px',
          overflow: 'hidden',
        }}
      >
        {/* Progress bar fill */}
        <div
          style={{
            width: `${percentage}%`,
            height: '100%',
            backgroundColor: color,
            borderRadius: '3px',
            // Smooth visual update — CSS transition handles the animation.
            transition: 'width 200ms ease-out, background-color 300ms ease',
          }}
        />
      </div>
    </div>
  );
};

export default CaptureProgress;
