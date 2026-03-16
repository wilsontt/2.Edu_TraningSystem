from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# 一律使用專案根目錄下的 data/education_training.db（與 backend 並列）
# 從 backend/app/database.py -> 上兩層到專案根 -> data/
_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.abspath(os.path.join(_script_dir, "..", ".."))
_db_dir = os.path.join(_project_root, "data")
_db_path = os.path.join(_db_dir, "education_training.db")
os.makedirs(_db_dir, exist_ok=True)
SQLALCHEMY_DATABASE_URL = "sqlite:///" + _db_path.replace("\\", "/")

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
