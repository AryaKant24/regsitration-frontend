import './ProgressIndicator.css';

/**
 * ProgressIndicator
 *
 * Displays a circular progress ring with frame count.
 * Uses SVG stroke-dashoffset for smooth animated progress.
 *
 * Props:
 *   - current: number — frames captured so far
 *   - total: number — total frames to capture
 *
 * Works with both time-based (secondsLeft/totalDuration) and
 * frame-based (current/total) progress tracking.
 */
export function ProgressIndicator({ current, total }) {
  const size = 64;
  const strokeWidth = 3.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const progress = total > 0 ? current / total : 0;
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="progress-indicator">
      <svg
        className="progress-indicator__ring"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
      >
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.2)"
          strokeWidth={strokeWidth}
        />
        {/* Animated progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="progress-indicator__arc"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="progress-indicator__seconds">{current}</span>
    </div>
  );
}
