"""
將明文機敏字串加密為 `.env` 可用之 `enc:<Fernet密文>`。

前置：已設定 CREDENTIAL_SECRET 或 BACKUP_CREDENTIAL_SECRET（Fernet 金鑰）。
產生金鑰：
  python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

執行方式（於 backend 目錄）：

  Windows:
    .\\.venv\\Scripts\\python.exe scripts/encrypt_env_secret.py "你的SMTP密碼"

  Linux / macOS:
    .venv/bin/python3 scripts/encrypt_env_secret.py "你的SMTP密碼"

將輸出整行貼到 `.env`：
  SMTP_PASSWORD=enc:gAAAAA...

注意：密文與金鑰綁定；更換 CREDENTIAL_SECRET 後須重新加密。
"""
from __future__ import annotations

import sys
from pathlib import Path

# 確保可 import app.*（不依賴 PYTHONPATH）
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))


def main() -> int:
    if len(sys.argv) < 2 or not sys.argv[1]:
        print(
            "用法: python scripts/encrypt_env_secret.py <明文密碼>\n"
            "請先在 backend/.env 設定 CREDENTIAL_SECRET 或 BACKUP_CREDENTIAL_SECRET。",
            file=sys.stderr,
        )
        return 2

    plain = sys.argv[1]
    from app.config import get_settings
    from app.services.crypto import CredentialEncryptionError, format_encrypted_env_secret

    settings = get_settings()
    if not settings.effective_credential_secret:
        print(
            "錯誤：尚未設定 CREDENTIAL_SECRET 或 BACKUP_CREDENTIAL_SECRET。\n"
            "產生金鑰：python -c \"from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())\"",
            file=sys.stderr,
        )
        return 1

    try:
        print(format_encrypted_env_secret(plain))
    except CredentialEncryptionError as exc:
        print(f"錯誤：{exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
