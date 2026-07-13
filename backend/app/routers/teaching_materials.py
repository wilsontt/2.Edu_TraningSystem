"""
教材類型／允許格式主檔維護 + NAS 登入路由 (Teaching Materials Router)

Wave2 起，教材本體（套組/檔案/計畫綁定）已全面改由 teaching_material_sets.py 提供
（`/admin/teaching-materials/sets`、`/files` 系列端點）。本檔僅保留：
- 教材類型／允許格式主檔 CRUD（`material-types`、`material-file-formats`）
- NAS 登入短時 token（`nas-session/verify`）
- 供 teaching_material_sets.py 匯入的共用小工具（副檔名驗證、單檔上限計算、NAS 憑證解析、
  Content-Disposition、client IP、tags 解析）

Wave1 資料表 `teaching_materials` 保留於資料庫供歷史查證，但不再有任何寫入路徑；
既有資料已由 backend/migrations/add_teaching_material_sets.py 遷移至 Wave2 三表。
準據：教材 PLAN（20260617）§5.12.5（廢止 on_conflict／conflict-check／replace_in_place／
deactivate_and_new）。
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from typing import List, Optional, Tuple
import os
import json
from urllib.parse import quote

from .. import models, schemas
from ..database import get_db
from ..config import get_settings
from .auth import check_permission
from ..services import storage, nas_session

router = APIRouter(prefix="/admin/teaching-materials", tags=["teaching-materials"])

# 危險副檔名（雙副檔名防禦；維持程式常數，不可由 UI 關閉）
DANGEROUS_EXTS = {"exe", "bat", "cmd", "sh", "js", "com", "scr", "msi", "zip", "rar", "7z", "jar", "ps1", "vbs"}


# ----------------------------------------------------------------
# 共用小工具（供 teaching_material_sets.py 匯入）
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


def _normalize_ext(ext: str) -> str:
    """副檔名正規化：小寫、去除前導點與空白。"""
    return (ext or "").strip().lower().lstrip(".")


def _validate_filename(filename: str, db: Session) -> Tuple[str, models.MaterialFileFormat]:
    """驗證副檔名白名單（DB）與雙副檔名；回傳 (小寫副檔名, 格式主檔)。"""
    base = os.path.basename(filename or "")
    parts = base.lower().split(".")
    if len(parts) < 2 or not parts[0]:
        raise ValueError("檔名缺少副檔名")
    ext = parts[-1]
    fmt = db.query(models.MaterialFileFormat).filter(
        models.MaterialFileFormat.ext == ext,
        models.MaterialFileFormat.is_active == True,  # noqa: E712
    ).first()
    if not fmt:
        raise ValueError(f"不允許的格式 .{ext}")
    if any(p in DANGEROUS_EXTS for p in parts[1:-1]):
        raise ValueError("可疑的雙副檔名")
    return ext, fmt


def _fmt_bytes_human(n: int) -> str:
    """將位元組數轉為可讀字串（KB／MB／GB）。"""
    if n >= 1_073_741_824:
        return f"{n / 1_073_741_824:.1f} GB"
    if n >= 1_048_576:
        return f"{n / 1_048_576:.1f} MB"
    return f"{max(1, (n + 1023) // 1024)} KB"


def _effective_max_bytes(
    mt: Optional[models.MaterialType],
    fmt: Optional[models.MaterialFileFormat],
) -> int:
    """有效單檔上限 = min(格式上限, 類型上限, 系統硬上限)。"""
    hard = get_settings().teaching_material_max_file_bytes
    caps = [hard]
    if mt and mt.max_file_bytes:
        caps.append(mt.max_file_bytes)
    if fmt and fmt.max_file_bytes:
        caps.append(fmt.max_file_bytes)
    return min(caps)


def _file_size_limit_exceeded_message(
    fname: str,
    size: int,
    mt: Optional[models.MaterialType],
    fmt: Optional[models.MaterialFileFormat],
) -> str:
    """單檔超限說明：標明觸發層（類型／格式／系統）與各層參考上限。"""
    hard = get_settings().teaching_material_max_file_bytes
    type_cap = mt.max_file_bytes if mt and mt.max_file_bytes else None
    fmt_cap = fmt.max_file_bytes if fmt and fmt.max_file_bytes else None
    effective = _effective_max_bytes(mt, fmt)

    triggers: list[str] = []
    if type_cap is not None and type_cap == effective:
        triggers.append(f"教材類型「{mt.name}」上限 {_fmt_bytes_human(type_cap)}")
    if fmt_cap is not None and fmt_cap == effective:
        triggers.append(f"檔案格式 .{fmt.ext} 上限 {_fmt_bytes_human(fmt_cap)}")
    if hard == effective:
        triggers.append(f"系統硬上限 {_fmt_bytes_human(hard)}")
    trigger_txt = "；".join(triggers) if triggers else f"有效上限 {_fmt_bytes_human(effective)}"

    refs = [f"系統硬上限 {_fmt_bytes_human(hard)}"]
    if mt is not None:
        refs.append(
            f"類型「{mt.name}」"
            + (_fmt_bytes_human(type_cap) if type_cap is not None else "未另限")
        )
    if fmt is not None:
        refs.append(
            f"格式 .{fmt.ext} "
            + (_fmt_bytes_human(fmt_cap) if fmt_cap is not None else "未另限")
        )

    return (
        f"「{fname}」超過單檔上限：{_fmt_bytes_human(size)} > {_fmt_bytes_human(effective)}"
        f"（觸發：{trigger_txt}；參考：{'、'.join(refs)}）"
    )


def _batch_upload_total_exceeded_message(total: int, limit: int) -> str:
    """單次上傳總量超限說明。"""
    return (
        f"單次上傳總量超過上限：目前 {_fmt_bytes_human(total)}，"
        f"上限 {_fmt_bytes_human(limit)}（系統批次上傳總量）"
    )


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


def _material_type_in_use(db: Session, type_id: int) -> bool:
    """教材類型是否仍被 Wave1 舊表或 Wave2 套組引用（供刪除前檢查）。"""
    return bool(
        db.query(models.TeachingMaterial).filter(models.TeachingMaterial.material_type_id == type_id).first()
        or db.query(models.TeachingMaterialSet).filter(models.TeachingMaterialSet.material_type_id == type_id).first()
    )


def _file_format_in_use(db: Session, ext: str) -> bool:
    """允許格式是否仍被 Wave1 舊表或 Wave2 檔案引用（供刪除前檢查）。"""
    return bool(
        db.query(models.TeachingMaterial).filter(models.TeachingMaterial.file_format == ext).first()
        or db.query(models.TeachingMaterialFile).filter(models.TeachingMaterialFile.file_format == ext).first()
    )


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
    data = payload.model_dump(exclude_unset=True)
    if "slug" in data and data["slug"] != mt.slug:
        if _material_type_in_use(db, type_id):
            raise HTTPException(status_code=400, detail="類型已有教材引用，不可修改 slug")
        if db.query(models.MaterialType).filter(
            models.MaterialType.slug == data["slug"],
            models.MaterialType.id != type_id,
        ).first():
            raise HTTPException(status_code=400, detail="slug 已存在")
    if "name" in data and data["name"] != mt.name:
        if db.query(models.MaterialType).filter(
            models.MaterialType.name == data["name"],
            models.MaterialType.id != type_id,
        ).first():
            raise HTTPException(status_code=400, detail="類型名稱已存在")
    for k, v in data.items():
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
    if _material_type_in_use(db, type_id):
        mt.is_active = False
        db.commit()
        return {"message": "類型已有教材引用，已改為停用", "disabled": True}
    db.delete(mt)
    db.commit()
    return {"message": "已刪除"}


# ----------------------------------------------------------------
# 允許檔案格式維護（material-file-formats）—— GET 需 menu:exam；異動需 menu:admin
# ----------------------------------------------------------------

@router.get("/material-file-formats", response_model=List[schemas.MaterialFileFormat])
def list_material_file_formats(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    q = db.query(models.MaterialFileFormat)
    if not include_inactive:
        q = q.filter(models.MaterialFileFormat.is_active == True)  # noqa: E712
    return q.order_by(
        models.MaterialFileFormat.sort_order.asc(),
        models.MaterialFileFormat.id.asc(),
    ).all()


@router.post("/material-file-formats", response_model=schemas.MaterialFileFormat)
def create_material_file_format(
    payload: schemas.MaterialFileFormatCreate,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:admin"),
):
    ext = _normalize_ext(payload.ext)
    if not ext:
        raise HTTPException(status_code=400, detail="副檔名不可為空")
    if db.query(models.MaterialFileFormat).filter(models.MaterialFileFormat.ext == ext).first():
        raise HTTPException(status_code=400, detail="副檔名已存在")
    data = payload.model_dump()
    data["ext"] = ext
    fmt = models.MaterialFileFormat(**data)
    db.add(fmt)
    db.commit()
    db.refresh(fmt)
    return fmt


@router.put("/material-file-formats/{format_id}", response_model=schemas.MaterialFileFormat)
def update_material_file_format(
    format_id: int,
    payload: schemas.MaterialFileFormatUpdate,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:admin"),
):
    fmt = db.query(models.MaterialFileFormat).filter(
        models.MaterialFileFormat.id == format_id
    ).first()
    if not fmt:
        raise HTTPException(status_code=404, detail="檔案格式不存在")
    data = payload.model_dump(exclude_unset=True)
    if "ext" in data:
        new_ext = _normalize_ext(data["ext"])
        if not new_ext:
            raise HTTPException(status_code=400, detail="副檔名不可為空")
        if new_ext != fmt.ext:
            if _file_format_in_use(db, fmt.ext):
                raise HTTPException(status_code=400, detail="格式已有教材引用，不可修改副檔名")
            if db.query(models.MaterialFileFormat).filter(
                models.MaterialFileFormat.ext == new_ext,
                models.MaterialFileFormat.id != format_id,
            ).first():
                raise HTTPException(status_code=400, detail="副檔名已存在")
        data["ext"] = new_ext
    for k, v in data.items():
        setattr(fmt, k, v)
    db.commit()
    db.refresh(fmt)
    return fmt


@router.delete("/material-file-formats/{format_id}")
def delete_material_file_format(
    format_id: int,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:admin"),
):
    fmt = db.query(models.MaterialFileFormat).filter(
        models.MaterialFileFormat.id == format_id
    ).first()
    if not fmt:
        raise HTTPException(status_code=404, detail="檔案格式不存在")
    if _file_format_in_use(db, fmt.ext):
        fmt.is_active = False
        db.commit()
        return {"message": "格式已有教材引用，已改為停用", "disabled": True}
    db.delete(fmt)
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
