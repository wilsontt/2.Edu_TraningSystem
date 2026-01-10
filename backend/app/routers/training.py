from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from datetime import date
import qrcode
import base64
import os
from io import BytesIO
from .. import models, schemas
from ..database import get_db
from .auth import check_permission

router = APIRouter(prefix="/training", tags=["training"])

# --- 訓練計畫管理 ---
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
        passing_score=plan.passing_score,
        expected_attendance=plan.expected_attendance
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
    # 檢查開始日期是否變更，且是否已有考試紀錄
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
    db_plan.expected_attendance = plan_update.expected_attendance
    
    # 若有提供受課單位則更新
    if plan_update.target_dept_ids:
        target_depts = db.query(models.Department).filter(models.Department.id.in_(plan_update.target_dept_ids)).all()
        db_plan.target_departments = target_depts
    elif not db_plan.target_departments:
         # 正常情況不應發生，若無提供則略過
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

# --- 報到統計與應到人數管理 ---

@router.get("/plans/{plan_id}/attendance/stats", response_model=schemas.AttendanceStats)
def get_attendance_stats(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user = check_permission("menu:plan")
):
    """取得該計畫的報到統計"""
    # 檢查計畫是否存在
    plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="訓練計畫不存在")
    
    # 計算實到人數
    actual_count = db.query(func.count(models.AttendanceRecord.id)).filter(
        models.AttendanceRecord.plan_id == plan_id
    ).scalar() or 0
    
    # 取得應到人數（如果未設定則計算）
    if plan.expected_attendance is not None:
        expected_count = plan.expected_attendance
    else:
        # 根據受課對象部門自動計算
        if plan.target_departments:
            dept_ids = [dept.id for dept in plan.target_departments]
            expected_count = db.query(func.count(models.User.emp_id)).filter(
                models.User.dept_id.in_(dept_ids),
                models.User.status == "active"
            ).scalar() or 0
        else:
            expected_count = 0
    
    # 計算出席率
    attendance_rate = (actual_count / expected_count * 100) if expected_count > 0 else 0.0
    
    # 取得已報到用戶列表
    checked_in_records = db.query(models.AttendanceRecord).filter(
        models.AttendanceRecord.plan_id == plan_id
    ).join(models.User, models.AttendanceRecord.emp_id == models.User.emp_id).all()
    
    checked_in_users = []
    checked_in_emp_ids = set()
    for record in checked_in_records:
        user = record.user
        checked_in_users.append({
            "emp_id": user.emp_id,
            "name": user.name,
            "dept_name": user.department.name if user.department else "未知",
            "checkin_time": record.checkin_time.isoformat()
        })
        checked_in_emp_ids.add(user.emp_id)
    
    # 取得未報到用戶列表
    not_checked_in_users = []
    if plan.target_departments:
        dept_ids = [dept.id for dept in plan.target_departments]
        all_target_users = db.query(models.User).filter(
            models.User.dept_id.in_(dept_ids),
            models.User.status == "active"
        ).all()
        
        for user in all_target_users:
            if user.emp_id not in checked_in_emp_ids:
                not_checked_in_users.append({
                    "emp_id": user.emp_id,
                    "name": user.name,
                    "dept_name": user.department.name if user.department else "未知"
                })
    
    return {
        "plan_id": plan_id,
        "expected_count": expected_count,
        "actual_count": actual_count,
        "attendance_rate": round(attendance_rate, 2),
        "checked_in_users": checked_in_users,
        "not_checked_in_users": not_checked_in_users
    }

@router.put("/plans/{plan_id}/expected-attendance")
def update_expected_attendance(
    plan_id: int,
    update: schemas.ExpectedAttendanceUpdate,
    db: Session = Depends(get_db),
    current_user = check_permission("menu:plan")
):
    """手動設定應到人數"""
    plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="訓練計畫不存在")
    
    if update.expected_attendance < 0:
        raise HTTPException(status_code=400, detail="應到人數不能為負數")
    
    plan.expected_attendance = update.expected_attendance
    try:
        db.commit()
        db.refresh(plan)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"更新應到人數失敗：{str(e)}")
    
    return {"success": True, "expected_attendance": plan.expected_attendance}

@router.get("/plans/{plan_id}/calculate-expected-attendance", response_model=schemas.CalculatedAttendance)
def calculate_expected_attendance(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user = check_permission("menu:plan")
):
    """根據受課對象部門自動計算應到人數"""
    plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="訓練計畫不存在")
    
    if not plan.target_departments:
        return {"calculated_count": 0}
    
    dept_ids = [dept.id for dept in plan.target_departments]
    calculated_count = db.query(func.count(models.User.emp_id)).filter(
        models.User.dept_id.in_(dept_ids),
        models.User.status == "active"
    ).scalar() or 0
    
    return {"calculated_count": calculated_count}

# --- 報到 QRcode 生成 ---

def generate_checkin_qrcode_image(url: str) -> str:
    """生成報到 QRcode 圖片並返回 Base64 編碼的圖片 URL"""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    
    # 將圖片轉換為 Base64
    buffered = BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode()
    
    return f"data:image/png;base64,{img_str}"

@router.post("/plans/{plan_id}/checkin-qrcode/generate")
def generate_checkin_qrcode(
    plan_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user = check_permission("menu:plan")  # Admin 或 menu:plan 權限
):
    """產生報到 QRcode（用於訓練計畫報到）"""
    # 檢查計畫是否存在
    plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="訓練計畫不存在")
    
    # 構建報到 URL（動態 URL，非固定 IP）
    # 優先使用環境變數 FRONTEND_URL
    frontend_url = os.getenv("FRONTEND_URL")
    
    if frontend_url:
        base_url = frontend_url.rstrip("/")
    else:
        # 自動從請求中推斷前端 URL
        host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
        scheme = request.headers.get("x-forwarded-proto") or request.url.scheme
        base_url = f"{scheme}://{host}"
        if "/api" in base_url:
            base_url = base_url.split("/api")[0]
    
    # 報到 URL：前端路由，用戶掃描後會導向報到頁面
    # 用戶需要先登入才能報到（如果未登入會導向登入頁面）
    checkin_url = f"{base_url}/checkin?plan_id={plan_id}"
    
    # 生成 QRcode 圖片
    qrcode_image = generate_checkin_qrcode_image(checkin_url)
    
    return {
        "plan_id": plan_id,
        "plan_title": plan.title,
        "qrcode_url": qrcode_image,
        "checkin_url": checkin_url  # 也返回 URL 供複製使用
    }
