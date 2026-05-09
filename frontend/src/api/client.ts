export interface UploadResponse {
  message: string;
  task_id: string;
  userID: string;
  frames_received: number;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

export async function uploadFaceFrames(formData: FormData): Promise<UploadResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/faces/batch-images`, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMessage = typeof data === 'object' && data !== null
      ? (data.detail || data.message || JSON.stringify(data))
      : String(data);
    throw new Error(errorMessage || 'Upload failed');
  }

  return data as UploadResponse;
}
