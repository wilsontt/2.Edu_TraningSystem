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

    # 稽核紀錄延後至本交易 db.commit() 成功後才寫入（見下方迴圈後）：
    # record_file_transfer() 使用獨立 session／連線，若在本路由自身交易仍
    # 開啟（已 flush 但未 commit）時呼叫，於 SQLite 下會與本路由持有的寫入鎖
    # 互相等待（同一 call stack、同一執行緒），直到逾時才失敗，且稽核 session
    # 失敗會被靜默吞掉——不但拖慢請求，稽核紀錄也會遺失。待本交易確定 commit
    # 成功、鎖已釋放後才寫稽核紀錄，可避免鎖等待，語意上也更正確：僅在整批
    # 上傳真正成功時才記錄「成功」稽核。
    pending_audit_records: list[tuple[str, int, int]] = []

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
                pending_audit_records.append((fname, mf.id, len(raw)))
        db.commit()
    except storage.StorageUnavailable as e:
        db.rollback()
        raise HTTPException(status_code=503, detail=f"NAS 無法連線或登入失敗：{e}")
    except storage.StorageError as e:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(e))

    for fname, mf_id, size in pending_audit_records:
        record_file_transfer(
            emp_id=emp_id, client_ip=client_ip, action="upload",
            resource_type="teaching_material", status="success", filename=fname,
            plan_id=(plans[0].id if plans else None), resource_id=mf_id,
            nas_username=creds.username, bytes_=size,
        )

    db.refresh(material_set)
    return _set_to_out(db, material_set, include_files=True)


# ----------------------------------------------------------------
# 列表（套組檢視）／詳情
# ----------------------------------------------------------------

@router.get("/sets", response_model=schemas.TeachingMaterialSetListOut)
def list_sets(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    keyword: Optional[str] = None,
    material_type_id: Optional[int] = None,
    file_format: Optional[str] = None,
    plan_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    """教材庫套組檢視：一列一套組，keyword 涵蓋標題/簡述/標籤/綁定計畫名稱（教材 PLAN §5.12.4）。"""
    q = db.query(models.TeachingMaterialSet).filter(models.TeachingMaterialSet.is_active == True)  # noqa: E712
    if keyword:
        like = f"%{keyword}%"
        plan_match_ids = db.query(models.TeachingMaterialSetPlan.set_id).join(
            models.TrainingPlan, models.TrainingPlan.id == models.TeachingMaterialSetPlan.plan_id
        ).filter(models.TrainingPlan.title.ilike(like))
        q = q.filter(
            models.TeachingMaterialSet.title.ilike(like)
            | models.TeachingMaterialSet.description.ilike(like)
            | models.TeachingMaterialSet.tags.ilike(like)
            | models.TeachingMaterialSet.id.in_(plan_match_ids)
        )
    if material_type_id:
        q = q.filter(models.TeachingMaterialSet.material_type_id == material_type_id)
    if file_format:
        fmt_set_ids = db.query(models.TeachingMaterialFile.set_id).filter(
            models.TeachingMaterialFile.file_format == file_format,
            models.TeachingMaterialFile.is_active == True,  # noqa: E712
        )
        q = q.filter(models.TeachingMaterialSet.id.in_(fmt_set_ids))
    if plan_id:
        bound_ids = db.query(models.TeachingMaterialSetPlan.set_id).filter(
            models.TeachingMaterialSetPlan.plan_id == plan_id
        )
        q = q.filter(models.TeachingMaterialSet.id.in_(bound_ids))

    total = q.count()
    rows = q.order_by(desc(models.TeachingMaterialSet.uploaded_at)).offset((page - 1) * size).limit(size).all()
    items = [_set_to_out(db, s) for s in rows]
    return {"items": items, "total": total, "page": page, "size": size, "total_pages": (total + size - 1) // size}


@router.get("/sets/{set_id}", response_model=schemas.TeachingMaterialSetOut)
def get_set_detail(
    set_id: int,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    s = db.query(models.TeachingMaterialSet).filter(
        models.TeachingMaterialSet.id == set_id,
        models.TeachingMaterialSet.is_active == True,  # noqa: E712
    ).first()
    if not s:
        raise HTTPException(status_code=404, detail="教材套組不存在")
    return _set_to_out(db, s, include_files=True)


# ----------------------------------------------------------------
# 更新中繼資料 / 計畫綁定 / 軟刪除
# ----------------------------------------------------------------

@router.put("/sets/{set_id}", response_model=schemas.TeachingMaterialSetOut)
def update_set(
    set_id: int,
    payload: schemas.TeachingMaterialSetUpdate,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    s = db.query(models.TeachingMaterialSet).filter(models.TeachingMaterialSet.id == set_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="教材套組不存在")
    data = payload.model_dump(exclude_unset=True)
    if "tags" in data:
        tags_val = data.pop("tags")
        s.tags = json.dumps([str(t) for t in tags_val], ensure_ascii=False) if tags_val else None
    if "material_type_id" in data and data["material_type_id"] is not None:
        mt = db.query(models.MaterialType).filter(models.MaterialType.id == data["material_type_id"]).first()
        if not mt:
            raise HTTPException(status_code=400, detail="教材類型不存在")
    for k, v in data.items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return _set_to_out(db, s, include_files=True)


@router.put("/sets/{set_id}/plans", response_model=schemas.TeachingMaterialSetOut)
def update_set_plans(
    set_id: int,
    payload: schemas.TeachingMaterialSetPlansUpdate,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    """完整取代套組的綁定計畫列表；空陣列＝解除全部綁定，恢復「通用」（教材 PLAN §5.12.2）。"""
    s = db.query(models.TeachingMaterialSet).filter(models.TeachingMaterialSet.id == set_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="教材套組不存在")
    plans = []
    for pid in payload.plan_ids:
        plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == pid).first()
        if not plan:
            raise HTTPException(status_code=404, detail=f"訓練計畫不存在：{pid}")
        plans.append(plan)
    db.query(models.TeachingMaterialSetPlan).filter(models.TeachingMaterialSetPlan.set_id == set_id).delete()
    for plan in plans:
        db.add(models.TeachingMaterialSetPlan(set_id=set_id, plan_id=plan.id))
    db.commit()
    db.refresh(s)
    return _set_to_out(db, s, include_files=True)


@router.delete("/sets/{set_id}")
def delete_set(
    set_id: int,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    s = db.query(models.TeachingMaterialSet).filter(models.TeachingMaterialSet.id == set_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="教材套組不存在")
    s.is_active = False
    db.commit()
    return {"message": "已停用（軟刪除）"}


# ----------------------------------------------------------------
# 套組內新增檔案（同名覆蓋 Yes/No）／移除單檔
# ----------------------------------------------------------------

@router.post("/sets/{set_id}/files", response_model=schemas.SetFileUploadResult)
async def add_set_files(
    set_id: int,
    request: Request,
    files: List[UploadFile] = File(...),
    overwrite_on_duplicate: Optional[bool] = Form(None),
    nas_username: Optional[str] = Form(None),
    nas_password: Optional[str] = Form(None),
    nas_session_token: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    """套組內新增檔案；套組內同名檔需以 overwrite_on_duplicate 明確指定
    True=覆蓋該檔 NAS+中繼資料、False=跳過該檔（教材 PLAN §5.12.3）。"""
    settings = get_settings()
    emp_id = getattr(current_user, "emp_id", None)
    client_ip = _client_ip(request)

    s = db.query(models.TeachingMaterialSet).filter(
        models.TeachingMaterialSet.id == set_id,
        models.TeachingMaterialSet.is_active == True,  # noqa: E712
    ).first()
    if not s:
        raise HTTPException(status_code=404, detail="教材套組不存在")
    mt = db.query(models.MaterialType).filter(models.MaterialType.id == s.material_type_id).first()

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

    plan_row = db.query(models.TeachingMaterialSetPlan).filter(
        models.TeachingMaterialSetPlan.set_id == set_id
    ).first()
    creds = _resolve_credentials(nas_session_token, nas_username, nas_password)

    succeeded: List[dict] = []
    failed: List[dict] = []
    # 稽核延後至 db.commit() 後寫入，避免 SQLite 寫入鎖互相等待（同 create_set）
    pending_audit: list[tuple[str, str, Optional[int], Optional[int], Optional[str]]] = []

    try:
        with storage.connection(creds) as st:
            for fname, raw in payloads:
                try:
                    ext, fmt = _validate_filename(fname, db)
                    max_bytes = _effective_max_bytes(mt, fmt)
                    if len(raw) > max_bytes:
                        raise ValueError(f"超過單檔上限（{max_bytes} bytes）")

                    conflict = _find_active_file_conflict(db, set_id, fname)
                    overwritten = False
                    if conflict:
                        if overwrite_on_duplicate is None:
                            raise ValueError("同名衝突，需指定是否覆蓋")
                        if not overwrite_on_duplicate:
                            failed.append({"original_filename": fname, "reason": "已跳過（同名，未覆蓋）"})
                            continue
                        st.save(conflict.storage_path, raw)
                        conflict.file_format = ext
                        conflict.file_size_bytes = len(raw)
                        conflict.uploaded_by = emp_id
                        conflict.uploaded_at = datetime.utcnow()
                        db.flush()
                        rec_id = conflict.id
                        overwritten = True
                    else:
                        mf = models.TeachingMaterialFile(
                            set_id=set_id, original_filename=fname, stored_filename="",
                            storage_path="", file_format=ext, file_size_bytes=len(raw),
                            uploaded_by=emp_id, uploaded_at=datetime.utcnow(), is_active=True,
                        )
                        db.add(mf)
                        db.flush()
                        stored_filename = f"{mf.id}.{ext}"
                        storage_path = storage.normalize_smb_rel_path(
                            str(s.year), "sets", str(s.id), "teaching", mt.slug, stored_filename,
                        )
                        st.save(storage_path, raw)
                        mf.stored_filename = stored_filename
                        mf.storage_path = storage_path
                        db.flush()
                        rec_id = mf.id

                    pending_audit.append(("success", fname, rec_id, len(raw), None))
                    succeeded.append({"id": rec_id, "original_filename": fname, "overwritten": overwritten})
                except (ValueError, storage.StorageError) as e:
                    # 單檔失敗不 rollback 整批，以支援部分成功
                    pending_audit.append(("failed", fname, None, None, str(e)))
                    failed.append({"original_filename": fname, "reason": str(e)})
            db.commit()
    except storage.StorageUnavailable as e:
        db.rollback()
        raise HTTPException(status_code=503, detail=f"NAS 無法連線或登入失敗：{e}")

    for status, fname, rec_id, size, err in pending_audit:
        record_file_transfer(
            emp_id=emp_id, client_ip=client_ip, action="upload",
            resource_type="teaching_material", status=status, filename=fname,
            plan_id=(plan_row.plan_id if plan_row else None), resource_id=rec_id,
            nas_username=creds.username, bytes_=size, error_message=err,
        )

    return {"succeeded": succeeded, "failed": failed}


@router.delete("/sets/{set_id}/files/{file_id}")
def remove_set_file(
    set_id: int,
    file_id: int,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    mf = db.query(models.TeachingMaterialFile).filter(
        models.TeachingMaterialFile.id == file_id,
        models.TeachingMaterialFile.set_id == set_id,
    ).first()
    if not mf:
        raise HTTPException(status_code=404, detail="檔案不存在")
    mf.is_active = False
    db.commit()
    return {"message": "已移除（軟刪除）"}


# ----------------------------------------------------------------
# 列表（檔案檢視）／下載（單檔 / 批次 ZIP）
# ----------------------------------------------------------------

@router.get("/files", response_model=schemas.TeachingMaterialFileListOut)
def list_files(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    keyword: Optional[str] = None,
    material_type_id: Optional[int] = None,
    file_format: Optional[str] = None,
    plan_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    """教材庫檔案檢視：一列一檔案（教材 PLAN §5.12.4）。"""
    q = db.query(models.TeachingMaterialFile).join(
        models.TeachingMaterialSet, models.TeachingMaterialSet.id == models.TeachingMaterialFile.set_id
    ).filter(
        models.TeachingMaterialFile.is_active == True,  # noqa: E712
        models.TeachingMaterialSet.is_active == True,  # noqa: E712
    )
    if keyword:
        like = f"%{keyword}%"
        plan_match_ids = db.query(models.TeachingMaterialSetPlan.set_id).join(
            models.TrainingPlan, models.TrainingPlan.id == models.TeachingMaterialSetPlan.plan_id
        ).filter(models.TrainingPlan.title.ilike(like))
        q = q.filter(
            models.TeachingMaterialFile.original_filename.ilike(like)
            | models.TeachingMaterialSet.title.ilike(like)
            | models.TeachingMaterialSet.description.ilike(like)
            | models.TeachingMaterialSet.tags.ilike(like)
            | models.TeachingMaterialFile.set_id.in_(plan_match_ids)
        )
    if material_type_id:
        q = q.filter(models.TeachingMaterialSet.material_type_id == material_type_id)
    if file_format:
        q = q.filter(models.TeachingMaterialFile.file_format == file_format)
    if plan_id:
        bound_ids = db.query(models.TeachingMaterialSetPlan.set_id).filter(
            models.TeachingMaterialSetPlan.plan_id == plan_id
        )
        q = q.filter(models.TeachingMaterialFile.set_id.in_(bound_ids))

    total = q.count()
    rows = q.order_by(desc(models.TeachingMaterialFile.uploaded_at)).offset((page - 1) * size).limit(size).all()
    items = []
    for f in rows:
        plans = db.query(models.TrainingPlan).join(
            models.TeachingMaterialSetPlan, models.TeachingMaterialSetPlan.plan_id == models.TrainingPlan.id
        ).filter(models.TeachingMaterialSetPlan.set_id == f.set_id).all()
        items.append({
            "id": f.id, "set_id": f.set_id, "set_title": f.material_set.title,
            "original_filename": f.original_filename, "file_format": f.file_format,
            "file_size_bytes": f.file_size_bytes, "uploaded_by": f.uploaded_by,
            "uploaded_at": f.uploaded_at, "is_active": f.is_active,
            "plan_titles": [p.title for p in plans],
        })
    return {"items": items, "total": total, "page": page, "size": size, "total_pages": (total + size - 1) // size}


@router.get("/files/{file_id}/download")
def download_file(
    file_id: int,
    request: Request,
    nas_session_token: Optional[str] = Query(None),
    nas_username: Optional[str] = Query(None),
    nas_password: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    mf = db.query(models.TeachingMaterialFile).filter(
        models.TeachingMaterialFile.id == file_id,
        models.TeachingMaterialFile.is_active == True,  # noqa: E712
    ).first()
    if not mf:
        raise HTTPException(status_code=404, detail="檔案不存在或已停用")

    emp_id = getattr(current_user, "emp_id", None)
    client_ip = _client_ip(request)
    plan_row = db.query(models.TeachingMaterialSetPlan).filter(
        models.TeachingMaterialSetPlan.set_id == mf.set_id
    ).first()
    creds = _resolve_credentials(nas_session_token, nas_username, nas_password)
    try:
        with storage.connection(creds) as st:
            data = st.open(mf.storage_path)
    except storage.StorageUnavailable as e:
        raise HTTPException(status_code=503, detail=f"NAS 無法連線：{e}")
    except storage.StorageError as e:
        record_file_transfer(
            emp_id=emp_id, client_ip=client_ip, action="download", resource_type="teaching_material",
            status="failed", filename=mf.original_filename, plan_id=(plan_row.plan_id if plan_row else None),
            resource_id=mf.id, nas_username=creds.username, error_message=str(e),
        )
        raise HTTPException(status_code=404, detail="檔案不存在或讀取失敗")

    record_file_transfer(
        emp_id=emp_id, client_ip=client_ip, action="download", resource_type="teaching_material",
        status="success", filename=mf.original_filename, plan_id=(plan_row.plan_id if plan_row else None),
        resource_id=mf.id, nas_username=creds.username, bytes_=len(data),
    )
    return Response(
        content=data, media_type="application/octet-stream",
        headers={"Content-Disposition": _content_disposition(mf.original_filename)},
    )


@router.post("/batch-download")
def batch_download_files(
    req: schemas.SetBatchDownloadRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    settings = get_settings()
    emp_id = getattr(current_user, "emp_id", None)
    client_ip = _client_ip(request)

    if not req.file_ids:
        raise HTTPException(status_code=400, detail="未選擇教材")
    files = db.query(models.TeachingMaterialFile).filter(
        models.TeachingMaterialFile.id.in_(req.file_ids),
        models.TeachingMaterialFile.is_active == True,  # noqa: E712
    ).all()
    if not files:
        raise HTTPException(status_code=400, detail="所選教材皆不可下載（已停用或不存在）")
    if len(files) > settings.teaching_material_max_batch_download_count:
        raise HTTPException(status_code=400, detail=f"批次下載最多 {settings.teaching_material_max_batch_download_count} 份")
    total = sum(f.file_size_bytes or 0 for f in files)
    if total > settings.teaching_material_max_batch_download_bytes:
        raise HTTPException(status_code=400, detail="批次下載總量超過上限")

    creds = _resolve_credentials(req.nas_session_token, req.nas_username, req.nas_password)
    buf = io.BytesIO()
    used_names: dict = {}
    try:
        with storage.connection(creds) as st:
            with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
                for f in files:
                    try:
                        data = st.open(f.storage_path)
                    except storage.StorageError as e:
                        record_file_transfer(
                            emp_id=emp_id, client_ip=client_ip, action="download",
                            resource_type="teaching_material", status="failed",
                            filename=f.original_filename, resource_id=f.id,
                            nas_username=creds.username, error_message=str(e),
                        )
                        continue
                    name = f.original_filename
                    if name in used_names:
                        name = f"{f.id}_{name}"
                    used_names[name] = True
                    zf.writestr(name, data)
                    record_file_transfer(
                        emp_id=emp_id, client_ip=client_ip, action="download",
                        resource_type="teaching_material", status="success",
                        filename=f.original_filename, resource_id=f.id,
                        nas_username=creds.username, bytes_=len(data),
                    )
    except storage.StorageUnavailable as e:
        raise HTTPException(status_code=503, detail=f"NAS 無法連線：{e}")

    zip_name = f"teaching_materials_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
    return Response(
        content=buf.getvalue(), media_type="application/zip",
        headers={"Content-Disposition": _content_disposition(zip_name)},
    )
