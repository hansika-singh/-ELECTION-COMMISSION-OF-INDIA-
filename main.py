from fastapi import FastAPI
from app.routes import auth, vote, admin
from app.db.database import Base, engine

app = FastAPI()

Base.metadata.create_all(bind=engine)

app.include_router(auth.router, prefix="/auth")
app.include_router(vote.router, prefix="/vote")
app.include_router(admin.router, prefix="/admin")