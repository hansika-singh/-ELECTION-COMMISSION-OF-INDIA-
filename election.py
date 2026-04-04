from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from app.db.database import Base

class Election(Base):
    __tablename__ = "elections"

    id = Column(Integer, primary_key=True)
    title = Column(String)
    state = Column(String)
    is_active = Column(Boolean, default=False)


class Candidate(Base):
    __tablename__ = "candidates"

    id = Column(Integer, primary_key=True)
    name = Column(String)
    party = Column(String)
    symbol = Column(String)
    election_id = Column(Integer, ForeignKey("elections.id"))