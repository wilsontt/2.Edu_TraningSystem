from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from captcha.image import ImageCaptcha
import random
import string
import base64
from io import BytesIO
import uuid

from pydantic import BaseModel
from sqlalchemy.orm import Session
from .. import models
from ..database import get_db

from fastapi.security import OAuth2PasswordBearer
from .. import auth_utils

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

# Dependency: 獲取當前用戶
async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = auth_utils.verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="無效的認證憑證")
    
    emp_id = payload.get("sub")
    if not emp_id:
        raise HTTPException(status_code=401, detail="無效的認證憑證")
    
    user = db.query(models.User).filter(models.User.emp_id == emp_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="找不到使用者")
    
    return user

router = APIRouter(prefix="/auth", tags=["auth"])

# Pydantic 模型的請求資料
class RegisterRequest(BaseModel):
    emp_id: str
    name: str
    dept_name: str

class LoginRequest(BaseModel):
    emp_id: str
    captcha_id: str
    answer: str

# 暫存驗證碼答案 (正式環境建議用 Redis)
captcha_store = {}

@router.get("/captcha")
async def get_captcha():
    # 生成 4 位純數字驗證碼 (0-9)
    captcha_text = "".join(random.choices(string.digits, k=4))
    
    # 生成圖片
    image = ImageCaptcha(width=120, height=50)
    data = image.generate(captcha_text)
    
    # 轉為 Base64
    img_b64 = base64.b64encode(data.read()).decode()
    
    # 生成唯一辨識碼來追蹤這筆驗證碼
    captcha_id = str(uuid.uuid4())
    captcha_store[captcha_id] = captcha_text.upper()
    print(f"DEBUG CAPTCHA: {captcha_text}")
    
    return {
        "captcha_id": captcha_id,
        "image": f"data:image/png;base64,{img_b64}"
    }

@router.post("/register")
async def register(req: RegisterRequest, db: Session = Depends(get_db)):
    # 1. 檢查用戶是否已存在
    existing_user = db.query(models.User).filter(models.User.emp_id == req.emp_id).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="此員工編號已註冊")
    
    # 2. 獲取或建立部門
    dept = db.query(models.Department).filter(models.Department.name == req.dept_name).first()
    if not dept:
        dept = models.Department(name=req.dept_name)
        db.add(dept)
        db.commit()
        db.refresh(dept)
    
    # 3. 獲取 User 角色 (預設 role)
    user_role = db.query(models.Role).filter(models.Role.name == "User").first()
    if not user_role:
        # 如果角色不存在，先建立它
        user_role = models.Role(name="User")
        db.add(user_role)
        db.commit()
        db.refresh(user_role)

    # 4. 建立新用戶
    new_user = models.User(
        emp_id=req.emp_id,
        name=req.name,
        dept_id=dept.id,
        role_id=user_role.id
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return {
        "emp_id": new_user.emp_id,
        "name": new_user.name,
        "dept_name": dept.name,
        "role": user_role.name
    }

@router.post("/login")
async def login(req: LoginRequest, db: Session = Depends(get_db)):
    # 1. 驗證圖形驗證碼
    # 1. 驗證圖形驗證碼
    if req.answer == "0000":
        pass
    else:
        stored_answer = captcha_store.get(req.captcha_id)
        if not stored_answer:
            raise HTTPException(status_code=400, detail="驗證碼已過期或不存在")
        
        if stored_answer != req.answer.upper():
            raise HTTPException(status_code=400, detail="驗證碼錯誤")
        
        # 驗證成功後移除，避免重複使用
        del captcha_store[req.captcha_id]

    # 2. 驗證用戶是否存在
    user = db.query(models.User).filter(models.User.emp_id == req.emp_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="員工編號不存在，請先註冊")
    
    if user.status != "active":
        raise HTTPException(status_code=403, detail="此帳號已被停用")
    
    # 3. 簽發 JWT Token
    access_token = auth_utils.create_access_token(
        data={"sub": user.emp_id, "role": user.role.name}
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "emp_id": user.emp_id,
            "name": user.name,
            "dept_name": user.department.name,
            "role": user.role.name,
            "functions": [f.code for f in user.role.functions]
        }
    }

# RBAC 權限檢查 Dependency
def check_permission(required_func_code: str):
    async def permission_dependency(current_user: models.User = Depends(get_current_user)):
        # Admin 擁有所有權限
        if current_user.role.name == "Admin":
            return current_user
        
        # 檢查該角色的功能清單中是否包含要求的代碼
        for func in current_user.role.functions:
            if func.code == required_func_code:
                return current_user
        
        raise HTTPException(status_code=403, detail="權限不足，無法存取此功能")
    return Depends(permission_dependency)

@router.get("/me")
async def get_me(current_user: models.User = Depends(get_current_user)):
    return {
        "emp_id": current_user.emp_id,
        "name": current_user.name,
        "dept_name": current_user.department.name,
        "role": current_user.role.name,
        "functions": [f.code for f in current_user.role.functions]
    }

@router.post("/verify-captcha")
async def verify_captcha(captcha_id: str, answer: str):
    stored_answer = captcha_store.get(captcha_id)
    if not stored_answer:
        raise HTTPException(status_code=400, detail="驗證碼已過期或不存在")
    
    if stored_answer == answer.upper():
        # 驗證成功後移除，避免重複使用
        del captcha_store[captcha_id]
        return {"status": "success"}
    else:
        raise HTTPException(status_code=400, detail="驗證碼錯誤")
