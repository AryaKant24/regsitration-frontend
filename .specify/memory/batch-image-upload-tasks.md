# Task List: Batch Image Upload

**Task 1**: Create `UploadMetadata` Pydantic schema in `backend/app/schemas/upload.py`
- **Done Condition**: Schema exists with `userID`, `timestamp`, `name`, and `registration number` fields, including basic field validation.

**Task 2**: Create `UploadResponse` Pydantic schema in `backend/app/schemas/upload.py`
- **Done Condition**: Schema exists representing a standard response payload for the 202 Accepted status (e.g., returning a success message and task ID).

**Task 3**: Implement `parse_metadata` function in `backend/app/services/upload_service.py`
- **Done Condition**: Function successfully accepts a JSON string, uses `json.loads`, validates it against the `UploadMetadata` schema, and correctly handles `ValidationError` or `JSONDecodeError`.

**Task 4**: Implement `save_images_to_disk` function in `backend/app/services/upload_service.py`
- **Done Condition**: Function takes a list of FastAPI `UploadFile` objects, iterates over them, asynchronously writes valid files to a local storage directory using `aiofiles`, safely catches and ignores I/O errors for corrupted frames (Best Effort), and returns a list of successfully saved absolute file paths.

**Task 5**: Implement `process_images_background` function in `backend/app/services/upload_service.py`
- **Done Condition**: Function accepts the list of saved file paths and the parsed `UploadMetadata` object, logging the start of the ML processing pipeline (as a placeholder for actual ML integration).

**Task 6**: Create `POST /batch-images` endpoint in `backend/app/api/upload.py`
- **Done Condition**: FastAPI endpoint is defined with `status_code=202`. It accepts `files: list[UploadFile] = File(...)` and `metadata: str = Form(...)`. It orchestrates the flow by calling `parse_metadata`, `save_images_to_disk`, enqueues `process_images_background` using FastAPI's `BackgroundTasks`, and returns the `UploadResponse`.

**Task 7**: Register upload router in `backend/app/api/router.py` (or `main.py`)
- **Done Condition**: The new `upload` router is imported and added via `app.include_router()`. The endpoint is successfully exposed and visible in the `/docs` Swagger UI.
