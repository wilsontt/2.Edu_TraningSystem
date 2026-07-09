"""
教材套組路由 (Teaching Material Sets Router) — Wave 2

一標題可含多檔、可綁 0~N 個訓練計畫；套組內同名檔上傳需明確指定是否覆蓋。
沿用 teaching_materials.py 之共用小工具（副檔名白名單驗證、單檔上限、NAS 憑證解析、
Content-Disposition、Audit）。準據：教材 PLAN（20260617）§5.12。
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List, Optional
import os
import io
import json
import zipfile
from datetime import datetime

from .. import models, schemas
from ..database import get_db
from ..config import get_settings
from .auth import check_permission
from ..services import storage
from ..services.audit_log import record_file_transfer
from .teaching_materials import (
    _client_ip, _validate_filename, _effective_max_bytes,
    _resolve_credentials, _content_disposition, _parse_tags,
)

router = APIRouter(prefix="/admin/teaching-materials", tags=["teaching-material-sets"])


# ----------------------------------------------------------------
# 共用小工具
# ----------------------------------------------------------------

def _parse_id_list(raw: Optional[str]) -> List[int]:
    """plan_ids 接受 JSON 陣列字串或逗號分隔；回傳 int 陣列。"""
    if not raw:
        return []
    try:
        val = json.loads(raw)
        if isinstance(val, list):
            return [int(v) for v in val]
    except (ValueError, TypeError):
        pass
    return [int(p.strip()) for p in raw.split(",") if p.strip()]


def _derive_year(plans: List["models.TrainingPlan"]) -> str:
    """套組年度：優先取第一個綁定計畫的年度，否則用系統年度。"""
    for p in plans:
        if p.year:
            return p.year
    return str(datetime.utcnow().year)


def _set_to_out(db: Session, s: "models.TeachingMaterialSet", include_files: bool = False) -> dict:
    file_count = db.query(models.TeachingMaterialFile).filter(
        models.TeachingMaterialFile.set_id == s.id,
        models.TeachingMaterialFile.is_active == True,  # noqa: E712
    ).count()
    plans = db.query(models.TrainingPlan).join(
        models.TeachingMaterialSetPlan, models.TeachingMaterialSetPlan.plan_id == models.TrainingPlan.id
    ).filter(models.TeachingMaterialSetPlan.set_id == s.id).all()
    out = {
        "id": s.id, "title": s.title, "material_type_id": s.material_type_id,
        "description": s.description, "tags": s.tags, "year": s.year,
        "uploaded_by": s.uploaded_by, "uploaded_at": s.uploaded_at, "is_active": s.is_active,
        "file_count": file_count,
        "plan_ids": [p.id for p in plans],
        "plan_titles": [p.title for p in plans],
    }
    if include_files:
        files = db.query(models.TeachingMaterialFile).filter(
            models.TeachingMaterialFile.set_id == s.id,
            models.TeachingMaterialFile.is_active == True,  # noqa: E712
        ).order_by(models.TeachingMaterialFile.uploaded_at.asc()).all()
        out["files"] = files
    return out


def _find_active_file_conflict(db: Session, set_id: int, filename: str) -> Optional["models.TeachingMaterialFile"]:
    return db.query(models.TeachingMaterialFile).filter(
        models.TeachingMaterialFile.set_id == set_id,
        models.TeachingMaterialFile.is_active == True,  # noqa: E712
        models.TeachingMaterialFile.original_filename == filename,
    ).first()


# ----------------------------------------------------------------
# 建立套組（+ 首批檔案）
# ----------------------------------------------------------------

@router.post("/sets", response_model=schemas.TeachingMaterialSetOut)
async def create_set(
    request: Request,
    title: str = Form(...),
    material_type_id: int = Form(...),
    description: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    plan_ids: Optional[str] = Form(None),
    nas_username: Optional[str] = Form(None),
    nas_password: Optional[str] = Form(None),
    nas_session_token: Optional[str] = Form(None),
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    """建立教材套組＋首批檔案。原子建立：任一檔案格式/大小驗證失敗即整批拒絕，不建立套組。"""
    settings = get_settings()
    emp_id = getattr(current_user, "emp_id", None)
    client_ip = _client_ip(request)

    mt = db.query(models.MaterialType).filter(
        models.MaterialType.id == material_type_id,
        models.MaterialType.is_active == True,  # noqa: E712
    ).first()
    if not mt:
        raise HTTPException(status_code=400, detail="教材類型不存在或已停用")

    plan_id_list = _parse_id_list(plan_ids)
    plans: List[models.TrainingPlan] = []
    for pid in plan_id_list:
        plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == pid).first()
        if not plan:
            raise HTTPException(status_code=404, detail=f"訓練計畫不存在：{pid}")
        if plan.is_archived:
            raise HTTPException(status_code=403, detail=f"計畫已封存，無法綁定：{plan.title}")
        plans.append(plan)

    if not files:
        raise HTTPException(status_code=400, detail="請至少選擇一個檔案")
    if len(files) > settings.teaching_material_max_batch_upload_count:
        raise HTTPException(status_code=400, detail=f"單次最多上傳 {settings.teaching_material_max_batch_upload_count} 份")

    payloads = []
    total = 0
    for f in files:
        raw = await f.read()
        total += len(raw)
        payloads.append((os.path.basename(f.filename or ""), raw))
    if total > settings.teaching_material_max_batch_upload_bytes:
        raise HTTPException(status_code=400, detail="單次上傳總量超過上限")

    validated = []
    for fname, raw in payloads:
        try:
            ext, fmt = _validate_filename(fname, db)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"{fname}：{e}")
        max_bytes = _effective_max_bytes(mt, fmt)
        if len(raw) > max_bytes:
            raise HTTPException(status_code=400, detail=f"{fname}：超過單檔上限（{max_bytes} bytes）")
        validated.append((fname, raw, ext))

    creds = _resolve_credentials(nas_session_token, nas_username, nas_password)
    year = _derive_year(plans)
    tags_json = _parse_tags(tags)

    material_set = models.TeachingMaterialSet(
        title=title, material_type_id=mt.id, description=description, tags=tags_json,
        year=year, uploaded_by=emp_id, uploaded_at=datetime.utcnow(), is_active=True,
    )
    db.add(material_set)
    db.flush()

    for plan in plans:
        db.add(models.TeachingMaterialSetPlan(set_id=material_set.id, plan_id=plan.id))

    try:
        with storage.connection(creds) as st:
            for fname, raw, ext in validated:
                mf = models.TeachingMaterialFile(
                    set_id=material_set.id, original_filename=fname, stored_filename="",
                    storage_path="", file_format=ext, file_size_bytes=len(raw),
                    uploaded_by=emp_id, uploaded_at=datetime.utcnow(), is_active=True,
                )
                db.add(mf)
                db.flush()
                stored_filename = f"{mf.id}.{ext}"
                storage_path = storage.normalize_smb_rel_path(
                    str(year), "sets", str(material_set.id), "teaching", mt.slug, stored_filename,
                )
                st.save(storage_path, raw)
                mf.stored_filename = stored_filename
                mf.storage_path = storage_path
                record_file_transfer(
                    emp_id=emp_id, client_ip=client_ip, action="upload",
                    resource_type="teaching_material", status="success", filename=fname,
                    plan_id=(plans[0].id if plans else None), resource_id=mf.id,
                    nas_username=creds.username, bytes_=len(raw),
                )
        db.commit()
    except storage.StorageUnavailable as e:
        db.rollback()
        raise HTTPException(status_code=503, detail=f"NAS 無法連線或登入失敗：{e}")
    except storage.StorageError as e:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(e))

    db.refresh(material_set)
    return _set_to_out(db, material_set, include_files=True)
