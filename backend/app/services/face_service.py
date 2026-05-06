import cv2
import os
import shutil
import logging
from typing import List
from insightface.app import FaceAnalysis

logger = logging.getLogger(__name__)

class FaceAnalysisService:
    def __init__(self):
        # Initialize model
        self.app = FaceAnalysis(name='buffalo_l')
        self.app.prepare(ctx_id=-1)
        logger.info("FaceAnalysis model 'buffalo_l' loaded successfully.")

    def process_frames(self, image_paths: List[str], base_dir: str) -> bool:
        """
        Process a list of image paths for face detection.
        Saves valid frames and cropped faces into subdirectories of base_dir.
        Returns True if processing is successful and accepted, False if rejected.
        """
        if not image_paths:
            logger.warning("No image paths provided for face processing.")
            return False

        output_frames = os.path.join(base_dir, "valid_frames")
        output_faces = os.path.join(base_dir, "valid_faces")

        os.makedirs(output_frames, exist_ok=True)
        os.makedirs(output_faces, exist_ok=True)

        saved_frames = 0
        saved_faces = 0
        invalid_session = False
        face_found = False

        logger.info(f"Processing {len(image_paths)} images in {base_dir}")

        for path in image_paths:
            frame = cv2.imread(path)
            if frame is None:
                continue

            faces = self.app.get(frame)

            # Reject if multiple faces
            if len(faces) > 1:
                logger.warning(f"Multiple faces detected in frame: {path}")
                invalid_session = True
                break

            # Skip if no faces
            if len(faces) == 0:
                continue

            # Exactly one face
            face_found = True

            face = faces[0]
            x1, y1, x2, y2 = face.bbox.astype(int)

            draw_frame = frame.copy()
            cv2.rectangle(draw_frame, (x1, y1), (x2, y2), (0, 255, 0), 2)

            # Save frame
            cv2.imwrite(os.path.join(output_frames, f"frame_{saved_frames}.jpg"), draw_frame)
            saved_frames += 1

            # Save face crop
            face_crop = frame[y1:y2, x1:x2]
            if face_crop.size > 0:
                cv2.imwrite(os.path.join(output_faces, f"face_{saved_faces}.jpg"), face_crop)
                saved_faces += 1

        # FINAL VALIDATION
        if invalid_session:
            logger.error("SESSION REJECTED (multiple faces detected)")
            shutil.rmtree(output_frames, ignore_errors=True)
            shutil.rmtree(output_faces, ignore_errors=True)
            return False

        elif not face_found:
            logger.error("SESSION REJECTED (no faces detected in any frame)")
            shutil.rmtree(output_frames, ignore_errors=True)
            shutil.rmtree(output_faces, ignore_errors=True)
            return False

        else:
            logger.info("✅ SESSION ACCEPTED")
            logger.info(f"Valid frames saved: {saved_frames}")
            logger.info(f"Face crops saved: {saved_faces}")
            return True

# Export a singleton instance so the model is only loaded once in memory.
face_analysis_service = FaceAnalysisService()
