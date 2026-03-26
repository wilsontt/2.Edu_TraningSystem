from fastapi import APIRouter, HTTPException, Depends, Request, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_, and_
from typing import List, Optional
from datetime import date, datetime
import qrcode
import base64
import os
from io import BytesIO
from .. import models, schemas
from ..database import get_db
from .auth import check_permission, check_any_permission

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
    
    # 處理個人受課對象
    if plan.target_user_ids:
        target_users = db.query(models.User).filter(models.User.emp_id.in_(plan.target_user_ids)).all()
        db_plan.target_users = target_users
    
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
    
    # 處理個人受課對象
    if plan_update.target_user_ids is not None:
        target_users = db.query(models.User).filter(models.User.emp_id.in_(plan_update.target_user_ids)).all()
        db_plan.target_users = target_users
    
    try:
        db.commit()
        db.refresh(db_plan)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="更新訓練計畫失敗")
    return db_plan

@router.get("/plans", response_model=List[schemas.TrainingPlan])
def get_training_plans(
    status: Optional[str] = Query(None, description="狀態篩選: active, expired, archived, all (預設: 不過濾狀態，只過濾封存)"),
    year: Optional[str] = Query(None, description="年份篩選"),
    dept_id: Optional[int] = Query(None, description="單位篩選"),
    category_id: Optional[int] = Query(None, description="分類篩選 (sub_category_id)"),
    db: Session = Depends(get_db),
    current_user=check_any_permission(["menu:plan", "menu:attendance-overview"]),
):
    """獲取訓練計畫清單，支援狀態、年份、單位、分類篩選
    
    預設行為：只過濾掉已封存的計畫，不過濾過期狀態（為了向後兼容）
    使用 status 參數可以進一步篩選狀態
    """
    query = db.query(models.TrainingPlan)
    
    today = date.today()
    
    # 根據狀態篩選
    if status == "active":
        query = query.filter(
            models.TrainingPlan.is_archived == False,
            or_(
                models.TrainingPlan.end_date >= today,
                models.TrainingPlan.end_date.is_(None)
            )
        )
    elif status == "expired":
        query = query.filter(
            models.TrainingPlan.is_archived == False,
            models.TrainingPlan.end_date < today
        )
    elif status == "archived":
        query = query.filter(models.TrainingPlan.is_archived == True)
    elif status == "all":
        # 不過濾封存狀態
        pass
    else:
        # 預設：只過濾掉已封存的計畫，不過濾過期狀態（向後兼容）
        query = query.filter(models.TrainingPlan.is_archived == False)
    
    # 年份篩選
    if year:
        query = query.filter(models.TrainingPlan.year == year)
    
    # 單位篩選
    if dept_id:
        query = query.filter(models.TrainingPlan.dept_id == dept_id)
    
    # 分類篩選
    if category_id:
        query = query.filter(models.TrainingPlan.sub_category_id == category_id)
    
    # 使用 joinedload 載入 sub_category 關聯，避免 N+1 查詢問題
    return query.options(joinedload(models.TrainingPlan.sub_category)).order_by(models.TrainingPlan.training_date.desc()).all()

@router.delete("/plans/{plan_id}")
def delete_training_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user = check_permission("menu:plan")
):
    """刪除訓練計畫"""
    db_plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == plan_id).first()
    if not db_plan:
        raise HTTPException(status_code=404, detail="訓練計畫不存在")
    
    # 檢查是否有考試記錄
    exam_records_count = db.query(models.ExamRecord).filter(models.ExamRecord.plan_id == plan_id).count()
    if exam_records_count > 0:
        raise HTTPException(status_code=400, detail=f"該計畫有 {exam_records_count} 筆考試記錄，無法刪除")
    
    # 檢查是否有報到記錄
    attendance_count = db.query(models.AttendanceRecord).filter(models.AttendanceRecord.plan_id == plan_id).count()
    if attendance_count > 0:
        raise HTTPException(status_code=400, detail=f"該計畫有 {attendance_count} 筆報到記錄，無法刪除")
    
    try:
        db.delete(db_plan)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="刪除訓練計畫失敗")
    
    return {"message": "訓練計畫已刪除"}

@router.post("/plans/{plan_id}/archive", response_model=schemas.TrainingPlan)
def archive_training_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user = check_permission("menu:plan")
):
    """封存訓練計畫"""
    db_plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == plan_id).first()
    if not db_plan:
        raise HTTPException(status_code=404, detail="訓練計畫不存在")
    
    if db_plan.is_archived:
        raise HTTPException(status_code=400, detail="該計畫已經被封存")
    
    db_plan.is_archived = True
    try:
        db.commit()
        db.refresh(db_plan)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="封存訓練計畫失敗")
    
    return db_plan

@router.post("/plans/{plan_id}/unarchive", response_model=schemas.TrainingPlan)
def unarchive_training_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user = check_permission("menu:plan")
):
    """取消封存訓練計畫"""
    db_plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == plan_id).first()
    if not db_plan:
        raise HTTPException(status_code=404, detail="訓練計畫不存在")
    
    if not db_plan.is_archived:
        raise HTTPException(status_code=400, detail="該計畫未被封存")
    
    db_plan.is_archived = False
    try:
        db.commit()
        db.refresh(db_plan)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="取消封存訓練計畫失敗")
    
    return db_plan

@router.get("/plans/archived", response_model=List[schemas.TrainingPlan])
def get_archived_plans(
    db: Session = Depends(get_db),
    current_user = check_permission("menu:plan")
):
    """查詢已封存的訓練計畫"""
    return db.query(models.TrainingPlan).filter(
        models.TrainingPlan.is_archived == True
    ).order_by(models.TrainingPlan.training_date.desc()).all()

# --- 報到統計與應到人數管理 ---

@router.get("/plans/{plan_id}/attendance/stats", response_model=schemas.AttendanceStats)
def get_attendance_stats(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user=check_any_permission(["menu:plan", "menu:attendance-overview"]),
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
        # 根據受課對象部門和個人自動計算
        expected_count = 0
        
        # 計算部門人數
        if plan.target_departments:
            dept_ids = [dept.id for dept in plan.target_departments]
            dept_user_count = db.query(func.count(models.User.emp_id)).filter(
                models.User.dept_id.in_(dept_ids),
                models.User.status == "active"
            ).scalar() or 0
            expected_count += dept_user_count
        
        # 計算個人受課對象人數（排除已在部門中的）
        if plan.target_users:
            # 如果沒有部門，直接計算個人數量
            if not plan.target_departments:
                expected_count = len([u for u in plan.target_users if u.status == "active"])
            else:
                # 如果有部門，只計算不在部門中的個人
                dept_ids = [dept.id for dept in plan.target_departments]
                dept_user_ids = set(
                    db.query(models.User.emp_id).filter(
                        models.User.dept_id.in_(dept_ids),
                        models.User.status == "active"
                    ).all()
                )
                dept_user_ids = {uid[0] for uid in dept_user_ids}
                # 計算個人受課對象中不在部門的
                personal_count = len([u for u in plan.target_users if u.status == "active" and u.emp_id not in dept_user_ids])
                expected_count += personal_count
    
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
    all_target_user_ids = set()
    
    # 從部門取得用戶
    if plan.target_departments:
        dept_ids = [dept.id for dept in plan.target_departments]
        dept_users = db.query(models.User).filter(
            models.User.dept_id.in_(dept_ids),
            models.User.status == "active"
        ).all()
        for user in dept_users:
            all_target_user_ids.add(user.emp_id)
    
    # 從個人受課對象取得用戶
    if plan.target_users:
        for user in plan.target_users:
            if user.status == "active":
                all_target_user_ids.add(user.emp_id)
    
    # 取得所有目標用戶
    all_target_users = db.query(models.User).filter(
        models.User.emp_id.in_(list(all_target_user_ids)),
        models.User.status == "active"
    ).all()
    
    # 查詢已填寫的未到原因
    absence_reasons = {}
    reason_rows = db.query(models.AttendanceAbsenceReason).filter(
        models.AttendanceAbsenceReason.plan_id == plan_id
    ).all()
    for r in reason_rows:
        absence_reasons[r.emp_id] = {"reason_code": r.reason_code, "reason_text": r.reason_text}

    for user in all_target_users:
        if user.emp_id not in checked_in_emp_ids:
            item = {
                "emp_id": user.emp_id,
                "name": user.name,
                "dept_name": user.department.name if user.department else "未知"
            }
            if user.emp_id in absence_reasons:
                item["absence_reason_code"] = absence_reasons[user.emp_id]["reason_code"]
                item["absence_reason_text"] = absence_reasons[user.emp_id]["reason_text"]
            not_checked_in_users.append(item)

    leave_count = sum(1 for u in not_checked_in_users if u.get("absence_reason_code"))
    absent_without_reason_count = len(not_checked_in_users) - leave_count
    
    return {
        "plan_id": plan_id,
        "expected_count": expected_count,
        "actual_count": actual_count,
        "attendance_rate": round(attendance_rate, 2),
        "leave_count": leave_count,
        "absent_without_reason_count": absent_without_reason_count,
        "checked_in_users": checked_in_users,
        "not_checked_in_users": not_checked_in_users
    }


def _user_has_function_code(current_user: models.User, code: str) -> bool:
    if not current_user.role or not current_user.role.functions:
        return False
    return any(f.code == code for f in current_user.role.functions)


def _can_edit_absence_reason(current_user: models.User, absent_emp_id: str, db: Session) -> bool:
    """擁有報到總覽權限、Admin／系統管理者、或部門主管（同部門未到同仁）可填寫未報到原因。"""
    role_name = current_user.role.name if current_user.role else ""
    if role_name in ("Admin", "System Admin", "系統管理", "系統管理者"):
        return True
    if _user_has_function_code(current_user, "menu:attendance-overview"):
        return True
    if current_user.job_title and current_user.job_title.name == "主管":
        absent_user = db.query(models.User).filter(models.User.emp_id == absent_emp_id).first()
        if absent_user and current_user.dept_id is not None and absent_user.dept_id == current_user.dept_id:
            return True
    return False


@router.put("/plans/{plan_id}/attendance/absence-reason")
def update_absence_reason(
    plan_id: int,
    body: schemas.AbsenceReasonUpdate,
    db: Session = Depends(get_db),
    current_user=check_any_permission(["menu:plan", "menu:attendance-overview"]),
):
    """填寫或更新未報到者的原因。擁有報到總覽或訓練計畫權限者，依角色規則可填寫。"""
    plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="訓練計畫不存在")
    if plan.is_archived:
        raise HTTPException(status_code=400, detail="已封存的訓練計畫無法編輯未到原因")
    if not _can_edit_absence_reason(current_user, body.emp_id, db):
        raise HTTPException(status_code=403, detail="僅部門主管（同部門）、擁有報到總覽權限者、或 Admin、系統管理者可填寫未報到原因")
    if body.reason_code == "other" and not (body.reason_text or "").strip():
        raise HTTPException(status_code=400, detail="選擇「其他」時請填寫原因說明")
    allowed_codes = {"sick_leave", "business_trip", "official_leave", "other"}
    if body.reason_code not in allowed_codes:
        raise HTTPException(status_code=400, detail="無效的未到原因代碼")
    existing = db.query(models.AttendanceAbsenceReason).filter(
        models.AttendanceAbsenceReason.plan_id == plan_id,
        models.AttendanceAbsenceReason.emp_id == body.emp_id
    ).first()
    if existing:
        existing.reason_code = body.reason_code
        existing.reason_text = body.reason_text
        existing.recorded_by = current_user.emp_id
        existing.recorded_at = datetime.utcnow()
    else:
        new_rec = models.AttendanceAbsenceReason(
            plan_id=plan_id,
            emp_id=body.emp_id,
            reason_code=body.reason_code,
            reason_text=body.reason_text,
            recorded_by=current_user.emp_id
        )
        db.add(new_rec)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"儲存未到原因失敗：{str(e)}")
    return {"success": True}


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
    """根據受課對象部門和個人自動計算應到人數"""
    plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="訓練計畫不存在")
    
    calculated_count = 0
    all_target_user_ids = set()
    
    # 計算部門人數
    if plan.target_departments:
        dept_ids = [dept.id for dept in plan.target_departments]
        dept_users = db.query(models.User).filter(
            models.User.dept_id.in_(dept_ids),
            models.User.status == "active"
        ).all()
        for user in dept_users:
            all_target_user_ids.add(user.emp_id)
    
    # 計算個人受課對象人數（排除已在部門中的）
    if plan.target_users:
        # 如果沒有部門，直接計算個人數量
        if not plan.target_departments:
            calculated_count = len([u for u in plan.target_users if u.status == "active"])
        else:
            # 如果有部門，只計算不在部門中的個人
            dept_ids = [dept.id for dept in plan.target_departments]
            dept_user_ids = set(
                db.query(models.User.emp_id).filter(
                    models.User.dept_id.in_(dept_ids),
                    models.User.status == "active"
                ).all()
            )
            dept_user_ids = {uid[0] for uid in dept_user_ids}
            # 計算個人受課對象中不在部門的
            personal_count = len([u for u in plan.target_users if u.status == "active" and u.emp_id not in dept_user_ids])
            calculated_count = len(all_target_user_ids) + personal_count
    else:
        calculated_count = len(all_target_user_ids)
    
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
