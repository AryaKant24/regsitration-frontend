import os
from dotenv import load_dotenv

# Load .env from the root directory
root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv(os.path.join(root_dir, ".env"))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.endpoints.faces import router as faces_router
from app.core.logger import setup_logging

def create_app() -> FastAPI:
    """
    Factory function to configure and instantiate the FastAPI application.
    Follows standard professional practices for clean app initialization and testing.
    """
    # Initialize professional terminal logging immediately
    setup_logging()
    
    app = FastAPI(
        title="AttendEase ML Registration API",
        description="Backend API for processing and registering user facial frames.",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc"
    )

    # Standard security practice: Configure CORS
    # Note: allow_origins=["*"] is used for development. Replace with exact frontend domains in production.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register API routers under a standard versioned prefix
    app.include_router(
        faces_router, 
        prefix="/api/v1/faces", 
        tags=["Faces"]
    )

    return app

# The single FastAPI instance used by Uvicorn
app = create_app()
