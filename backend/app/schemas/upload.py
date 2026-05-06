from pydantic import BaseModel, Field

class UploadMetadata(BaseModel):
    userID: str
    timestamp: float
    name: str
    registration_number: str = Field(alias="registration number")

class UploadResponse(BaseModel):
    message: str
    task_id: str
    userID: str
    frames_received: int
