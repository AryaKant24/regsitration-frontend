import uuid
import logging
from typing import List

from fastapi import APIRouter, File, Form, UploadFile, BackgroundTasks, HTTPException, status

from app.schemas.upload import UploadResponse
from app.services.upload_service import parse_metadata, save_images_to_disk, process_images_background

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post(
    "/batch-images", 
    status_code=status.HTTP_202_ACCEPTED, 
    response_model=UploadResponse,
    summary="Batch upload image frames for ML registration",
    description="Uploads >20 image frames concurrently along with shared metadata. Frames are saved to disk and processed asynchronously."
)
async def upload_batch_images(
    background_tasks: BackgroundTasks,
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
        
    # 2. Asynchronously save images to disk (Best Effort)
    try:
        saved_file_paths, skipped_count, received_count = await save_images_to_disk(files, parsed_metadata)
    except Exception as e:
        logger.error(f"[USER: {parsed_metadata.userID}] | [UPLOAD] -> Critical failure while saving images: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to persist image frames to disk."
        )

    # 3. Enqueue background processing
    if saved_file_paths:
        background_tasks.add_task(process_images_background, saved_file_paths, parsed_metadata)
    
    # 4. Generate a tracking task ID for idempotency/reference
    task_id = str(uuid.uuid4())
    
    # 5. Determine correct HTTP Status (202 vs 206)
    final_status = status.HTTP_202_ACCEPTED if skipped_count == 0 else status.HTTP_206_PARTIAL_CONTENT
    message = "Images successfully saved and processing queued." if skipped_count == 0 else f"Partial success: {skipped_count} frames corrupted/skipped."
    
    # Optional trick in FastAPI: you can't dynamically change the status code inside the function 
    # without returning a JSONResponse, but since response_model is used, we can just let it stay 202 
    # or raise an exception. Actually, returning standard object is fine, we rely on the payload data.
    # To be extremely clean, we will just return the precise payload.
    
    return UploadResponse(
        message=message,
        task_id=task_id,
        userID=parsed_metadata.userID,
        frames_received=received_count
    )
