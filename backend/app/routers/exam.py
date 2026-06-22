"""
考卷工坊路由 (Exam Router)
負責處理考卷題目的上傳解析、題庫管理、教材存放以及考卷工坊專用的計畫查詢。
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Body, Query, Request
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from typing import List, Any, Dict, Optional
import os
import json
from datetime import datetime

from .. import models, schemas
from ..database import get_db
from .auth import check_permission
from ..services import storage
from ..services.audit_log import record_file_transfer

router = APIRouter(prefix="/admin/exams", tags=["exams"])

# ----------------------------------------------------------------
# 考卷 TXT 儲存（NAS／service 模式）
# ----------------------------------------------------------------
# 考卷實體 TXT 一律存於 NAS：{MATERIALS_ROOT}/{year}/{plan_id}/exams/{filename}
# 本地不再保留副本；每次傳輸短連線並寫入稽核（見 NAS PLAN §5.1～5.3、建議事項 PLAN §5.2/§7.1）。


def _exam_rel_path(year: str, plan_id: int, filename: str) -> str:
    """考卷 TXT 於 NAS 之相對路徑（相對 MATERIALS_ROOT）。"""
    return f"{year}/{plan_id}/exams/{filename}"


def _client_ip(request: Optional[Request]) -> Optional[str]:
    """解析來源 IP（考慮反向代理）。"""
    if request is None:
        return None
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    real = request.headers.get("x-real-ip")
    if real:
        return real
    return request.client.host if request.client else None


def _safe_filename(filename: str) -> str:
    """防止路徑穿越：僅取基底檔名，拒絕含路徑分隔或 .. 之檔名。"""
    base = os.path.basename(filename or "")
    if not base or base in (".", "..") or "/" in (filename or "") or "\\" in (filename or ""):
        raise HTTPException(status_code=400, detail="非法檔名")
    return base

# ----------------------------------------------------------------
# 考卷工坊計畫列表 (Exam Studio Plans List)
# ----------------------------------------------------------------

@router.get("/plans", response_model=List[schemas.TrainingPlan])
def list_plans_for_exam_studio(
    status: Optional[str] = Query(
        None,
        description="狀態篩選: active, expired, archived, all",
    ),
    year: Optional[str] = Query(None, description="年份篩選"),
    dept_id: Optional[int] = Query(None, description="單位篩選"),
    category_id: Optional[int] = Query(None, description="分類篩選"),
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    """
    獲取考卷工坊專用的計畫清單
    為持有 menu:exam 權限的使用者提供計畫查詢能力，並支援複雜的篩選邏輯。
    """
    from datetime import date

    query = db.query(models.TrainingPlan)
    today = date.today()

    # 執行計畫狀態篩選邏輯
    if status == "active":
        query = query.filter(
            models.TrainingPlan.is_archived == False,
            or_(models.TrainingPlan.end_date >= today, models.TrainingPlan.end_date.is_(None)),
        )
    elif status == "expired":
        query = query.filter(
            models.TrainingPlan.is_archived == False,
            models.TrainingPlan.end_date < today,
        )
    elif status == "archived":
        query = query.filter(models.TrainingPlan.is_archived == True)
    elif status == "all":
        pass # 不篩選
    else:
        query = query.filter(models.TrainingPlan.is_archived == False)

    if year:
        query = query.filter(models.TrainingPlan.year == year)
    if dept_id:
        query = query.filter(models.TrainingPlan.dept_id == dept_id)
    if category_id:
        query = query.filter(models.TrainingPlan.sub_category_id == category_id)

    return (
        query.options(joinedload(models.TrainingPlan.sub_category))
        .order_by(models.TrainingPlan.training_date.desc())
        .all()
    )

# ----------------------------------------------------------------
# 教材與題目上傳 (Material & Question Upload)
# ----------------------------------------------------------------

@router.post("/upload")
async def upload_material(
    request: Request,
    plan_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user = check_permission("menu:exam")
):
    """
    上傳並自動解析考卷題目 (僅支援 .txt 格式)
    流程：
    1. 驗證檔案格式與計畫存在性。
    2. 以 TXTParser 解析題目（題幹、選項、答案、配分）。
    3. 原始 TXT 以 service 模式寫入 NAS {year}/{plan_id}/exams/（本地不留副本），並寫稽核；
       NAS 不可達時回傳 503 且不寫入題目（避免有題無檔之不一致）。
    4. 寫入 Questions 與全域題庫。
    """
    # 1. 驗證檔案
    filename = _safe_filename(file.filename)
    if not filename.lower().endswith('.txt'):
        raise HTTPException(status_code=400, detail="僅支援 .txt 格式")

    plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="訓練計畫不存在")

    # 2. 讀取並解析內容
    raw = await file.read()
    try:
        content = raw.decode('utf-8')
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="檔案編碼需為 UTF-8")
    from ..services.parser import TXTParser
    questions_data = TXTParser.parse_content(content)

    if not questions_data:
        raise HTTPException(status_code=400, detail="無法解析題目，請檢查檔案格式 (需包含 Q:, ANS:, SCORE:)")

    emp_id = getattr(current_user, "emp_id", None)
    client_ip = _client_ip(request)
    year = plan.year if plan.year else "unknown"
    rel_path = _exam_rel_path(year, plan_id, filename)

    # 3. 先以 service 模式寫入 NAS（短連線）；失敗則不進 DB，確保「有題必有檔」
    try:
        with storage.connection(storage.service_credentials()) as st:
            written = st.save(rel_path, raw)
    except storage.StorageUnavailable as e:
        record_file_transfer(
            emp_id=emp_id, client_ip=client_ip, action="upload", resource_type="exam_txt",
            status="failed", filename=filename, plan_id=plan_id, nas_username="service",
            error_message=str(e),
        )
        raise HTTPException(status_code=503, detail=f"NAS 無法連線，考卷未上傳：{e}")
    except storage.StorageError as e:
        record_file_transfer(
            emp_id=emp_id, client_ip=client_ip, action="upload", resource_type="exam_txt",
            status="failed", filename=filename, plan_id=plan_id, nas_username="service",
            error_message=str(e),
        )
        raise HTTPException(status_code=500, detail=f"考卷寫入 NAS 失敗：{e}")

    # 4. 儲存題目至資料庫 (追加模式) 並同步全域題庫
    try:
        duplicate_count = 0
        imported_count = 0

        for q in questions_data:
            # 檢查此計畫中是否已有重複題目
            exists = db.query(models.Question).filter(
                models.Question.plan_id == plan_id,
                models.Question.content == q["content"]
            ).first()

            if exists:
                duplicate_count += 1
                continue

            new_q = models.Question(
                plan_id=plan_id,
                question_type=q["type"],
                content=q["content"],
                options=q["options"],
                answer=q["answer"],
                hint=q.get("hint"),
                level=q.get("level"),  # 題目難易度 E/M/H
                points=q.get("points", 10)
            )
            db.add(new_q)
            imported_count += 1

            # --- 同步寫入題庫 (QuestionBank) ---
            exists_in_bank = db.query(models.QuestionBank).filter(
                models.QuestionBank.content == q["content"]
            ).first()

            if not exists_in_bank:
                tags_list = []
                if plan.title: tags_list.append(plan.title)
                if plan.sub_category and plan.sub_category.name:
                    tags_list.append(plan.sub_category.name)

                qb = models.QuestionBank(
                    content=q["content"],
                    question_type=q["type"],
                    options=q["options"],
                    answer=q["answer"],
                    tags=json.dumps(tags_list, ensure_ascii=False),
                    hint=q.get("hint"),
                    level=q.get("level"),
                    created_by=emp_id if emp_id else 'system'
                )
                db.add(qb)

        db.commit()
    except Exception as e:
        db.rollback()
        record_file_transfer(
            emp_id=emp_id, client_ip=client_ip, action="upload", resource_type="exam_txt",
            status="failed", filename=filename, plan_id=plan_id, nas_username="service",
            bytes_=written, error_message=f"題目儲存失敗：{e}",
        )
        raise HTTPException(status_code=500, detail=f"題目儲存失敗: {str(e)}")

    record_file_transfer(
        emp_id=emp_id, client_ip=client_ip, action="upload", resource_type="exam_txt",
        status="success", filename=filename, plan_id=plan_id, nas_username="service",
        bytes_=written,
    )
    return {
        "filename": filename,
        "imported": imported_count,
        "duplicate": duplicate_count,
        "failed": 0
    }

@router.post("/upload/preview")
async def upload_preview(
    file: UploadFile = File(...),
    current_user = check_permission("menu:exam")
):
    """僅解析 TXT 不寫入 DB，回傳題目列表供前端預覽與勾選後再匯入。"""
    if not file.filename.lower().endswith('.txt'):
        raise HTTPException(status_code=400, detail="僅支援 .txt 格式")
    content = (await file.read()).decode('utf-8')
    from ..services.parser import TXTParser
    questions_data = TXTParser.parse_content(content)
    if not questions_data:
        raise HTTPException(status_code=400, detail="無法解析題目，請檢查檔案格式 (需包含 Q:, ANS:, SCORE:)")
    # 回傳結構化題目（含 type, content, options, answer, points, hint, level）
    return {"filename": file.filename, "questions": questions_data}

@router.post("/import-from-preview")
async def import_from_preview(
    plan_id: int = Body(...),
    questions: List[Dict[str, Any]] = Body(...),
    add_to_bank: bool = Body(True),
    db: Session = Depends(get_db),
    current_user = check_permission("menu:exam")
):
    """將預覽後勾選的題目寫入該訓練計畫，並可選擇同步寫入題庫。"""
    plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="訓練計畫不存在")
    imported = 0
    duplicate = 0
    for q in questions:
        if not q.get("content") or not q.get("answer"):
            continue
        exists = db.query(models.Question).filter(
            models.Question.plan_id == plan_id,
            models.Question.content == q["content"]
        ).first()
        if exists:
            duplicate += 1
            continue
        new_q = models.Question(
            plan_id=plan_id,
            question_type=q.get("type", "single"),
            content=q["content"],
            options=q.get("options", "{}"),
            answer=q["answer"],
            hint=q.get("hint"),
            level=q.get("level"),
            points=q.get("points", 10)
        )
        db.add(new_q)
        imported += 1
        if add_to_bank:
            exists_bank = db.query(models.QuestionBank).filter(
                models.QuestionBank.content == q["content"]
            ).first()
            if not exists_bank:
                tags_list = []
                if plan.title:
                    tags_list.append(plan.title)
                if plan.sub_category and plan.sub_category.name:
                    tags_list.append(plan.sub_category.name)
                qb = models.QuestionBank(
                    content=q["content"],
                    question_type=q.get("type", "single"),
                    options=q.get("options", "{}"),
                    answer=q["answer"],
                    tags=json.dumps(tags_list, ensure_ascii=False),
                    hint=q.get("hint"),
                    level=q.get("level"),
                    created_by=current_user.emp_id if hasattr(current_user, 'emp_id') else 'system'
                )
                db.add(qb)
    db.commit()
    return {"imported": imported, "duplicate": duplicate}

@router.get("/materials/{plan_id}")
def list_materials(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user = check_permission("menu:exam")
):
    """
    列出該計畫已上傳的考卷 TXT（讀自 NAS exams/）。
    """
    plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="訓練計畫不存在")

    year = plan.year if plan.year else "unknown"
    rel_dir = f"{year}/{plan_id}/exams"
    try:
        with storage.connection(storage.service_credentials()) as st:
            entries = st.list(rel_dir)
    except storage.StorageUnavailable as e:
        raise HTTPException(status_code=503, detail=f"NAS 無法連線：{e}")
    except storage.StorageError as e:
        raise HTTPException(status_code=500, detail=f"讀取 NAS 失敗：{e}")

    files = []
    for it in entries:
        files.append({
            "filename": it["filename"],
            "path": _exam_rel_path(year, plan_id, it["filename"]),
            "size": it["size"],
            "upload_time": datetime.fromtimestamp(it["mtime"]).strftime('%Y-%m-%d %H:%M'),
        })

    return files

@router.get("/materials/preview/{year}/{plan_id}/{filename}")
def preview_material(
    year: str,
    plan_id: int,
    filename: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user = check_permission("menu:exam")
):
    """
    預覽考卷 TXT 內容（讀自 NAS），並寫入下載稽核。
    """
    safe = _safe_filename(filename)
    rel_path = _exam_rel_path(year, plan_id, safe)
    emp_id = getattr(current_user, "emp_id", None)
    client_ip = _client_ip(request)
    try:
        with storage.connection(storage.service_credentials()) as st:
            data = st.open(rel_path)
    except storage.StorageUnavailable as e:
        raise HTTPException(status_code=503, detail=f"NAS 無法連線：{e}")
    except storage.StorageError as e:
        record_file_transfer(
            emp_id=emp_id, client_ip=client_ip, action="download", resource_type="exam_txt",
            status="failed", filename=safe, plan_id=plan_id, nas_username="service",
            error_message=str(e),
        )
        raise HTTPException(status_code=404, detail="檔案不存在或讀取失敗")

    content = data.decode("utf-8", errors="replace")
    record_file_transfer(
        emp_id=emp_id, client_ip=client_ip, action="download", resource_type="exam_txt",
        status="success", filename=safe, plan_id=plan_id, nas_username="service",
        bytes_=len(data),
    )
    return {"content": content}

@router.delete("/materials/{plan_id}/{filename}")
def delete_material(
    plan_id: int,
    filename: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user = check_permission("menu:exam")
):
    """
    刪除 NAS 上的考卷 TXT，並寫入稽核。
    """
    plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="訓練計畫不存在")

    safe = _safe_filename(filename)
    year = plan.year if plan.year else "unknown"
    rel_path = _exam_rel_path(year, plan_id, safe)
    emp_id = getattr(current_user, "emp_id", None)
    client_ip = _client_ip(request)
    try:
        with storage.connection(storage.service_credentials()) as st:
            st.delete(rel_path)
    except storage.StorageUnavailable as e:
        raise HTTPException(status_code=503, detail=f"NAS 無法連線：{e}")
    except storage.StorageError as e:
        record_file_transfer(
            emp_id=emp_id, client_ip=client_ip, action="delete", resource_type="exam_txt",
            status="failed", filename=safe, plan_id=plan_id, nas_username="service",
            error_message=str(e),
        )
        raise HTTPException(status_code=404, detail="檔案不存在或刪除失敗")

    record_file_transfer(
        emp_id=emp_id, client_ip=client_ip, action="delete", resource_type="exam_txt",
        status="success", filename=safe, plan_id=plan_id, nas_username="service",
    )
    return {"message": "檔案已刪除"}

@router.get("/questions/{plan_id}", response_model=List[schemas.Question])
def list_questions(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user = check_permission("menu:exam")
):
    """
    列出該計畫的所有題目
    """
    questions = db.query(models.Question).filter(models.Question.plan_id == plan_id).all()
    return questions

@router.put("/questions/{question_id}", response_model=schemas.Question)
def update_question(
    question_id: int,
    q_update: schemas.QuestionUpdate,
    db: Session = Depends(get_db),
    current_user = check_permission("menu:exam")
):
    """
    更新題目內容
    """
    db_q = db.query(models.Question).filter(models.Question.id == question_id).first()
    if not db_q:
        raise HTTPException(status_code=404, detail="題目不存在")
        
    if q_update.content is not None:
        db_q.content = q_update.content
    if q_update.question_type is not None:
        db_q.question_type = q_update.question_type
    if q_update.options is not None:
        db_q.options = q_update.options
    if q_update.answer is not None:
        db_q.answer = q_update.answer
    if q_update.points is not None:
        db_q.points = q_update.points
    if q_update.hint is not None:
        db_q.hint = q_update.hint
        
    try:
        db.commit()
        db.refresh(db_q)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="更新失敗")
    return db_q

@router.delete("/questions/bulk-delete")
def bulk_delete_questions(
    body: schemas.BulkDeleteQuestionsRequest,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam")
):
    """
    批次刪除指定題目（考卷工坊）
    """
    ids = list({qid for qid in body.question_ids if isinstance(qid, int)})
    if not ids:
        raise HTTPException(status_code=400, detail="question_ids 不可為空")

    existing_questions = db.query(models.Question).filter(models.Question.id.in_(ids)).all()
    existing_map = {q.id: q for q in existing_questions}
    missing_ids = [qid for qid in ids if qid not in existing_map]

    deleted_count = 0
    try:
        for qid in ids:
            q = existing_map.get(qid)
            if not q:
                continue
            db.delete(q)
            deleted_count += 1
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"批次刪除失敗: {str(e)}")

    return {
        "deleted_count": deleted_count,
        "missing_ids": missing_ids
    }


@router.delete("/questions/{question_id}")
def delete_question(
    question_id: int,
    db: Session = Depends(get_db),
    current_user = check_permission("menu:exam")
):
    """
    刪除題目
    """
    db_q = db.query(models.Question).filter(models.Question.id == question_id).first()
    if not db_q:
        raise HTTPException(status_code=404, detail="題目不存在")
        
    try:
        db.delete(db_q)
        db.commit()
        return {"message": "題目已刪除"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="刪除失敗")
