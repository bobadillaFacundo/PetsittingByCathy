from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from src.database.session import get_db
from src.services.audio_service import NLPService

router = APIRouter(prefix="/chat", tags=["Chat"])

class ChatRequest(BaseModel):
    query: str

class ChatResponse(BaseModel):
    response: str

@router.post("", response_model=ChatResponse)
def smart_chat(request: ChatRequest, db: Session = Depends(get_db)):
    # Pasamos el query y la conexión a BD al NLPService
    answer = NLPService.answer_query(request.query, db)
    return ChatResponse(response=answer)
