"""
角色管理：成員人數僅計在職帳號（含管理帳號 is_trainee=False）。

可離線執行，不需啟動後端。
"""

from __future__ import annotations


def count_active_role_users(users: list[dict]) -> int:
    """與 admin.get_roles 的 user_count 計算邏輯一致。"""
    return len([
        u for u in users
        if (u.get("status") or "").strip().lower() == "active"
    ])


def test_excludes_inactive_users():
    users = [
        {"emp_id": "A001", "status": "active", "is_trainee": True},
        {"emp_id": "A002", "status": "inactive", "is_trainee": True},
        {"emp_id": "A003", "status": "active", "is_trainee": True},
    ]
    assert count_active_role_users(users) == 2


def test_includes_admin_management_account():
    """Admin break-glass（is_trainee=False）仍應計入在職人數。"""
    users = [
        {"emp_id": "admin", "status": "active", "is_trainee": False},
        {"emp_id": "coach1", "status": "inactive", "is_trainee": True},
    ]
    assert count_active_role_users(users) == 1


def test_status_case_and_whitespace():
    users = [
        {"emp_id": "A001", "status": " Active ", "is_trainee": True},
        {"emp_id": "A002", "status": None, "is_trainee": True},
        {"emp_id": "A003", "status": "", "is_trainee": True},
    ]
    assert count_active_role_users(users) == 1


if __name__ == "__main__":
    test_excludes_inactive_users()
    test_includes_admin_management_account()
    test_status_case_and_whitespace()
    print("OK: role active member count semantics")
