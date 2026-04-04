from sqlalchemy import Column, Integer, String, Boolean
from app.db.database import Base

class Voter(Base):
    __tablename__ = "voters"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    email = Column(String, unique=True)
    aadhaar = Column(String, unique=True)
    constituency = Column(String)
    has_voted = Column(Boolean, default=False)
    wallet_address = Column(String)