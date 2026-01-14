from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
# from captcha.image import ImageCaptcha # Removed in favor of PIL
from PIL import Image, ImageDraw, ImageFont 
import random
import string
import base64
from io import BytesIO
import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator
import re
from sqlalchemy.orm import Session, joinedload
from .. import models, schemas
from ..database import get_db

from fastapi.security import OAuth2PasswordBearer
from .. import auth_utils
from typing import List

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

# Dependency: 獲取當前用戶
async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = auth_utils.verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="無效的認證憑證")
    
    emp_id = payload.get("sub")
    if not emp_id:
        raise HTTPException(status_code=401, detail="無效的認證憑證")
    
    # 預先載入角色與功能，避免非同步環境下的 Lazy Load 問題
    user = db.query(models.User).options(
        joinedload(models.User.role).joinedload(models.Role.functions)
    ).filter(models.User.emp_id == emp_id).first()
    
    if not user:
        raise HTTPException(status_code=401, detail="找不到使用者")
    
    return user

router = APIRouter(prefix="/auth", tags=["auth"])

# Pydantic 模型的請求資料
class RegisterRequest(BaseModel):
    emp_id: str = Field(..., min_length=1, max_length=10, description="員工編號，必須是1-10碼的數字")
    name: str = Field(..., min_length=1, max_length=20, description="姓名，最長20個字符")
    dept_id: int
    
    @field_validator('emp_id')
    @classmethod
    def validate_emp_id(cls, v: str) -> str:
        """驗證員工編號必須是1-10碼的數字，或特殊帳號 admin"""
        v_lower = v.lower()
        if v_lower != 'admin' and not re.match(r'^[0-9]{1,10}$', v):
            raise ValueError('員工編號必須是1-10碼的數字')
        return v_lower if v_lower == 'admin' else v
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        """驗證姓名長度"""
        v = v.strip()
        if len(v) == 0:
            raise ValueError('姓名不能為空')
        if len(v) > 20:
            raise ValueError('姓名最長20個字符')
        return v

class LoginRequest(BaseModel):
    emp_id: str = Field(..., min_length=1, max_length=10, description="員工編號，必須是1-10碼的數字")
    captcha_id: str
    answer: str
    
    @field_validator('emp_id')
    @classmethod
    def validate_emp_id(cls, v: str) -> str:
        """驗證員工編號必須是1-10碼的數字，或特殊帳號 admin"""
        v_lower = v.lower()
        if v_lower != 'admin' and not re.match(r'^[0-9]{1,10}$', v):
            raise ValueError('員工編號必須是1-10碼的數字')
        return v_lower if v_lower == 'admin' else v

# 暫存驗證碼答案 (正式環境建議用 Redis)
captcha_store = {}

@router.get("/departments", response_model=List[schemas.Department])
def get_public_departments(db: Session = Depends(get_db)):
    """公開的部門列表 API (供註冊使用)"""
    return db.query(models.Department).all()

# ... (imports) ...
from PIL import Image, ImageDraw, ImageFont
import random

# ... (rest of the file) ...

@router.get("/captcha")
async def get_captcha():
    # 生成 4 位純數字驗證碼
    captcha_text = "".join(random.choices(string.digits, k=4))
    
    # 使用 Pillow 繪製更清晰的驗證碼
    width, height = 160, 60
    image = Image.new('RGB', (width, height), color=(255, 255, 255))
    draw = ImageDraw.Draw(image)
    
    # 畫一些非常淡的干擾線，避免太過單調但保持清晰
    for _ in range(5):
        x1 = random.randint(0, width)
        y1 = random.randint(0, height)
        x2 = random.randint(0, width)
        y2 = random.randint(0, height)
        draw.line(((x1, y1), (x2, y2)), fill=(240, 240, 240), width=2)

    # 繪製文字
    # 嘗試載入系統字體，若無則使用預設
    try:
        # 嘗試常見的粗體字型
        font = ImageFont.truetype("Arial.ttf", 40)
    except:
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 40)
        except:
             font = ImageFont.load_default()

    # 每個字的顏色
    colors = [(220, 38, 38), (22, 163, 74), (37, 99, 235), (234, 88, 12)] # 紅, 綠, 藍, 橘
    
    for i, char in enumerate(captcha_text):
        x = 20 + i * 35
        y = 5 + random.randint(0, 5)
        color = colors[i % len(colors)]
        draw.text((x, y), char, font=font, fill=color)

    # 轉為 Base64
    buffered = BytesIO()
    image.save(buffered, format="PNG")
    img_b64 = base64.b64encode(buffered.getvalue()).decode()
    
    # 生成唯一辨識碼來追蹤這筆驗證碼
    captcha_id = str(uuid.uuid4())
    captcha_store[captcha_id] = captcha_text.upper()
    print(f"DEBUG CAPTCHA: Generated captcha_id={captcha_id}, text={captcha_text}, store_size={len(captcha_store)}")
    
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
    
    # 2. 獲取部門
    dept = db.query(models.Department).filter(models.Department.id == req.dept_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="所選部門不存在")
    
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
    print(f"DEBUG LOGIN: emp_id={req.emp_id}, captcha_id={req.captcha_id}, answer={req.answer}")
    print(f"DEBUG LOGIN: captcha_store size={len(captcha_store)}, keys={list(captcha_store.keys())[:3]}")
    
    # 1. 驗證圖形驗證碼
    if req.answer == "0000":
        print("DEBUG LOGIN: Using bypass code 0000")
        pass
    else:
        # 檢查 captcha_id 是否存在
        if not req.captcha_id:
            print("DEBUG LOGIN: captcha_id is missing")
            raise HTTPException(status_code=400, detail="驗證碼 ID 不存在，請重新取得驗證碼")
        
        stored_answer = captcha_store.get(req.captcha_id)
        if not stored_answer:
            print(f"DEBUG LOGIN: captcha_id={req.captcha_id} not found in store")
            print(f"DEBUG LOGIN: Available keys={list(captcha_store.keys())[:5]}")
            raise HTTPException(status_code=400, detail="驗證碼已過期或不存在，請重新取得驗證碼")
        
        print(f"DEBUG LOGIN: stored_answer={stored_answer}, user_answer={req.answer.upper()}")
        if stored_answer != req.answer.upper():
            print(f"DEBUG LOGIN: Captcha mismatch")
            raise HTTPException(status_code=400, detail="驗證碼錯誤")
        
        print("DEBUG LOGIN: Captcha verified successfully")
        # 驗證成功後移除，避免重複使用
        del captcha_store[req.captcha_id]

    # 2. 驗證用戶是否存在，並預載入關聯資料
    user = db.query(models.User).options(
        joinedload(models.User.department),
        joinedload(models.User.role).joinedload(models.Role.functions)
    ).filter(models.User.emp_id == req.emp_id).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="員工編號不存在，請先註冊")
    
    if user.status != "active":
        raise HTTPException(status_code=403, detail="此帳號已被停用")
    
    # 3. 簽發 JWT Token
    role_name = user.role.name if user.role else "User"
    access_token = auth_utils.create_access_token(
        data={"sub": user.emp_id, "role": role_name}
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "emp_id": user.emp_id,
            "name": user.name,
            "dept_name": user.department.name if user.department else "未知",
            "role": role_name,
            "functions": [f.code for f in user.role.functions] if user.role and user.role.functions else []
        }
    }

# RBAC 權限檢查 Dependency
def check_permission(required_func_code: str):
    async def permission_dependency(current_user: models.User = Depends(get_current_user)):
        try:
            # 確保 Role 存在
            if not current_user.role:
                raise HTTPException(status_code=403, detail="使用者未分配角色")

            # Admin 或 System Admin 擁有所有權限
            role_name = current_user.role.name
            if role_name in ["Admin", "System Admin"]:
                return current_user
            
            # 檢查該角色的功能清單中是否包含要求的代碼
            # 使用列表推導式與 any 可能更安全避免 Lazy Load 問題
            if any(func.code == required_func_code for func in current_user.role.functions):
                 return current_user
            
            raise HTTPException(status_code=403, detail="權限不足，無法存取此功能")
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            print(f"Permission Check Error: {e}")
            raise HTTPException(status_code=500, detail="權限檢查發生錯誤")
            
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

# --- QRcode 登入功能 ---

@router.get("/login/qrcode/{token}", response_model=schemas.QRCodeTokenValidate)
def validate_qrcode_token(token: str, db: Session = Depends(get_db)):
    """驗證 QRcode token 是否有效且未過期（不檢查 is_used，允許多人使用）"""
    login_token = db.query(models.LoginToken).filter(models.LoginToken.token == token).first()
    
    if not login_token:
        return {
            "valid": False,
            "reason": "Token 不存在"
        }
    
    # 移除 is_used 檢查，允許同一 QRcode 被多人使用
    # 只檢查是否過期
    if datetime.utcnow() > login_token.expires_at:
        return {
            "valid": False,
            "reason": "Token 已過期"
        }
    
    return {
        "valid": True,
        "expires_at": login_token.expires_at
    }

@router.post("/login/qrcode/{token}")
async def login_with_qrcode(
    token: str,
    req: schemas.QRCodeLoginRequest,
    db: Session = Depends(get_db)
):
    """使用 QRcode token 快速登入（仍需輸入驗證碼，但同一 QRcode 可被多人使用）"""
    # 1. 驗證 QRcode token（只檢查是否存在和是否過期，不檢查 is_used）
    login_token = db.query(models.LoginToken).filter(models.LoginToken.token == token).first()
    
    if not login_token:
        raise HTTPException(status_code=400, detail="無效的 QRcode token")
    
    # 移除 is_used 檢查，允許同一 QRcode 被多人使用
    if datetime.utcnow() > login_token.expires_at:
        raise HTTPException(status_code=400, detail="QRcode 已過期，請重新產生")
    
    # 2. 驗證圖形驗證碼
    if req.answer == "0000":
        pass  # 開發用後門
    else:
        stored_answer = captcha_store.get(req.captcha_id)
        if not stored_answer:
            raise HTTPException(status_code=400, detail="驗證碼已過期或不存在")
        
        if stored_answer != req.answer.upper():
            raise HTTPException(status_code=400, detail="驗證碼錯誤")
        
        # 驗證成功後移除，避免重複使用
        del captcha_store[req.captcha_id]
    
    # 3. 驗證用戶是否存在，並預載入關聯資料
    user = db.query(models.User).options(
        joinedload(models.User.department),
        joinedload(models.User.role).joinedload(models.Role.functions)
    ).filter(models.User.emp_id == req.emp_id).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="員工編號不存在，請先註冊")
    
    if user.status != "active":
        raise HTTPException(status_code=403, detail="此帳號已被停用")
    
    # 4. 不再標記 token 為已使用，允許多人使用
    # 可以選擇性地記錄使用次數（可選，用於統計）
    # login_token.use_count = (login_token.use_count or 0) + 1
    
    # 5. 簽發 JWT Token
    access_token = auth_utils.create_access_token(
        data={"sub": user.emp_id, "role": user.role.name if user.role else "User"}
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "emp_id": user.emp_id,
            "name": user.name,
            "dept_name": user.department.name if user.department else "未知",
            "role": user.role.name if user.role else "User",
            "functions": [f.code for f in user.role.functions] if user.role else []
        }
    }
