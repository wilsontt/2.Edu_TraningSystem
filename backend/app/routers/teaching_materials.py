"""
教材庫路由 (Teaching Materials Router) — Wave 3

教材「目錄卡（DB）＋ NAS 實體檔」雙層列管：上傳（含同名衝突處理、分批部分成功、
格式白名單、分級大小上限）、教材庫搜尋、單檔／批次 ZIP 下載、軟刪、類型維護。

實體檔讀寫透過 NAS interactive 模式（每次傳輸前須 NAS 登入）；憑證採短時
`nas_session_token`（見 /nas-session/verify），密碼不入 DB。每次傳輸寫
`file_transfer_audit_logs`（resource_type=teaching_material）。
準據：教材 PLAN（20260617）§5.x；安全/稽核：建議事項 PLAN §5.1/§7.1。
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
from urllib.parse import quote

from .. import models, schemas
from ..database import get_db
from ..config import get_settings
from .auth import check_permission
from ..services import storage, nas_session
from ..services.audit_log import record_file_transfer

router = APIRouter(prefix="/admin/teaching-materials", tags=["teaching-materials"])

# 允許上傳之副檔名白名單（教材 PLAN §5.3）；teaching/ 的 .txt 僅存檔不觸發考卷解析。
ALLOWED_EXTS = {"pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "md", "txt"}
DANGEROUS_EXTS = {"exe", "bat", "cmd", "sh", "js", "com", "scr", "msi", "zip", "rar", "7z", "jar", "ps1", "vbs"}


# ----------------------------------------------------------------
# 共用小工具
# ----------------------------------------------------------------

def _client_ip(request: Optional[Request]) -> Optional[str]:
    if request is None:
        return None
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    real = request.headers.get("x-real-ip")
    if real:
        return real
    return request.client.host if request.client else None


def _validate_filename(filename: str) -> str:
    """驗證副檔名白名單與雙副檔名；回傳小寫副檔名（不含點）。"""
    base = os.path.basename(filename or "")
    parts = base.lower().split(".")
    if len(parts) < 2 or not parts[0]:
        raise ValueError("檔名缺少副檔名")
    ext = parts[-1]
    if ext not in ALLOWED_EXTS:
        raise ValueError(f"不允許的格式 .{ext}")
    if any(p in DANGEROUS_EXTS for p in parts[1:-1]):
        raise ValueError("可疑的雙副檔名")
    return ext


def _type_max_bytes(mt: models.MaterialType) -> int:
    hard = get_settings().teaching_material_max_file_bytes
    return min(mt.max_file_bytes, hard) if mt.max_file_bytes else hard


def _parse_tags(tags_raw: Optional[str]) -> Optional[str]:
    """tags 接受 JSON 陣列字串或逗號分隔；回傳 JSON 字串或 None。"""
    if not tags_raw:
        return None
    try:
        val = json.loads(tags_raw)
        if isinstance(val, list):
            return json.dumps([str(t) for t in val], ensure_ascii=False)
    except (ValueError, TypeError):
        pass
    parts = [t.strip() for t in tags_raw.split(",") if t.strip()]
    return json.dumps(parts, ensure_ascii=False) if parts else None


def _resolve_credentials(
    nas_session_token: Optional[str],
    nas_username: Optional[str],
    nas_password: Optional[str],
) -> storage.SmbCredentials:
    """由 session token（優先）或當次帳密解析 interactive credentials。"""
    if nas_session_token:
        creds = nas_session.get_credentials(nas_session_token)
        if not creds:
            raise HTTPException(status_code=401, detail="NAS 連線階段已逾時，請重新登入 NAS")
        return creds
    if nas_username and nas_password:
        try:
            return storage.interactive_credentials(nas_username, nas_password)
        except storage.StorageUnavailable as e:
            raise HTTPException(status_code=503, detail=str(e))
    raise HTTPException(status_code=401, detail="教材傳輸前需先進行 NAS 登入")


def _content_disposition(filename: str) -> str:
    """RFC 5987：支援中文檔名的 Content-Disposition。"""
    return f"attachment; filename*=UTF-8''{quote(filename)}"


def _find_active_conflict(db: Session, plan_id: Optional[int], original_filename: str) -> Optional[models.TeachingMaterial]:
    return db.query(models.TeachingMaterial).filter(
        models.TeachingMaterial.plan_id == plan_id,
        models.TeachingMaterial.is_active == True,  # noqa: E712
        models.TeachingMaterial.original_filename == original_filename,
    ).first()


def _to_out(m: models.TeachingMaterial) -> dict:
    return {
        "id": m.id, "plan_id": m.plan_id, "title": m.title,
        "material_type_id": m.material_type_id, "description": m.description, "tags": m.tags,
        "original_filename": m.original_filename, "stored_filename": m.stored_filename,
        "storage_path": m.storage_path, "file_format": m.file_format,
        "file_size_bytes": m.file_size_bytes, "year": m.year, "sub_category_id": m.sub_category_id,
        "uploaded_by": m.uploaded_by, "uploaded_at": m.uploaded_at, "is_active": m.is_active,
    }


# ----------------------------------------------------------------
# 教材類型維護（material-types）—— GET 需 menu:exam；異動需 menu:admin
# ----------------------------------------------------------------

@router.get("/material-types", response_model=List[schemas.MaterialType])
def list_material_types(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    q = db.query(models.MaterialType)
    if not include_inactive:
        q = q.filter(models.MaterialType.is_active == True)  # noqa: E712
    return q.order_by(models.MaterialType.sort_order.asc(), models.MaterialType.id.asc()).all()


@router.post("/material-types", response_model=schemas.MaterialType)
def create_material_type(
    payload: schemas.MaterialTypeCreate,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:admin"),
):
    if db.query(models.MaterialType).filter(
        (models.MaterialType.name == payload.name) | (models.MaterialType.slug == payload.slug)
    ).first():
        raise HTTPException(status_code=400, detail="類型名稱或 slug 已存在")
    mt = models.MaterialType(**payload.model_dump())
    db.add(mt)
    db.commit()
    db.refresh(mt)
    return mt


@router.put("/material-types/{type_id}", response_model=schemas.MaterialType)
def update_material_type(
    type_id: int,
    payload: schemas.MaterialTypeUpdate,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:admin"),
):
    mt = db.query(models.MaterialType).filter(models.MaterialType.id == type_id).first()
    if not mt:
        raise HTTPException(status_code=404, detail="教材類型不存在")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(mt, k, v)
    db.commit()
    db.refresh(mt)
    return mt


@router.delete("/material-types/{type_id}")
def delete_material_type(
    type_id: int,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:admin"),
):
    mt = db.query(models.MaterialType).filter(models.MaterialType.id == type_id).first()
    if not mt:
        raise HTTPException(status_code=404, detail="教材類型不存在")
    in_use = db.query(models.TeachingMaterial).filter(
        models.TeachingMaterial.material_type_id == type_id
    ).first()
    if in_use:
        # 已有教材引用：不可硬刪，改為停用以維持參照完整
        mt.is_active = False
        db.commit()
        return {"message": "類型已有教材引用，已改為停用", "disabled": True}
    db.delete(mt)
    db.commit()
    return {"message": "已刪除"}


# ----------------------------------------------------------------
# NAS 登入（短時 session token）
# ----------------------------------------------------------------

@router.post("/nas-session/verify", response_model=schemas.NasSessionVerifyResponse)
def verify_nas_session(
    payload: schemas.NasSessionVerifyRequest,
    current_user=check_permission("menu:exam"),
):
    """驗證 NAS 帳密並回傳短時 token；密碼僅存記憶體、不入 DB。"""
    try:
        creds = storage.interactive_credentials(payload.nas_username, payload.nas_password)
        storage.verify_credentials(creds)
    except storage.StorageUnavailable as e:
        raise HTTPException(status_code=401, detail=f"NAS 登入失敗：{e}")
    token, ttl = nas_session.create_session(creds)
    return {"nas_session_token": token, "expires_in": ttl}


# ----------------------------------------------------------------
# 衝突預檢
# ----------------------------------------------------------------

@router.get("/conflict-check", response_model=schemas.ConflictCheckResponse)
def conflict_check(
    plan_id: Optional[int] = Query(None),
    original_filename: str = Query(...),
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    existing = _find_active_conflict(db, plan_id, original_filename)
    if existing:
        return {
            "has_conflict": True,
            "existing": {
                "id": existing.id, "title": existing.title,
                "original_filename": existing.original_filename,
                "uploaded_at": existing.uploaded_at.isoformat() if existing.uploaded_at else None,
            },
        }
    return {"has_conflict": False, "existing": None}


# ----------------------------------------------------------------
# 上傳（多檔、部分成功、同名衝突二選一）
# ----------------------------------------------------------------

@router.post("/upload", response_model=schemas.UploadResult)
async def upload_materials(
    request: Request,
    plan_id: Optional[int] = Form(None),
    material_type_id: int = Form(...),
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    on_conflict: Optional[str] = Form(None),         # deactivate_and_new | replace_in_place
    conflict_target_id: Optional[int] = Form(None),
    nas_username: Optional[str] = Form(None),
    nas_password: Optional[str] = Form(None),
    nas_session_token: Optional[str] = Form(None),
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    settings = get_settings()
    emp_id = getattr(current_user, "emp_id", None)
    client_ip = _client_ip(request)

    plan = None
    if plan_id is not None:
        plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == plan_id).first()
        if not plan:
            raise HTTPException(status_code=404, detail="訓練計畫不存在")
        if plan.is_archived:
            raise HTTPException(status_code=403, detail="計畫已封存，無法上傳教材")

    mt = db.query(models.MaterialType).filter(models.MaterialType.id == material_type_id).first()
    if not mt or not mt.is_active:
        raise HTTPException(status_code=400, detail="教材類型不存在或已停用")

    if not files:
        raise HTTPException(status_code=400, detail="未選擇檔案")
    if len(files) > settings.teaching_material_max_batch_upload_count:
        raise HTTPException(status_code=400, detail=f"單次最多上傳 {settings.teaching_material_max_batch_upload_count} 份")

    # 先讀入所有檔案內容並檢查單次總量
    payloads = []  # (upload, raw)
    total = 0
    for f in files:
        raw = await f.read()
        total += len(raw)
        payloads.append((f, raw))
    if total > settings.teaching_material_max_batch_upload_bytes:
        raise HTTPException(status_code=400, detail="單次上傳總量超過上限")

    creds = _resolve_credentials(nas_session_token, nas_username, nas_password)
    type_max = _type_max_bytes(mt)
    year = (plan.year if plan and plan.year else None) or str(datetime.utcnow().year)
    sub_category_id = plan.sub_category_id if plan else None
    tags_json = _parse_tags(tags)

    succeeded: List[dict] = []
    failed: List[dict] = []

    try:
        with storage.connection(creds) as st:
            for f, raw in payloads:
                fname = os.path.basename(f.filename or "")
                try:
                    ext = _validate_filename(fname)
                    if len(raw) > type_max:
                        raise ValueError(f"超過類型單檔上限（{type_max} bytes）")

                    conflict = _find_active_conflict(db, plan_id, fname)
                    if conflict and on_conflict not in ("deactivate_and_new", "replace_in_place"):
                        raise ValueError("同名衝突，需指定處理方式")

                    derived_title = title or os.path.splitext(fname)[0]

                    if conflict and on_conflict == "replace_in_place":
                        # 沿用同一筆 id，覆寫 NAS 內容與中繼資料
                        target = conflict
                        if conflict_target_id and conflict_target_id != conflict.id:
                            t = db.query(models.TeachingMaterial).filter(
                                models.TeachingMaterial.id == conflict_target_id,
                                models.TeachingMaterial.is_active == True,  # noqa: E712
                            ).first()
                            if t:
                                target = t
                        st.save(target.storage_path, raw)
                        target.original_filename = fname
                        target.file_format = ext
                        target.file_size_bytes = len(raw)
                        target.uploaded_by = emp_id
                        target.uploaded_at = datetime.utcnow()
                        target.title = derived_title
                        target.material_type_id = mt.id
                        if description is not None:
                            target.description = description
                        if tags_json is not None:
                            target.tags = tags_json
                        db.flush()
                        rec_id = target.id
                    else:
                        # 新增一筆（無衝突 或 停用＋新版）
                        material = models.TeachingMaterial(
                            plan_id=plan_id, title=derived_title, material_type_id=mt.id,
                            description=description, tags=tags_json,
                            original_filename=fname, stored_filename="", storage_path="",
                            file_format=ext, file_size_bytes=len(raw), year=year,
                            sub_category_id=sub_category_id, uploaded_by=emp_id,
                            uploaded_at=datetime.utcnow(), is_active=True,
                        )
                        db.add(material)
                        db.flush()  # 取得 id
                        stored_filename = f"{material.id}.{ext}"
                        plan_segment = str(plan_id) if plan_id is not None else "general"
                        storage_path = f"{year}/{plan_segment}/teaching/{mt.slug}/{stored_filename}"
                        st.save(storage_path, raw)
                        material.stored_filename = stored_filename
                        material.storage_path = storage_path

                        if conflict and on_conflict == "deactivate_and_new":
                            conflict.is_active = False
                            conflict.deactivated_at = datetime.utcnow()
                            conflict.deactivated_by = emp_id
                            conflict.replaced_by_id = material.id
                            material.replaces_id = conflict.id
                        db.flush()
                        rec_id = material.id

                    record_file_transfer(
                        emp_id=emp_id, client_ip=client_ip, action="upload",
                        resource_type="teaching_material", status="success", filename=fname,
                        plan_id=plan_id, resource_id=rec_id, nas_username=creds.username,
                        bytes_=len(raw),
                    )
                    succeeded.append({"id": rec_id, "original_filename": fname})
                except (ValueError, storage.StorageError) as e:
                    db.rollback()  # 撤銷本檔未提交變更
                    record_file_transfer(
                        emp_id=emp_id, client_ip=client_ip, action="upload",
                        resource_type="teaching_material", status="failed", filename=fname,
                        plan_id=plan_id, nas_username=creds.username, error_message=str(e),
                    )
                    failed.append({"original_filename": fname, "reason": str(e)})
            db.commit()
    except storage.StorageUnavailable as e:
        db.rollback()
        raise HTTPException(status_code=503, detail=f"NAS 無法連線或登入失敗：{e}")

    return {"succeeded": succeeded, "failed": failed}


# ----------------------------------------------------------------
# 列表（教材庫總覽 / 單一計畫）
# ----------------------------------------------------------------

@router.get("/by-plan/{plan_id}", response_model=List[schemas.TeachingMaterial])
def list_by_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    rows = db.query(models.TeachingMaterial).filter(
        models.TeachingMaterial.plan_id == plan_id,
        models.TeachingMaterial.is_active == True,  # noqa: E712
    ).order_by(desc(models.TeachingMaterial.uploaded_at)).all()
    return rows


@router.get("/", response_model=schemas.TeachingMaterialList)
def list_materials(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    keyword: Optional[str] = None,
    material_type_id: Optional[int] = None,
    sub_category_id: Optional[int] = None,
    year: Optional[str] = None,
    plan_id: Optional[int] = None,
    file_format: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    """教材庫總覽（僅使用中教材，跨計畫分頁篩選）。"""
    q = db.query(models.TeachingMaterial).filter(models.TeachingMaterial.is_active == True)  # noqa: E712
    if keyword:
        like = f"%{keyword}%"
        q = q.filter(
            models.TeachingMaterial.title.ilike(like)
            | models.TeachingMaterial.description.ilike(like)
            | models.TeachingMaterial.tags.ilike(like)
            | models.TeachingMaterial.original_filename.ilike(like)
        )
    if material_type_id:
        q = q.filter(models.TeachingMaterial.material_type_id == material_type_id)
    if sub_category_id:
        q = q.filter(models.TeachingMaterial.sub_category_id == sub_category_id)
    if year:
        q = q.filter(models.TeachingMaterial.year == year)
    if plan_id:
        q = q.filter(models.TeachingMaterial.plan_id == plan_id)
    if file_format:
        q = q.filter(models.TeachingMaterial.file_format == file_format)

    total = q.count()
    items = q.order_by(desc(models.TeachingMaterial.uploaded_at)).offset((page - 1) * size).limit(size).all()
    return {
        "items": items, "total": total, "page": page, "size": size,
        "total_pages": (total + size - 1) // size,
    }


# ----------------------------------------------------------------
# 下載（單檔 / 批次 ZIP）
# ----------------------------------------------------------------

@router.get("/{material_id}/download")
def download_material(
    material_id: int,
    request: Request,
    nas_session_token: Optional[str] = Query(None),
    nas_username: Optional[str] = Query(None),
    nas_password: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    m = db.query(models.TeachingMaterial).filter(
        models.TeachingMaterial.id == material_id,
        models.TeachingMaterial.is_active == True,  # noqa: E712
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail="教材不存在或已停用")

    emp_id = getattr(current_user, "emp_id", None)
    client_ip = _client_ip(request)
    creds = _resolve_credentials(nas_session_token, nas_username, nas_password)
    try:
        with storage.connection(creds) as st:
            data = st.open(m.storage_path)
    except storage.StorageUnavailable as e:
        raise HTTPException(status_code=503, detail=f"NAS 無法連線：{e}")
    except storage.StorageError as e:
        record_file_transfer(
            emp_id=emp_id, client_ip=client_ip, action="download", resource_type="teaching_material",
            status="failed", filename=m.original_filename, plan_id=m.plan_id, resource_id=m.id,
            nas_username=creds.username, error_message=str(e),
        )
        raise HTTPException(status_code=404, detail="檔案不存在或讀取失敗")

    record_file_transfer(
        emp_id=emp_id, client_ip=client_ip, action="download", resource_type="teaching_material",
        status="success", filename=m.original_filename, plan_id=m.plan_id, resource_id=m.id,
        nas_username=creds.username, bytes_=len(data),
    )
    return Response(
        content=data, media_type="application/octet-stream",
        headers={"Content-Disposition": _content_disposition(m.original_filename)},
    )


@router.post("/batch-download")
def batch_download(
    req: schemas.BatchDownloadRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    settings = get_settings()
    emp_id = getattr(current_user, "emp_id", None)
    client_ip = _client_ip(request)

    if not req.ids:
        raise HTTPException(status_code=400, detail="未選擇教材")
    # 僅取使用中教材（停用/不存在自動略過）
    materials = db.query(models.TeachingMaterial).filter(
        models.TeachingMaterial.id.in_(req.ids),
        models.TeachingMaterial.is_active == True,  # noqa: E712
    ).all()
    if not materials:
        raise HTTPException(status_code=400, detail="所選教材皆不可下載（已停用或不存在）")
    if len(materials) > settings.teaching_material_max_batch_download_count:
        raise HTTPException(status_code=400, detail=f"批次下載最多 {settings.teaching_material_max_batch_download_count} 份")
    total = sum(m.file_size_bytes or 0 for m in materials)
    if total > settings.teaching_material_max_batch_download_bytes:
        raise HTTPException(status_code=400, detail="批次下載總量超過上限")

    creds = _resolve_credentials(req.nas_session_token, req.nas_username, req.nas_password)
    buf = io.BytesIO()
    used_names: dict = {}
    try:
        with storage.connection(creds) as st:
            with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
                for m in materials:
                    try:
                        data = st.open(m.storage_path)
                    except storage.StorageError as e:
                        record_file_transfer(
                            emp_id=emp_id, client_ip=client_ip, action="download",
                            resource_type="teaching_material", status="failed",
                            filename=m.original_filename, plan_id=m.plan_id, resource_id=m.id,
                            nas_username=creds.username, error_message=str(e),
                        )
                        continue
                    # ZIP 內重名 → 加 {id}_ 前綴（教材 PLAN §5.7）
                    name = m.original_filename
                    if name in used_names:
                        name = f"{m.id}_{name}"
                    used_names[name] = True
                    zf.writestr(name, data)
                    record_file_transfer(
                        emp_id=emp_id, client_ip=client_ip, action="download",
                        resource_type="teaching_material", status="success",
                        filename=m.original_filename, plan_id=m.plan_id, resource_id=m.id,
                        nas_username=creds.username, bytes_=len(data),
                    )
    except storage.StorageUnavailable as e:
        raise HTTPException(status_code=503, detail=f"NAS 無法連線：{e}")

    zip_name = f"teaching_materials_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
    return Response(
        content=buf.getvalue(), media_type="application/zip",
        headers={"Content-Disposition": _content_disposition(zip_name)},
    )


# ----------------------------------------------------------------
# 更新中繼資料 / 軟刪除
# ----------------------------------------------------------------

@router.put("/{material_id}", response_model=schemas.TeachingMaterial)
def update_material(
    material_id: int,
    payload: schemas.TeachingMaterialUpdate,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    m = db.query(models.TeachingMaterial).filter(models.TeachingMaterial.id == material_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="教材不存在")
    data = payload.model_dump(exclude_unset=True)
    if "tags" in data:
        tags_val = data.pop("tags")
        m.tags = json.dumps([str(t) for t in tags_val], ensure_ascii=False) if tags_val else None
    if "material_type_id" in data and data["material_type_id"] is not None:
        mt = db.query(models.MaterialType).filter(models.MaterialType.id == data["material_type_id"]).first()
        if not mt:
            raise HTTPException(status_code=400, detail="教材類型不存在")
    for k, v in data.items():
        setattr(m, k, v)
    db.commit()
    db.refresh(m)
    return m


# ----------------------------------------------------------------
# 替換教材實體檔（replace-file）
# ----------------------------------------------------------------

@router.post("/{material_id}/replace-file", response_model=schemas.TeachingMaterial)
async def replace_material_file(
    material_id: int,
    request: Request,
    files: List[UploadFile] = File(...),
    material_type_id: Optional[int] = Form(None),
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    nas_username: Optional[str] = Form(None),
    nas_password: Optional[str] = Form(None),
    nas_session_token: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    """替換教材實體檔（覆寫同一 NAS 路徑）；可同時更新部分中繼資料。
    storage_path 與 stored_filename 不更新，以維持同路徑覆寫語意。
    """
    emp_id = getattr(current_user, "emp_id", None)
    client_ip = _client_ip(request)

    # 1. 查找 is_active 教材
    m = db.query(models.TeachingMaterial).filter(
        models.TeachingMaterial.id == material_id,
        models.TeachingMaterial.is_active == True,  # noqa: E712
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail="教材不存在")

    # 2. 只接受 1 個檔案
    if len(files) != 1:
        raise HTTPException(status_code=400, detail="只能替換一個檔案")

    f = files[0]
    raw = await f.read()
    fname = os.path.basename(f.filename or "")

    try:
        ext = _validate_filename(fname)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 確認有效教材類型（若有指定新類型則驗證；否則沿用現有）
    if material_type_id is not None:
        effective_mt = db.query(models.MaterialType).filter(
            models.MaterialType.id == material_type_id,
            models.MaterialType.is_active == True,  # noqa: E712
        ).first()
        if not effective_mt:
            raise HTTPException(status_code=400, detail="教材類型不存在")
    else:
        effective_mt = db.query(models.MaterialType).filter(
            models.MaterialType.id == m.material_type_id
        ).first()

    if effective_mt and len(raw) > _type_max_bytes(effective_mt):
        raise HTTPException(
            status_code=400,
            detail=f"超過類型單檔上限（{_type_max_bytes(effective_mt)} bytes）",
        )

    # 3. 解析 NAS 憑證
    creds = _resolve_credentials(nas_session_token, nas_username, nas_password)

    try:
        # 4. 開啟 NAS 連線
        with storage.connection(creds) as st:
            # 5. 覆寫同一 NAS 路徑（storage_path 不更新）
            st.save(m.storage_path, raw)

            # 6. 更新 DB 欄位
            m.original_filename = fname
            m.file_format = ext
            m.file_size_bytes = len(raw)
            m.uploaded_by = emp_id
            m.uploaded_at = datetime.utcnow()

            if material_type_id is not None:
                m.material_type_id = material_type_id
            if title is not None:
                m.title = title
            if description is not None:
                m.description = description
            if tags is not None:
                m.tags = _parse_tags(tags)

        # 7. 提交
        db.commit()
        db.refresh(m)

    except storage.StorageUnavailable as e:
        raise HTTPException(status_code=503, detail=f"NAS 無法連線：{e}")
    except storage.StorageError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # 8. 稽核紀錄
    record_file_transfer(
        emp_id=emp_id, client_ip=client_ip, action="upload",
        resource_type="teaching_material", status="success", filename=fname,
        plan_id=m.plan_id, resource_id=m.id, nas_username=creds.username,
        bytes_=len(raw),
    )

    # 9. 回傳
    return m


@router.delete("/{material_id}")
def delete_material(
    material_id: int,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    """軟刪除（is_active=false）；NAS 實體檔保留（見教材 PLAN §2.2/§5.6）。"""
    m = db.query(models.TeachingMaterial).filter(models.TeachingMaterial.id == material_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="教材不存在")
    m.is_active = False
    m.deactivated_at = datetime.utcnow()
    m.deactivated_by = getattr(current_user, "emp_id", None)
    db.commit()
    return {"message": "已停用（軟刪除）"}
