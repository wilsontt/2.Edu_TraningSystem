from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List, Optional
import json
from .. import models, schemas
from ..database import get_db
from .auth import check_permission

router = APIRouter(prefix="/admin/question-bank", tags=["question-bank"])

@router.get("/", response_model=schemas.QuestionBankList)
def get_questions(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    keyword: Optional[str] = None,
    tags: Optional[str] = None,
    question_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user = check_permission("menu:exam_studio")
):
    """
    查詢題庫列表 (支援分頁與篩選)
    """
    query = db.query(models.QuestionBank)
    
    if keyword:
        # SQLite 大小寫不敏感支援有限，但在此專案中使用 .contains 即可
        query = query.filter(models.QuestionBank.content.ilike(f"%{keyword}%"))
    
    if question_type and question_type != 'all':
        query = query.filter(models.QuestionBank.question_type == question_type)
        
    if tags:
        # 簡單標籤篩選: 檢查 tags 欄位是否包含該字串
        query = query.filter(models.QuestionBank.tags.ilike(f"%{tags}%"))

    total = query.count()
    items = query.order_by(desc(models.QuestionBank.created_at)).offset((page - 1) * size).limit(size).all()
    
    return {
        "items": items,
        "total": total,
        "page": page,
        "size": size,
        "total_pages": (total + size - 1) // size
    }

@router.put("/{id}", response_model=schemas.QuestionBank)
def update_question_bank(
    id: int,
    q_update: schemas.QuestionBankUpdate,
    db: Session = Depends(get_db),
    current_user = check_permission("menu:exam_studio")
):
    """更新題庫題目"""
    db_q = db.query(models.QuestionBank).filter(models.QuestionBank.id == id).first()
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
    if q_update.tags is not None:
        db_q.tags = q_update.tags
    if q_update.hint is not None:
        db_q.hint = q_update.hint
        
    try:
        db.commit()
        db.refresh(db_q)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"更新失敗: {str(e)}")
        
    return db_q

@router.delete("/{id}")
def delete_question_bank(
    id: int,
    db: Session = Depends(get_db),
    current_user = check_permission("menu:exam_studio")
):
    """刪除題庫題目"""
    db_q = db.query(models.QuestionBank).filter(models.QuestionBank.id == id).first()
    if not db_q:
        raise HTTPException(status_code=404, detail="題目不存在")
        
    try:
        db.delete(db_q)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="刪除失敗")
        
    return {"message": "刪除成功"}

@router.post("/import")
def import_questions_to_plan(
    plan_id: int = Body(..., embed=True),
    question_ids: List[int] = Body(..., embed=True),
    db: Session = Depends(get_db),
    current_user = check_permission("menu:exam_studio")
):
    """從題庫匯入題目至訓練計畫"""
    # 檢查計畫
    plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="訓練計畫不存在")
        
    # 撈取題目
    questions = db.query(models.QuestionBank).filter(models.QuestionBank.id.in_(question_ids)).all()
    if not questions:
        raise HTTPException(status_code=404, detail="未找到選取的題目")
        
    count = 0
    try:
        for q in questions:
            # 檢查是否已存在於該計畫中 (避免重複匯入)
            exists = db.query(models.Question).filter(
                models.Question.plan_id == plan_id,
                models.Question.content == q.content
            ).first()
            
            if exists:
                continue

            # 複製一份到 Question 表
            new_q = models.Question(
                plan_id=plan_id,
                content=q.content,
                question_type=q.question_type,
                options=q.options,
                answer=q.answer,
                hint=q.hint,  # 包含提示欄位
                points=10 # 預設分數
            )
            db.add(new_q)
            count += 1
            
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"匯入失敗: {str(e)}")
        
    return {
        "message": f"匯入完成", 
        "imported": count,
        "duplicate": len(questions) - count,
        "failed": 0
    }
