from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.upload import router as upload_router

def create_app() -> FastAPI:
    """
    Factory function to configure and instantiate the FastAPI application.
    Follows standard professional practices for clean app initialization and testing.
    """
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
        upload_router, 
        prefix="/api/v1/upload", 
        tags=["Batch Upload"]
    )

    return app

# The single FastAPI instance used by Uvicorn
app = create_app()
