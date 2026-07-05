"""
SMB（NAS）儲存抽象層 (Storage Abstraction)

提供「按需建立 → 操作 → 立即釋放」的 SMB 連線；**禁止**長期掛載或永久連線，
每次操作以 `connection()` context manager 完成，離開時必定 Close Session。

三種連線模式之 credentials 來源（見 NAS PLAN §5.3）：
- interactive：使用者當次提供（教材，Wave 3）
- service    ：環境變數 EXAM_SMB_*（考卷 TXT）
- backup     ：排程設定 backup_nas_*（Wave 4）

路徑慣例（Win／macOS／Linux Docker 共用）：
- 業務層與 DB（storage_path）一律使用 `/` 邏輯相對路徑，不寫本機磁碟路徑。
- `_unc()` 將 `/` 與 `\\` 正規為 SMB UNC（`\\\\server\\share\\...`），與執行主機 OS 無關。

`smbclient`（smbprotocol）採**延遲匯入**：未安裝套件時不影響本模組載入與單元測試
（可 mock SmbStorage 或在已安裝環境執行整合測試）。
"""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
from typing import Iterator, List, Dict

from ..config import get_settings


class StorageError(Exception):
    """儲存層一般錯誤（NAS 可達但操作失敗）。"""


class StorageUnavailable(StorageError):
    """NAS 不可達、設定不全或連線／認證失敗（對應 HTTP 503）。"""


def smb_path_segments(*parts: str) -> List[str]:
    """將多段路徑拆成 SMB 路徑段（接受 `/` 或 `\\`，拒絕 `..`）。"""
    segs: List[str] = []
    for part in parts:
        if not part:
            continue
        for seg in str(part).replace("\\", "/").split("/"):
            seg = seg.strip()
            if not seg or seg == ".":
                continue
            if seg == "..":
                raise StorageError("非法路徑（禁止 ..）")
            segs.append(seg)
    return segs


def normalize_smb_rel_path(*parts: str) -> str:
    """組出以 `/` 分隔的邏輯相對路徑（寫入 DB／業務層用，跨平台一致）。"""
    return "/".join(smb_path_segments(*parts))


@dataclass(frozen=True)
class SmbCredentials:
    """單次 SMB 連線所需資訊。`root` 為共享內根目錄（如 materials），可空。"""

    server: str
    share: str
    username: str
    password: str
    root: str = ""


class SmbStorage:
    """單一 SMB 連線的儲存操作；建議透過 `connection()` 使用以確保關閉連線。"""

    def __init__(self, creds: SmbCredentials):
        if not (creds.server and creds.share and creds.username):
            raise StorageUnavailable("SMB 連線設定不完整（server／share／username）")
        self._creds = creds
        self._client = None  # 已連線之 smbclient 模組

    # --- 連線生命週期 ---
    def connect(self) -> None:
        try:
            import smbclient  # 延遲匯入
        except ImportError as e:  # pragma: no cover - 依部署環境而定
            raise StorageUnavailable("未安裝 smbprotocol 套件，無法連線 NAS") from e
        try:
            smbclient.register_session(
                self._creds.server,
                username=self._creds.username,
                password=self._creds.password,
            )
        except Exception as e:  # 連線／認證失敗一律視為不可達
            raise StorageUnavailable(f"無法連線 NAS（{self._creds.server}）：{e}") from e
        self._client = smbclient

    def disconnect(self) -> None:
        if self._client is None:
            return
        try:
            self._client.delete_session(self._creds.server)
        except Exception:
            pass
        finally:
            self._client = None

    # --- 內部工具 ---
    def _unc(self, rel_path: str = "") -> str:
        """組出 UNC 路徑 \\\\server\\share\\root\\rel_path（與主機 OS 無關）。"""
        segs = smb_path_segments(self._creds.share, self._creds.root, rel_path)
        if not segs:
            raise StorageError("SMB 路徑為空")
        return "\\\\" + self._creds.server + "\\" + "\\".join(segs)

    def _require(self):
        if self._client is None:
            raise StorageError("尚未連線（請使用 connection() 或先呼叫 connect()）")
        return self._client

    # --- 檔案操作 ---
    def save(self, rel_path: str, data: bytes) -> int:
        """寫入檔案（自動建立父目錄）；回傳寫入位元組數。"""
        c = self._require()
        unc = self._unc(rel_path)
        parent = unc.rsplit("\\", 1)[0]
        try:
            c.makedirs(parent, exist_ok=True)
            with c.open_file(unc, mode="wb") as f:
                f.write(data)
        except Exception as e:
            raise StorageError(f"寫入失敗（{rel_path}）：{e}") from e
        return len(data)

    def open(self, rel_path: str) -> bytes:
        """讀取檔案內容。"""
        c = self._require()
        unc = self._unc(rel_path)
        try:
            with c.open_file(unc, mode="rb") as f:
                return f.read()
        except FileNotFoundError:
            raise StorageError(f"檔案不存在（{rel_path}）")
        except Exception as e:
            raise StorageError(f"讀取失敗（{rel_path}）：{e}") from e

    def list(self, rel_dir: str = "") -> List[Dict]:
        """列出目錄下檔案（不含子目錄與隱藏檔）；目錄不存在回傳空清單。"""
        c = self._require()
        unc = self._unc(rel_dir)
        items: List[Dict] = []
        try:
            entries = list(c.scandir(unc))
        except FileNotFoundError:
            return items
        except Exception as e:
            raise StorageError(f"列表失敗（{rel_dir}）：{e}") from e
        for entry in entries:
            try:
                if entry.is_file() and not entry.name.startswith("."):
                    st = entry.stat()
                    items.append(
                        {"filename": entry.name, "size": st.st_size, "mtime": st.st_mtime}
                    )
            except Exception:
                continue
        return items

    def delete(self, rel_path: str) -> None:
        """刪除檔案。"""
        c = self._require()
        unc = self._unc(rel_path)
        try:
            c.remove(unc)
        except FileNotFoundError:
            raise StorageError(f"檔案不存在（{rel_path}）")
        except Exception as e:
            raise StorageError(f"刪除失敗（{rel_path}）：{e}") from e


@contextmanager
def connection(creds: SmbCredentials) -> Iterator[SmbStorage]:
    """短連線 context manager：進入時 connect，離開時必定 disconnect（Close Session）。"""
    storage = SmbStorage(creds)
    storage.connect()
    try:
        yield storage
    finally:
        storage.disconnect()


def service_credentials() -> SmbCredentials:
    """考卷 TXT 之 service 模式 credentials（來自環境變數 EXAM_SMB_*）。"""
    s = get_settings()
    if not s.exam_smb_configured:
        raise StorageUnavailable("考卷 NAS（service 模式）尚未設定（需 SMB_SERVER／SMB_SHARE／EXAM_SMB_USERNAME）")
    return SmbCredentials(
        server=s.smb_server,
        share=s.smb_share,
        username=s.exam_smb_username,
        password=s.exam_smb_password,
        root=s.materials_root,
    )


def normalize_interactive_username(username: str, domain: str | None = None) -> str:
    """正規化教材 interactive NAS 帳號。

    - 已含 ``\\``、``/``、``@``：視為已帶網域（``DOMAIN/user`` 轉成 ``DOMAIN\\user``）。
    - 純帳號且有網域設定：含 ``.`` → ``user@domain``（UPN）；否則 → ``DOMAIN\\user``（NetBIOS）。
    - 無網域設定：原樣回傳（NAS 本機帳號）。
    """
    u = (username or "").strip()
    if not u:
        return u
    if "\\" in u or "@" in u:
        return u
    if "/" in u:
        left, _, right = u.partition("/")
        if left and right and "\\" not in right and "@" not in right:
            return f"{left}\\{right}"
        return u
    dom = (domain if domain is not None else get_settings().effective_smb_auth_domain).strip()
    if not dom:
        return u
    if "." in dom:
        return f"{u}@{dom}"
    return f"{dom}\\{u}"


def interactive_credentials(nas_username: str, nas_password: str) -> SmbCredentials:
    """教材 interactive 模式 credentials（伺服器／共享來自設定，帳密由使用者當次提供）。

    帳號未含網域時，依 ``SMB_AUTH_DOMAIN``／``AD_DOMAIN`` 自動補上（見 normalize_interactive_username）。
    """
    s = get_settings()
    if not s.smb_configured:
        raise StorageUnavailable("NAS 共享尚未設定（需 SMB_SERVER／SMB_SHARE）")
    if not (nas_username and nas_password):
        raise StorageUnavailable("缺少 NAS 帳號或密碼")
    username = normalize_interactive_username(nas_username, s.effective_smb_auth_domain)
    return SmbCredentials(
        server=s.smb_server,
        share=s.smb_share,
        username=username,
        password=nas_password,
        root=s.materials_root,
    )


def backup_credentials(nas_username: str, nas_password: str, destination: str | None = None) -> SmbCredentials:
    """排程備份 backup 模式 credentials（帳密來自排程設定 backup_nas_*）。
    `destination` 可覆寫備份目的地（相對共享根目錄）；未提供則用 BACKUP_ROOT。"""
    s = get_settings()
    if not s.smb_configured:
        raise StorageUnavailable("NAS 共享尚未設定（需 SMB_SERVER／SMB_SHARE）")
    if not (nas_username and nas_password):
        raise StorageUnavailable("排程備份尚未設定 NAS 帳號或密碼")
    return SmbCredentials(
        server=s.smb_server,
        share=s.smb_share,
        username=nas_username,
        password=nas_password,
        root=destination or s.backup_root,
    )


def verify_credentials(creds: SmbCredentials) -> None:
    """驗證 credentials 可連線（連線後立即關閉）；失敗拋 StorageUnavailable。"""
    storage = SmbStorage(creds)
    storage.connect()
    storage.disconnect()
