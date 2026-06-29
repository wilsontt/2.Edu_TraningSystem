"""
應用組態 (Application Settings)

集中管理環境變數，特別是 NAS（SMB）儲存相關設定。
SMB 帳密屬機敏：僅由環境變數／密鑰管理注入，嚴禁寫入版控或資料庫明文。
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """以環境變數（或 backend/.env）載入之系統設定。"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # SMB 伺服器與共享（三模式共用）
    smb_server: str = ""          # 例：192.168.1.10
    smb_share: str = ""           # 例：CrownWork

    # NAS 共享內之根目錄（相對路徑）
    materials_root: str = "materials"  # 對應 MATERIALS_ROOT
    backup_root: str = "backups"       # 對應 BACKUP_ROOT（Wave 4 使用）

    # 考卷 TXT：service 模式帳號（環境變數）
    exam_smb_username: str = ""   # EXAM_SMB_USERNAME
    exam_smb_password: str = ""   # EXAM_SMB_PASSWORD

    # 教材上傳／下載限額（見教材 PLAN §5.4）
    teaching_material_max_file_bytes: int = 52_428_800           # 50MB 全系統硬上限
    teaching_material_max_batch_upload_count: int = 5            # 單次上傳檔數
    teaching_material_max_batch_upload_bytes: int = 104_857_600  # 100MB 單次上傳總量
    teaching_material_max_batch_download_count: int = 10         # 批次下載檔數
    teaching_material_max_batch_download_bytes: int = 209_715_200  # 200MB 批次下載總量
    exam_txt_max_file_bytes: int = 5_242_880                     # 5MB 考卷 TXT 專用

    # NAS interactive 短時 session token 有效秒數（教材傳輸；密碼不存 DB）
    nas_session_ttl_seconds: int = 600  # 10 分鐘

    # 排程備份（Wave 4）：backup_nas_username/password 加密存於 DB，金鑰由此環境變數注入
    # 產生方式：python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    backup_credential_secret: str = ""  # BACKUP_CREDENTIAL_SECRET

    # ----------------------------------------------------------------
    # JWT（W1 AD 整合）
    # 生產環境必須覆寫 JWT_SECRET_KEY；使用預設值時 startup 會輸出警告
    # ----------------------------------------------------------------
    jwt_secret_key: str = "crown-secret-key-for-internal-education-system"
    jwt_expire_minutes: int = 480

    # ----------------------------------------------------------------
    # AD / LDAPS（W1 AD 整合）
    # ----------------------------------------------------------------
    ad_enabled: bool = False
    ad_server_uri: str = ""           # 例：ldaps://dc.yourco.com:636
    ad_base_dn: str = ""              # 例：DC=yourco,DC=com
    ad_domain: str = ""               # UPN 網域，例：yourco.com
    ad_admin_group: str = "IT_Admin"  # DC 上的群組名稱
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
    # SMTP_PASSWORD 屬機敏，不入版控
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
    # Properties
    # ----------------------------------------------------------------

    @property
    def smb_configured(self) -> bool:
        """SMB 伺服器與共享是否已設定（interactive 模式前提）。"""
        return bool(self.smb_server and self.smb_share)

    @property
    def exam_smb_configured(self) -> bool:
        """考卷 service 模式是否具備最小可連線設定。"""
        return bool(self.smb_server and self.smb_share and self.exam_smb_username)

    @property
    def smtp_configured(self) -> bool:
        """SMTP 是否具備最小可寄信設定。"""
        return bool(self.smtp_host and self.smtp_user and self.smtp_password)

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
