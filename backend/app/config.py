"""
應用組態 (Application Settings)

集中管理環境變數，特別是 NAS（SMB）儲存相關設定。
SMB 帳密屬機敏：僅由環境變數／密鑰管理注入，嚴禁寫入版控或資料庫明文。

路徑慣例（Win／macOS 開發、Linux Docker 生產共用）：
- SMB 相關值為「邏輯路徑」，不是本機磁碟路徑；一律以 `/` 分段。
- `env_file` 以本檔位置推算 `backend/.env`，不依賴行程 cwd。
- 生產 Docker 以環境變數注入為準（映像不含 `.env`）。
"""

from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/（與 cwd 無關；Docker WORKDIR=/app 時即 /app/.env）
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_ENV_FILE = _BACKEND_DIR / ".env"


def normalize_smb_logical_path(value: str) -> str:
    """將 SMB 共享內相對路徑正規為以 `/` 分隔的邏輯路徑。

    - `\\` → `/`，去除首尾分隔與 `.`／`..` 段
    - 拒絕本機絕對路徑、磁碟代號、UNC（避免 Win／Linux 設定互不相容）
    """
    if value is None:
        return ""
    s = str(value).strip()
    if not s:
        return ""
    # UNC 或誤貼的完整路徑
    if s.startswith("\\\\") or s.startswith("//"):
        raise ValueError(
            "不可使用 UNC 或本機絕對路徑；請填 SMB 共享內相對路徑（例：教育訓練教材及考卷/materials）"
        )
    # Unix 絕對路徑
    if s.startswith("/"):
        raise ValueError(
            "不可使用本機絕對路徑（如 /mnt/...）；請填共享內相對路徑，並以 / 分段"
        )
    # Windows 磁碟代號（D:\... 或 D:/...）
    if len(s) >= 2 and s[1] == ":":
        raise ValueError(
            "不可使用本機磁碟路徑（如 D:\\...）；請填共享內相對路徑，並以 / 分段"
        )
    parts = [p for p in s.replace("\\", "/").split("/") if p and p not in (".", "..")]
    return "/".join(parts)


class Settings(BaseSettings):
    """以環境變數（或 backend/.env）載入之系統設定。"""

    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # SMB 伺服器與共享（三模式共用）
    # SMB_SHARE：僅共享名稱（例 CrownWork）；子目錄請放 MATERIALS_ROOT／BACKUP_ROOT
    smb_server: str = ""          # 例：192.168.1.10
    smb_share: str = ""           # 例：CrownWork
    # 教材 interactive NAS 登入：帳號未含網域時自動補上（見 storage.normalize_interactive_username）
    # 含「.」→ user@domain（UPN）；否則 → DOMAIN\user（NetBIOS）。未設則沿用 AD_DOMAIN。
    smb_auth_domain: str = ""     # SMB_AUTH_DOMAIN

    # NAS 共享內之根目錄（相對路徑，一律 / 分段）
    materials_root: str = "materials"  # 對應 MATERIALS_ROOT
    backup_root: str = "backups"       # 對應 BACKUP_ROOT（Wave 4 使用）

    # 考卷 TXT：service 模式帳號（環境變數）
    exam_smb_username: str = ""   # EXAM_SMB_USERNAME
    exam_smb_password: str = ""   # EXAM_SMB_PASSWORD

    # 教材上傳／下載限額（見教材 PLAN §5.4；20260704 主檔維護 PLAN 調為 1 GiB）
    teaching_material_max_file_bytes: int = 1_073_741_824        # 1 GiB 全系統硬上限
    teaching_material_max_batch_upload_count: int = 5            # 單次上傳檔數
    teaching_material_max_batch_upload_bytes: int = 1_073_741_824  # 1 GiB 單次上傳總量
    teaching_material_max_batch_download_count: int = 10         # 批次下載檔數
    teaching_material_max_batch_download_bytes: int = 1_073_741_824  # 1 GiB 批次下載總量
    exam_txt_max_file_bytes: int = 5_242_880                     # 5MB 考卷 TXT 專用

    # NAS interactive 短時 session token 有效秒數（教材傳輸；密碼不存 DB）
    nas_session_ttl_seconds: int = 600  # 10 分鐘

    # 機敏憑證 Fernet 金鑰（SMTP 密文、排程備份 NAS 密碼等共用）
    # 產生方式：python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # CREDENTIAL_SECRET 優先；未設則沿用 BACKUP_CREDENTIAL_SECRET（相容既有部署）
    credential_secret: str = ""         # CREDENTIAL_SECRET
    backup_credential_secret: str = ""  # BACKUP_CREDENTIAL_SECRET

    # ----------------------------------------------------------------
    # JWT（W1 AD 整合）
    # 生產環境必須覆寫 JWT_SECRET_KEY；使用預設值時 startup 會輸出警告
    # ----------------------------------------------------------------
    jwt_secret_key: str = "crown-secret-key-for-internal-education-system"
    jwt_expire_minutes: int = 480

    # ----------------------------------------------------------------
    # AD 整合（W1 AD 整合）
    # ----------------------------------------------------------------
    ad_enabled: bool = False
    ad_server_uri: str = ""           # LDAP：ldap://dc.yourco.com:389  LDAPS：ldaps://dc.yourco.com:636
    ad_use_ssl: bool = False          # false = LDAP（port 389）；true = LDAPS（port 636，需 DC 有效憑證）
    ad_base_dn: str = ""              # 例：DC=yourco,DC=com
    ad_domain: str = ""               # UPN 網域，例：yourco.com
    ad_admin_group: str = "IT Admins"  # DC 上的群組名稱
    ad_admin_role_name: str = "系統管理"  # JIT 掛載的本地 RBAC 角色
    ad_default_dept_name: str = "IT部"   # JIT 預設部門
    ad_use_nested_groups: bool = False

    # Email OTP 備援（路徑 D）
    ad_fallback_email_enabled: bool = True
    ad_email_fallback_max_days: int = 30   # 距上次 AD 登入可接受天數
    ad_email_otp_length: int = 6
    ad_email_otp_ttl_minutes: int = 10
    ad_email_otp_max_requests: int = 3     # 每 15 分鐘每帳號上限
    ad_email_allowed_domain: str = ""      # 可選；如 yourco.com

    # ----------------------------------------------------------------
    # SMTP（用於 Email OTP，W1 AD 整合）
    # SMTP_PASSWORD：建議 `enc:<Fernet密文>`（scripts/encrypt_env_secret.py）；
    # 明文仍相容但啟動會警告。金鑰見 CREDENTIAL_SECRET／BACKUP_CREDENTIAL_SECRET。
    # ----------------------------------------------------------------
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_use_tls: bool = True

    # ----------------------------------------------------------------
    # Break-glass 本地登入（路徑 B，W1 AD 整合）
    # ----------------------------------------------------------------
    login_bypass_enabled: bool = False   # 驗證碼 0000 後門；生產必須為 false
    password_min_length: int = 12        # 僅 break-glass 帳號適用
    password_max_age_days: int = 90      # 僅 break-glass 帳號適用
    login_max_failed: int = 6            # 連續失敗上限
    login_lockout_minutes: int = 15      # 鎖定時長
    break_glass_emp_id: str = "admin"    # is_protected 帳號的 emp_id
    initial_admin_password: str = ""     # 遷移／初始化時注入；不入版控

    # ----------------------------------------------------------------
    # Validators（跨平台路徑正規化）
    # ----------------------------------------------------------------

    @field_validator("smb_server", mode="before")
    @classmethod
    def _normalize_smb_server(cls, v: object) -> str:
        s = str(v or "").strip()
        # 允許 host 或 IP；去掉誤貼的 \\ 前綴與結尾斜線
        s = s.strip("\\/")
        if "\\" in s or "/" in s:
            raise ValueError("SMB_SERVER 僅填主機名或 IP（例：10.9.82.22），不可含路徑")
        return s

    @field_validator("smb_share", mode="before")
    @classmethod
    def _normalize_smb_share(cls, v: object) -> str:
        """共享名稱（建議僅填 share）；若寫成 share/subdir，正規為 `/` 分段，由 storage._unc 拆解。"""
        s = str(v or "").strip()
        if not s:
            return ""
        if s.startswith("\\\\") or s.startswith("//") or (len(s) >= 2 and s[1] == ":"):
            raise ValueError("SMB_SHARE 僅填共享名稱（例：CrownWork），不可為 UNC 或本機路徑")
        parts = [p for p in s.replace("\\", "/").split("/") if p and p not in (".", "..")]
        return "/".join(parts)

    @field_validator("materials_root", "backup_root", mode="before")
    @classmethod
    def _normalize_smb_roots(cls, v: object) -> str:
        return normalize_smb_logical_path(str(v) if v is not None else "")

    # ----------------------------------------------------------------
    # Properties
    # ----------------------------------------------------------------

    @property
    def smb_configured(self) -> bool:
        """SMB 伺服器與共享是否已設定（interactive 模式前提）。"""
        return bool(self.smb_server and self.smb_share)

    @property
    def effective_smb_auth_domain(self) -> str:
        """NAS interactive 自動補網域：SMB_AUTH_DOMAIN 優先，否則 AD_DOMAIN。"""
        return (self.smb_auth_domain or self.ad_domain or "").strip()

    @property
    def exam_smb_configured(self) -> bool:
        """考卷 service 模式是否具備最小可連線設定。"""
        return bool(self.smb_server and self.smb_share and self.exam_smb_username)

    @property
    def effective_credential_secret(self) -> str:
        """Fernet 金鑰：CREDENTIAL_SECRET 優先，否則 BACKUP_CREDENTIAL_SECRET。"""
        return (self.credential_secret or self.backup_credential_secret or "").strip()

    @property
    def smtp_configured(self) -> bool:
        """SMTP 是否具備最小可寄信設定（密碼欄非空即可；密文於寄信時解密）。"""
        return bool(self.smtp_host and self.smtp_user and self.smtp_password)

    def resolve_smtp_password(self) -> str:
        """取得 SMTP 登入用明文密碼（`enc:` 密文則解密；否則明文並記警告）。"""
        from .services.crypto import resolve_env_secret
        return resolve_env_secret(self.smtp_password, field_name="SMTP_PASSWORD")

    @property
    def ad_configured(self) -> bool:
        """AD 是否具備最小可連線設定。"""
        return bool(
            self.ad_enabled
            and self.ad_server_uri
            and self.ad_base_dn
            and self.ad_domain
        )

    @property
    def ad_fallback_email_configured(self) -> bool:
        """Email OTP 備援是否可用（AD 備援開關 + SMTP 就緒）。"""
        return bool(self.ad_fallback_email_enabled and self.smtp_configured)


@lru_cache
def get_settings() -> Settings:
    """取得單例設定（lru_cache 確保僅讀取一次環境）。"""
    return Settings()
