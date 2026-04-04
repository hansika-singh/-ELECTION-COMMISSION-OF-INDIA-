from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.database import SessionLocal
from app.models.user import Voter
from app.services.otp_service import send_otp, verify_otp
from app.services.zkp_simulator import verify_zkp

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/register")
def register(name: str, email: str, aadhaar: str, constituency: str, db: Session = Depends(get_db)):
    voter = Voter(name=name, email=email, aadhaar=aadhaar, constituency=constituency)
    db.add(voter)
    db.commit()
    return {"message": "Registered"}

@router.post("/send-otp")
def send(email: str):
    return send_otp(email)

@router.post("/login")
def login(email: str, otp: str, aadhaar: str, db: Session = Depends(get_db)):
    if not verify_otp(email, otp):
        return {"status": "OTP failed"}

    if not verify_zkp(aadhaar):
        return {"status": "ZKP failed"}

    voter = db.query(Voter).filter(Voter.email == email).first()

    return {"status": "success", "voter_id": voter.id}