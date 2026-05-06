import os
import cv2
import numpy as np
import shutil
import logging
from app.services.face_service import face_analysis_service

logger = logging.getLogger(__name__)

def cosine_similarity(vec1, vec2):
    return np.dot(vec1, vec2) / (
        np.linalg.norm(vec1) * np.linalg.norm(vec2)
    )

def generate_unique_embeddings(folder_path, output_folder, base_user_dir, threshold=0.75):
    """
    Generates embeddings from frames in folder_path, filters duplicates using cosine similarity,
    copies unique frames to output_folder, and saves embeddings as .npy files.
    """
    embeddings = []
    image_names = []

    os.makedirs(output_folder, exist_ok=True)

    if not os.path.exists(folder_path):
        logger.error(f"Folder path does not exist: {folder_path}")
        return None

    files = [f for f in os.listdir(folder_path) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
    logger.info(f"Generating unique embeddings from {len(files)} valid frames in {folder_path}")

    for file in files:
        img_path = os.path.join(folder_path, file)
        img = cv2.imread(img_path)

        if img is None:
            continue

        faces = face_analysis_service.app.get(img)

        # Safety check: should only be 1 since we already validated it, but good to be safe
        if len(faces) != 1:
            logger.warning(f"Skipping {file}: detected {len(faces)} faces during embedding generation")
            continue

        embedding = faces[0].embedding

        # Normalize embedding
        embedding = embedding / np.linalg.norm(embedding)

        # Check similarity with previous embeddings
        is_duplicate = False
        for prev_emb in embeddings:
            sim = cosine_similarity(embedding, prev_emb)

            if sim > threshold:
                is_duplicate = True
                logger.info(f"Discarding {file} (similarity: {sim:.3f})")
                break

        # Keep unique frame
        if not is_duplicate:
            embeddings.append(embedding)
            image_names.append(file)

            shutil.copy(
                img_path,
                os.path.join(output_folder, file)
            )

            logger.debug(f"Keeping {file}")

    if len(embeddings) == 0:
        logger.warning("No unique embeddings generated")
        return None

    embeddings_array = np.array(embeddings)

    # Average embedding for final identity representation
    final_embedding = np.mean(embeddings_array, axis=0)

    embeddings_path = os.path.join(base_user_dir, "unique_embeddings.npy")
    final_embedding_path = os.path.join(base_user_dir, "final_embedding.npy")

    np.save(embeddings_path, embeddings_array)
    np.save(final_embedding_path, final_embedding)

    logger.info(f"Original valid frames: {len(files)}")
    logger.info(f"Unique frames kept: {len(embeddings)}")
    logger.info(f"Saved embeddings successfully to {base_user_dir}")

    return embeddings_array, final_embedding, image_names
