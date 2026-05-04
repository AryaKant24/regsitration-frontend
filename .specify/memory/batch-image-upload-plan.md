# Implementation Plan: Batch Image Upload

**Branch**: `batch-image-upload` | **Date**: 2026-05-04  
**Input**: Feature specification from `.specify/memory/batch-image-upload-spec.md`

## Summary

Implement a public FastAPI endpoint that accepts `multipart/form-data` containing a JSON metadata object and >20 image frames. The system will save valid images to local disk, return a `202 Accepted` response immediately to prevent timeouts, and process the images asynchronously. 

## Technical Context

**Language/Version**: Python 3.11+
**Primary Dependencies**: FastAPI, Pydantic, python-multipart, aiofiles (for async disk I/O)
**Storage**: Local Server Disk (for image frames)
**Project Type**: Web Service (Backend)

## Step-by-Step Execution Plan

### Step 1: Define Schemas
**Target File**: `backend/app/schemas/upload.py`
- Create a Pydantic model (`UploadMetadata`) to validate the incoming JSON metadata string containing `userID`, `timestamp`, `name`, and `registration number`.
- Create a response schema for the 202 Accepted response.

### Step 2: Database Models & CRUD (Optional / As needed)
**Target File**: `backend/app/models/registration.py` (or existing user model)
**Target File**: `backend/app/crud/crud_registration.py`
- If the metadata needs to be persisted to a relational database prior to ML processing, define the SQLAlchemy models and corresponding CRUD operations here. 
- *Rule Check: Ensure no business logic or file I/O occurs in the CRUD layer.*

### Step 3: Implement Storage and Processing Service
**Target File**: `backend/app/services/upload_service.py`
- Implement `parse_metadata`: Extracts and validates the JSON string into the `UploadMetadata` schema.
- Implement `save_images_to_disk`: Asynchronously saves the valid `UploadFile` objects to the designated local storage directory. This function must implement the "Best Effort" logic—gracefully skipping unreadable/corrupted files without throwing an exception that rolls back the request.
- Implement `process_images_background`: The function that will be queued to run asynchronously (e.g., via FastAPI's `BackgroundTasks`). It will load the saved images from disk and pass them to the ML pipeline.

### Step 4: Create API Endpoint
**Target File**: `backend/app/api/upload.py` (or `backend/app/api/endpoints/upload.py` depending on exact router structure)
- Define a public `POST` endpoint (e.g., `/api/v1/upload/batch-images`).
- Configure the route to accept `multipart/form-data` using FastAPI's `File(...)` and `Form(...)` dependencies (e.g., `files: list[UploadFile] = File(...)`, `metadata: str = Form(...)`).
- Inject `BackgroundTasks`.
- Orchestrate the flow: 
  1. Call `upload_service` to parse metadata.
  2. Call `upload_service` to save images to disk synchronously/asynchronously.
  3. Add the `process_images_background` function to `BackgroundTasks`.
  4. Return a `202 Accepted` response.
- *Rule Check: Ensure the API layer only handles HTTP routing and dependency injection. All heavy lifting must remain in `services/`.*

### Step 5: Register API Router
**Target File**: `backend/app/api/router.py` (or `backend/app/main.py`)
- Import the new `upload` router.
- `app.include_router(upload.router, prefix="/upload", tags=["Upload"])` to ensure the new endpoint is active and documented in Swagger/OpenAPI.
