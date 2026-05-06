import pytest
from pydantic import ValidationError
from app.schemas.upload import UploadMetadata, UploadResponse

def test_upload_metadata_valid() -> None:
    """Test that a valid metadata payload is correctly parsed and aliases are handled."""
    data = {
        "userID": "user_123",
        "timestamp": 1684321000,
        "name": "John Doe",
        "registration number": "REG-8901"
    }
    metadata = UploadMetadata.model_validate(data)
    
    assert metadata.userID == "user_123"
    assert metadata.timestamp == 1684321000
    assert metadata.name == "John Doe"
    assert metadata.registration_number == "REG-8901"

def test_upload_metadata_missing_required_fields() -> None:
    """Test that missing required fields raise a ValidationError."""
    data = {
        "userID": "user_123",
        # missing timestamp, name, and registration number
    }
    with pytest.raises(ValidationError):
        UploadMetadata.model_validate(data)

def test_upload_response_valid() -> None:
    """Test that the UploadResponse correctly validates and stores the accepted response."""
    data = {
        "message": "Upload accepted and processing in background.",
        "task_id": "task_12345",
        "userID": "user_123",
        "frames_received": 20
    }
    response = UploadResponse.model_validate(data)
    
    assert response.message == "Upload accepted and processing in background."
    assert response.task_id == "task_12345"
    assert response.userID == "user_123"
    assert response.frames_received == 20
