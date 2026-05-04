import os
import json
import logging
import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import UploadFile

from app.services.upload_service import parse_metadata, save_images_to_disk, process_images_background
from app.schemas.upload import UploadMetadata

def test_parse_metadata_valid() -> None:
    """Test that a valid JSON string is successfully parsed into UploadMetadata."""
    valid_json = json.dumps({
        "userID": "user_789",
        "timestamp": 1684321000,
        "name": "Alice Smith",
        "registration number": "REG-1234"
    })
    result = parse_metadata(valid_json)
    
    assert isinstance(result, UploadMetadata)
    assert result.userID == "user_789"
    assert result.name == "Alice Smith"
    assert result.registration_number == "REG-1234"

def test_parse_metadata_invalid_json() -> None:
    """Test that a malformed JSON string raises ValueError."""
    bad_json = '{"userID": "user_789", "timestamp": }'
    
    with pytest.raises(ValueError, match="Invalid JSON payload"):
        parse_metadata(bad_json)

def test_parse_metadata_missing_fields() -> None:
    """Test that valid JSON with missing required schema fields raises ValueError."""
    incomplete_json = json.dumps({"userID": "user_789"})
    
    with pytest.raises(ValueError, match="Metadata validation failed"):
        parse_metadata(incomplete_json)

@pytest.mark.asyncio
async def test_save_images_to_disk_success(tmp_path) -> None:
    """Test that valid files are saved successfully to the organized directory structure."""
    metadata = UploadMetadata(
        userID="user_abc", 
        timestamp=1684321000.0, 
        name="Test", 
        **{"registration number": "REG-1"}
    )
    
    # Mock FastAPI UploadFile
    mock_file1 = MagicMock(spec=UploadFile)
    mock_file1.filename = "frame1.jpg"
    mock_file1.read = AsyncMock(return_value=b"fake image data 1")
    
    mock_file2 = MagicMock(spec=UploadFile)
    mock_file2.filename = "frame2.png"
    mock_file2.read = AsyncMock(return_value=b"fake image data 2")
    
    # Run the function
    saved_paths = await save_images_to_disk([mock_file1, mock_file2], metadata, base_dir=str(tmp_path))
    
    # Assertions
    assert len(saved_paths) == 2
    
    # Check that directory structure was created correctly: base_dir/userID/timestamp/
    expected_dir = tmp_path / "user_abc" / "1684321000.0"
    assert expected_dir.exists()
    
    # Check files exist and have correct content
    assert (expected_dir / "frame1.jpg").read_bytes() == b"fake image data 1"
    assert (expected_dir / "frame2.png").read_bytes() == b"fake image data 2"

@pytest.mark.asyncio
async def test_save_images_to_disk_best_effort_partial_failure(tmp_path) -> None:
    """Test that corrupted files are skipped but valid files are still saved (Best Effort)."""
    metadata = UploadMetadata(
        userID="user_xyz", 
        timestamp=1234567890.0, 
        name="Fail Test", 
        **{"registration number": "REG-2"}
    )
    
    mock_valid = MagicMock(spec=UploadFile)
    mock_valid.filename = "good.jpg"
    mock_valid.read = AsyncMock(return_value=b"good data")
    
    # Corrupted file that throws Exception on read
    mock_corrupted = MagicMock(spec=UploadFile)
    mock_corrupted.filename = "bad.jpg"
    mock_corrupted.read = AsyncMock(side_effect=Exception("Simulated I/O Error"))
    
    saved_paths = await save_images_to_disk([mock_valid, mock_corrupted], metadata, base_dir=str(tmp_path))
    
    # Only 1 file should be saved successfully
    assert len(saved_paths) == 1
    assert "good.jpg" in saved_paths[0]

def test_process_images_background_logs(caplog) -> None:
    """Test that the background process logs the incoming metadata and file paths."""
    metadata = UploadMetadata(
        userID="user_111", 
        timestamp=1684321000.0, 
        name="ML Test", 
        **{"registration number": "REG-ML"}
    )
    saved_paths = ["/fake/path/1.jpg", "/fake/path/2.jpg"]
    
    with caplog.at_level(logging.INFO):
        process_images_background(saved_paths, metadata)
        
    assert "Started background ML processing for user user_111" in caplog.text
    assert "Processing 2 image frames" in caplog.text
