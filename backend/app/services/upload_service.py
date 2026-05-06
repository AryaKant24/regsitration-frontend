import os
import json
import logging
import shutil
import aiofiles
from typing import List
from pydantic import ValidationError
from fastapi import UploadFile
from app.schemas.upload import UploadMetadata

# Import the newly created face service instance
from app.services.face_service import face_analysis_service

logger = logging.getLogger(__name__)

def parse_metadata(metadata_json: str) -> UploadMetadata:
    """
    Parses a JSON string into an UploadMetadata schema.
    Raises ValueError on invalid JSON or missing/invalid fields.
    """
    try:
        data = json.loads(metadata_json)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON payload: {str(e)}")
        
    try:
        return UploadMetadata.model_validate(data)
    except ValidationError as e:
        raise ValueError(f"Metadata validation failed: {str(e)}")

async def save_images_to_disk(files: List[UploadFile], metadata: UploadMetadata, base_dir: str = "uploads") -> List[str]:
    """
    Asynchronously saves valid image frames to the local disk.
    Creates an organized path: {base_dir}/{userID}/{timestamp}/
    Skips corrupted files without crashing (Best Effort).
    """
    # Create the organized directory path
    target_dir = os.path.join(base_dir, str(metadata.userID), str(metadata.timestamp))
    os.makedirs(target_dir, exist_ok=True)
    
    saved_paths: List[str] = []
    
    for file in files:
        if not file.filename:
            continue
            
        file_path = os.path.join(target_dir, file.filename)
        
        try:
            # Read and write asynchronously using aiofiles
            content = await file.read()
            async with aiofiles.open(file_path, 'wb') as out_file:
                await out_file.write(content)
                
            saved_paths.append(file_path)
            
        except Exception as e:
            # Log the partial failure and continue (Best Effort logic)
            logger.warning(f"Failed to process file {file.filename} for user {metadata.userID}: {e}")
            continue
            
    return saved_paths

def process_images_background(saved_paths: List[str], metadata: UploadMetadata, base_dir: str = "uploads") -> None:
    """
    Background ML processing pipeline.
    This function will be enqueued in FastAPI BackgroundTasks.
    """
    logger.info(f"Started background ML processing for user {metadata.userID}")
    logger.info(f"Processing {len(saved_paths)} image frames")
    
    if not saved_paths:
        logger.warning(f"No saved paths to process for user {metadata.userID}")
        return

    # Derive the exact base_dir where frames were saved
    target_dir = os.path.join(base_dir, str(metadata.userID), str(metadata.timestamp))

    # Connect the ML validation pipeline
    is_accepted = face_analysis_service.process_frames(saved_paths, target_dir)
    
    if not is_accepted:
        logger.error(f"ML Processing REJECTED for user {metadata.userID}. Cleaning up uploaded frames.")
        # Only cleanup frames (valid_frames and valid_faces have already been cleaned by the service,
        # but we also want to delete the original frames to save space or delete the whole folder)
        shutil.rmtree(target_dir, ignore_errors=True)
    else:
        logger.info(f"ML Processing ACCEPTED for user {metadata.userID}.")

    logger.info(f"Finished background ML processing for user {metadata.userID}")
