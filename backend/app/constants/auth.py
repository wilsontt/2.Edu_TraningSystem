"""認證相關常數與輔助函式。"""
import re

SUPER_ADMIN_ROLE_NAMES: frozenset = frozenset({
    "Admin", "System Admin", "系統管理", "系統管理者"
})

# AD username 白名單：首碼英數，後續可含 . _ -，共 1–20 碼
AD_USERNAME_PATTERN = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,19}$")


def normalize_ad_username(raw: str) -> str:
    """去除前後空白後轉小寫，作為系統內統一 emp_id。"""
    return raw.strip().lower()


def is_super_admin_role(role_name: str) -> bool:
    return role_name in SUPER_ADMIN_ROLE_NAMES
