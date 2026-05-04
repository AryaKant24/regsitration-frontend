import json
import pytest
from fastapi.testclient import TestClient
from fastapi import FastAPI

from app.api.upload import router

# Create a minimal FastAPI app strictly for testing the router
app = FastAPI()
app.include_router(router)

client = TestClient(app)

def test_upload_batch_images_success(monkeypatch) -> None:
    """Test that a valid upload request returns 202 Accepted and correct payload."""
    
    # Mock the service layer to prevent actual disk I/O and ML processing during HTTP tests
    async def mock_save(*args, **kwargs):
        return ["/fake/path/image1.jpg", "/fake/path/image2.jpg"]
        
    def mock_process(*args, **kwargs):
        pass

    monkeypatch.setattr("app.api.upload.save_images_to_disk", mock_save)
    monkeypatch.setattr("app.api.upload.process_images_background", mock_process)

    metadata = {
        "userID": "user_api_123",
        "timestamp": 1234567890.0,
        "name": "API Test User",
        "registration number": "REG-API-123"
    }
    
    response = client.post(
        "/batch-images",
        data={"metadata": json.dumps(metadata)},
        files=[
            ("files", ("image1.jpg", b"fake image content 1", "image/jpeg")),
            ("files", ("image2.jpg", b"fake image content 2", "image/jpeg"))
        ]
    )
    
    assert response.status_code == 202
    
    response_data = response.json()
    assert response_data["message"] == "Images successfully saved and background processing queued."
    assert "task_id" in response_data
    assert response_data["userID"] == "user_api_123"

def test_upload_batch_images_invalid_metadata() -> None:
    """Test that invalid metadata returns a 400 Bad Request."""
    response = client.post(
        "/batch-images",
        data={"metadata": "{ bad json"},
        files=[
            ("files", ("image1.jpg", b"fake image content", "image/jpeg"))
        ]
    )
    
    assert response.status_code == 400
    assert "Invalid JSON payload" in response.json()["detail"]
