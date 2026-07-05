"""
檔案傳輸稽核 (File Transfer Audit Log)

記錄考卷／教材之上傳、下載、刪除等傳輸行為（emp_id、來源 IP、檔名、結果）。
寫入使用獨立 Session 並吞除例外：**稽核失敗不得影響主流程**。
"""

from __future__ import annotations

from typing import Optional

from ..database import SessionLocal
from .. import models


def record_file_transfer(
    *,
    emp_id: Optional[str],
    client_ip: Optional[str],
    action: str,            # upload / download / delete / cancel
    resource_type: str,     # exam_txt / teaching_material
    status: str,            # success / failed / cancelled
    filename: str,
    plan_id: Optional[int] = None,
    resource_id: Optional[int] = None,
    nas_username: Optional[str] = None,
    bytes_: Optional[int] = None,
    error_message: Optional[str] = None,
) -> None:
    """寫入一筆檔案傳輸稽核紀錄（獨立交易，失敗僅吞除不拋出）。"""
    db = SessionLocal()
    try:
        db.add(
            models.FileTransferAuditLog(
                emp_id=emp_id,
                client_ip=client_ip,
                nas_username=nas_username,
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                plan_id=plan_id,
                filename=filename,
                bytes=bytes_,
                status=status,
                error_message=error_message,
            )
        )
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()
