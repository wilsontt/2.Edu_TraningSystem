from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import auth, admin, training, qrcode
from .database import engine, Base
from . import models

app = FastAPI()

# 在應用啟動時初始化資料庫表
@app.on_event("startup")
async def startup_event():
    # 建立所有資料表（如果不存在）
    Base.metadata.create_all(bind=engine)
    print("Database tables initialized")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 開發環境允許所有來源，生產環境應限制特定域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 註冊路由
app.include_router(training.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
from .routers import report
app.include_router(report.router, prefix="/api")
from .routers import exam
app.include_router(exam.router, prefix="/api")
from .routers import exam_center
app.include_router(exam_center.router, prefix="/api")
from .routers import question_bank
app.include_router(question_bank.router, prefix="/api")
app.include_router(qrcode.router, prefix="/api")

@app.get("/")
async def root():
    return {"message": "Welcome to Educational Training API", "status": "online"}

@app.get("/health")
async def health_check():
    return {"status": "ok"}
