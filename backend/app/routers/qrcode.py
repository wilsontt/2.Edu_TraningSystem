from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timedelta
import uuid
import qrcode
import base64
import os
from io import BytesIO
from .. import models, schemas
from ..database import get_db
from .auth import check_permission, get_current_user
from .. import auth_utils

router = APIRouter(prefix="/admin/qrcode", tags=["qrcode"])

def generate_qrcode_image(url: str) -> str:
    """生成 QRcode 圖片並返回 Base64 編碼的圖片 URL"""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    
    # 將圖片轉換為 Base64
    buffered = BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode()
    
    return f"data:image/png;base64,{img_str}"

@router.post("/login/generate", response_model=schemas.QRCodeGenerateResponse)
def generate_login_qrcode(
    request: Request,
    db: Session = Depends(get_db),
    current_user = check_permission("menu:admin")  # 僅 Admin
):
    """產生登入 QRcode"""
    # 產生唯一的 token
    token = str(uuid.uuid4())
    
    # 設定過期時間（24小時後）
    expires_at = datetime.utcnow() + timedelta(hours=24)
    
    # 儲存 token 到資料庫
    login_token = models.LoginToken(
        token=token,
        created_by=current_user.emp_id,
        expires_at=expires_at,
        is_used=False
    )
    
    db.add(login_token)
    try:
        db.commit()
        db.refresh(login_token)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"產生 QRcode 失敗：{str(e)}")
    
    # 構建完整的 QRcode URL（支持動態 URL，非固定 IP）
    # 優先使用環境變數 FRONTEND_URL（適合生產環境配置）
    frontend_url = os.getenv("FRONTEND_URL")
    
    if frontend_url:
        # 使用環境變數設定的前端 URL（推薦用於生產環境）
        base_url = frontend_url.rstrip("/")
    else:
        # 從請求 headers 中獲取前端 URL
        # 優先使用前端明確傳遞的 URL（通過 X-Frontend-URL header）
        explicit_frontend_url = request.headers.get("x-frontend-url")
        if explicit_frontend_url:
            base_url = explicit_frontend_url.rstrip("/")
        else:
            # 其次從 Referer 或 Origin header 中提取（前端會自動設置）
            referer = request.headers.get("referer") or request.headers.get("origin")
            
            if referer:
                # 從 Referer 或 Origin 提取前端 URL
                from urllib.parse import urlparse
                parsed = urlparse(referer)
                base_url = f"{parsed.scheme}://{parsed.netloc}"
            else:
                # 如果沒有 Referer，嘗試從請求 host 推斷
                host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
                scheme = request.headers.get("x-forwarded-proto") or request.url.scheme
                
                # 如果是後端端口（8000），嘗試推斷前端端口
                if ":8000" in host:
                    # 移除端口號，假設前端在同一 host 的不同端口
                    host_without_port = host.split(":")[0]
                    # 嘗試常見的前端開發端口
                    base_url = f"{scheme}://{host_without_port}:5173"  # Vite 默認端口
                else:
                    base_url = f"{scheme}://{host}"
                    # 移除可能的路徑前綴（如 /api）
                    if "/api" in base_url:
                        base_url = base_url.split("/api")[0]
    
    # 前端路由是 /auth/login/qrcode/:token（不需要 /api 前綴）
    qrcode_url = f"{base_url}/auth/login/qrcode/{token}"
    
    # 生成 QRcode 圖片
    qrcode_image = generate_qrcode_image(qrcode_url)
    
    return {
        "token": token,
        "qrcode_url": qrcode_image,
        "expires_at": expires_at
    }

@router.get("/login/tokens", response_model=List[schemas.LoginToken])
def get_login_tokens(
    db: Session = Depends(get_db),
    current_user = check_permission("menu:admin")
):
    """查詢所有產生的登入 token（含使用狀態）"""
    tokens = db.query(models.LoginToken).order_by(
        models.LoginToken.created_at.desc()
    ).limit(50).all()  # 限制最近 50 筆
    
    return tokens

@router.delete("/login/tokens/{token_id}")
def delete_login_token(
    token_id: int,
    db: Session = Depends(get_db),
    current_user = check_permission("menu:admin")
):
    """刪除指定的登入 token"""
    token = db.query(models.LoginToken).filter(models.LoginToken.id == token_id).first()
    
    if not token:
        raise HTTPException(status_code=404, detail="Token 不存在")
    
    try:
        db.delete(token)
        db.commit()
        return {"success": True, "message": "Token 已刪除"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"刪除 Token 失敗：{str(e)}")

@router.post("/login/tokens/{token_id}/regenerate-qrcode")
def regenerate_qrcode_for_token(
    token_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user = check_permission("menu:admin")
):
    """為現有的 token 重新生成 QRcode"""
    token = db.query(models.LoginToken).filter(models.LoginToken.id == token_id).first()
    
    if not token:
        raise HTTPException(status_code=404, detail="Token 不存在")
    
    # 只檢查 token 是否已過期（不再檢查 is_used，因為允许多人使用）
    if datetime.utcnow() > token.expires_at:
        raise HTTPException(status_code=400, detail="此 Token 已過期，無法重新生成 QRcode")
    
    # 構建 QRcode URL（使用相同的邏輯，與 generate_login_qrcode 保持一致）
    frontend_url = os.getenv("FRONTEND_URL")
    
    if frontend_url:
        base_url = frontend_url.rstrip("/")
    else:
        explicit_frontend_url = request.headers.get("x-frontend-url")
        if explicit_frontend_url:
            base_url = explicit_frontend_url.rstrip("/")
        else:
            referer = request.headers.get("referer") or request.headers.get("origin")
            
            if referer:
                from urllib.parse import urlparse
                parsed = urlparse(referer)
                base_url = f"{parsed.scheme}://{parsed.netloc}"
            else:
                host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
                scheme = request.headers.get("x-forwarded-proto") or request.url.scheme
                
                if ":8000" in host:
                    host_without_port = host.split(":")[0]
                    base_url = f"{scheme}://{host_without_port}:5173"
                else:
                    base_url = f"{scheme}://{host}"
                    if "/api" in base_url:
                        base_url = base_url.split("/api")[0]
    
    # 構建完整的登入 URL
    login_url = f"{base_url}/auth/login/qrcode/{token.token}"
    qrcode_image = generate_qrcode_image(login_url)
    
    return {
        "token": token.token,
        "qrcode_url": qrcode_image,  # Base64 編碼的圖片
        "login_url": login_url,  # 完整的登入 URL（用於複製）
        "expires_at": token.expires_at
    }
