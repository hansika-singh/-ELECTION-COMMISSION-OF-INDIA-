from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.database import SessionLocal
from app.models.user import Voter

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/mark-voted")
def mark_voted(voter_id: int, db: Session = Depends(get_db)):
    voter = db.query(Voter).filter(Voter.id == voter_id).first()

    if voter.has_voted:
        return {"error": "Already voted"}

    voter.has_voted = True
    db.commit()

    return {"message": "Vote recorded"}