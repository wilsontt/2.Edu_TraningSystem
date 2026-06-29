"""
ad_auth 單元測試（mock ldap3，不連真實 DC）。

ldap3 未安裝時以 MagicMock 替代，測試執行不依賴真實 AD 連線。
"""
import sys
import os
from types import ModuleType
from unittest.mock import MagicMock, patch

# 在 import app 之前先建立 ldap3 mock，防止 ImportError
_ldap3_mock = MagicMock()
_ldap3_core_exc = MagicMock()
_ldap3_mock.core = MagicMock()
_ldap3_mock.core.exceptions = _ldap3_core_exc

# LDAPBindError 必須是真正可 except 的 class
class _LDAPBindError(Exception):
    pass

_ldap3_core_exc.LDAPBindError = _LDAPBindError
_ldap3_mock.ALL = "ALL"
_ldap3_mock.Server = MagicMock()
_ldap3_mock.Connection = MagicMock()

sys.modules.setdefault("ldap3", _ldap3_mock)
sys.modules.setdefault("ldap3.core", _ldap3_mock.core)
sys.modules.setdefault("ldap3.core.exceptions", _ldap3_core_exc)
sys.modules.setdefault("ldap3.utils", MagicMock())
sys.modules.setdefault("ldap3.utils.conv", MagicMock())

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import pytest
from unittest.mock import MagicMock

from app.services.ad_auth import AdAuthResult, AdConnectionError, authenticate_ad


def _settings(
    ad_enabled=True,
    ad_server_uri="ldaps://dc.test.local:636",
    ad_base_dn="DC=test,DC=local",
    ad_domain="test.local",
    ad_admin_group="IT_Admin",
    ad_use_nested_groups=False,
):
    s = MagicMock()
    s.ad_enabled = ad_enabled
    s.ad_server_uri = ad_server_uri
    s.ad_base_dn = ad_base_dn
    s.ad_domain = ad_domain
    s.ad_admin_group = ad_admin_group
    s.ad_use_nested_groups = ad_use_nested_groups
    s.ad_configured = ad_enabled and bool(ad_server_uri and ad_base_dn and ad_domain)
    return s


def _make_ldap_entry(display_name="Test User", mail="test@test.local", member_of=None):
    """建立模擬 ldap3 Entry 物件。"""
    entry = MagicMock()
    entry.displayName = display_name
    entry.mail = mail

    if member_of is None:
        member_of = ["CN=IT_Admin,OU=Groups,DC=test,DC=local"]

    memberof_mock = MagicMock()
    memberof_mock.values = member_of
    entry.memberOf = memberof_mock
    return entry


# ── AD 未設定 ───────────────────────────────────────────────────


def test_authenticate_ad_disabled_raises_connection_error():
    s = _settings(ad_enabled=False)
    s.ad_configured = False
    with pytest.raises(AdConnectionError, match="AD 未設定"):
        authenticate_ad("jdoe", "password", settings=s)


# ── 使用者名稱格式錯誤 ───────────────────────────────────────────


def test_invalid_username_returns_none():
    s = _settings()
    # 含空白的使用者名稱
    assert authenticate_ad("invalid user!", "pw", settings=s) is None


# ── Bind 失敗（帳密錯誤）→ None ────────────────────────────────


def test_bind_failure_returns_none():
    s = _settings()

    with patch.dict(sys.modules, {"ldap3": _ldap3_mock}):
        # Connection 建構時拋出 LDAPBindError → 帳密錯誤
        _ldap3_mock.Connection.side_effect = _LDAPBindError("Invalid credentials")
        _ldap3_mock.utils.conv = MagicMock()
        _ldap3_mock.utils.conv.escape_filter_chars = lambda x: x

        result = authenticate_ad("jdoe", "wrongpw", settings=s)

    _ldap3_mock.Connection.side_effect = None  # 重設
    assert result is None


# ── 連線失敗 → AdConnectionError ───────────────────────────────


def test_connection_error_raises():
    s = _settings()

    with patch.dict(sys.modules, {"ldap3": _ldap3_mock}):
        _ldap3_mock.Connection.side_effect = OSError("Connection refused")
        _ldap3_mock.utils.conv = MagicMock()
        _ldap3_mock.utils.conv.escape_filter_chars = lambda x: x

        with pytest.raises(AdConnectionError):
            authenticate_ad("jdoe", "pw", settings=s)

    _ldap3_mock.Connection.side_effect = None


# ── 成功登入，回傳 AdAuthResult ────────────────────────────────


def test_authenticate_ad_success():
    s = _settings()
    entry = _make_ldap_entry(
        display_name="John Doe",
        mail="jdoe@test.local",
        member_of=["CN=IT_Admin,OU=Groups,DC=test,DC=local"],
    )

    mock_conn = MagicMock()
    mock_conn.entries = [entry]

    with patch.dict(sys.modules, {"ldap3": _ldap3_mock}):
        _ldap3_mock.Connection.side_effect = None
        _ldap3_mock.Connection.return_value = mock_conn
        _ldap3_mock.utils.conv = MagicMock()
        _ldap3_mock.utils.conv.escape_filter_chars = lambda x: x

        result = authenticate_ad("JDoe", "correctpw", settings=s)

    assert isinstance(result, AdAuthResult)
    assert result.ad_username == "jdoe"  # normalize 為小寫
    assert result.display_name == "John Doe"
    assert result.mail == "jdoe@test.local"
    assert "IT_Admin" in result.groups


# ── 非 IT_Admin 成員（groups 不含 IT_Admin）─────────────────────


def test_authenticate_ad_not_in_admin_group_still_returns_result():
    """
    authenticate_ad 本身不做群組過濾，回傳 result；
    群組檢查由 router（W3）負責，這裡確認 groups 內容正確。
    """
    s = _settings()
    entry = _make_ldap_entry(
        member_of=["CN=Developers,OU=Groups,DC=test,DC=local"]
    )

    mock_conn = MagicMock()
    mock_conn.entries = [entry]

    with patch.dict(sys.modules, {"ldap3": _ldap3_mock}):
        _ldap3_mock.Connection.side_effect = None
        _ldap3_mock.Connection.return_value = mock_conn
        _ldap3_mock.utils.conv = MagicMock()
        _ldap3_mock.utils.conv.escape_filter_chars = lambda x: x

        result = authenticate_ad("jdoe", "pw", settings=s)

    assert result is not None
    assert "IT_Admin" not in result.groups


# ── 使用者在 DC 中找不到（entries 空）→ None ────────────────────


def test_user_not_found_in_ldap_returns_none():
    s = _settings()
    mock_conn = MagicMock()
    mock_conn.entries = []

    with patch.dict(sys.modules, {"ldap3": _ldap3_mock}):
        _ldap3_mock.Connection.side_effect = None
        _ldap3_mock.Connection.return_value = mock_conn
        _ldap3_mock.utils.conv = MagicMock()
        _ldap3_mock.utils.conv.escape_filter_chars = lambda x: x

        result = authenticate_ad("ghost", "pw", settings=s)

    assert result is None
