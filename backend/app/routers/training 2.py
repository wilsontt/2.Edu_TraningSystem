from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List
from datetime import date
from .. import models, schemas
from ..database import get_db
from .auth import check_permission

router = APIRouter(prefix="/training", tags=["training"])

# --- Training Plan CRUD ---
@router.post("/plans", response_model=schemas.TrainingPlan)
def create_training_plan(
    plan: schemas.TrainingPlanCreate,
    db: Session = Depends(get_db),
    current_user = check_permission("menu:plan")
):
    """建立新的訓練計畫"""
    # 從 training_date 提取年份
    year = str(plan.training_date.year)
    
    # 檢查 sub_category 是否存在
    sub_cat = db.query(models.SubCategory).filter(models.SubCategory.id == plan.sub_category_id).first()
    if not sub_cat:
        raise HTTPException(status_code=404, detail="細項目不存在")
    
    # 檢查 department 是否存在
    dept = db.query(models.Department).filter(models.Department.id == plan.dept_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="單位不存在")
    
    db_plan = models.TrainingPlan(
        title=plan.title,
        sub_category_id=plan.sub_category_id,
        dept_id=plan.dept_id,
        training_date=plan.training_date,
        year=year,
        timer_enabled=plan.timer_enabled,
        time_limit=plan.time_limit
    )
    
    db.add(db_plan)
    try:
        db.commit()
        db.refresh(db_plan)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="建立訓練計畫失敗")
    
    return db_plan

@router.get("/plans", response_model=List[schemas.TrainingPlan])
def get_training_plans(
    db: Session = Depends(get_db),
    current_user = check_permission("menu:plan")
):
    """獲取訓練計畫清單"""
    return db.query(models.TrainingPlan).all()
