from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_api_router_registered() -> None:
    """
    Test that the main API router is correctly registered.
    We send a GET request to a POST endpoint to verify the route exists in the routing table. 
    If it exists, it returns 405 Method Not Allowed. If it doesn't exist, it returns 404 Not Found.
    """
    response = client.get("/api/v1/upload/batch-images")
    
    # 405 confirms the route '/api/v1/upload/batch-images' is registered in the main app
    assert response.status_code == 405
    
def test_docs_available() -> None:
    """Test that the Swagger UI documentation is successfully exposed."""
    response = client.get("/docs")
    
    # 200 confirms the FastAPI app is initialized and serving docs
    assert response.status_code == 200
