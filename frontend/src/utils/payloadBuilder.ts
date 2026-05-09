/**
 * PROD0-56: multipart/form-data Payload Builder
 *
 * Constructs a FormData object from captured frames and student metadata.
 * This is the bridge between the frame capture pipeline (PROD0-55) and the
 * eventual backend upload API call.
 *
 * Payload structure
 * ─────────────────
 * The FormData will contain:
 *
 *   Field Name         │ Type   │ Description
 *   ───────────────────┼────────┼──────────────────────────────────────────
 *   name               │ string │ Student's full name
 *   prn                │ string │ Permanent Registration Number
 *   frameCount         │ string │ Total number of frame files attached
 *   frame_000          │ File   │ First captured frame (image/webp or image/jpeg)
 *   frame_001          │ File   │ Second captured frame
 *   …                  │ …      │ …
 *   frame_NNN          │ File   │ Nth captured frame
 *
 * Each frame is appended as a File object (Blob + filename), so the backend
 * receives it as a standard file upload field.
 *
 * Usage
 * ─────
 *   import { buildRegistrationPayload } from '../utils/payloadBuilder';
 *
 *   const formData = buildRegistrationPayload(capturedFrames, studentMetadata);
 *
 *   // Later (PROD0-57+): send to backend
 *   // await fetch('/api/register', { method: 'POST', body: formData });
 */

import type { CapturedFrame } from '../types/frameCapture';
import type { StudentMetadata } from '../types/studentMetadata';

// ---------------------------------------------------------------------------
// Payload builder
// ---------------------------------------------------------------------------

/**
 * Build a multipart/form-data payload containing student metadata and
 * all sampled frames from the capture session.
 *
 * @param frames   - Array of CapturedFrame objects from useFrameCapture
 * @param metadata - Student registration information
 * @returns FormData ready to be used as the body of a fetch() POST request
 *
 * @throws {Error} If frames array is empty
 * @throws {Error} If any required metadata field is missing
 */
export function buildRegistrationPayload(
  frames: CapturedFrame[],
  metadata: StudentMetadata,
): FormData {
  // ── Validate inputs ─────────────────────────────────────────────────────
  validateMetadata(metadata);

  if (frames.length === 0) {
    throw new Error(
      '[PayloadBuilder] Cannot build payload: no frames provided. ' +
      'Ensure the capture session completed successfully before calling this function.',
    );
  }

  // ── Build FormData ──────────────────────────────────────────────────────
  const formData = new FormData();

  // Build required backend metadata as a JSON string.
  const metadataPayload = {
    userID: metadata.prn.trim(),
    timestamp: Date.now(),
    name: metadata.name.trim(),
    'registration number': metadata.prn.trim(),
  };

  formData.append('metadata', JSON.stringify(metadataPayload));
  formData.append('name', metadata.name.trim());
  formData.append('prn', metadata.prn.trim());
  formData.append('frameCount', String(frames.length));

  // Append each frame as a File object using the backend's upload field name.
  frames.forEach((frame) => {
    const extension = getExtensionFromMime(frame.mimeType);
    const paddedIndex = String(frame.index).padStart(3, '0');
    const fileName = `frame_${paddedIndex}.${extension}`;

    // Convert Blob → File so the backend receives a proper filename
    const file = new File([frame.blob], fileName, { type: frame.mimeType });
    formData.append('files', file, fileName);
  });

  return formData;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate that all required metadata fields are non-empty strings.
 * Throws a descriptive error listing all missing fields at once.
 */
function validateMetadata(metadata: StudentMetadata): void {
  const requiredFields: Array<{ key: keyof StudentMetadata; label: string }> = [
    { key: 'name', label: 'Name' },
    { key: 'prn', label: 'PRN Number' },
  ];

  const missing = requiredFields
    .filter(({ key }) => !metadata[key] || metadata[key].trim().length === 0)
    .map(({ label }) => label);

  if (missing.length > 0) {
    throw new Error(
      `[PayloadBuilder] Missing required metadata fields: ${missing.join(', ')}. ` +
      'All student information must be provided before building the upload payload.',
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map MIME type to file extension.
 */
function getExtensionFromMime(mimeType: string): string {
  switch (mimeType) {
    case 'image/webp':
      return 'webp';
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    default:
      return 'bin';
  }
}

// ---------------------------------------------------------------------------
// Debug / Logging
// ---------------------------------------------------------------------------

/**
 * Log a summary of the built FormData for debugging.
 * Useful during development — call after buildRegistrationPayload().
 *
 * @param formData - The FormData object to summarize
 */
export function logPayloadSummary(formData: FormData): void {
  const entries: Array<{ field: string; type: string; size: string }> = [];
  let totalSizeBytes = 0;

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      entries.push({
        field: key,
        type: value.type,
        size: `${(value.size / 1024).toFixed(1)} KB`,
      });
      totalSizeBytes += value.size;
    } else {
      entries.push({
        field: key,
        type: 'text',
        size: `${new Blob([value]).size} B`,
      });
      totalSizeBytes += new Blob([value]).size;
    }
  }

  console.group('[PayloadBuilder] FormData Summary');
  console.table(entries);
  console.log(
    `Total payload size: ${(totalSizeBytes / 1024).toFixed(1)} KB (${(totalSizeBytes / (1024 * 1024)).toFixed(2)} MB)`,
  );
  console.groupEnd();
}
