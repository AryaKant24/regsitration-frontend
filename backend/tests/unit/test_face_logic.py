import os
import sys
import glob

# Ensure the app module can be imported
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.services.face_service import face_analysis_service

def test_face_detection():
    # Prompt the user for the directory path
    target_dir = input("Enter the absolute path to your folder containing the images: ").strip()
    
    if not os.path.isdir(target_dir):
        print(f"❌ Directory not found: {target_dir}")
        return

    # Find all image files in the directory
    image_paths = glob.glob(os.path.join(target_dir, "*.*"))
    image_paths = [p for p in image_paths if p.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))]

    if not image_paths:
        print(f"❌ No images found in {target_dir}")
        return

    print(f"✅ Found {len(image_paths)} images. Testing Face Detection...")
    
    # Process frames using the service
    is_accepted = face_analysis_service.process_frames(image_paths, target_dir)
    
    print("\n-------------------------------")
    if is_accepted:
        print("✅ FACE DETECTION TEST PASSED")
        print(f"Check '{os.path.join(target_dir, 'valid_frames')}' and '{os.path.join(target_dir, 'valid_faces')}'")
    else:
        print("🚫 FACE DETECTION TEST FAILED / REJECTED")

if __name__ == "__main__":
    test_face_detection()
