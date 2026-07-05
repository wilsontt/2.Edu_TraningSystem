"""
機敏字串加解密工具。

用途：
- 排程備份 NAS 密碼（DB 欄位，見 NAS PLAN §5.6／§7.1）
- SMTP 等環境變數密文（`.env` 以 `enc:<Fernet密文>` 儲存，見 AD 整合／ISO 27001 強化）

採對稱加密 `cryptography.fernet`。金鑰優先讀 `CREDENTIAL_SECRET`，未設則沿用
`BACKUP_CREDENTIAL_SECRET`（相容既有部署）。金鑰絕不寫入版控或以明文存於業務資料表。
未設定金鑰時，加解密操作會拋出明確錯誤，而非靜默以明文儲存。
"""

from __future__ import annotations

import logging

from cryptography.fernet import Fernet, InvalidToken

from ..config import get_settings

logger = logging.getLogger(__name__)

# 環境變數密文前綴；例：SMTP_PASSWORD=enc:gAAAAA...
ENV_SECRET_PREFIX = "enc:"


class CredentialEncryptionError(Exception):
    """金鑰未設定或加解密失敗。"""


def _get_fernet() -> Fernet:
    secret = get_settings().effective_credential_secret
    if not secret:
        raise CredentialEncryptionError(
            "尚未設定 CREDENTIAL_SECRET（或相容用 BACKUP_CREDENTIAL_SECRET），"
            "無法加密／解密機敏字串"
        )
    try:
        return Fernet(secret.encode("utf-8"))
    except Exception as e:
        raise CredentialEncryptionError(
            f"CREDENTIAL_SECRET／BACKUP_CREDENTIAL_SECRET 格式錯誤：{e}"
        ) from e


def encrypt_secret(plain: str) -> str:
    """加密明文字串，回傳可存入 DB 或環境變數的 Fernet 密文字串（不含前綴）。"""
    return _get_fernet().encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt_secret(cipher_text: str) -> str:
    """解密 Fernet 密文字串，回傳明文。"""
    try:
        return _get_fernet().decrypt(cipher_text.encode("utf-8")).decode("utf-8")
    except InvalidToken as e:
        raise CredentialEncryptionError("密碼解密失敗（金鑰錯誤或資料已損毀）") from e


def is_encrypted_env_secret(raw: str | None) -> bool:
    """是否為 `enc:` 前綴之環境變數密文格式。"""
    return bool(raw and raw.startswith(ENV_SECRET_PREFIX) and len(raw) > len(ENV_SECRET_PREFIX))


def format_encrypted_env_secret(plain: str) -> str:
    """加密明文並加上 `enc:` 前綴，供寫入 `.env`。"""
    return f"{ENV_SECRET_PREFIX}{encrypt_secret(plain)}"


def resolve_env_secret(raw: str | None, *, field_name: str = "secret") -> str:
    """解析環境變數中的機敏值。

    - 空字串 → 空字串
    - `enc:<密文>` → Fernet 解密後回傳明文
    - 其他 → 視為舊版明文，記錄警告後原樣回傳（過渡相容；生產應改為 enc:）
    """
    if not raw:
        return ""
    if is_encrypted_env_secret(raw):
        cipher = raw[len(ENV_SECRET_PREFIX) :]
        return decrypt_secret(cipher)
    logger.warning(
        "%s 仍為明文儲存；請改為 enc:<密文>（執行 scripts/encrypt_env_secret.py），"
        "並設定 CREDENTIAL_SECRET 或 BACKUP_CREDENTIAL_SECRET",
        field_name,
    )
    return raw
