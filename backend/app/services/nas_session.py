"""
NAS interactive 短時 session（教材傳輸用）

使用者通過 NAS/AD 帳密驗證後，發給一個短時 `nas_session_token`，同次傳輸複用，
避免每個 API 都重帶密碼。**密碼僅存於記憶體**（不寫 DB、不入版控），逾時即清除。

採程序內記憶體儲存；多進程／重啟後失效（可接受：使用者重新登入 NAS 即可）。
"""

from __future__ import annotations

import secrets
import threading
import time
from typing import Dict, Tuple

from .storage import SmbCredentials
from ..config import get_settings

# token -> (credentials, 到期 epoch 秒)
_sessions: Dict[str, Tuple[SmbCredentials, float]] = {}
_lock = threading.Lock()


def _purge_expired(now: float) -> None:
    expired = [t for t, (_, exp) in _sessions.items() if exp <= now]
    for t in expired:
        _sessions.pop(t, None)


def create_session(creds: SmbCredentials) -> Tuple[str, int]:
    """建立 session，回傳 (token, 有效秒數)。"""
    ttl = get_settings().nas_session_ttl_seconds
    token = secrets.token_urlsafe(32)
    now = time.time()
    with _lock:
        _purge_expired(now)
        _sessions[token] = (creds, now + ttl)
    return token, ttl


def get_credentials(token: str) -> SmbCredentials | None:
    """取出未逾時之 credentials；逾時或不存在回傳 None。"""
    if not token:
        return None
    now = time.time()
    with _lock:
        _purge_expired(now)
        entry = _sessions.get(token)
        if not entry:
            return None
        return entry[0]
