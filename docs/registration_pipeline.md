# Registration Pipeline Design Document

## 1. System Overview
The registration pipeline is designed for a supervised, single-device Kiosk flow. A student steps up to the kiosk, is guided by a human operator to perform a 180° head turn, and their facial data along with metadata (Name, PRN, Division) is captured, verified, and stored for future attendance tracking.

## 2. Client-Side Processing (React/Vite Frontend)
To minimize network payload and optimize server performance, heavy video processing is shifted to the browser.
*   **Video Capture:** The kiosk UI opens a live webcam feed. The UI is minimal, relying on the operator for verbal instructions rather than complex on-screen tracking elements.
*   **Frame Extraction:** As the student turns, the browser extracts frames at fixed intervals directly from the video stream.
*   **Sampling:** The client samples down the extracted frames to a target batch size (e.g., 10-20 frames) representing the span of the movement.
*   **Transmission:** Once extraction is complete, the client sends a single, atomic `multipart/form-data` POST request containing all the sampled frames alongside the user's PRN, Name, and Division.

## 3. Server-Side Processing (FastAPI Backend)
The backend acts as the enforcement layer for data quality and identity uniqueness.
*   **Face Detection Validation:** Upon receiving the batch, the backend runs an ONNX Face Detector on each frame.
    *   *No Face:* If a frame contains no face, it is silently discarded.
    *   *Multiple Faces:* If *any* frame contains multiple faces, the entire registration request is immediately rejected with a specific error message to prevent contaminated embeddings.
*   **Embedding Extraction & Deduplication:** For valid frames, the backend extracts the facial embeddings using the ONNX Embedding Runner. It then calculates the similarity between embeddings to drop near-duplicates (ensuring the frames represent distinct angles, not just the user standing still).
*   **Threshold Check:** The system verifies if the remaining deduplicated frames meet the `min_frames` threshold required for a robust profile. If it fails, the request is rejected, prompting the kiosk to repeat the capture.

## 4. Data Storage and State Management
Data is staged securely to allow for immediate human-in-the-loop verification before becoming active.
*   **Dual Storage Strategy:** 
    *   *Cropped Images:* The individual, deduplicated face crops are saved to a storage provider (starting with local disk/blob) for operational auditing.
    *   *Vectors:* The deep learning embeddings are saved to the Vector Database. They are stored as *individual vectors* (not averaged), multiple vectors mapped to the single User ID/PRN.
*   **Stateful Registration:** The newly created User and Face records are initially saved with an `ApprovalStatus` of `PENDING`. In this state, their embeddings are excluded from active search pools (e.g., production attendance scanning).

## 5. Operator Verification Flow
The final step enforces the 180° turn requirement via human supervision.
*   **Immediate Review:** As soon as the backend finishes processing and staging the `PENDING` data, it returns the URLs of the final deduplicated face crops to the Kiosk.
*   **Human-in-the-Loop:** The frontend displays these frames. The operator visually verifies that the distinct frames represent a proper 180° turning motion.
*   **Approval:** If verified, the operator taps an "Approve" button on the Kiosk UI. This triggers a `PATCH` request to the backend, shifting the user's state to `APPROVED`, officially making their embeddings active for future recognition tasks.
