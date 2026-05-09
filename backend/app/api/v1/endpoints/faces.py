import uuid
import logging
from typing import List

from fastapi import APIRouter, File, Form, UploadFile, HTTPException, status

from app.schemas.upload import UploadResponse
from app.services.upload_service import parse_metadata, save_images_to_disk, process_images_background

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post(
    "/batch-images", 
    status_code=status.HTTP_202_ACCEPTED, 
    response_model=UploadResponse,
    summary="Batch upload image frames for ML registration",
    description="Uploads a batch of image frames along with shared metadata. Frames are saved to disk, face-validated, and deduplicated synchronously."
)
async def upload_batch_images(
    files: List[UploadFile] = File(..., description="List of image frames to upload"),
    metadata: str = Form(..., description="JSON string containing userID, timestamp, name, and registration number")
) -> UploadResponse:
    # 1. Parse and validate metadata
    try:
        parsed_metadata = parse_metadata(metadata)
    except ValueError as e:
        logger.error(f"Metadata validation error: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
        
    # 2. Persist uploaded images to disk
    try:
        saved_file_paths, skipped_count, received_count = await save_images_to_disk(files, parsed_metadata)
    except Exception as e:
        logger.error(f"[USER: {parsed_metadata.userID}] | [UPLOAD] -> Critical failure while saving images: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to persist image frames to disk."
        )

    if not saved_file_paths:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid image frames were uploaded. Please record again."
        )

    # 3. Run validation and deduplication synchronously so the frontend can react immediately.
    is_accepted = process_images_background(saved_file_paths, parsed_metadata)
    if not is_accepted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Capture rejected after face validation/deduplication. Please retake the video with a clear front-facing view."
        )

    # 4. Generate a tracking task ID for idempotency/reference
    task_id = str(uuid.uuid4())
    message = "Images successfully saved and validated. Processing completed."

    return UploadResponse(
        message=message,
        task_id=task_id,
        userID=parsed_metadata.userID,
        frames_received=received_count
    )
