from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import auth, admin, training

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex="https?://.*", # Allow all http/https origins with credentials
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

@app.get("/")
async def root():
    return {"message": "Welcome to Educational Training API", "status": "online"}

@app.get("/health")
async def health_check():
    return {"status": "ok"}
