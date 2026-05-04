# Feature Specification: Batch Image Upload

**Feature Branch**: `batch-image-upload`  
**Created**: 2026-05-04  
**Status**: Draft  
**Input**: User description: "an API endpoint following professional code writing practices that does the following - it receives multiple image files (approximately > 20 frames) with a shared metadata object (containing the fields : userID , timestamp , name , registration number )."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Batch Upload Submission (Priority: P1)

As a client device (e.g., kiosk or mobile app), I need to upload a burst of >20 image frames along with user metadata in a single request, so that the user's face can be registered efficiently without timing out.

**Why this priority**: This is the core functionality. Without it, the application cannot collect the necessary face frames for machine learning processing.

**Independent Test**: Can be tested via an automated script (e.g., `curl` or Postman) sending a `multipart/form-data` payload with 20 images and a valid JSON metadata string. Success is validated by receiving a `202 Accepted` response and verifying the files are saved to the correct local disk directory.

**Acceptance Scenarios**:

1. **Given** a valid set of 20 images and complete metadata, **When** the client submits the request, **Then** the server saves the files to local disk and returns a `202 Accepted` response immediately.
2. **Given** a payload of 30 images, **When** the client submits the request, **Then** the server queues the background task for processing and closes the HTTP connection without waiting for the ML pipeline.

---

### User Story 2 - Partial Failure Handling (Priority: P2)

As a client device, if some of the image frames in my burst are corrupted or in an unsupported format, I want the server to process the valid ones anyway instead of rejecting the entire batch, so that registration can still succeed if enough valid frames remain.

**Why this priority**: Prevents high failure rates during registration where a single corrupted frame out of 30 would otherwise fail the whole process.

**Independent Test**: Can be tested by sending a payload containing 15 valid JPEGs and 5 corrupted text files masquerading as JPEGs.

**Acceptance Scenarios**:

1. **Given** a batch of images containing a mix of valid and invalid files, **When** submitted, **Then** the server ignores the invalid files, saves the valid ones to disk, and returns a generic success (`202 Accepted`).

---

### Edge Cases

- What happens when the client sends zero images in the request?
- How does the system handle a payload that exceeds maximum server upload size limits (e.g., > 100MB)?
- What happens if the local disk is full when attempting to save the files?
- How does the system handle a request where the metadata JSON is missing, malformed, or missing required fields (`userID`, `name`, etc.)?
- How does the system handle concurrent uploads for the exact same `userID` and `timestamp`?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST expose a public (unauthenticated) API endpoint to receive data.
- **FR-002**: System MUST accept requests formatted as `multipart/form-data`.
- **FR-003**: System MUST extract and validate a JSON metadata string containing the fields: `userID`, `timestamp`, `name`, and `registration number`.
- **FR-004**: System MUST accept multiple image file attachments within the same request payload.
- **FR-005**: System MUST save all valid image files to local disk storage for long-term retention.
- **FR-006**: System MUST use a "best effort" persistence strategy, gracefully ignoring invalid/corrupted frames without rolling back the entire request.
- **FR-007**: System MUST perform ML processing asynchronously in the background.
- **FR-008**: System MUST return an immediate `202 Accepted` response upon successfully writing the valid files to disk, before any heavy ML processing begins.

### Key Entities

- **UploadMetadata**: Represents the structured data accompanying the images (attributes: `userID`, `timestamp`, `name`, `registration number`).
- **ImageFrame**: A single image file extracted from the batch, saved to the local disk and linked to the `UploadMetadata` for background processing.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: API endpoint responds with a `202 Accepted` in under 1 second for a 20-image payload (assuming average 100KB per image) on a standard network.
- **SC-002**: 100% of valid images are successfully persisted to local disk during a successful request.
- **SC-003**: The background processing system successfully receives the event trigger to process the newly saved files 100% of the time following a `202` response.

## Assumptions

- **Environment**: The local disk has sufficient capacity to handle long-term storage of all image frames, or there is an external cron job managing disk space cleanup.
- **Architecture**: A background task worker (e.g., Celery, Redis Queue, or FastAPI BackgroundTasks) is available or will be configured to handle the asynchronous ML processing.
- **Security**: A public, unauthenticated endpoint is acceptable for this specific use case, likely because the endpoint is only accessible via a secure internal network or locked-down kiosk device.
