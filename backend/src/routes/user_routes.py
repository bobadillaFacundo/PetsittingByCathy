from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from src.database.session import get_db
from src.models.models import User
from src.auth import get_current_user, get_password_hash

router = APIRouter(prefix="/users", tags=["users"])

# --- SCHEMAS ---
class UserResponse(BaseModel):
    id: int
    name: str
    role: str
    is_active: bool

    class Config:
        from_attributes = True

class UserCreate(BaseModel):
    name: str
    password: str
    role: Optional[str] = "user"

class UserChangePassword(BaseModel):
    new_password: str

# --- ROUTES ---

@router.get("", response_model=List[UserResponse])
def get_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(User).all()

@router.post("", response_model=UserResponse)
def create_user(user_in: UserCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    existing = db.query(User).filter(User.name == user_in.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="El nombre de usuario ya existe")
    
    new_user = User(
        name=user_in.name,
        role=user_in.role,
        password_hash=get_password_hash(user_in.password),
        is_active=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.put("/{user_id}/password")
def change_password(user_id: int, payload: UserChangePassword, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    user.password_hash = get_password_hash(payload.new_password)
    db.commit()
    return {"detail": "Contraseña actualizada correctamente"}

@router.put("/{user_id}/toggle_status", response_model=UserResponse)
def toggle_user_status(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    # Prevent the superadmin cathy from deactivating herself (optional safety net)
    if user.name == "cathy" and user.id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes desactivar tu propia cuenta superadmin")
        
    user.is_active = not getattr(user, 'is_active', True)
    db.commit()
    db.refresh(user)
    return user
