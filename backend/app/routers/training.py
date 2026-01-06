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
        end_date=plan.end_date,
        year=year,
        timer_enabled=plan.timer_enabled,
        time_limit=plan.time_limit,
        passing_score=plan.passing_score
    )
    
    # 處理受課單位
    if plan.target_dept_ids:
        target_depts = db.query(models.Department).filter(models.Department.id.in_(plan.target_dept_ids)).all()
        db_plan.target_departments = target_depts
    else:
        # 預設為開課單位
        db_plan.target_departments = [dept]
    
    db.add(db_plan)
    try:
        db.commit()
        db.refresh(db_plan)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="建立訓練計畫失敗")
    
    return db_plan

@router.put("/plans/{plan_id}", response_model=schemas.TrainingPlan)
def update_training_plan(
    plan_id: int,
    plan_update: schemas.TrainingPlanCreate,
    db: Session = Depends(get_db),
    current_user = check_permission("menu:plan")
):
    """更新訓練計畫"""
    db_plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == plan_id).first()
    if not db_plan:
        raise HTTPException(status_code=404, detail="訓練計畫不存在")

    # update fields
    # Check if start date is changed and if exams have started
    if db_plan.training_date != plan_update.training_date:
        if db_plan.exam_records:
             raise HTTPException(status_code=400, detail="已有學員開始考試，無法變更開始日期")
             
    db_plan.title = plan_update.title
    db_plan.sub_category_id = plan_update.sub_category_id
    db_plan.dept_id = plan_update.dept_id
    db_plan.training_date = plan_update.training_date
    db_plan.end_date = plan_update.end_date
    db_plan.year = str(plan_update.training_date.year)
    db_plan.timer_enabled = plan_update.timer_enabled
    db_plan.time_limit = plan_update.time_limit
    db_plan.passing_score = plan_update.passing_score
    
    # Update target departments if provided
    if plan_update.target_dept_ids:
        target_depts = db.query(models.Department).filter(models.Department.id.in_(plan_update.target_dept_ids)).all()
        db_plan.target_departments = target_depts
    elif not db_plan.target_departments:
         # Should not happen typically, but ensure at least host dept is there if empty? 
         # Or stick to existing if not provided? Use list from frontend.
         # Assuming frontend sends full list on update.
         pass
    
    try:
        db.commit()
        db.refresh(db_plan)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="更新訓練計畫失敗")
    return db_plan

@router.get("/plans", response_model=List[schemas.TrainingPlan])
def get_training_plans(
    db: Session = Depends(get_db),
    current_user = check_permission("menu:plan")
):
    """獲取訓練計畫清單"""
    return db.query(models.TrainingPlan).order_by(models.TrainingPlan.training_date.desc()).all()
