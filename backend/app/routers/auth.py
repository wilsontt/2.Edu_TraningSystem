"""
認證模組路由 — 四條登入路徑 + JWT 工具。

路徑 A (/login/admin)           — AD LDAPS 日常管理員登入
路徑 B (/login/local)           — break-glass 本地緊急登入
路徑 C (/login)                 — 員工免密登入（驗證碼；管理角色拒絕）
路徑 D (/login/admin/email/*)   — Email OTP 備援（AD 斷線時）
"""

import logging
from datetime import datetime, timedelta
from io import BytesIO
from typing import List, Optional
import base64
import random
import re
import string
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordBearer
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session, joinedload

from .. import auth_utils, models, schemas
from ..config import get_settings
from ..constants.auth import SUPER_ADMIN_ROLE_NAMES, is_management_role, is_super_admin_role
from ..database import get_db
from ..schemas import (
    AdminLoginRequest,
    AuthLoginResponse,
    ChangePasswordRequest,
    EmailOtpRequestBody,
    EmailOtpRequestResponse,
    EmailOtpVerifyBody,
    LocalLoginRequest,
    LoginUserInfo,
    MustChangePasswordResponse,
)
from ..services.ad_auth import AdConnectionError, AdAuthResult, authenticate_ad
from ..services.email_otp import (
    OtpEligibilityError,
    OtpRateLimitError,
    OtpVerifyError,
    is_ad_unreachable,
    mark_ad_reachable,
    mark_ad_unreachable,
    request_otp,
    verify_otp,
)
from ..services.jit_provision import EmpIdCollisionError, upsert_admin_user
from ..services.password_policy import PasswordPolicyViolation, is_password_expired, validate_password_complexity
from ..services.smtp_mailer import SmtpDeliveryError

logger = logging.getLogger(__name__)
audit_logger = logging.getLogger("audit")

# OAuth2 密碼模式；tokenUrl 與 /login 端點對應
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

# 暫存驗證碼答案（正式環境建議改用 Redis）
captcha_store: dict[str, str] = {}

# ────────────────────────────────────────────────────────────────────
# 內部工具
# ────────────────────────────────────────────────────────────────────

def _audit(event: str, emp_id: str, auth_src: str, client_ip: str, detail: str = "") -> None:
    audit_logger.info(
        "event=%s emp_id=%s auth_src=%s ip=%s detail=%s",
        event, emp_id, auth_src, client_ip, detail,
    )


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _load_user_full(db: Session, emp_id: str) -> Optional[models.User]:
    """載入使用者並預先載入角色、功能、部門。"""
    return (
        db.query(models.User)
        .options(
            joinedload(models.User.role).joinedload(models.Role.functions),
            joinedload(models.User.department),
        )
        .filter(models.User.emp_id == emp_id)
        .first()
    )


def _auth_response_dict(user: models.User, auth_src: str) -> dict:
    """組裝登入成功回應（dict，FastAPI 自動序列化）。"""
    role_name = user.role.name if user.role else "User"
    funcs = [f.code for f in user.role.functions] if user.role and user.role.functions else []
    dept_name = user.department.name if user.department else "未知"
    token = auth_utils.create_access_token(data={"sub": user.emp_id, "role": role_name})
    return {
        "access_token": token,
        "token_type": "bearer",
        "auth_src": auth_src,
        "user": {
            "emp_id": user.emp_id,
            "name": user.name,
            "dept_name": dept_name,
            "role": role_name,
            "functions": funcs,
        },
    }


# ────────────────────────────────────────────────────────────────────
# 身份驗證依賴
# ────────────────────────────────────────────────────────────────────

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    payload = auth_utils.verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="無效的認證憑證")

    emp_id = payload.get("sub")
    if not emp_id:
        raise HTTPException(status_code=401, detail="無效的認證憑證")

    user = (
        db.query(models.User)
        .options(
            joinedload(models.User.role).joinedload(models.Role.functions),
            joinedload(models.User.job_title),
        )
        .filter(models.User.emp_id == emp_id)
        .first()
    )

    if not user:
        raise HTTPException(status_code=401, detail="找不到使用者")

    return user


router = APIRouter(prefix="/auth", tags=["auth"])


# ────────────────────────────────────────────────────────────────────
# RBAC 權限檢查 Dependency
# ────────────────────────────────────────────────────────────────────

def check_permission(required_func_code: str):
    async def _dep(current_user: models.User = Depends(get_current_user)):
        try:
            if not current_user.role:
                raise HTTPException(status_code=403, detail="使用者未分配角色")
            if is_super_admin_role(current_user.role.name):
                return current_user
            if any(f.code == required_func_code for f in current_user.role.functions):
                return current_user
            raise HTTPException(status_code=403, detail="權限不足，無法存取此功能")
        except HTTPException:
            raise
        except Exception as exc:
            logger.error("Permission check error: %s", exc)
            raise HTTPException(status_code=500, detail="權限檢查發生錯誤")

    return Depends(_dep)


def check_any_permission(required_func_codes: List[str]):
    async def _dep(current_user: models.User = Depends(get_current_user)):
        try:
            if not current_user.role:
                raise HTTPException(status_code=403, detail="使用者未分配角色")
            if is_super_admin_role(current_user.role.name):
                return current_user
            allowed = set(required_func_codes)
            user_codes = {f.code for f in (current_user.role.functions or [])}
            if allowed & user_codes:
                return current_user
            raise HTTPException(status_code=403, detail="權限不足，無法存取此功能")
        except HTTPException:
            raise
        except Exception as exc:
            logger.error("Permission check error: %s", exc)
            raise HTTPException(status_code=500, detail="權限檢查發生錯誤")

    return Depends(_dep)


# ────────────────────────────────────────────────────────────────────
# 公開端點：部門清單、驗證碼
# ────────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    emp_id: str = Field(..., min_length=1, max_length=10)
    name: str = Field(..., min_length=1, max_length=20)
    dept_id: int

    @field_validator("emp_id")
    @classmethod
    def validate_emp_id(cls, v: str) -> str:
        v_lower = v.lower()
        if v_lower != "admin" and not re.match(r"^[0-9]{1,10}$", v):
            raise ValueError("員工編號必須是 1-10 碼的數字")
        return v_lower if v_lower == "admin" else v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("姓名不能為空")
        return v


class LoginRequest(BaseModel):
    emp_id: str = Field(..., min_length=1, max_length=10)
    captcha_id: str
    answer: str

    @field_validator("emp_id")
    @classmethod
    def validate_emp_id(cls, v: str) -> str:
        v_lower = v.lower()
        if v_lower != "admin" and not re.match(r"^[0-9]{1,10}$", v):
            raise ValueError("員工編號必須是 1-10 碼的數字")
        return v_lower if v_lower == "admin" else v


@router.get("/departments", response_model=List[schemas.Department])
def get_public_departments(db: Session = Depends(get_db)):
    return db.query(models.Department).all()


@router.get("/captcha")
async def get_captcha():
    captcha_text = "".join(random.choices(string.digits, k=4))

    width, height = 200, 72
    image = Image.new("RGB", (width, height), color=(255, 255, 255))
    draw = ImageDraw.Draw(image)

    for _ in range(5):
        x1 = random.randint(0, width)
        y1 = random.randint(0, height)
        x2 = random.randint(0, width)
        y2 = random.randint(0, height)
        draw.line(((x1, y1), (x2, y2)), fill=(240, 240, 240), width=2)

    font_paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "Arial.ttf",
    ]
    font = None
    for path in font_paths:
        try:
            font = ImageFont.truetype(path, 48)
            break
        except Exception:
            continue
    if font is None:
        font = ImageFont.load_default()

    colors = [(220, 38, 38), (22, 163, 74), (37, 99, 235), (234, 88, 12)]
    for i, char in enumerate(captcha_text):
        x = 24 + i * 42
        y = 10 + random.randint(0, 6)
        draw.text((x, y), char, font=font, fill=colors[i % len(colors)])

    buffered = BytesIO()
    image.save(buffered, format="PNG")
    img_b64 = base64.b64encode(buffered.getvalue()).decode()

    captcha_id = str(uuid.uuid4())
    captcha_store[captcha_id] = captcha_text.upper()

    return {"captcha_id": captcha_id, "image": f"data:image/png;base64,{img_b64}"}


@router.post("/register")
async def register(req: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.emp_id == req.emp_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="此員工編號已註冊")

    dept = db.query(models.Department).filter(models.Department.id == req.dept_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="所選部門不存在")

    user_role = db.query(models.Role).filter(models.Role.name == "User").first()
    if not user_role:
        user_role = models.Role(name="User")
        db.add(user_role)
        db.commit()
        db.refresh(user_role)

    new_user = models.User(emp_id=req.emp_id, name=req.name, dept_id=dept.id, role_id=user_role.id)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {"emp_id": new_user.emp_id, "name": new_user.name, "dept_name": dept.name, "role": user_role.name}


# ────────────────────────────────────────────────────────────────────
# 路徑 C：員工免密登入（含驗證碼）— 管理角色拒絕
# ────────────────────────────────────────────────────────────────────

@router.post("/login")
async def login(req: LoginRequest, request: Request, db: Session = Depends(get_db)):
    settings = get_settings()
    client_ip = _client_ip(request)

    # 驗證碼檢查（LOGIN_BYPASS_ENABLED 控制 0000 後門）
    if req.answer == "0000" and settings.login_bypass_enabled:
        pass
    else:
        if not req.captcha_id:
            raise HTTPException(status_code=400, detail="驗證碼 ID 不存在，請重新取得驗證碼")
        stored = captcha_store.get(req.captcha_id)
        if not stored:
            raise HTTPException(status_code=400, detail="驗證碼已過期或不存在，請重新取得驗證碼")
        if stored != req.answer.upper():
            raise HTTPException(status_code=400, detail="驗證碼錯誤")
        del captcha_store[req.captcha_id]

    user = (
        db.query(models.User)
        .options(
            joinedload(models.User.department),
            joinedload(models.User.role).joinedload(models.Role.functions),
        )
        .filter(models.User.emp_id == req.emp_id)
        .first()
    )

    if not user:
        raise HTTPException(status_code=404, detail="員工編號不存在，請先註冊")

    if user.status != "active":
        raise HTTPException(status_code=403, detail="此帳號已被停用")

    # 管理角色禁止走路徑 C（§6.6）
    if is_management_role(user):
        _audit("login_c_blocked_management", user.emp_id, "employee", client_ip, "管理角色禁止走路徑C")
        raise HTTPException(status_code=403, detail="管理帳號請使用 AD 登入或本地緊急登入")

    role_name = user.role.name if user.role else "User"
    access_token = auth_utils.create_access_token(data={"sub": user.emp_id, "role": role_name})

    _audit("login_c_success", user.emp_id, "employee", client_ip)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "emp_id": user.emp_id,
            "name": user.name,
            "dept_name": user.department.name if user.department else "未知",
            "role": role_name,
            "functions": [f.code for f in user.role.functions] if user.role and user.role.functions else [],
        },
    }


# ────────────────────────────────────────────────────────────────────
# 路徑 A：AD 管理員登入
# ────────────────────────────────────────────────────────────────────

@router.post("/login/admin")
async def login_admin(req: AdminLoginRequest, request: Request, db: Session = Depends(get_db)):
    """
    AD LDAPS 管理員登入。

    503 情境：
    - AD_ENABLED=false → {"detail": "AD 整合未啟用"}（無 fallback）
    - DC 不可達        → {"detail": "...", "fallback": "email"}（前端展開 OTP UI）
    """
    settings = get_settings()
    client_ip = _client_ip(request)

    if not settings.ad_configured:
        return JSONResponse(
            status_code=503,
            content={"detail": "AD 整合未啟用（AD_ENABLED=false 或缺少必要設定）"},
        )

    try:
        ad_result = authenticate_ad(req.username, req.password, settings)
    except AdConnectionError as exc:
        mark_ad_unreachable()
        _audit("ad_login_connection_error", req.username, "ad", client_ip, str(exc))
        return JSONResponse(
            status_code=503,
            content={"detail": f"AD 伺服器暫時無法連線：{exc}", "fallback": "email"},
        )

    if ad_result is None:
        _audit("ad_login_bad_credentials", req.username, "ad", client_ip)
        raise HTTPException(status_code=401, detail="AD 帳號或密碼錯誤")

    if settings.ad_admin_group not in ad_result.groups:
        _audit("ad_login_not_in_group", ad_result.ad_username, "ad", client_ip,
               f"非 {settings.ad_admin_group} 群組")
        raise HTTPException(
            status_code=403,
            detail=f"使用者不在 {settings.ad_admin_group} 群組，無管理存取權",
        )

    try:
        user = upsert_admin_user(db, ad_result, settings)
    except EmpIdCollisionError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    mark_ad_reachable()

    user = _load_user_full(db, user.emp_id)
    _audit("ad_login_success", user.emp_id, "ad", client_ip)
    return _auth_response_dict(user, "ad")


# ────────────────────────────────────────────────────────────────────
# 路徑 D：Email OTP 備援（AD 斷線時）
# ────────────────────────────────────────────────────────────────────

@router.post("/login/admin/email/request")
async def login_admin_email_request(
    req: EmailOtpRequestBody,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    發送 Email OTP（路徑 D 第一步）。
    AD 仍可達時回 400；帳號不符資格時回 403；頻率超限時回 429。
    """
    settings = get_settings()
    client_ip = _client_ip(request)

    # AD 可達 → 不允許走路徑 D
    if not settings.ad_fallback_email_enabled or not is_ad_unreachable(settings):
        raise HTTPException(status_code=400, detail="請使用 AD 登入")

    try:
        result = request_otp(db, req.username, client_ip, settings=settings)
    except OtpEligibilityError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except OtpRateLimitError as exc:
        raise HTTPException(status_code=429, detail=str(exc))
    except SmtpDeliveryError as exc:
        logger.error("SMTP 發信失敗 username=%s: %s", req.username, exc)
        raise HTTPException(status_code=503, detail="Email 發送失敗，請稍後再試")

    return result


@router.post("/login/admin/email/verify")
async def login_admin_email_verify(
    req: EmailOtpVerifyBody,
    request: Request,
    db: Session = Depends(get_db),
):
    """驗證 Email OTP，成功後發 JWT（路徑 D 第二步）。"""
    settings = get_settings()
    client_ip = _client_ip(request)

    try:
        user = verify_otp(db, req.username, req.otp_code, client_ip, settings=settings)
    except OtpVerifyError as exc:
        _audit("email_otp_verify_failed", req.username, "email_fallback", client_ip, str(exc))
        raise HTTPException(status_code=401, detail=str(exc))

    user = _load_user_full(db, user.emp_id)
    _audit("email_otp_login_success", user.emp_id, "email_fallback", client_ip)
    return _auth_response_dict(user, "email_fallback")


# ────────────────────────────────────────────────────────────────────
# 路徑 B：break-glass 本地緊急登入
# ────────────────────────────────────────────────────────────────────

@router.post("/login/local")
async def login_local(req: LocalLoginRequest, request: Request, db: Session = Depends(get_db)):
    """
    break-glass 本地緊急登入（僅 is_protected=true 帳號）。

    鎖定狀態回 423；帳密錯誤回 401；密碼到期回 must_change_password 物件。
    """
    settings = get_settings()
    client_ip = _client_ip(request)

    user = _load_user_full(db, req.emp_id)

    # 帳號不存在或不是 protected 帳號 → 統一 403（不揭露存在性）
    if not user or not user.is_protected:
        _audit("local_login_failed_no_account", req.emp_id, "local", client_ip)
        raise HTTPException(status_code=403, detail="帳號不存在或無本地登入權限")

    if user.status != "active":
        raise HTTPException(status_code=403, detail="帳號已停用")

    # 鎖定檢查
    now = datetime.utcnow()
    if user.locked_until and user.locked_until > now:
        raise HTTPException(
            status_code=423,
            detail=f"帳號已鎖定，請 {settings.login_lockout_minutes} 分鐘後再試",
        )

    if not user.password_hash:
        raise HTTPException(status_code=403, detail="帳號未設定密碼，請聯絡系統管理員")

    # 密碼驗證
    if not auth_utils.verify_password(req.password, user.password_hash):
        user.failed_login_count = (user.failed_login_count or 0) + 1
        if user.failed_login_count >= settings.login_max_failed:
            user.locked_until = now + timedelta(minutes=settings.login_lockout_minutes)
            db.commit()
            _audit("local_login_locked", user.emp_id, "local", client_ip,
                   f"失敗 {settings.login_max_failed} 次，已鎖定")
            raise HTTPException(status_code=423, detail="連續錯誤次數過多，帳號已鎖定")
        db.commit()
        _audit("local_login_bad_credentials", user.emp_id, "local", client_ip,
               f"失敗 {user.failed_login_count} 次")
        raise HTTPException(status_code=401, detail="帳號或密碼錯誤")

    # 密碼到期 → 要求強制換密
    if is_password_expired(user, settings):
        change_token = auth_utils.create_password_change_token(user.emp_id, settings)
        user.must_change_password = True
        db.commit()
        _audit("local_login_must_change_password", user.emp_id, "local", client_ip)
        return {"must_change_password": True, "change_token": change_token}

    # 登入成功
    user.last_login_at = now
    user.failed_login_count = 0
    user.locked_until = None
    db.commit()

    user = _load_user_full(db, user.emp_id)
    _audit("local_login_success", user.emp_id, "local", client_ip)
    return _auth_response_dict(user, "local")


# ────────────────────────────────────────────────────────────────────
# 路徑 B：強制改密
# ────────────────────────────────────────────────────────────────────

@router.post("/password/change")
async def change_password(req: ChangePasswordRequest, db: Session = Depends(get_db)):
    """break-glass 帳號密碼強制更新（must_change_password 流程）。"""
    settings = get_settings()

    emp_id = auth_utils.verify_password_change_token(req.change_token, settings)
    if not emp_id or emp_id != req.emp_id:
        raise HTTPException(status_code=401, detail="無效的密碼變更 token")

    user = db.query(models.User).filter(
        models.User.emp_id == emp_id,
        models.User.is_protected == True,  # noqa: E712
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="帳號不存在")

    try:
        validate_password_complexity(req.new_password, settings)
    except PasswordPolicyViolation as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    now = datetime.utcnow()
    user.password_hash = auth_utils.hash_password(req.new_password)
    user.password_changed_at = now
    user.must_change_password = False
    user.failed_login_count = 0
    user.locked_until = None
    db.commit()

    return {"message": "密碼已成功更新"}


# ────────────────────────────────────────────────────────────────────
# /me 端點
# ────────────────────────────────────────────────────────────────────

@router.get("/me")
async def get_me(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scope_type = "self"
    scope_dept_ids: List[int] = []

    if current_user.role and is_super_admin_role(current_user.role.name):
        scope_type = "all"
    elif current_user.role_id:
        scope_row = db.query(models.RoleDepartmentScope).filter(
            models.RoleDepartmentScope.role_id == current_user.role_id
        ).first()
        if scope_row:
            scope_type = scope_row.scope_type or "self"
        if scope_type == "department":
            scope_dept_ids = [
                row[0]
                for row in db.query(models.RoleDepartmentScopeDept.dept_id).filter(
                    models.RoleDepartmentScopeDept.role_id == current_user.role_id
                ).all()
            ]

    return {
        "emp_id": current_user.emp_id,
        "name": current_user.name,
        "dept_name": current_user.department.name,
        "role": current_user.role.name,
        "functions": [f.code for f in current_user.role.functions],
        "role_scope_type": scope_type,
        "role_scope_dept_ids": scope_dept_ids,
    }


# ────────────────────────────────────────────────────────────────────
# 驗證碼工具端點（原有，無修改）
# ────────────────────────────────────────────────────────────────────

@router.post("/verify-captcha")
async def verify_captcha(captcha_id: str, answer: str):
    stored = captcha_store.get(captcha_id)
    if not stored:
        raise HTTPException(status_code=400, detail="驗證碼已過期或不存在")
    if stored == answer.upper():
        del captcha_store[captcha_id]
        return {"status": "success"}
    raise HTTPException(status_code=400, detail="驗證碼錯誤")


# ────────────────────────────────────────────────────────────────────
# QR code 登入（已棄用，保留相容性）
# ────────────────────────────────────────────────────────────────────

@router.get("/login/qrcode/{token}", response_model=schemas.QRCodeTokenValidate, deprecated=True)
def validate_qrcode_token(token: str, db: Session = Depends(get_db)):
    """[已棄用] QRcode 一次性 token 驗證。"""
    login_token = db.query(models.LoginToken).filter(models.LoginToken.token == token).first()
    if not login_token:
        return {"valid": False, "reason": "Token 不存在"}
    if datetime.utcnow() > login_token.expires_at:
        return {"valid": False, "reason": "Token 已過期"}
    return {"valid": True, "expires_at": login_token.expires_at}


@router.post("/login/qrcode/{token}", deprecated=True)
async def login_with_qrcode(
    token: str,
    req: schemas.QRCodeLoginRequest,
    db: Session = Depends(get_db),
):
    """[已棄用] 使用 QRcode 一次性 token 登入。"""
    settings = get_settings()
    login_token = db.query(models.LoginToken).filter(models.LoginToken.token == token).first()
    if not login_token:
        raise HTTPException(status_code=400, detail="無效的 QRcode token")
    if datetime.utcnow() > login_token.expires_at:
        raise HTTPException(status_code=400, detail="QRcode 已過期，請重新產生")

    if req.answer == "0000" and settings.login_bypass_enabled:
        pass
    else:
        stored = captcha_store.get(req.captcha_id)
        if not stored:
            raise HTTPException(status_code=400, detail="驗證碼已過期或不存在")
        if stored != req.answer.upper():
            raise HTTPException(status_code=400, detail="驗證碼錯誤")
        del captcha_store[req.captcha_id]

    user = (
        db.query(models.User)
        .options(
            joinedload(models.User.department),
            joinedload(models.User.role).joinedload(models.Role.functions),
        )
        .filter(models.User.emp_id == req.emp_id)
        .first()
    )
    if not user:
        raise HTTPException(status_code=404, detail="員工編號不存在，請先註冊")
    if user.status != "active":
        raise HTTPException(status_code=403, detail="此帳號已被停用")

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
            "functions": [f.code for f in user.role.functions] if user.role else [],
        },
    }
