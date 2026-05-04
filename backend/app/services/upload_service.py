import os
import json
import logging
import aiofiles
from typing import List
from pydantic import ValidationError
from fastapi import UploadFile
from app.schemas.upload import UploadMetadata

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

def process_images_background(saved_paths: List[str], metadata: UploadMetadata) -> None:
    """
    Placeholder/stub for the background ML processing pipeline.
    This function will be enqueued in FastAPI BackgroundTasks.
    """
    logger.info(f"Started background ML processing for user {metadata.userID}")
    logger.info(f"Processing {len(saved_paths)} image frames")
    # TODO: Connect the actual ML validation/pipeline here in the future
    # e.g., result = ml_model.predict(saved_paths)
    logger.info(f"Finished background ML processing placeholder for user {metadata.userID}")
