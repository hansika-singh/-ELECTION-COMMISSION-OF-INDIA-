from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.database import SessionLocal
from app.models.election import Election, Candidate

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/create-election")
def create(title: str, state: str, db: Session = Depends(get_db)):
    election = Election(title=title, state=state)
    db.add(election)
    db.commit()
    return {"message": "Election created"}

@router.post("/add-candidate")
def add_candidate(name: str, party: str, symbol: str, election_id: int, db: Session = Depends(get_db)):
    candidate = Candidate(name=name, party=party, symbol=symbol, election_id=election_id)
    db.add(candidate)
    db.commit()
    return {"message": "Candidate added"}

@router.post("/start-election")
def start(election_id: int, db: Session = Depends(get_db)):
    election = db.query(Election).get(election_id)
    election.is_active = True
    db.commit()
    return {"message": "Election started"}

@router.post("/end-election")
def end(election_id: int, db: Session = Depends(get_db)):
    election = db.query(Election).get(election_id)
    election.is_active = False
    db.commit()
    return {"message": "Election ended"}