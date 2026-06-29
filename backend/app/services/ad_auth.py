"""
AD 認證服務（路徑 A：LDAPS bind）。

連線失敗拋 AdConnectionError（router 轉 503）。
帳密錯誤回傳 None（router 回 401）。
群組成員資格由 router 負責檢查（403）。
ldap3 延遲匯入——未安裝時僅 AD_ENABLED=true 才會觸發 AdConnectionError。
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

from ..config import Settings, get_settings
from ..constants.auth import AD_USERNAME_PATTERN, normalize_ad_username

logger = logging.getLogger(__name__)


class AdConnectionError(Exception):
    """AD 伺服器無法連線（網路、TLS、或服務不可達）。"""


@dataclass
class AdAuthResult:
    ad_username: str
    display_name: str
    groups: list[str]
    mail: str | None = None


def authenticate_ad(
    username: str,
    password: str,
    settings: Settings | None = None,
) -> AdAuthResult | None:
    """
    LDAPS bind + 使用者資訊查詢。

    Returns:
        AdAuthResult — bind 成功，含 groups / mail
        None         — bind 失敗（帳密錯誤或使用者不存在）

    Raises:
        AdConnectionError — 無法連線至 DC
    """
    if settings is None:
        settings = get_settings()

    if not settings.ad_configured:
        raise AdConnectionError("AD 未設定（AD_ENABLED=false 或缺少必要設定）")

    if not AD_USERNAME_PATTERN.match(username.strip()):
        return None  # 格式錯誤，視為帳密錯

    try:
        import ldap3
        from ldap3.utils.conv import escape_filter_chars
    except ImportError as exc:
        raise AdConnectionError("ldap3 套件未安裝，無法連線 AD") from exc

    safe_username = escape_filter_chars(username.strip())
    upn = f"{safe_username}@{settings.ad_domain}"

    try:
        server = ldap3.Server(
            settings.ad_server_uri,
            use_ssl=True,
            get_info=ldap3.ALL,
        )
        conn = ldap3.Connection(
            server,
            user=upn,
            password=password,
            auto_bind=True,
        )
    except ldap3.core.exceptions.LDAPBindError:
        return None  # 帳密錯誤 → 401
    except Exception as exc:
        logger.warning("AD 連線失敗: %s", exc)
        raise AdConnectionError(str(exc)) from exc

    try:
        search_filter = (
            f"(&(objectClass=person)(sAMAccountName={safe_username}))"
        )
        conn.search(
            search_base=settings.ad_base_dn,
            search_filter=search_filter,
            attributes=["displayName", "mail", "memberOf"],
        )

        if not conn.entries:
            return None

        entry = conn.entries[0]
        raw_groups: list[str] = list(entry.memberOf.values) if entry.memberOf else []

        if settings.ad_use_nested_groups:
            raw_groups = _expand_nested_groups(
                conn, settings.ad_base_dn, safe_username
            )

        groups = [cn for dn in raw_groups if (cn := _extract_cn(dn))]

        display_name = (
            str(entry.displayName) if entry.displayName else username
        )
        mail: str | None = (
            str(entry.mail) if entry.mail else None
        )

        logger.info(
            "AD 登入成功 username=%s groups=%s",
            normalize_ad_username(username),
            groups,
        )
        return AdAuthResult(
            ad_username=normalize_ad_username(username),
            display_name=display_name,
            groups=groups,
            mail=mail,
        )
    finally:
        try:
            conn.unbind()
        except Exception:
            pass


def _extract_cn(dn: str) -> str | None:
    """從 LDAP DN 字串提取最近的 CN= 值。"""
    for part in dn.split(","):
        part = part.strip()
        if part.upper().startswith("CN="):
            return part[3:]
    return None


def _expand_nested_groups(
    conn, base_dn: str, safe_username: str
) -> list[str]:
    """使用 LDAP_MATCHING_RULE_IN_CHAIN 展開巢狀群組（AD 專屬 OID）。"""
    nested_filter = (
        f"(&(objectClass=group)"
        f"(member:1.2.840.113556.1.4.1941:=CN={safe_username},{base_dn}))"
    )
    conn.search(
        search_base=base_dn,
        search_filter=nested_filter,
        attributes=["cn"],
    )
    return [f"CN={e.cn},{base_dn}" for e in conn.entries if e.cn]
