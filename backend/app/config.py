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

    @property
    def smb_configured(self) -> bool:
        """SMB 伺服器與共享是否已設定（interactive 模式前提）。"""
        return bool(self.smb_server and self.smb_share)

    @property
    def exam_smb_configured(self) -> bool:
        """考卷 service 模式是否具備最小可連線設定。"""
        return bool(self.smb_server and self.smb_share and self.exam_smb_username)


@lru_cache
def get_settings() -> Settings:
    """取得單例設定（lru_cache 確保僅讀取一次環境）。"""
    return Settings()
