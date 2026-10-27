"""
重設本機 break-glass admin 密碼（僅能在主機／容器內以 shell 執行，不提供 Web 端點）。

用法（於 backend 目錄；Docker 見 1.docs/00-專案總覽/資料庫遷移/MIGRATION_GUIDE.md）：

  互動輸入（建議，隱藏輸入兩次）：
    docker compose exec -it training-backend python scripts/reset_admin_password.py

  環境變數（非互動；請勿寫入 .env）：
    docker compose exec -e NEW_ADMIN_PASSWORD training-backend python scripts/reset_admin_password.py

  本機開發：
    .venv/bin/python3 scripts/reset_admin_password.py

規則：
  - 密碼須符合 validate_password_complexity（長度見 PASSWORD_MIN_LENGTH，含大小寫、數字、特殊字元），
    且 UTF-8 長度不得超過 72 bytes（bcrypt 上限）。
  - 僅更新既有且 is_protected 的 break-glass 帳號（BREAK_GLASS_EMP_ID，預設 admin）。
  - 同步清除登入失敗次數與鎖定；password_changed_at 設為現在；不強制下次登入改密碼。
  - JWT 為無狀態，既有登入不會被登出，最長維持至 JWT_EXPIRE_MINUTES。
  - 稽核僅寫 audit logger（不含密碼），並附加寫入 data/logs/admin_password_reset.log。

退出碼：0 成功；1 輸入或前置條件不符；2 未預期錯誤。
"""
from __future__ import annotations

import getpass
import logging
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import NamedTuple, Optional

# 確保可 import app.*（不依賴 PYTHONPATH）
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from sqlalchemy.orm import Session  # noqa: E402

from app import models  # noqa: E402
from app.auth_utils import hash_password  # noqa: E402
from app.config import Settings, get_settings  # noqa: E402
from app.database import SessionLocal, engine  # noqa: E402
from app.services.password_policy import (  # noqa: E402
    PasswordPolicyViolation,
    validate_password_complexity,
)

EXIT_OK = 0
EXIT_USAGE = 1
EXIT_ERROR = 2

AUDIT_EVENT = "admin_password_reset"
_BCRYPT_MAX_BYTES = 72

audit_logger = logging.getLogger("audit")


class UsageError(Exception):
    """使用者輸入或前置條件不符（退出碼 1）。"""


class ResetResult(NamedTuple):
    """重設結果（不含任何密碼資訊）。"""

    emp_id: str
    was_locked: bool
    is_inactive: bool


def reset_admin_password(
    db: Session,
    new_password: str,
    settings: Settings,
    os_user: str,
    now: Optional[datetime] = None,
) -> ResetResult:
    """
    驗證並重設 break-glass admin 密碼。

    Args:
        db: SQLAlchemy Session（由呼叫端管理生命週期）。
        new_password: 新密碼（明文，僅存在記憶體）。
        settings: 應用程式設定（提供複雜度規則與 break-glass 帳號）。
        os_user: 執行者的 OS 使用者名稱（供稽核）。
        now: 測試用時間注入；預設為 UTC 現在。

    Returns:
        ResetResult。

    Raises:
        UsageError: 密碼不符規則、帳號不存在或非 break-glass 帳號。
    """
    try:
        validate_password_complexity(new_password, settings)
    except PasswordPolicyViolation as exc:
        raise UsageError(f"密碼不符合強度規則：{exc}") from exc

    if len(new_password.encode("utf-8")) > _BCRYPT_MAX_BYTES:
        raise UsageError(f"密碼過長：UTF-8 長度不得超過 {_BCRYPT_MAX_BYTES} bytes")

    emp_id = settings.break_glass_emp_id
    user = db.query(models.User).filter(models.User.emp_id == emp_id).first()
    if user is None:
        raise UsageError(f"找不到帳號 {emp_id}，請先執行 init_db 建立")
    if not user.is_protected:
        raise UsageError(f"帳號 {emp_id} 不是 break-glass（is_protected）帳號，拒絕重設")

    current = now or datetime.utcnow()
    was_locked = bool(user.locked_until and user.locked_until > current)

    user.password_hash = hash_password(new_password)
    user.password_changed_at = current
    user.must_change_password = False
    user.failed_login_count = 0
    user.locked_until = None
    db.commit()

    audit_logger.info(
        "event=%s emp_id=%s auth_src=%s ip=%s detail=%s",
        AUDIT_EVENT,
        emp_id,
        "local",
        "cli",
        f"os_user={os_user} cleared_lock={was_locked}",
    )
    return ResetResult(
        emp_id=emp_id,
        was_locked=was_locked,
        is_inactive=(user.status != "active"),
    )


def obtain_new_password() -> str:
    """
    取得新密碼：NEW_ADMIN_PASSWORD → TTY 隱藏輸入（輸入兩次）。

    Raises:
        UsageError: 非互動環境且未提供環境變數、兩次輸入不一致、或使用者取消。
    """
    from_env = os.environ.get("NEW_ADMIN_PASSWORD")
    if from_env:
        return from_env

    if not sys.stdin.isatty():
        raise UsageError(
            "非互動環境：請使用 docker compose exec -it（SSH 請加 -t），"
            "或設定 NEW_ADMIN_PASSWORD"
        )

    try:
        first = getpass.getpass("新密碼：")
        second = getpass.getpass("再輸入一次：")
    except (EOFError, KeyboardInterrupt) as exc:
        raise UsageError("已取消") from exc
    if first != second:
        raise UsageError("兩次輸入不一致")
    return first


def resolve_os_user() -> str:
    """取得操作者的 OS 使用者名稱；取不到時退回 uid。"""
    try:
        return os.getlogin()
    except OSError:
        pass
    try:
        import pwd

        return pwd.getpwuid(os.getuid()).pw_name
    except (ImportError, KeyError):
        return f"uid:{os.getuid() if hasattr(os, 'getuid') else 'unknown'}"


def _configure_audit_logging() -> None:
    """
    為 audit logger 附加 handler。

    API 程序未替 audit logger 設定 handler，若不處理，CLI 的稽核訊息不會輸出。
    輸出至 stderr，並附加寫入資料目錄下 logs/admin_password_reset.log（Docker 即 /data volume）。
    """
    audit_logger.setLevel(logging.INFO)
    audit_logger.propagate = False
    formatter = logging.Formatter("%(asctime)s %(name)s %(message)s")

    stream_handler = logging.StreamHandler(sys.stderr)
    stream_handler.setFormatter(formatter)
    audit_logger.addHandler(stream_handler)

    db_file = engine.url.database
    if not db_file:
        return
    log_dir = Path(db_file).resolve().parent / "logs"
    try:
        log_dir.mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(
            log_dir / "admin_password_reset.log", encoding="utf-8"
        )
        file_handler.setFormatter(formatter)
        audit_logger.addHandler(file_handler)
    except OSError as exc:
        print(f"警告：無法寫入稽核檔案（{exc}），僅輸出至 stderr", file=sys.stderr)


def main() -> int:
    """CLI 進入點。"""
    _configure_audit_logging()
    print(f"目標資料庫：{engine.url.database or '（無法判斷）'}")
    try:
        password = obtain_new_password()
        with SessionLocal() as db:
            result = reset_admin_password(
                db, password, get_settings(), resolve_os_user()
            )
    except UsageError as exc:
        print(str(exc), file=sys.stderr)
        print("Admin 密碼未變更。", file=sys.stderr)
        return EXIT_USAGE
    except Exception as exc:  # noqa: BLE001 - CLI 最外層，統一回報並以退出碼 2 結束
        print(f"未預期錯誤：{type(exc).__name__}: {exc}", file=sys.stderr)
        print("Admin 密碼未變更。", file=sys.stderr)
        return EXIT_ERROR

    print(f"{result.emp_id} 密碼已更新。")
    if result.was_locked:
        print("已同時解除帳號鎖定。")
    if result.is_inactive:
        print(f"警告：帳號 {result.emp_id} 狀態不是 active，仍無法登入。", file=sys.stderr)
    print("注意：既有登入不會被登出，最長維持至 JWT 到期。")
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
