"""
認證工具函式 — JWT 簽發、驗證，及 break-glass 密碼雜湊。

JWT_SECRET_KEY 與 JWT_EXPIRE_MINUTES 從 config.get_settings() 讀取，
不再使用模組層級硬編碼常數（W3 安全債清償）。
"""

from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from jose import JWTError, jwt

from .config import get_settings

ALGORITHM = "HS256"

_BCRYPT_ROUNDS = 12


def hash_password(password: str) -> str:
    """break-glass 本地帳號密碼雜湊（bcrypt；與遷移腳本一致）。"""
    return bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt(rounds=_BCRYPT_ROUNDS),
    ).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """驗證明文密碼與 bcrypt 雜湊是否相符。"""
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(
            password.encode("utf-8"),
            password_hash.encode("utf-8"),
        )
    except (ValueError, TypeError):
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    settings = get_settings()
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=settings.jwt_expire_minutes)
    )
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=ALGORITHM)


def verify_token(token: str) -> Optional[dict]:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[ALGORITHM])
    except JWTError:
        return None


def create_password_change_token(emp_id: str, settings=None) -> str:
    """發給 break-glass 帳號的一次性密碼變更 JWT（10 分鐘有效）。"""
    if settings is None:
        settings = get_settings()
    expire = datetime.utcnow() + timedelta(minutes=10)
    return jwt.encode(
        {"sub": emp_id, "exp": expire, "type": "password_change"},
        settings.jwt_secret_key,
        algorithm=ALGORITHM,
    )


def verify_password_change_token(token: str, settings=None) -> Optional[str]:
    """驗證密碼變更 token；成功回傳 emp_id，失敗回傳 None。"""
    if settings is None:
        settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[ALGORITHM])
        if payload.get("type") != "password_change":
            return None
        return payload.get("sub")
    except JWTError:
        return None
