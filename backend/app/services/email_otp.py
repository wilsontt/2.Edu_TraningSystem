"""
Email OTP 備援登入服務（路徑 D）。

只有在以下全部條件成立時才允許路徑 D：
  1. AD_FALLBACK_EMAIL_ENABLED=true
  2. AD 目前不可達（mark_ad_unreachable 已被呼叫且未過期）
  3. user.is_trainee=False 且帳號狀態為 active
  4. user.email 非空且通過網域白名單（若設定）
  5. user.email_verified_at 距今 <= AD_EMAIL_FALLBACK_MAX_DAYS（曾成功 AD 登入）

AD_ENABLED=false 時 is_ad_unreachable() 固定回 False，
因此 AD_ENABLED=false 的 503 不觸發 OTP UI。
"""
from __future__ import annotations

import datetime
import logging
import secrets
import threading
import time

from passlib.context import CryptContext
from sqlalchemy.orm import Session

from ..config import Settings, get_settings
from ..models import AdminLoginOtp, User

logger = logging.getLogger(__name__)

# OTP 使用 sha256_crypt（避免 passlib bcrypt 初始化與新版 bcrypt 套件相容性問題）
_pwd_context = CryptContext(schemes=["sha256_crypt"], deprecated="auto")

# ── AD 不可達快取（模組級，thread-safe）────────────────────────────
_lock = threading.Lock()
_unreachable_until: float = 0.0  # epoch seconds；0 = 可達


def mark_ad_unreachable(duration_seconds: int = 300) -> None:
    """AD 連線失敗時由 router 呼叫，記錄不可達狀態。"""
    with _lock:
        global _unreachable_until
        _unreachable_until = time.time() + duration_seconds
    logger.warning("AD 標記為不可達，持續 %ds", duration_seconds)


def mark_ad_reachable() -> None:
    """AD 連線成功時清除快取。"""
    with _lock:
        global _unreachable_until
        _unreachable_until = 0.0


def is_ad_unreachable(settings: "Settings | None" = None) -> bool:
    """
    AD 是否不可達。
    - AD_ENABLED=false → 固定回 False（避免 OTP 備援被觸發；§1.1 #4）
    - 快取尚未到期 → True
    接受 settings 注入以利測試（不傳則用 get_settings()）。
    """
    if settings is None:
        settings = get_settings()
    if not settings.ad_enabled:
        return False
    with _lock:
        return time.time() < _unreachable_until


# ── Email OTP 資格檢查 ────────────────────────────────────────────

def can_use_email_fallback(
    user: User,
    settings: Settings,
) -> tuple[bool, str]:
    """
    全部條件成立時回 (True, "")；否則回 (False, 原因描述)。
    原因描述可直接顯示給 IT 管理員。
    """
    if not settings.ad_fallback_email_enabled:
        return False, "Email OTP 備援已停用（AD_FALLBACK_EMAIL_ENABLED=false）"

    if not is_ad_unreachable(settings):
        return False, "AD 目前可達，請使用 AD 登入"

    if user.is_trainee:
        return False, "非管理帳號，不符備援資格"

    if not user.email:
        return False, "帳號未綁定 Email（須先以 AD 登入一次）"

    if settings.ad_email_allowed_domain:
        if not user.email.lower().endswith(f"@{settings.ad_email_allowed_domain.lower()}"):
            return False, f"Email 網域不在白名單（需為 @{settings.ad_email_allowed_domain}）"

    if user.status != "active":
        return False, "帳號已停用"

    if user.email_verified_at is None:
        return False, "尚未透過 AD 登入，無法使用 Email 備援"

    cutoff = datetime.datetime.utcnow() - datetime.timedelta(
        days=settings.ad_email_fallback_max_days
    )
    if user.email_verified_at < cutoff:
        return False, (
            f"距上次 AD 登入已超過 {settings.ad_email_fallback_max_days} 天，"
            "備援資格已失效"
        )

    return True, ""


# ── OTP 操作 ──────────────────────────────────────────────────────

class OtpRateLimitError(Exception):
    """短時間內 OTP 請求次數超過上限（429）。"""


class OtpEligibilityError(Exception):
    """帳號不符合 Email OTP 備援資格（403）。message 為原因說明。"""


class OtpVerifyError(Exception):
    """OTP 驗證失敗（401）。"""


def request_otp(
    db: Session,
    username: str,
    client_ip: str,
    settings: Settings | None = None,
) -> dict:
    """
    發起 OTP 請求：
    1. 確認 AD 備援資格
    2. 頻率限制（15 分鐘內 <= AD_EMAIL_OTP_MAX_REQUESTS）
    3. 產生 OTP、bcrypt 雜湊後存 DB
    4. 寄信

    Returns:
        {"masked_email": "w***@...", "expires_in_seconds": 600}

    Raises:
        OtpEligibilityError — 403
        OtpRateLimitError   — 429
        SmtpDeliveryError   — 503
    """
    if settings is None:
        settings = get_settings()

    # 查 JIT 帳號
    user = db.query(User).filter(User.emp_id == username).first()
    if not user:
        # 回傳與「資格不符」相同的訊息，避免使用者枚舉
        raise OtpEligibilityError("帳號未建立 AD 登入紀錄，無法使用 Email 備援")

    eligible, reason = can_use_email_fallback(user, settings)
    if not eligible:
        raise OtpEligibilityError(reason)

    # 頻率限制
    window_start = datetime.datetime.utcnow() - datetime.timedelta(minutes=15)
    recent_count = (
        db.query(AdminLoginOtp)
        .filter(
            AdminLoginOtp.emp_id == username,
            AdminLoginOtp.created_at >= window_start,
        )
        .count()
    )
    if recent_count >= settings.ad_email_otp_max_requests:
        raise OtpRateLimitError(
            f"15 分鐘內最多 {settings.ad_email_otp_max_requests} 次 OTP 請求"
        )

    # 產生 OTP（secrets 保證均勻分布）
    otp_code = f"{secrets.randbelow(10 ** settings.ad_email_otp_length):0{settings.ad_email_otp_length}d}"
    otp_hash = _pwd_context.hash(otp_code)

    expires_at = datetime.datetime.utcnow() + datetime.timedelta(
        minutes=settings.ad_email_otp_ttl_minutes
    )

    otp_row = AdminLoginOtp(
        emp_id=username,
        otp_hash=otp_hash,
        expires_at=expires_at,
    )
    db.add(otp_row)
    db.flush()  # 寫入但不 commit；SMTP 失敗時可 rollback，避免耗盡限額

    # 寄信（匯入在此以避免循環依賴）
    from .smtp_mailer import send_otp_email
    try:
        send_otp_email(user.email, otp_code, username, settings)
    except Exception:
        db.rollback()
        raise

    db.commit()

    masked = _mask_email(user.email)
    return {
        "masked_email": masked,
        "expires_in_seconds": settings.ad_email_otp_ttl_minutes * 60,
    }


def verify_otp(
    db: Session,
    username: str,
    otp_code: str,
    client_ip: str,
    settings: Settings | None = None,
) -> User:
    """
    驗證 OTP：
    - 找最新一筆未使用且未到期的 OTP 列
    - bcrypt 驗證；失敗時遞增 attempt_count
    - 連續失敗 6 次 → 作廢該列
    - 成功 → 標記 used_at、更新 last_login_at / auth_source

    Returns:
        User — 驗證通過

    Raises:
        OtpVerifyError — 401
    """
    if settings is None:
        settings = get_settings()

    now = datetime.datetime.utcnow()

    otp_row: AdminLoginOtp | None = (
        db.query(AdminLoginOtp)
        .filter(
            AdminLoginOtp.emp_id == username,
            AdminLoginOtp.expires_at > now,
            AdminLoginOtp.used_at.is_(None),
        )
        .order_by(AdminLoginOtp.created_at.desc())
        .first()
    )

    if otp_row is None:
        logger.warning("OTP 驗證失敗：無有效 OTP username=%s ip=%s", username, client_ip)
        raise OtpVerifyError("驗證碼不存在或已過期")

    _MAX_ATTEMPTS = 6

    if not _pwd_context.verify(otp_code, otp_row.otp_hash):
        otp_row.attempt_count += 1
        if otp_row.attempt_count >= _MAX_ATTEMPTS:
            otp_row.used_at = now  # 作廢
            logger.warning(
                "OTP 連續失敗 %d 次，已作廢 username=%s ip=%s",
                _MAX_ATTEMPTS,
                username,
                client_ip,
            )
        db.commit()
        raise OtpVerifyError("驗證碼錯誤")

    # 驗證成功
    otp_row.used_at = now
    user = db.query(User).filter(User.emp_id == username).first()
    if user:
        user.last_login_at = now
        user.auth_source = "email_fallback"
    db.commit()

    logger.info("Email OTP 登入成功 username=%s ip=%s", username, client_ip)
    return user


def _mask_email(email: str) -> str:
    """w***@yourco.com 遮罩格式。"""
    if "@" not in email:
        return "***"
    local, _, domain = email.partition("@")
    return f"{local[:1]}***@{domain}"
