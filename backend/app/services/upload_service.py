import os
import json
import logging
import shutil
import aiofiles
from typing import List, Tuple
from pydantic import ValidationError
from fastapi import UploadFile
from app.schemas.upload import UploadMetadata

# Import the newly created face service instance
from app.services.face_service import face_analysis_service
from app.services.embedding_service import generate_unique_embeddings

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

async def save_images_to_disk(files: List[UploadFile], metadata: UploadMetadata, base_dir: str = "uploads") -> Tuple[List[str], int, int]:
    """
    Asynchronously saves valid image frames to the local disk.
    Creates an organized path under {base_dir}/{userID}/ with 2 folders:
    raw_frames and valid_frames.
    Incoming images are saved to raw_frames.
    Skips corrupted files without crashing (Best Effort).
    Returns: (saved_paths, skipped_count, received_count)
    """
    # Create the organized directory paths
    base_user_dir = os.path.join(base_dir, str(metadata.userID))
    raw_frames_dir = os.path.join(base_user_dir, "raw_frames")
    
    os.makedirs(raw_frames_dir, exist_ok=True)
    os.makedirs(os.path.join(base_user_dir, "valid_frames"), exist_ok=True)
    
    saved_paths: List[str] = []
    skipped_count = 0
    received_count = len(files)
    
    for file in files:
        if not file.filename:
            skipped_count += 1
            continue
            
        file_path = os.path.join(raw_frames_dir, file.filename)
        
        try:
            # Read and write asynchronously using aiofiles
            content = await file.read()
            async with aiofiles.open(file_path, 'wb') as out_file:
                await out_file.write(content)
                
            saved_paths.append(file_path)
            
        except Exception as e:
            skipped_count += 1
            logger.warning(f"[USER: {metadata.userID}] | [UPLOAD] -> Failed to process file {file.filename}: {e}")
            continue
            
    return saved_paths, skipped_count, received_count


MIN_UNIQUE_FRAMES = int(os.getenv("MIN_UNIQUE_FRAME_COUNT", "8"))

def process_images_background(saved_paths: List[str], metadata: UploadMetadata, base_dir: str = "uploads") -> bool:
    """
    Synchronous ML processing pipeline.
    Returns True if the session is accepted and unique embeddings are generated.
    Returns False when face validation or deduplication fails.
    """
    user_log_prefix = f"[USER: {metadata.userID}] | [ML_PIPELINE] ->"
    logger.info(f"{user_log_prefix} Phase 1: Initiating validation for {len(saved_paths)} frames...")
    
    if not saved_paths:
        logger.warning(f"{user_log_prefix} No saved paths to process. Aborting pipeline.")
        return False

    # Derive the exact base_user_dir where folders were created
    base_user_dir = os.path.join(base_dir, str(metadata.userID))

    logger.info(f"{user_log_prefix} Phase 2: Delegating to face_analysis_service...")
    is_accepted = face_analysis_service.process_frames(saved_paths, base_user_dir)
    
    if not is_accepted:
        logger.error(f"{user_log_prefix} Pipeline REJECTED. Cleaning up uploaded frames.")
        shutil.rmtree(base_user_dir, ignore_errors=True)
        return False

    logger.info(f"{user_log_prefix} Phase 3: Generating unique embeddings...")
    valid_frames_dir = os.path.join(base_user_dir, "valid_frames")
    unique_frames_dir = os.path.join(base_user_dir, "unique_frames")
    
    threshold = float(os.getenv("SIMILARITY_THRESHOLD", "0.75"))
    result = generate_unique_embeddings(
        folder_path=valid_frames_dir,
        output_folder=unique_frames_dir,
        base_user_dir=base_user_dir,
        threshold=threshold
    )
    
    if result is None:
        logger.error(f"{user_log_prefix} Embedding generation failed or no unique frames found.")
        shutil.rmtree(base_user_dir, ignore_errors=True)
        return False

    unique_embeddings, _, image_names = result
    if len(unique_embeddings) < MIN_UNIQUE_FRAMES:
        logger.error(
            f"{user_log_prefix} Pipeline REJECTED: only {len(unique_embeddings)} unique frames after deduplication "
            f"(minimum required: {MIN_UNIQUE_FRAMES})."
        )
        shutil.rmtree(base_user_dir, ignore_errors=True)
        return False

    logger.info(f"{user_log_prefix} Pipeline SUCCESS: User successfully registered with embeddings.")
    return True
