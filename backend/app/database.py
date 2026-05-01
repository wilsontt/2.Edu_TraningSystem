"""
資料庫配置與連線管理 (Database Configuration & Connection Management)
負責定義 SQLite 資料庫路徑、初始化 SQLAlchemy 引擎以及提供資料庫工作階段 (Session)。
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# ----------------------------------------------------------------
# 資料庫路徑解析 (Database Path Resolution)
# ----------------------------------------------------------------

# 一律使用專案根目錄下的 data/education_training.db（與 backend 並列）
# 路徑邏輯：從 backend/app/database.py 向上兩層到專案根目錄，再進入 data/ 資料夾
_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.abspath(os.path.join(_script_dir, "..", ".."))
_db_dir = os.path.join(_project_root, "data")
_db_path = os.path.join(_db_dir, "education_training.db")

# 確保資料庫目錄存在
os.makedirs(_db_dir, exist_ok=True)

# 定義 SQLAlchemy 連線字串 (SQLite)
SQLALCHEMY_DATABASE_URL = "sqlite:///" + _db_path.replace("\\", "/")

# ----------------------------------------------------------------
# SQLAlchemy 初始化 (SQLAlchemy Initialization)
# ----------------------------------------------------------------

# 建立資料庫引擎
# check_same_thread=False 為 SQLite 專用，允許 FastAPI 在多執行緒環境下共用連線
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

# 建立 Session 類別，用於後續生成資料庫工作階段
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 宣告式基底類別 (Declarative Base)，所有 ORM 模型將繼承自此
Base = declarative_base()

# ----------------------------------------------------------------
# 依賴注入 (Dependency Injection)
# ----------------------------------------------------------------

def get_db():
    """
    提供資料庫工作階段的生成器 (Generator)
    用於 FastAPI 的 Depends() 依賴注入，確保每次請求結束後都會自動關閉連線。
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
