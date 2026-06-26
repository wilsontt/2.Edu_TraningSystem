"""
密碼政策服務（僅適用路徑 B：break-glass 本地帳號）。

AD 帳號的密碼政策由 DC 負責，本模組不介入。
"""
from __future__ import annotations

import datetime
import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..models import User
    from ..config import Settings


class PasswordPolicyViolation(Exception):
    """密碼不符合政策，message 為前端可顯示的說明。"""


def validate_password_complexity(password: str, settings: "Settings") -> None:
    """
    驗證密碼是否符合複雜度要求。
    不符合時拋出 PasswordPolicyViolation。
    規則：
      - 最少 settings.password_min_length 個字元
      - 需含大寫、小寫、數字、特殊字元各至少一個
    """
    min_len = settings.password_min_length

    if len(password) < min_len:
        raise PasswordPolicyViolation(
            f"密碼至少需要 {min_len} 個字元"
        )

    if not re.search(r"[A-Z]", password):
        raise PasswordPolicyViolation("密碼需包含至少一個大寫英文字母")

    if not re.search(r"[a-z]", password):
        raise PasswordPolicyViolation("密碼需包含至少一個小寫英文字母")

    if not re.search(r"\d", password):
        raise PasswordPolicyViolation("密碼需包含至少一個數字")

    if not re.search(r"[^A-Za-z0-9]", password):
        raise PasswordPolicyViolation("密碼需包含至少一個特殊字元")


def is_password_expired(user: "User", settings: "Settings") -> bool:
    """
    檢查 break-glass 帳號的密碼是否超過 password_max_age_days。

    - password_changed_at 為 None → 視為已到期（帳號從未設定密碼）
    - 距今超過 PASSWORD_MAX_AGE_DAYS → 到期
    """
    if user.password_changed_at is None:
        return True

    age = datetime.datetime.utcnow() - user.password_changed_at
    return age.days >= settings.password_max_age_days
