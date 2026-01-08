from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session
from typing import List
import os
import shutil
from pathlib import Path
from datetime import datetime

from .. import models, schemas
from ..database import get_db
from .auth import check_permission

router = APIRouter(prefix="/admin/exams", tags=["exams"])

BASE_UPLOAD_DIR = Path("data/materials")

def get_upload_dir(year: str, plan_id: int) -> Path:
    return BASE_UPLOAD_DIR / str(year) / str(plan_id)

@router.post("/upload")
async def upload_material(
    plan_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user = check_permission("menu:exam") 
):
    """
    上傳並匯入考卷題目 (TXT)
    流程:
    1. 驗證檔案格式
    2. 解析題目內容
    3. 若解析成功，儲存題目至資料庫
    4. 備份原始檔案
    """
    # 1. 驗證檔案
    if not file.filename.lower().endswith('.txt'):
        raise HTTPException(status_code=400, detail="僅支援 .txt 格式")
    
    plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="訓練計畫不存在")

    # 2. 讀取並解析內容
    content = (await file.read()).decode('utf-8')
    from ..services.parser import TXTParser
    questions_data = TXTParser.parse_content(content)
    
    if not questions_data:
        raise HTTPException(status_code=400, detail="無法解析題目，請檢查檔案格式 (需包含 Q:, ANS:, SCORE:)")

    # 3. 儲存題目至資料庫 (User 要求直接產生，採用追加模式)
    import json
    try:
        new_questions = []
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
                points=q.get("points", 10)
            )
            db.add(new_q)
            new_questions.append(new_q)
            imported_count += 1
            
            # --- 同步寫入題庫 (QuestionBank) ---
            # 檢查是否已存在 (以題目內容判斷)
            exists_in_bank = db.query(models.QuestionBank).filter(
                models.QuestionBank.content == q["content"]
            ).first()
            
            if not exists_in_bank:
                # 產生標籤: 計畫標題 + 分類
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
                    created_by=current_user.emp_id if hasattr(current_user, 'emp_id') else 'system'
                )
                db.add(qb)
            # -----------------------------------
        
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"題目儲存失敗: {str(e)}")

    return {
        "filename": file.filename,
        "imported": imported_count,
        "duplicate": duplicate_count,
        "failed": 0
    }

    # 4. 備份原始檔案
    try:
        year = plan.year if plan.year else "unknown"
        upload_dir = get_upload_dir(year, plan_id)
        upload_dir.mkdir(parents=True, exist_ok=True)
        file_path = upload_dir / file.filename
        
        # 不重置檔案游標，直接寫入已讀取的內容
        with file_path.open("w", encoding="utf-8") as f:
            f.write(content)
            
    except Exception as e:
        print(f"備份失敗: {e}") # 非致命錯誤
        
    return {
        "filename": file.filename,
        "parsed_count": len(new_questions),
        "message": f"成功匯入 {len(new_questions)} 題"
    }

@router.get("/materials/{plan_id}")
def list_materials(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user = check_permission("menu:exam")
):
    """
    列出該計畫已上傳的教材
    """
    plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="訓練計畫不存在")
    
    year = plan.year if plan.year else "unknown"
    upload_dir = get_upload_dir(year, plan_id)
    
    if not upload_dir.exists():
        return []
    
    files = []
    for f in upload_dir.iterdir():
        if f.is_file() and not f.name.startswith('.'):
            files.append({
                "filename": f.name,
                "path": str(f),
                "size": f.stat().st_size,
                "upload_time": datetime.fromtimestamp(f.stat().st_mtime).strftime('%Y-%m-%d %H:%M')
            })
            
    return files

@router.get("/materials/preview/{year}/{plan_id}/{filename}")
def preview_material(
    year: str,
    plan_id: int,
    filename: str,
    db: Session = Depends(get_db),
    current_user = check_permission("menu:exam")
):
    """
    預覽教材內容 (TXT)
    """
    file_path = get_upload_dir(year, plan_id) / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="檔案不存在")
        
    try:
        with file_path.open("r", encoding="utf-8") as f:
            content = f.read()
        return {"content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"讀取失敗: {str(e)}")

@router.delete("/materials/{plan_id}/{filename}")
def delete_material(
    plan_id: int,
    filename: str,
    db: Session = Depends(get_db),
    current_user = check_permission("menu:exam")
):
    """
    刪除已上傳的教材檔案
    """
    plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="訓練計畫不存在")
        
    year = plan.year if plan.year else "unknown"
    file_path = get_upload_dir(year, plan_id) / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="檔案不存在")
        
    try:
        os.remove(file_path)
        return {"message": "檔案已刪除"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"刪除失敗: {str(e)}")

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
        
    try:
        db.commit()
        db.refresh(db_q)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="更新失敗")
    return db_q

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
