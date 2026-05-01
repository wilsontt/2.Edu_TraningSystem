"""
FastAPI 主應用程式入口 (Main Application Entry Point)
負責初始化 FastAPI 實例、配置 CORS 中間件、連結資料庫以及註冊各模組路由。
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import auth, admin, training, qrcode
from .database import engine, Base
from . import models

# 初始化 FastAPI 應用
app = FastAPI(
    title="教育訓練教材及線上考卷系統 API",
    description="提供教育訓練計畫、考卷解析、考試中心及成績統計之核心服務",
    version="1.2.0"
)

# ----------------------------------------------------------------
# 資料庫與啟動事件 (Database & Startup Events)
# ----------------------------------------------------------------

@app.on_event("startup")
async def startup_event():
    """
    應用程式啟動時的初始化任務：
    建立所有 SQLAlchemy 定義的資料表（若資料庫中尚不存在）。
    """
    Base.metadata.create_all(bind=engine)
    print("Database tables initialized - 系統資料庫初始化完成")

# ----------------------------------------------------------------
# 中間件配置 (Middleware Configuration)
# ----------------------------------------------------------------

# 配置 CORS 跨域資源共享，允許前端 React SPA 存取
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 開發環境建議為 ["*"]，生產環境應明確指定域名 (如 https://your-site.com)
    allow_credentials=True,
    allow_methods=["*"],  # 允許所有 HTTP 方法 (GET, POST, PUT, DELETE 等)
    allow_headers=["*"],  # 允許所有自定義標頭 (如 Authorization)
)

# ----------------------------------------------------------------
# 路由註冊 (Router Registration)
# ----------------------------------------------------------------

# 將各個功能模組的路由註冊到 /api 前綴下
app.include_router(training.router, prefix="/api")        # 訓練計畫管理
app.include_router(admin.router, prefix="/api")           # 系統管理 (人員、單位、權限)
app.include_router(auth.router, prefix="/api")            # 使用者認證與登入
from .routers import report
app.include_router(report.router, prefix="/api")          # 成績報表與統計
from .routers import exam
app.include_router(exam.router, prefix="/api")            # 考卷工坊 (題目解析與教材)
from .routers import exam_center
app.include_router(exam_center.router, prefix="/api")     # 考試中心 (作答與評分)
from .routers import question_bank
app.include_router(question_bank.router, prefix="/api")   # 全域題庫管理
app.include_router(qrcode.router, prefix="/api")          # QRcode 生成相關

# ----------------------------------------------------------------
# 基礎端點 (Base Endpoints)
# ----------------------------------------------------------------

@app.get("/")
async def root():
    """
    根路徑歡迎訊息，可用於確認服務是否存活
    """
    return {"message": "Welcome to Educational Training API", "status": "online"}

@app.get("/health")
async def health_check():
    """
    健康檢查端點，供 Load Balancer 或監控系統使用
    """
    return {"status": "ok"}
