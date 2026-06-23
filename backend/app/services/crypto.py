"""
機敏字串加解密工具（排程備份 NAS 密碼用，見 NAS PLAN §5.6／§7.1）。

採對稱加密 `cryptography.fernet`，金鑰來自環境變數 `BACKUP_CREDENTIAL_SECRET`，
絕不寫入版控或以明文存於資料庫。未設定金鑰時，加解密操作會拋出明確錯誤，
提示管理者先設定金鑰，而非靜默以明文儲存。
"""

from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken

from ..config import get_settings


class CredentialEncryptionError(Exception):
    """金鑰未設定或加解密失敗。"""


def _get_fernet() -> Fernet:
    secret = get_settings().backup_credential_secret
    if not secret:
        raise CredentialEncryptionError(
            "尚未設定 BACKUP_CREDENTIAL_SECRET，無法加密／解密排程備份 NAS 密碼"
        )
    try:
        return Fernet(secret.encode("utf-8"))
    except Exception as e:
        raise CredentialEncryptionError(f"BACKUP_CREDENTIAL_SECRET 格式錯誤：{e}") from e


def encrypt_secret(plain: str) -> str:
    """加密明文字串，回傳可存入 DB 的密文字串。"""
    return _get_fernet().encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt_secret(cipher_text: str) -> str:
    """解密密文字串，回傳明文。"""
    try:
        return _get_fernet().decrypt(cipher_text.encode("utf-8")).decode("utf-8")
    except InvalidToken as e:
        raise CredentialEncryptionError("密碼解密失敗（金鑰錯誤或資料已損毀）") from e
