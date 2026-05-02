"""
報表與統計模組路由 (Report Router)
負責處理管理端的成績統計、部門績效分析、訓練計畫概覽以及 PDF 成績單的批次導出邏輯。
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import func, case, and_, or_, extract, select, Integer
from typing import List, Optional
from datetime import datetime, date, timedelta
from zoneinfo import ZoneInfo
from urllib.parse import quote
from .. import models, schemas
from ..database import get_db
from .auth import check_permission
from ..access_scope import get_scope_emp_ids, apply_emp_scope as apply_emp_scope_field

router = APIRouter(prefix="/admin/reports", tags=["reports"])

def _get_report_scope_emp_ids(db: Session, current_user: models.User):
    return get_scope_emp_ids(db, current_user, active_only=False)


def _apply_emp_scope(query, emp_ids):
    return apply_emp_scope_field(query, models.ExamRecord.emp_id, emp_ids)


def _training_plan_status_filter_expr(status: str):
    """
    與 GET /training/plans 的 status 參數語意一致（active／expired／archived）。
    """
    today = date.today()
    if status == "active":
        return and_(
            models.TrainingPlan.is_archived == False,
            or_(
                models.TrainingPlan.end_date >= today,
                models.TrainingPlan.end_date.is_(None),
            ),
        )
    if status == "expired":
        return and_(
            models.TrainingPlan.is_archived == False,
            models.TrainingPlan.end_date < today,
        )
    if status == "archived":
        return models.TrainingPlan.is_archived == True
    raise HTTPException(
        status_code=400,
        detail="plan_status 必須為 active、expired 或 archived",
    )


@router.get("/print/plan-options")
def get_print_plan_options(
    db: Session = Depends(get_db),
    current_user=check_permission("menu:report")
):
    """
    成績列印可選訓練計畫（依可視範圍過濾）。
    """
    emp_scope_ids = _get_report_scope_emp_ids(db, current_user)
    query = db.query(
        models.TrainingPlan.id,
        models.TrainingPlan.title,
        models.TrainingPlan.training_date
    ).join(
        models.ExamRecord, models.TrainingPlan.id == models.ExamRecord.plan_id
    )
    if emp_scope_ids is not None:
        if not emp_scope_ids:
            return []
        query = query.filter(models.ExamRecord.emp_id.in_(emp_scope_ids))

    rows = query.distinct(models.TrainingPlan.id).order_by(models.TrainingPlan.training_date.desc()).all()
    return [
        {
            "plan_id": r.id,
            "plan_title": r.title,
            "training_date": r.training_date.isoformat() if r.training_date else None,
        }
        for r in rows
    ]


@router.get("/department/{dept_id}/print-plan-options")
def get_dept_print_plan_options(
    dept_id: int,
    plan_status: str = Query("active"),
    db: Session = Depends(get_db),
    current_user=check_permission("menu:report"),
):
    """取得部門可列印的訓練計畫選項（依狀態篩選）。"""
    allowed_emp_ids = _get_report_scope_emp_ids(db, current_user)
    if allowed_emp_ids is not None:
        dept_emp_ids = {
            r[0]
            for r in db.query(models.User.emp_id)
            .filter(models.User.dept_id == dept_id)
            .all()
        }
        if not dept_emp_ids.intersection(set(allowed_emp_ids)):
            raise HTTPException(status_code=403, detail="您沒有查看此部門的權限")

    status_filter = _training_plan_status_filter_expr(plan_status)
    dept_exam_plan_sq = (
        db.query(models.ExamRecord.plan_id)
        .join(models.User, models.ExamRecord.emp_id == models.User.emp_id)
        .filter(models.User.dept_id == dept_id)
        .subquery()
    )
    rows = (
        db.query(
            models.TrainingPlan.id,
            models.TrainingPlan.title,
            models.TrainingPlan.training_date,
        )
        .filter(
            status_filter,
            or_(
                models.TrainingPlan.id.in_(
                    select(models.plan_target_departments.c.plan_id).where(
                        models.plan_target_departments.c.dept_id == dept_id
                    )
                ),
                models.TrainingPlan.id.in_(dept_exam_plan_sq),
            ),
        )
        .distinct()
        .order_by(models.TrainingPlan.training_date.desc())
        .all()
    )
    return [
        {
            "plan_id": r.id,
            "plan_title": r.title,
            "training_date": r.training_date.isoformat() if r.training_date else None,
        }
        for r in rows
    ]


@router.get("/department/{dept_id}/print-members")
def get_dept_print_members(
    dept_id: int,
    plan_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user=check_permission("menu:report"),
):
    """取得部門成員名單（以 User 為主），含指定計畫最後一次考試與出席狀態。"""
    allowed_emp_ids = _get_report_scope_emp_ids(db, current_user)

    users_q = db.query(models.User).filter(
        models.User.dept_id == dept_id,
        models.User.status == "active",
    )
    if allowed_emp_ids is not None:
        if not allowed_emp_ids:
            return []
        users_q = users_q.filter(models.User.emp_id.in_(allowed_emp_ids))

    users = users_q.order_by(models.User.name).all()
    if not users:
        return []

    emp_ids = [u.emp_id for u in users]

    # 每人最後一次考試（submit_time 最大值）
    last_subq = (
        db.query(
            models.ExamRecord.emp_id,
            func.max(models.ExamRecord.submit_time).label("last_submit_time"),
        )
        .filter(
            models.ExamRecord.plan_id == plan_id,
            models.ExamRecord.emp_id.in_(emp_ids),
        )
        .group_by(models.ExamRecord.emp_id)
        .subquery()
    )
    exam_rows = (
        db.query(models.ExamRecord)
        .join(
            last_subq,
            and_(
                models.ExamRecord.emp_id == last_subq.c.emp_id,
                models.ExamRecord.submit_time == last_subq.c.last_submit_time,
                models.ExamRecord.plan_id == plan_id,
            ),
        )
        .all()
    )
    exam_map = {r.emp_id: r for r in exam_rows}

    att_rows = (
        db.query(models.AttendanceRecord)
        .filter(
            models.AttendanceRecord.plan_id == plan_id,
            models.AttendanceRecord.emp_id.in_(emp_ids),
        )
        .all()
    )
    att_dict = {r.emp_id: r for r in att_rows}

    reason_code_map = {
        "sick_leave": "病假",
        "business_trip": "出差",
        "official_leave": "公假",
        "other": "其他",
    }
    abs_rows = (
        db.query(models.AttendanceAbsenceReason)
        .filter(
            models.AttendanceAbsenceReason.plan_id == plan_id,
            models.AttendanceAbsenceReason.emp_id.in_(emp_ids),
        )
        .all()
    )
    abs_label_map: dict = {}
    abs_obj_map: dict = {}
    for r in abs_rows:
        label = reason_code_map.get(r.reason_code, r.reason_code)
        if r.reason_code == "other" and r.reason_text:
            label = r.reason_text
        abs_label_map[r.emp_id] = label
        abs_obj_map[r.emp_id] = r

    result = []
    for u in users:
        exam = exam_map.get(u.emp_id)
        att_record = att_dict.get(u.emp_id)
        absence = abs_label_map.get(u.emp_id)
        abs_record = abs_obj_map.get(u.emp_id)

        if exam:
            att_status = "已考試"
        elif att_record:
            att_status = "已報到/未完成"
        else:
            reason_part = f"（{absence}）" if absence else ""
            att_status = f"未應考{reason_part}"

        result.append(
            {
                "emp_id": u.emp_id,
                "name": u.name,
                "last_submit_time": (
                    exam.submit_time.isoformat() if exam and exam.submit_time else None
                ),
                "last_score": exam.total_score if exam else None,
                "is_passed": exam.is_passed if exam else None,
                "attendance_status": att_status,
                "absence_reason": absence,
                "check_in_time": (
                    att_record.checkin_time.isoformat()
                    if att_record and att_record.checkin_time
                    else None
                ),
                "absence_recorded_at": (
                    abs_record.recorded_at.isoformat()
                    if abs_record and abs_record.recorded_at
                    else None
                ),
            }
        )
    return result


# --- 總覽統計 ---
@router.get("/overview")
def get_overview_statistics(
    db: Session = Depends(get_db),
    current_user = check_permission("menu:report"),
    year: Optional[int] = Query(None, description="年度篩選（例如：2026）"),
    month: Optional[int] = Query(None, description="月份篩選（1-12），需配合 year 使用"),
    quarter: Optional[int] = Query(None, description="季度篩選（1-4），需配合 year 使用"),
    plan_status: str = Query(
        "active",
        description="訓練計畫狀態：active／expired／archived（與訓練計畫管理相同）",
    ),
):
    """
    獲取總體統計數據:
    - 總考試場次
    - 總應考人次
    - 平均分數
    - 總體及格率
    - 本月新增考試場次
    - 本月應考人次
    - 待考試人數
    - 平均作答時間
    - 完成率
    - 補考率
    """
    # 取得當前時間
    now = datetime.now()
    current_year = now.year
    current_month = now.month
    
    # 計算時間篩選條件
    time_filter = None
    try:
        if year and month:
            # 指定年月
            if not (1 <= month <= 12):
                raise HTTPException(status_code=400, detail="月份必須在 1-12 之間")
            start_datetime = datetime(year, month, 1, 0, 0, 0)
            if month == 12:
                end_datetime = datetime(year + 1, 1, 1, 0, 0, 0) - timedelta(seconds=1)
            else:
                end_datetime = datetime(year, month + 1, 1, 0, 0, 0) - timedelta(seconds=1)
            time_filter = and_(
                models.ExamRecord.submit_time >= start_datetime,
                models.ExamRecord.submit_time <= end_datetime
            )
        elif year and quarter:
            # 指定年度季度
            if not (1 <= quarter <= 4):
                raise HTTPException(status_code=400, detail="季度必須在 1-4 之間")
            quarter_start_month = (quarter - 1) * 3 + 1
            quarter_end_month = quarter * 3
            start_datetime = datetime(year, quarter_start_month, 1, 0, 0, 0)
            if quarter_end_month == 12:
                end_datetime = datetime(year + 1, 1, 1, 0, 0, 0) - timedelta(seconds=1)
            else:
                end_datetime = datetime(year, quarter_end_month + 1, 1, 0, 0, 0) - timedelta(seconds=1)
            time_filter = and_(
                models.ExamRecord.submit_time >= start_datetime,
                models.ExamRecord.submit_time <= end_datetime
            )
        elif year:
            # 指定年度
            if year < 2000 or year > 2100:
                raise HTTPException(status_code=400, detail="年度範圍不合理")
            start_datetime = datetime(year, 1, 1, 0, 0, 0)
            end_datetime = datetime(year, 12, 31, 23, 59, 59)
            time_filter = and_(
                models.ExamRecord.submit_time >= start_datetime,
                models.ExamRecord.submit_time <= end_datetime
            )
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"時間篩選參數錯誤: {str(e)}")
    
    emp_scope_ids = _get_report_scope_emp_ids(db, current_user)

    ps = (plan_status or "active").strip().lower()
    if ps not in ("active", "expired", "archived"):
        raise HTTPException(status_code=400, detail="plan_status 必須為 active、expired 或 archived")
    plan_status_expr = _training_plan_status_filter_expr(ps)

    # 本月時間範圍
    month_start_dt = datetime(current_year, current_month, 1, 0, 0, 0)
    if current_month == 12:
        month_end_dt = datetime(current_year + 1, 1, 1, 0, 0, 0) - timedelta(seconds=1)
    else:
        month_end_dt = datetime(current_year, current_month + 1, 1, 0, 0, 0) - timedelta(seconds=1)
    
    # 基礎查詢（套用時間篩選，只查詢有 submit_time 的記錄；依訓練計畫狀態篩選）
    try:
        base_query = (
            db.query(models.ExamRecord)
            .join(models.TrainingPlan, models.ExamRecord.plan_id == models.TrainingPlan.id)
            .filter(
                models.ExamRecord.submit_time.isnot(None),
                plan_status_expr,
            )
        )
        base_query = _apply_emp_scope(base_query, emp_scope_ids)
        if time_filter:
            base_query = base_query.filter(time_filter)
        
        total_records = base_query.count()
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        print(f"Error in overview query with time filter: {error_detail}")
        raise HTTPException(status_code=500, detail=f"查詢錯誤: {str(e)}")
    
    if total_records == 0:
        return {
            "total_exams": 0,
            "total_records": 0,
            "average_score": 0,
            "pass_rate": 0,
            "monthly_new_exams": 0,
            "monthly_records": 0,
            "pending_exam_count": 0,
            "avg_exam_duration": 0,
            "completion_rate": 0,
            "retake_rate": 0
        }

    # 總考試場次 (以有產生成績的計畫數計算)
    distinct_plans = base_query.with_entities(models.ExamRecord.plan_id).distinct().count()
    
    # 平均分數
    avg_score = base_query.with_entities(func.avg(models.ExamRecord.total_score)).scalar() or 0
    
    # 及格率
    passed_count = base_query.filter(models.ExamRecord.is_passed == True).count()
    pass_rate = (passed_count / total_records) * 100 if total_records > 0 else 0
    
    # 本月新增考試場次（使用 training_date 判斷本月新增的計畫）
    month_start_date = date(current_year, current_month, 1)
    if current_month == 12:
        month_end_date = date(current_year + 1, 1, 1) - timedelta(days=1)
    else:
        month_end_date = date(current_year, current_month + 1, 1) - timedelta(days=1)
    
    monthly_new_exams = db.query(models.TrainingPlan).filter(
        and_(
            models.TrainingPlan.training_date >= month_start_date,
            models.TrainingPlan.training_date <= month_end_date,
            plan_status_expr,
        )
    ).count()
    
    # 本月應考人次
    monthly_records = (
        _apply_emp_scope(db.query(models.ExamRecord), emp_scope_ids)
        .join(models.TrainingPlan, models.ExamRecord.plan_id == models.TrainingPlan.id)
        .filter(
            plan_status_expr,
            models.ExamRecord.submit_time >= month_start_dt,
            models.ExamRecord.submit_time <= month_end_dt,
        )
    ).count()
    
    # 待考試人數（已指派但尚未完成考試的人員數）
    # 依目前 plan_status 篩選後的計畫集合，計算應考／已完成人員（與上方成績統計同一批計畫定義）
    scoped_plans = db.query(models.TrainingPlan).filter(plan_status_expr).all()
    
    # 收集所有應考人員（從 scoped_plans 的 target_departments）
    target_user_ids = set()
    for plan in scoped_plans:
        for dept in plan.target_departments:
            for user in dept.users:
                target_user_ids.add(user.emp_id)
    
    # 找出已完成考試的人員（有 ExamRecord 且 is_passed=True）
    completed_user_ids = set()
    for plan in scoped_plans:
        records = _apply_emp_scope(db.query(models.ExamRecord), emp_scope_ids).filter(
            models.ExamRecord.plan_id == plan.id,
            models.ExamRecord.is_passed == True
        ).all()
        for record in records:
            completed_user_ids.add(record.emp_id)
    
    # 待考試人數 = 應考人員 - 已完成人員（針對每個計畫）
    # 這裡簡化計算：所有應考人員中，尚未完成任何一個有效計畫的人數
    pending_exam_count = len(target_user_ids - completed_user_ids)
    
    # 平均作答時間（秒）
    # 計算所有有 start_time 和 submit_time 的記錄的平均時間差
    records_with_time = base_query.filter(
        and_(
            models.ExamRecord.start_time.isnot(None),
            models.ExamRecord.submit_time.isnot(None)
        )
    ).all()
    
    if records_with_time:
        total_duration = 0
        for record in records_with_time:
            duration = (record.submit_time - record.start_time).total_seconds()
            total_duration += duration
        avg_exam_duration = total_duration / len(records_with_time)
    else:
        avg_exam_duration = 0
    
    # 完成率（已完成人數 / 應考人數）
    # 應考人數 = 所有 active_plans 的 target_departments 中的使用者數
    total_target_users = len(target_user_ids)
    completed_users = len(completed_user_ids)
    completion_rate = (completed_users / total_target_users * 100) if total_target_users > 0 else 0
    
    # 補考率（需要補考的人次占比）
    # 需要補考 = 有 ExamRecord 但 is_passed=False 的記錄
    retake_records = base_query.filter(models.ExamRecord.is_passed == False).count()
    retake_rate = (retake_records / total_records * 100) if total_records > 0 else 0

    return {
        "total_exams": distinct_plans,
        "total_records": total_records,
        "average_score": round(avg_score, 1),
        "pass_rate": round(pass_rate, 1),
        "monthly_new_exams": monthly_new_exams,
        "monthly_records": monthly_records,
        "pending_exam_count": pending_exam_count,
        "avg_exam_duration": round(avg_exam_duration, 0),  # 秒數，取整數
        "completion_rate": round(completion_rate, 1),
        "retake_rate": round(retake_rate, 1)
    }

# --- 部門/單位統計 ---
@router.get("/department")
def get_department_statistics(
    db: Session = Depends(get_db), 
    current_user = check_permission("menu:report"),
    year: Optional[int] = Query(None, description="年度篩選（例如：2026）"),
    month: Optional[int] = Query(None, description="月份篩選（1-12），需配合 year 使用"),
    quarter: Optional[int] = Query(None, description="季度篩選（1-4），需配合 year 使用"),
    include_advanced: bool = Query(False, description="是否包含進階分析資料"),
    plan_status: str = Query(
        "active",
        description="訓練計畫狀態：active／expired／archived（與訓練計畫管理相同）",
    ),
):
    """
    各部門與單位統計列表（T2.1 擴充版）
    - 基本統計：名稱、應考人次、平均分數、及格率
    - 進階分析（include_advanced=true）：
      - 部門排名
      - 部門完成率
      - 部門內成績分布（分數區間統計）
      - 部門內個人排名 Top 10
      - 部門成長率（與上期相比）
    """
    try:
        emp_scope_ids = _get_report_scope_emp_ids(db, current_user)
        ps = (plan_status or "active").strip().lower()
        if ps not in ("active", "expired", "archived"):
            raise HTTPException(status_code=400, detail="plan_status 必須為 active、expired 或 archived")
        plan_status_expr = _training_plan_status_filter_expr(ps)
        # 計算時間篩選條件
        time_filter = None
        if year and month:
            if not (1 <= month <= 12):
                raise HTTPException(status_code=400, detail="月份必須在 1-12 之間")
            start_datetime = datetime(year, month, 1, 0, 0, 0)
            if month == 12:
                end_datetime = datetime(year + 1, 1, 1, 0, 0, 0) - timedelta(seconds=1)
            else:
                end_datetime = datetime(year, month + 1, 1, 0, 0, 0) - timedelta(seconds=1)
            time_filter = and_(
                models.ExamRecord.submit_time >= start_datetime,
                models.ExamRecord.submit_time <= end_datetime
            )
        elif year and quarter:
            if not (1 <= quarter <= 4):
                raise HTTPException(status_code=400, detail="季度必須在 1-4 之間")
            quarter_start_month = (quarter - 1) * 3 + 1
            quarter_end_month = quarter * 3
            start_datetime = datetime(year, quarter_start_month, 1, 0, 0, 0)
            if quarter_end_month == 12:
                end_datetime = datetime(year + 1, 1, 1, 0, 0, 0) - timedelta(seconds=1)
            else:
                end_datetime = datetime(year, quarter_end_month + 1, 1, 0, 0, 0) - timedelta(seconds=1)
            time_filter = and_(
                models.ExamRecord.submit_time >= start_datetime,
                models.ExamRecord.submit_time <= end_datetime
            )
        elif year:
            if year < 2000 or year > 2100:
                raise HTTPException(status_code=400, detail="年度範圍不合理")
            start_datetime = datetime(year, 1, 1, 0, 0, 0)
            end_datetime = datetime(year, 12, 31, 23, 59, 59)
            time_filter = and_(
                models.ExamRecord.submit_time >= start_datetime,
                models.ExamRecord.submit_time <= end_datetime
            )
        
        # 基礎查詢
        base_query = db.query(
            models.Department.id,
            models.Department.name,
            func.count(models.ExamRecord.id).label("count"),
            func.avg(models.ExamRecord.total_score).label("avg_score")
        ).join(models.User, models.Department.id == models.User.dept_id)\
         .join(models.ExamRecord, models.User.emp_id == models.ExamRecord.emp_id)\
         .join(models.TrainingPlan, models.ExamRecord.plan_id == models.TrainingPlan.id)\
         .filter(
            models.ExamRecord.submit_time.isnot(None),
            plan_status_expr,
        )
        if emp_scope_ids is not None:
            if not emp_scope_ids:
                return []
            base_query = base_query.filter(models.ExamRecord.emp_id.in_(emp_scope_ids))
        
        if time_filter:
            base_query = base_query.filter(time_filter)
        
        results = base_query.group_by(models.Department.id).all()
        
        stats = []
        for r in results:
            total = r.count
            
            # 計算及格數（使用 Python 邏輯避免 case() 問題）
            dept_records_query = db.query(models.ExamRecord).join(
                models.User, models.ExamRecord.emp_id == models.User.emp_id
            ).join(
                models.TrainingPlan, models.ExamRecord.plan_id == models.TrainingPlan.id
            ).filter(
                models.User.dept_id == r.id,
                models.ExamRecord.submit_time.isnot(None),
                plan_status_expr,
            )
            if emp_scope_ids is not None:
                dept_records_query = dept_records_query.filter(models.ExamRecord.emp_id.in_(emp_scope_ids))
            if time_filter:
                dept_records_query = dept_records_query.filter(time_filter)
            
            dept_records = dept_records_query.all()
            passed = sum(1 for record in dept_records if record.is_passed == True)
            pass_rate = (passed / total * 100) if total > 0 else 0
            
            stat = {
                "dept_id": r.id,
                "name": r.name,
                "count": total,
                "avg_score": round(r.avg_score or 0, 1),
                "pass_rate": round(pass_rate, 1)
            }
            
            # 進階分析
            if include_advanced:
                # 計算完成率
                dept_users_query = db.query(models.User).filter(models.User.dept_id == r.id)
                if emp_scope_ids is not None:
                    dept_users_query = dept_users_query.filter(models.User.emp_id.in_(emp_scope_ids))
                dept_users = dept_users_query.count()
                completed_users = len(set(record.emp_id for record in dept_records if record.is_passed == True))
                completion_rate = (completed_users / dept_users * 100) if dept_users > 0 else 0
                stat["completion_rate"] = round(completion_rate, 1)
                
                # 成績分布（分數區間統計）
                score_distribution = {
                    "0-59": 0,
                    "60-69": 0,
                    "70-79": 0,
                    "80-89": 0,
                    "90-100": 0
                }
                for record in dept_records:
                    score = record.total_score
                    if score < 60:
                        score_distribution["0-59"] += 1
                    elif score < 70:
                        score_distribution["60-69"] += 1
                    elif score < 80:
                        score_distribution["70-79"] += 1
                    elif score < 90:
                        score_distribution["80-89"] += 1
                    else:
                        score_distribution["90-100"] += 1
                stat["score_distribution"] = score_distribution
                
                # 部門內個人排名 Top 10
                user_scores = {}
                for record in dept_records:
                    emp_id = record.emp_id
                    if emp_id not in user_scores:
                        user = db.query(models.User).filter(models.User.emp_id == emp_id).first()
                        user_scores[emp_id] = {
                            "emp_id": emp_id,
                            "name": user.name if user else emp_id,
                            "scores": [],
                            "avg_score": 0,
                            "count": 0
                        }
                    user_scores[emp_id]["scores"].append(record.total_score)
                
                # 計算每個人的平均分數
                for emp_id, data in user_scores.items():
                    if data["scores"]:
                        data["avg_score"] = sum(data["scores"]) / len(data["scores"])
                        data["count"] = len(data["scores"])
                
                # 排序並取 Top 10
                top_users = sorted(
                    user_scores.values(),
                    key=lambda x: x["avg_score"],
                    reverse=True
                )[:10]
                
                stat["top_users"] = [
                    {
                        "emp_id": u["emp_id"],
                        "name": u["name"],
                        "avg_score": round(u["avg_score"], 1),
                        "count": u["count"]
                    }
                    for u in top_users
                ]
                
                # 計算成長率（與上期相比）
                # 上期定義：如果指定了月份，則為上個月；如果指定了季度，則為上個季度；如果指定了年度，則為上一年
                growth_rate = None
                if year and month:
                    # 上個月
                    if month == 1:
                        prev_start = datetime(year - 1, 12, 1, 0, 0, 0)
                        prev_end = datetime(year, 1, 1, 0, 0, 0) - timedelta(seconds=1)
                    else:
                        prev_start = datetime(year, month - 1, 1, 0, 0, 0)
                        prev_end = datetime(year, month, 1, 0, 0, 0) - timedelta(seconds=1)
                elif year and quarter:
                    # 上個季度
                    if quarter == 1:
                        prev_start = datetime(year - 1, 10, 1, 0, 0, 0)
                        prev_end = datetime(year - 1, 12, 31, 23, 59, 59)
                    else:
                        prev_quarter_start_month = (quarter - 2) * 3 + 1
                        prev_quarter_end_month = (quarter - 1) * 3
                        prev_start = datetime(year, prev_quarter_start_month, 1, 0, 0, 0)
                        if prev_quarter_end_month == 12:
                            prev_end = datetime(year, 12, 31, 23, 59, 59)
                        else:
                            prev_end = datetime(year, prev_quarter_end_month + 1, 1, 0, 0, 0) - timedelta(seconds=1)
                elif year:
                    # 上一年
                    prev_start = datetime(year - 1, 1, 1, 0, 0, 0)
                    prev_end = datetime(year - 1, 12, 31, 23, 59, 59)
                else:
                    # 當前期間：本月 vs 上月
                    now = datetime.now()
                    if now.month == 1:
                        prev_start = datetime(now.year - 1, 12, 1, 0, 0, 0)
                        prev_end = datetime(now.year, 1, 1, 0, 0, 0) - timedelta(seconds=1)
                    else:
                        prev_start = datetime(now.year, now.month - 1, 1, 0, 0, 0)
                        prev_end = datetime(now.year, now.month, 1, 0, 0, 0) - timedelta(seconds=1)
                
                if growth_rate is None:
                    prev_filter = and_(
                        models.ExamRecord.submit_time >= prev_start,
                        models.ExamRecord.submit_time <= prev_end
                    )
                    prev_records = db.query(models.ExamRecord).join(
                        models.User, models.ExamRecord.emp_id == models.User.emp_id
                    ).join(
                        models.TrainingPlan, models.ExamRecord.plan_id == models.TrainingPlan.id
                    ).filter(
                        models.User.dept_id == r.id,
                        models.ExamRecord.submit_time.isnot(None),
                        plan_status_expr,
                        prev_filter
                    ).all()
                    if emp_scope_ids is not None:
                        prev_records = [pr for pr in prev_records if pr.emp_id in emp_scope_ids]
                    
                    if prev_records:
                        prev_avg = sum(r.total_score for r in prev_records) / len(prev_records)
                        current_avg = r.avg_score or 0
                        if prev_avg > 0:
                            growth_rate = ((current_avg - prev_avg) / prev_avg) * 100
                        else:
                            growth_rate = 100 if current_avg > 0 else 0
                    else:
                        growth_rate = 0
                
                stat["growth_rate"] = round(growth_rate, 1) if growth_rate is not None else None
            
            stats.append(stat)
        
        # 計算部門排名（按平均分數）
        if include_advanced:
            stats.sort(key=lambda x: x["avg_score"], reverse=True)
            for idx, stat in enumerate(stats, 1):
                stat["rank"] = idx
        
        return stats
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in department stats: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# --- 計畫統計 ---
@router.get("/plan")
def get_plan_statistics(
    db: Session = Depends(get_db),
    current_user = check_permission("menu:report"),
    plan_status: str = Query(
        "active",
        description="訓練計畫狀態：active／expired／archived（與訓練計畫管理相同）",
    ),
):
    """
    各訓練計畫統計列表
    """
    try:
        emp_scope_ids = _get_report_scope_emp_ids(db, current_user)
        ps = (plan_status or "active").strip().lower()
        if ps not in ("active", "expired", "archived"):
            raise HTTPException(status_code=400, detail="plan_status 必須為 active、expired 或 archived")
        plan_status_expr = _training_plan_status_filter_expr(ps)
        results = db.query(
            models.TrainingPlan.title,
            models.TrainingPlan.training_date,
            func.count(models.ExamRecord.id).label("count"),
            func.avg(models.ExamRecord.total_score).label("avg_score"),
            func.sum(case((models.ExamRecord.is_passed == True, 1), else_=0)).label("passed_count")
        ).join(models.ExamRecord, models.TrainingPlan.id == models.ExamRecord.plan_id)\
         .filter(plan_status_expr)
        if emp_scope_ids is not None:
            if not emp_scope_ids:
                return []
            results = results.filter(models.ExamRecord.emp_id.in_(emp_scope_ids))
        results = results.group_by(models.TrainingPlan.id).all()

        stats = []
        for r in results:
            total = r.count
            passed = r.passed_count or 0
            pass_rate = (passed / total * 100) if total > 0 else 0
            stats.append({
                "name": r.title,
                "date": r.training_date,
                "count": total,
                "avg_score": round(r.avg_score or 0, 1),
                "pass_rate": round(pass_rate, 1)
            })
        
        return stats
    except Exception as e:
        print(f"Error in plan stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- 趨勢圖表資料 ---
@router.get("/trends")
def get_trends_data(
    db: Session = Depends(get_db),
    current_user = check_permission("menu:report"),
    months: int = Query(6, ge=1, le=24, description="查詢過去幾個月的資料（1-24）")
):
    """
    獲取趨勢圖表資料:
    - 時間趨勢分析（過去 N 個月的成績趨勢）
    - 及格率變化趨勢
    - 應考人次趨勢
    """
    now = datetime.now()
    emp_scope_ids = _get_report_scope_emp_ids(db, current_user)
    results = []
    
    for i in range(months - 1, -1, -1):
        # 計算每個月的開始和結束日期
        target_date = now - timedelta(days=30 * i)
        month_start = date(target_date.year, target_date.month, 1)
        if target_date.month == 12:
            month_end = date(target_date.year + 1, 1, 1) - timedelta(days=1)
        else:
            month_end = date(target_date.year, target_date.month + 1, 1) - timedelta(days=1)
        
        month_start_dt = datetime.combine(month_start, datetime.min.time())
        month_end_dt = datetime.combine(month_end, datetime.max.time())
        
        # 查詢該月的考試記錄
        month_query = db.query(models.ExamRecord)
        month_query = _apply_emp_scope(month_query, emp_scope_ids).filter(
            and_(
                models.ExamRecord.submit_time >= month_start_dt,
                models.ExamRecord.submit_time <= month_end_dt
            )
        )
        month_records = month_query.all()
        
        if month_records:
            total_count = len(month_records)
            avg_score = sum(r.total_score for r in month_records) / total_count
            passed_count = sum(1 for r in month_records if r.is_passed)
            pass_rate = (passed_count / total_count * 100) if total_count > 0 else 0
        else:
            total_count = 0
            avg_score = 0
            pass_rate = 0
        
        results.append({
            "month": f"{target_date.year}-{target_date.month:02d}",
            "year": target_date.year,
            "month_num": target_date.month,
            "count": total_count,
            "avg_score": round(avg_score, 1),
            "pass_rate": round(pass_rate, 1)
        })
    
    return results

@router.get("/department-comparison")
def get_department_comparison(
    db: Session = Depends(get_db),
    current_user = check_permission("menu:report")
):
    """
    獲取部門對比資料:
    - 各部門平均分數對比
    - 各部門及格率對比
    - 各部門完成率對比
    """
    try:
        emp_scope_ids = _get_report_scope_emp_ids(db, current_user)
        # 取得各部門統計（不使用 case()，改用 Python 邏輯計算）
        dept_stats = db.query(
            models.Department.id,
            models.Department.name,
            func.count(models.ExamRecord.id).label("count"),
            func.avg(models.ExamRecord.total_score).label("avg_score")
        ).join(models.User, models.Department.id == models.User.dept_id)\
         .join(models.ExamRecord, models.User.emp_id == models.ExamRecord.emp_id)
        if emp_scope_ids is not None:
            if not emp_scope_ids:
                return []
            dept_stats = dept_stats.filter(models.ExamRecord.emp_id.in_(emp_scope_ids))
        dept_stats = dept_stats.group_by(models.Department.id).all()
        
        results = []
        for r in dept_stats:
            total = r.count
            
            # 使用 Python 邏輯計算及格數（避免 case() 語法問題）
            dept_records = db.query(models.ExamRecord).join(
                models.User, models.ExamRecord.emp_id == models.User.emp_id
            ).filter(
                models.User.dept_id == r.id
            ).all()
            if emp_scope_ids is not None:
                dept_records = [dr for dr in dept_records if dr.emp_id in emp_scope_ids]
            
            passed = sum(1 for record in dept_records if record.is_passed == True)
            pass_rate = (passed / total * 100) if total > 0 else 0
            
            # 計算完成率（該部門已完成考試的人數 / 應考人數）
            dept_users_query = db.query(models.User).filter(models.User.dept_id == r.id)
            if emp_scope_ids is not None:
                dept_users_query = dept_users_query.filter(models.User.emp_id.in_(emp_scope_ids))
            dept_users = dept_users_query.count()
            completed_users = db.query(models.ExamRecord).join(
                models.User, models.ExamRecord.emp_id == models.User.emp_id
            ).filter(
                models.User.dept_id == r.id,
                models.ExamRecord.is_passed == True
            )
            if emp_scope_ids is not None:
                completed_users = completed_users.filter(models.ExamRecord.emp_id.in_(emp_scope_ids))
            completed_users = completed_users.distinct(models.ExamRecord.emp_id).count()
            
            completion_rate = (completed_users / dept_users * 100) if dept_users > 0 else 0
            
            results.append({
                "department_id": r.id,
                "department_name": r.name,
                "avg_score": round(r.avg_score or 0, 1),
                "pass_rate": round(pass_rate, 1),
                "completion_rate": round(completion_rate, 1),
                "count": total
            })
        
        return results
    except Exception as e:
        print(f"Error in department comparison: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/department/{dept_id}/details")
def get_department_details(
    dept_id: int,
    db: Session = Depends(get_db),
    current_user = check_permission("menu:report"),
    sort_by: str = Query("score", description="排序欄位：score（分數）/time（時間）/name（姓名）"),
    order: str = Query("desc", description="排序方向：asc（升序）/desc（降序）"),
    page: int = Query(1, ge=1, description="頁碼"),
    page_size: int = Query(20, ge=1, le=100, description="每頁筆數")
):
    """
    獲取部門詳情（T2.3）:
    - 該部門所有成員的詳細成績列表
    - 支援排序（分數/時間/姓名）
    - 支援分頁
    """
    try:
        emp_scope_ids = _get_report_scope_emp_ids(db, current_user)
        # 檢查部門是否存在
        dept = db.query(models.Department).filter(models.Department.id == dept_id).first()
        if not dept:
            raise HTTPException(status_code=404, detail="部門不存在")
        
        # 取得該部門所有成員的考試記錄
        base_query = db.query(
            models.User.emp_id,
            models.User.name,
            models.ExamRecord.id,
            models.ExamRecord.plan_id,
            models.TrainingPlan.title.label("plan_title"),
            models.ExamRecord.total_score,
            models.ExamRecord.is_passed,
            models.ExamRecord.submit_time,
            models.ExamRecord.attempts
        ).join(
            models.ExamRecord, models.User.emp_id == models.ExamRecord.emp_id
        ).join(
            models.TrainingPlan, models.ExamRecord.plan_id == models.TrainingPlan.id
        ).filter(
            models.User.dept_id == dept_id,
            models.ExamRecord.submit_time.isnot(None)
        )
        if emp_scope_ids is not None:
            if not emp_scope_ids:
                return {"dept_id": dept_id, "dept_name": dept.name, "total": 0, "page": page, "page_size": page_size, "total_pages": 0, "records": []}
            base_query = base_query.filter(models.ExamRecord.emp_id.in_(emp_scope_ids))
        
        # 排序
        if sort_by == "score":
            order_by = models.ExamRecord.total_score.desc() if order == "desc" else models.ExamRecord.total_score.asc()
        elif sort_by == "time":
            order_by = models.ExamRecord.submit_time.desc() if order == "desc" else models.ExamRecord.submit_time.asc()
        elif sort_by == "name":
            order_by = models.User.name.desc() if order == "desc" else models.User.name.asc()
        else:
            order_by = models.ExamRecord.total_score.desc()
        
        base_query = base_query.order_by(order_by)
        
        # 分頁
        total = base_query.count()
        offset = (page - 1) * page_size
        records = base_query.offset(offset).limit(page_size).all()
        
        results = []
        for r in records:
            results.append({
                "emp_id": r.emp_id,
                "name": r.name,
                "plan_id": r.plan_id,
                "plan_title": r.plan_title,
                "total_score": r.total_score,
                "is_passed": r.is_passed,
                "submit_time": r.submit_time.isoformat() if r.submit_time else None,
                "attempts": r.attempts
            })
        
        return {
            "dept_id": dept_id,
            "dept_name": dept.name,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size,
            "records": results
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in department details: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/plan-popularity")
def get_plan_popularity(
    db: Session = Depends(get_db),
    current_user = check_permission("menu:report"),
    limit: int = Query(10, ge=1, le=50, description="回傳前 N 名計畫")
):
    """
    獲取計畫熱度資料:
    - 各計畫應考人次排行
    - 各計畫平均分數排行
    """
    try:
        emp_scope_ids = _get_report_scope_emp_ids(db, current_user)
        # 取得各計畫統計（不包括已封存的計畫）
        plan_stats = db.query(
            models.TrainingPlan.id,
            models.TrainingPlan.title,
            func.count(models.ExamRecord.id).label("count"),
            func.avg(models.ExamRecord.total_score).label("avg_score")
        ).join(models.ExamRecord, models.TrainingPlan.id == models.ExamRecord.plan_id)\
         .filter(models.TrainingPlan.is_archived == False)
        if emp_scope_ids is not None:
            if not emp_scope_ids:
                return {"popularity_ranking": [], "score_ranking": []}
            plan_stats = plan_stats.filter(models.ExamRecord.emp_id.in_(emp_scope_ids))
        plan_stats = plan_stats.group_by(models.TrainingPlan.id)\
         .order_by(func.count(models.ExamRecord.id).desc())\
         .limit(limit).all()
        
        # 按應考人次排序
        popularity_ranking = []
        for r in plan_stats:
            popularity_ranking.append({
                "plan_id": r.id,
                "plan_title": r.title,
                "count": r.count,
                "avg_score": round(r.avg_score or 0, 1)
            })
        
        # 按平均分數排序
        score_ranking = sorted(
            popularity_ranking,
            key=lambda x: x["avg_score"],
            reverse=True
        )
        
        return {
            "popularity_ranking": popularity_ranking,
            "score_ranking": score_ranking[:limit]
        }
    except Exception as e:
        print(f"Error in plan popularity: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- 即時狀態資料 ---
@router.get("/plan/{plan_id}/details")
def get_plan_details(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user = check_permission("menu:report"),
    sort_by: str = Query("score", description="排序欄位：score（分數）/time（時間）/name（姓名）"),
    order: str = Query("desc", description="排序方向：asc（升序）/desc（降序）"),
    page: int = Query(1, ge=1, description="頁碼"),
    page_size: int = Query(20, ge=1, le=100, description="每頁筆數")
):
    """
    獲取計畫詳情（T2.4）:
    - 該計畫所有考生的詳細成績列表
    - 支援排序（分數/時間/姓名）
    - 支援分頁
    """
    try:
        emp_scope_ids = _get_report_scope_emp_ids(db, current_user)
        # 檢查計畫是否存在
        plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == plan_id).first()
        if not plan:
            raise HTTPException(status_code=404, detail="計畫不存在")
        
        # 取得該計畫所有考生的考試記錄
        base_query = db.query(
            models.User.emp_id,
            models.User.name,
            models.Department.name.label("dept_name"),
            models.ExamRecord.id,
            models.ExamRecord.total_score,
            models.ExamRecord.is_passed,
            models.ExamRecord.submit_time,
            models.ExamRecord.attempts
        ).join(
            models.ExamRecord, models.User.emp_id == models.ExamRecord.emp_id
        ).join(
            models.Department, models.User.dept_id == models.Department.id
        ).filter(
            models.ExamRecord.plan_id == plan_id,
            models.ExamRecord.submit_time.isnot(None)
        )
        if emp_scope_ids is not None:
            if not emp_scope_ids:
                return {"plan_id": plan_id, "plan_title": plan.title, "total": 0, "page": page, "page_size": page_size, "total_pages": 0, "records": []}
            base_query = base_query.filter(models.ExamRecord.emp_id.in_(emp_scope_ids))
        
        # 排序
        if sort_by == "score":
            order_by = models.ExamRecord.total_score.desc() if order == "desc" else models.ExamRecord.total_score.asc()
        elif sort_by == "time":
            order_by = models.ExamRecord.submit_time.desc() if order == "desc" else models.ExamRecord.submit_time.asc()
        elif sort_by == "name":
            order_by = models.User.name.desc() if order == "desc" else models.User.name.asc()
        else:
            order_by = models.ExamRecord.total_score.desc()
        
        base_query = base_query.order_by(order_by)
        
        # 分頁
        total = base_query.count()
        offset = (page - 1) * page_size
        records = base_query.offset(offset).limit(page_size).all()
        
        results = []
        for r in records:
            results.append({
                "emp_id": r.emp_id,
                "name": r.name,
                "dept_name": r.dept_name,
                "total_score": r.total_score,
                "is_passed": r.is_passed,
                "submit_time": r.submit_time.isoformat() if r.submit_time else None,
                "attempts": r.attempts
            })
        
        return {
            "plan_id": plan_id,
            "plan_title": plan.title,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size,
            "records": results
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in plan details: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/active-exams")
def get_active_exams(
    db: Session = Depends(get_db),
    current_user = check_permission("menu:report")
):
    """
    獲取進行中的考試資料:
    - 目前可進行的考試數量
    - 進行中考試列表（含到期時間）
    """
    today = date.today()
    emp_scope_ids = _get_report_scope_emp_ids(db, current_user)
    
    # 找出所有有效的訓練計畫（今天在 training_date 和 end_date 之間，不包括已封存的）
    active_plans = db.query(models.TrainingPlan).filter(
        and_(
            models.TrainingPlan.training_date <= today,
            or_(
                models.TrainingPlan.end_date.is_(None),
                models.TrainingPlan.end_date >= today
            ),
            models.TrainingPlan.is_archived == False
        )
    ).all()
    
    results = []
    for plan in active_plans:
        # 計算應考人數
        target_user_count = 0
        for dept in plan.target_departments:
            target_user_count += len(dept.users)
        
        # 計算已完成人數
        completed_count = db.query(models.ExamRecord).filter(
            models.ExamRecord.plan_id == plan.id,
            models.ExamRecord.is_passed == True
        )
        if emp_scope_ids is not None:
            completed_count = completed_count.filter(models.ExamRecord.emp_id.in_(emp_scope_ids))
        completed_count = completed_count.distinct(models.ExamRecord.emp_id).count()
        if emp_scope_ids is not None:
            target_user_count = len([u for dept in plan.target_departments for u in dept.users if u.emp_id in emp_scope_ids])
        
        results.append({
            "plan_id": plan.id,
            "title": plan.title,
            "training_date": plan.training_date.isoformat() if plan.training_date else None,
            "end_date": plan.end_date.isoformat() if plan.end_date else None,
            "target_count": target_user_count,
            "completed_count": completed_count,
            "remaining_days": (plan.end_date - today).days if plan.end_date else None
        })
    
    return {
        "count": len(results),
        "exams": results
    }

@router.get("/expiring-soon")
def get_expiring_soon(
    db: Session = Depends(get_db),
    current_user = check_permission("menu:report"),
    days: int = Query(3, ge=1, le=30, description="幾天內到期（預設 3 天）")
):
    """
    獲取即將到期的考試提醒:
    - N 天內到期的考試提醒
    - 即將到期考試列表
    """
    today = date.today()
    emp_scope_ids = _get_report_scope_emp_ids(db, current_user)
    expiry_date = today + timedelta(days=days)
    
    # 找出即將到期的訓練計畫（不包括已封存的）
    expiring_plans = db.query(models.TrainingPlan).filter(
        and_(
            models.TrainingPlan.end_date.isnot(None),
            models.TrainingPlan.end_date >= today,
            models.TrainingPlan.end_date <= expiry_date,
            models.TrainingPlan.is_archived == False
        )
    ).all()
    
    results = []
    for plan in expiring_plans:
        # 計算應考人數
        target_user_count = 0
        for dept in plan.target_departments:
            target_user_count += len(dept.users)
        
        # 計算已完成人數
        completed_count = db.query(models.ExamRecord).filter(
            models.ExamRecord.plan_id == plan.id,
            models.ExamRecord.is_passed == True
        )
        if emp_scope_ids is not None:
            completed_count = completed_count.filter(models.ExamRecord.emp_id.in_(emp_scope_ids))
        completed_count = completed_count.distinct(models.ExamRecord.emp_id).count()
        if emp_scope_ids is not None:
            target_user_count = len([u for dept in plan.target_departments for u in dept.users if u.emp_id in emp_scope_ids])
        
        remaining_days = (plan.end_date - today).days
        
        results.append({
            "plan_id": plan.id,
            "title": plan.title,
            "end_date": plan.end_date.isoformat(),
            "remaining_days": remaining_days,
            "target_count": target_user_count,
            "completed_count": completed_count,
            "pending_count": target_user_count - completed_count
        })
    
    # 按剩餘天數排序
    results.sort(key=lambda x: x["remaining_days"])
    
    return {
        "count": len(results),
        "exams": results
    }

@router.get("/retake-needed")
def get_retake_needed(
    db: Session = Depends(get_db),
    current_user = check_permission("menu:report")
):
    """
    獲取待補考名單:
    - 未通過需補考的人員清單
    - 補考提醒資訊
    """
    # 找出所有未通過的考試記錄
    emp_scope_ids = _get_report_scope_emp_ids(db, current_user)
    failed_query = db.query(models.ExamRecord).filter(
        models.ExamRecord.is_passed == False
    )
    failed_records = _apply_emp_scope(failed_query, emp_scope_ids).all()
    
    # 按人員分組，找出每個人員需要補考的計畫
    retake_map = {}
    for record in failed_records:
        emp_id = record.emp_id
        if emp_id not in retake_map:
            user = db.query(models.User).filter(models.User.emp_id == emp_id).first()
            retake_map[emp_id] = {
                "emp_id": emp_id,
                "name": user.name if user else emp_id,
                "dept_name": user.department.name if user and user.department else "未知",
                "plans": []
            }
        
        plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == record.plan_id).first()
        if plan:
            retake_map[emp_id]["plans"].append({
                "plan_id": plan.id,
                "plan_title": plan.title,
                "score": record.total_score,
                "passing_score": plan.passing_score,
                "submit_time": record.submit_time.isoformat() if record.submit_time else None,
                "attempts": record.attempts
            })
    
    results = list(retake_map.values())
    
    return {
        "count": len(results),
        "users": results
    }

# --- PDF 匯出 ---
from fastapi.responses import StreamingResponse
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from io import BytesIO
from typing import Optional
import platform
import os
import sys
import tempfile
import json

# 嘗試導入 fontTools 來處理 TTC 檔案
try:
    from fontTools.ttLib import TTFont as FTTTFont
    FONTTOOLS_AVAILABLE = True
except ImportError:
    FONTTOOLS_AVAILABLE = False
    print("Warning: fontTools not available. TTC fonts may not work properly.")

# 全域變數：已註冊的字體名稱
_registered_chinese_font = None

# 註冊中文字體（跨平台支援）
def register_chinese_fonts():
    """註冊系統中文字體以支援中文顯示（支援 macOS、Windows、Linux）"""
    global _registered_chinese_font
    
    # 如果已經註冊過，直接返回
    if _registered_chinese_font:
        return _registered_chinese_font
    
    system = platform.system()
    font_name = "ChineseFont"
    
    try:
        # macOS 字體路徑
        if system == "Darwin":  # macOS
            font_paths = [
                # 嘗試 TTF 格式的字體（ReportLab 更相容）
                "/Library/Fonts/Microsoft/Microsoft YaHei.ttf",  # 微軟雅黑（如果安裝了 Office）
                "/System/Library/Fonts/Supplemental/STHeiti Light.ttc",  # 華文黑體
                "/System/Library/Fonts/STHeiti Light.ttc",  # 華文黑體
                "/System/Library/Fonts/STHeiti Medium.ttc",  # 華文黑體 Medium
                "/System/Library/Fonts/Supplemental/STSong.ttc",  # 華文宋體
                "/System/Library/Fonts/STSong.ttc",  # 華文宋體
                "/System/Library/Fonts/PingFang.ttc",  # 蘋方
            ]
            
            # 嘗試註冊字體
            for path in font_paths:
                if os.path.exists(path):
                    try:
                        # TTC 檔案需要特殊處理
                        if path.endswith('.ttc'):
                            if FONTTOOLS_AVAILABLE:
                                # 使用 fontTools 提取 TTC 中的第一個字體
                                try:
                                    ttc = FTTTFont(path, fontNumber=0)
                                    # 創建臨時 TTF 檔案
                                    with tempfile.NamedTemporaryFile(delete=False, suffix='.ttf') as tmp:
                                        ttc.save(tmp.name)
                                        tmp_path = tmp.name
                                    
                                    # 註冊提取的字體
                                    pdfmetrics.registerFont(TTFont(font_name, tmp_path))
                                    _registered_chinese_font = font_name
                                    print(f"Successfully registered Chinese font from TTC: {path}")
                                    return font_name
                                except Exception as e:
                                    print(f"Failed to extract font from TTC {path}: {e}")
                                    continue
                            else:
                                # 如果沒有 fontTools，嘗試使用 UnicodeCIDFont
                                try:
                                    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
                                    _registered_chinese_font = "STSong-Light"
                                    print(f"Successfully registered Chinese font: STSong-Light (CID)")
                                    return _registered_chinese_font
                                except:
                                    print(f"Failed to register TTC font as CID: {path}")
                                    continue
                        else:
                            # TTF 檔案直接註冊
                            pdfmetrics.registerFont(TTFont(font_name, path))
                            _registered_chinese_font = font_name
                            print(f"Successfully registered Chinese font: {path}")
                            return font_name
                    except Exception as e:
                        print(f"Failed to register font {path}: {e}")
                        continue
        
        # Windows 字體路徑
        elif system == "Windows":
            font_paths = [
                "C:/Windows/Fonts/msyh.ttf",  # 微軟雅黑（TTF 格式）
                "C:/Windows/Fonts/msyh.ttc",  # 微軟雅黑（TTC 格式）
                "C:/Windows/Fonts/simhei.ttf",  # 黑體
                "C:/Windows/Fonts/simsun.ttc",  # 宋體
                "C:/Windows/Fonts/simsun.ttf",  # 宋體（TTF 格式）
            ]
            
            for path in font_paths:
                if os.path.exists(path):
                    try:
                        if path.endswith('.ttc'):
                            if FONTTOOLS_AVAILABLE:
                                # 使用 fontTools 提取 TTC 中的第一個字體
                                try:
                                    ttc = FTTTFont(path, fontNumber=0)
                                    # 創建臨時 TTF 檔案
                                    with tempfile.NamedTemporaryFile(delete=False, suffix='.ttf') as tmp:
                                        ttc.save(tmp.name)
                                        tmp_path = tmp.name
                                    
                                    # 註冊提取的字體
                                    pdfmetrics.registerFont(TTFont(font_name, tmp_path))
                                    _registered_chinese_font = font_name
                                    print(f"Successfully registered Chinese font from TTC: {path}")
                                    return font_name
                                except Exception as e:
                                    print(f"Failed to extract font from TTC {path}: {e}")
                                    continue
                            else:
                                # 如果沒有 fontTools，嘗試使用 UnicodeCIDFont
                                try:
                                    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
                                    _registered_chinese_font = "STSong-Light"
                                    print(f"Successfully registered Chinese font: STSong-Light (CID)")
                                    return _registered_chinese_font
                                except:
                                    print(f"Failed to register TTC font as CID: {path}")
                                    continue
                        else:
                            # TTF 檔案直接註冊
                            pdfmetrics.registerFont(TTFont(font_name, path))
                            _registered_chinese_font = font_name
                            print(f"Successfully registered Chinese font: {path}")
                            return font_name
                    except Exception as e:
                        print(f"Failed to register font {path}: {e}")
                        continue
        
        # Linux 字體路徑
        else:
            font_paths = [
                "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",  # 文泉驛微米黑（fonts-wqy-microhei）
                "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",  # 文泉驛正黑（fonts-wqy-zenhei）
                "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",  # Noto CJK（fonts-noto-cjk，Debian bookworm 安裝於 opentype/）
                "/usr/share/fonts/truetype/arphic/uming.ttc",  # AR PL UMing（fonts-arphic-uming）
            ]
            
            for path in font_paths:
                if os.path.exists(path):
                    try:
                        if path.endswith('.ttc'):
                            if FONTTOOLS_AVAILABLE:
                                # 使用 fontTools 提取 TTC 中的第一個字體
                                try:
                                    ttc = FTTTFont(path, fontNumber=0)
                                    # 創建臨時 TTF 檔案
                                    with tempfile.NamedTemporaryFile(delete=False, suffix='.ttf') as tmp:
                                        ttc.save(tmp.name)
                                        tmp_path = tmp.name
                                    
                                    # 註冊提取的字體
                                    pdfmetrics.registerFont(TTFont(font_name, tmp_path))
                                    _registered_chinese_font = font_name
                                    print(f"Successfully registered Chinese font from TTC: {path}")
                                    return font_name
                                except Exception as e:
                                    print(f"Failed to extract font from TTC {path}: {e}")
                                    continue
                            else:
                                # 如果沒有 fontTools，嘗試使用 UnicodeCIDFont
                                try:
                                    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
                                    _registered_chinese_font = "STSong-Light"
                                    print(f"Successfully registered Chinese font: STSong-Light (CID)")
                                    return _registered_chinese_font
                                except:
                                    print(f"Failed to register TTC font as CID: {path}")
                                    continue
                        else:
                            # TTF 檔案直接註冊
                            pdfmetrics.registerFont(TTFont(font_name, path))
                            _registered_chinese_font = font_name
                            print(f"Successfully registered Chinese font: {path}")
                            return font_name
                    except Exception as e:
                        print(f"Failed to register font {path}: {e}")
                        continue
        
        # 如果所有字體都註冊失敗，嘗試使用 ReportLab 內建的 CID 字體
        try:
            pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
            _registered_chinese_font = "STSong-Light"
            print("Using built-in CID font: STSong-Light")
            return _registered_chinese_font
        except:
            pass
        
        # 最後的備選方案：使用 Helvetica（中文會顯示為方塊，但至少不會報錯）
        print("Warning: Could not register any Chinese font. Chinese characters may not display correctly.")
        _registered_chinese_font = "Helvetica"
        return _registered_chinese_font
        
    except Exception as e:
        print(f"Error registering Chinese font: {e}")
        import traceback
        traceback.print_exc()
        _registered_chinese_font = "Helvetica"
        return _registered_chinese_font

@router.get("/export/pdf")
def export_pdf(
    plan_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:report")
):
    """
    導出成績單 PDF（支援中文顯示，跨平台）
    內容從上往下排列，不置中
    """
    # 註冊中文字體
    chinese_font = register_chinese_fonts()
    
    buffer = BytesIO()
    p = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    # 從頁面頂部開始（不置中）
    y = height - 50  # 從頂部往下 50 點開始
    
    # 標題
    p.setFont(chinese_font, 20)
    p.drawString(50, y, "教育訓練成績報告")
    y -= 40

    # 查詢資料
    emp_scope_ids = _get_report_scope_emp_ids(db, current_user)

    if plan_id:
        plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == plan_id).first()
        if plan:
            title = f"訓練計畫：{plan.title}"
            records_query = db.query(models.ExamRecord).filter(models.ExamRecord.plan_id == plan_id)
            records = _apply_emp_scope(records_query, emp_scope_ids).order_by(models.ExamRecord.submit_time.desc()).all()
        else:
            title = "未知計畫"
            records = []
    else:
        title = "全部計畫總覽"
        records = _apply_emp_scope(db.query(models.ExamRecord), emp_scope_ids).order_by(models.ExamRecord.submit_time.desc()).all()

    # 計畫標題
    p.setFont(chinese_font, 12)
    p.drawString(50, y, title)
    y -= 25
    
    # 總記錄數
    p.drawString(50, y, f"總記錄數：{len(records)}")
    y -= 30

    # 如果沒有記錄，直接結束
    if not records:
        p.save()
        buffer.seek(0)
        return StreamingResponse(
            buffer, 
            media_type="application/pdf", 
            headers={"Content-Disposition": "attachment; filename=report.pdf"}
        )

    # 表格標題
    headers = ["員工編號", "姓名", "分數", "結果", "日期"]
    x_positions = [50, 130, 220, 280, 380]
    
    p.setFont(chinese_font, 11)
    for i, h in enumerate(headers):
        p.drawString(x_positions[i], y, h)
    
    y -= 20
    # 畫分隔線
    p.line(50, y+10, width - 50, y+10)
    y -= 15

    # 表格資料（從上往下排列）
    p.setFont(chinese_font, 10)
    page_bottom = 50  # 頁面底部邊距
    
    for r in records:
        # 檢查是否需要換頁
        if y < page_bottom:
            p.showPage()
            y = height - 50  # 新頁面從頂部開始
            # 在新頁面重複表頭
            p.setFont(chinese_font, 11)
            for i, h in enumerate(headers):
                p.drawString(x_positions[i], y, h)
            y -= 20
            p.line(50, y+10, width - 50, y+10)
            y -= 15
            p.setFont(chinese_font, 10)
        
        # 取得使用者姓名和部門
        user = db.query(models.User).filter(models.User.emp_id == r.emp_id).first()
        user_name = user.name if user else r.emp_id
        
        # 繪製資料行
        p.drawString(x_positions[0], y, str(r.emp_id))
        p.drawString(x_positions[1], y, user_name)
        p.drawString(x_positions[2], y, str(r.total_score))
        p.drawString(x_positions[3], y, "通過" if r.is_passed else "未通過")
        p.drawString(x_positions[4], y, str(r.submit_time.date()) if r.submit_time else "-")
        y -= 20

    # 不添加額外的空白頁（移除 p.showPage()）
    p.save()

    buffer.seek(0)
    return StreamingResponse(
        buffer, 
        media_type="application/pdf", 
        headers={"Content-Disposition": "attachment; filename=report.pdf"}
    )


@router.post("/print/preview")
def report_print_preview(
    scope: str = Body("plan"),
    print_mode: str = Body("list"),  # list | individual
    dept_ids: List[int] = Body(default=[]),
    plan_ids: List[int] = Body(default=[]),
    emp_ids: List[str] = Body(default=[]),
    include_employee_signature: bool = Body(False),
    include_exam_history: bool = Body(False),
    db: Session = Depends(get_db),
    current_user=check_permission("menu:report")
):
    allowed_emp_ids = _get_report_scope_emp_ids(db, current_user)
    base_query = db.query(
        models.ExamRecord.emp_id,
        models.User.name,
        models.Department.name.label("dept_name"),
        models.ExamRecord.plan_id,
        models.TrainingPlan.title.label("plan_title"),
        models.ExamRecord.total_score,
        models.ExamRecord.is_passed,
        models.ExamRecord.submit_time
    ).join(models.User, models.ExamRecord.emp_id == models.User.emp_id)\
     .join(models.Department, models.User.dept_id == models.Department.id)\
     .join(models.TrainingPlan, models.ExamRecord.plan_id == models.TrainingPlan.id)

    if allowed_emp_ids is not None:
        if not allowed_emp_ids:
            return {"total": 0, "items": [], "options": {"include_employee_signature": include_employee_signature, "include_exam_history": include_exam_history}}
        base_query = base_query.filter(models.ExamRecord.emp_id.in_(allowed_emp_ids))

    if scope == "department" and dept_ids:
        base_query = base_query.filter(models.User.dept_id.in_(dept_ids))
    if scope == "plan" and plan_ids:
        base_query = base_query.filter(models.ExamRecord.plan_id.in_(plan_ids))
    if emp_ids:
        base_query = base_query.filter(models.ExamRecord.emp_id.in_(emp_ids))

    rows = base_query.order_by(models.ExamRecord.submit_time.desc()).all()
    items = [{
        "emp_id": r.emp_id,
        "name": r.name,
        "dept_name": r.dept_name,
        "plan_id": r.plan_id,
        "plan_title": r.plan_title,
        "total_score": r.total_score,
        "is_passed": r.is_passed,
        "submit_time": r.submit_time.isoformat() if r.submit_time else None
    } for r in rows]
    return {
        "total": len(items),
        "items": items,
        "options": {
            "print_mode": print_mode,
            "include_employee_signature": include_employee_signature,
            "include_exam_history": include_exam_history
        }
    }


def _draw_wrapped_text(
    p,
    text: str,
    x: float,
    y: float,
    max_width: float,
    font_name: str,
    font_size: float,
    line_height: float,
) -> float:
    """逐字換行繪製文字，回傳最終 y 位置。"""
    from reportlab.pdfbase.pdfmetrics import stringWidth
    if not text:
        return y
    line = ""
    for char in text:
        test = line + char
        if stringWidth(test, font_name, font_size) > max_width:
            if line:
                p.drawString(x, y, line)
                y -= line_height
            line = char
        else:
            line = test
    if line:
        p.drawString(x, y, line)
        y -= line_height
    return y


def _render_dept_individual_page_with_answers(
    p,
    member: dict,
    question_details: List[dict],
    dept_name: str,
    plan_title: str,
    include_signature: bool,
    width: float,
    height: float,
    chinese_font: str,
    print_time_str: str,
) -> None:
    """
    部門批次 individual 模式：完整版一人一頁（對齊個人查看詳情預覽成績單版型）。
    - 封面：抬頭、基本資訊、成績/結果（有考試才顯示）、雙欄簽名（在頁底）
    - 答題明細：第 2 頁起，逐題呈現（無考試則無此部分）
    """
    from reportlab.pdfbase.pdfmetrics import stringWidth

    has_exam = member.get("last_score") is not None
    plab = (plan_title or "")[:32]
    margin_l = 40
    body_w = width - margin_l - 40

    # ── 封面 ──
    y = height - 40

    # 抬頭
    p.setFont(chinese_font, 14)
    p.drawString(margin_l, y, f"{plab} 教育訓練測驗成績單" if plab else "教育訓練測驗成績單")
    p.setFont(chinese_font, 10)
    p.drawString(width - 180, y, f"列印時間：{print_time_str}")
    y -= 26

    # 基本資訊（9pt）
    p.setFont(chinese_font, 9)
    p.drawString(margin_l, y, f"考生姓名：{str(member.get('name', ''))[:18]}  員工編號：{str(member.get('emp_id', ''))[:12]}")
    y -= 14
    dept_str = (dept_name or "")[:16]
    p.drawString(margin_l, y, f"部門：{dept_str}  訓練計畫：{plab[:28]}")
    y -= 14

    if has_exam:
        st = member.get("last_submit_time") or ""
        st_str = st[:16].replace("T", " ").replace("-", "/") if st else "-"
        score = member.get("last_score", "-")
        result_str = "通過" if member.get("is_passed") else "未通過"
        p.setFillColor(colors.black)
        p.drawString(margin_l, y, f"測驗日期：{st_str}  總分：{score}  結果：")
        result_color = colors.HexColor("#16a34a") if member.get("is_passed") else colors.HexColor("#dc2626")
        p.setFillColor(result_color)
        result_x = margin_l + stringWidth(f"測驗日期：{st_str}  總分：{score}  結果：", chinese_font, 9)
        p.drawString(result_x, y, result_str)
        p.setFillColor(colors.black)
    y -= 16

    # 分隔線
    p.setStrokeColor(colors.HexColor("#374151"))
    p.line(margin_l, y, width - 40, y)
    p.setStrokeColor(colors.black)
    y -= 8

    # 封面底部雙欄簽名（固定在 y=80，呼叫前確保空間）
    if include_signature:
        _pdf_draw_dual_signature_employee_date(p, 80, width, height, chinese_font)

    # ── 答題明細（有考試才渲染，第 2 頁起）──
    if not question_details:
        return

    p.showPage()
    y = height - 40

    p.setFont(chinese_font, 12)
    p.drawString(margin_l, y, "答題詳情 / Answer Details")
    y -= 24

    for q in question_details:
        content_text = str(q.get("content") or "")
        q_type = str(q.get("question_type") or "")
        q_num = q.get("question_number", "")
        is_correct = bool(q.get("is_correct"))
        earned = q.get("earned_points", 0)
        pts = q.get("points", 0)
        user_ans = str(q.get("user_answer") or "未作答")
        correct_ans = str(q.get("correct_answer") or "-")

        # 解析選項 JSON
        options: dict = {}
        raw_opts = q.get("options")
        if raw_opts:
            try:
                options = json.loads(raw_opts) if isinstance(raw_opts, str) else raw_opts
            except (json.JSONDecodeError, TypeError):
                options = {}

        # 估算此題高度：題頭 + 題目行數 + 選項數 + 答案行
        content_lines_est = max(1, len(content_text) // 40 + 1)
        opts_lines = len(options)
        est_h = 14 + content_lines_est * 13 + opts_lines * 12 + 14 + 12

        if y - est_h < 60:
            p.showPage()
            y = height - 40

        # 題頭：第 N 題  [題型]  正確/錯誤  得分
        correct_mark = "✓" if is_correct else "✗"
        hdr_color = colors.HexColor("#16a34a") if is_correct else colors.HexColor("#dc2626")
        p.setFont(chinese_font, 9)
        p.setFillColor(hdr_color)
        p.drawString(margin_l, y, f"第 {q_num} 題  [{q_type}]  {correct_mark}  {earned}/{pts} 分")
        p.setFillColor(colors.black)
        y -= 13

        # 題目內容（換行）
        p.setFont(chinese_font, 9)
        y = _draw_wrapped_text(p, content_text, margin_l + 8, y, body_w - 8, chinese_font, 9, 12)
        y -= 2

        # 選項
        if options:
            p.setFont(chinese_font, 8)
            for key, val in options.items():
                opt_line = f"  {key}. {val}"
                y = _draw_wrapped_text(p, opt_line, margin_l + 12, y, body_w - 12, chinese_font, 8, 11)
            y -= 2

        # 考生答案 / 正確答案
        p.setFont(chinese_font, 8)
        ans_color = colors.HexColor("#16a34a") if is_correct else colors.HexColor("#dc2626")

        # 展開答案說明
        def _expand_ans(ans_str: str) -> str:
            parts = [a.strip() for a in ans_str.split(",") if a.strip()]
            expanded = []
            for a in parts:
                label = options.get(a, "")
                expanded.append(f"{a}（{label}）" if label else a)
            return ", ".join(expanded) if expanded else ans_str

        user_ans_exp = _expand_ans(user_ans) if options else user_ans
        correct_ans_exp = _expand_ans(correct_ans) if options else correct_ans

        p.setFillColor(ans_color)
        p.drawString(margin_l + 8, y, f"您的答案：{user_ans_exp[:40]}")
        p.setFillColor(colors.HexColor("#15803d"))
        p.drawString(margin_l + 8 + 260, y, f"正確答案：{correct_ans_exp[:40]}")
        p.setFillColor(colors.black)
        y -= 14

        # 題目間隔
        p.setStrokeColor(colors.HexColor("#e5e7eb"))
        p.line(margin_l, y + 2, width - 40, y + 2)
        p.setStrokeColor(colors.black)
        y -= 6


def _pdf_draw_dual_signature_employee_date(
    p, y: float, width: float, height: float, chinese_font: str
) -> float:
    """T13：個人歷程 PDF 詢問3 選「是」時之雙欄簽名／日期（非主表單行底線）。"""
    if y < 64:
        p.showPage()
        y = height - 40
    p.setFont(chinese_font, 8)
    p.setFillColor(colors.black)
    p.drawString(50, y, "考生簽名 / Examinee Signature")
    p.drawString(300, y, "日期 / Date")
    y -= 10
    p.setStrokeColor(colors.black)
    p.line(50, y, 260, y)
    p.line(300, y, 520, y)
    y -= 22
    return y


def _pdf_draw_exam_history_table_zebra(
    p,
    y: float,
    width: float,
    height: float,
    db: Session,
    emp_id: str,
    plan_id: int,
    chinese_font: str,
) -> float:
    """
    T13 personal_exam_history + list：主表下方之「考試歷程」表（zebra）。
    對應規格 T13 測試問題約 216–220、232–244 行（表格式、隔列、欄名考試結果、
    字級／垂直對齊、與主表及簽名區垂直間距）。
    """
    history_rows = (
        db.query(models.ExamHistory)
        .join(models.ExamRecord, models.ExamHistory.record_id == models.ExamRecord.id)
        .filter(
            models.ExamRecord.emp_id == emp_id,
            models.ExamRecord.plan_id == plan_id,
        )
        .order_by(models.ExamHistory.submit_time.asc())
        .all()
    )
    if not history_rows:
        return y
    y -= 15  # T13：與上方主表區塊加間距
    if y < 120:
        p.showPage()
        y = height - 40
        p.setFont(chinese_font, 8)
    p.setFont(chinese_font, 9)
    p.drawString(40, y, "考試歷程 / Exam History")
    y -= 14
    p.setFont(chinese_font, 8)
    col_x = (42, 88, 290, 360)
    hdrs = ("次數", "考試時間", "分數", "考試結果")
    for i, h in enumerate(hdrs):
        p.drawString(col_x[i], y, h)
    y -= 10
    p.line(40, y + 6, width - 40, y + 6)
    y -= 8
    for i, h in enumerate(history_rows):
        if y < 46:
            p.showPage()
            y = height - 40
            p.setFont(chinese_font, 8)
        row_h = 18
        fill_c = colors.HexColor("#f3f4f6") if i % 2 == 0 else colors.white
        p.setFillColor(fill_c)
        p.rect(38, y - row_h + 6, width - 76, row_h, fill=1, stroke=0)
        p.setFillColor(colors.black)
        p.setFont(chinese_font, 8)
        htime = h.submit_time.strftime("%Y/%m/%d %H:%M") if h.submit_time else "-"
        text_y = y - 3  # T13：儲存格內文字垂直置中（約略對齊列高）
        p.drawString(col_x[0] + 2, text_y, str(i + 1))
        p.drawString(col_x[1] + 2, text_y, htime[:24])
        p.drawString(col_x[2] + 2, text_y, str(h.total_score))
        p.drawString(col_x[3] + 2, text_y, "通過" if h.is_passed else "未通過")
        y -= row_h
    y -= 15  # T13：與下方簽名區塊加間距
    return y


def _render_one_individual_score_page(
    p,
    row: dict,
    dept_name_fallback: str,
    plan_title_override: str,
    include_signature: bool,
    width: float,
    height: float,
    chinese_font: str,
    print_time_str: Optional[str] = None,
) -> None:
    """
    單人考卷成績單頁面（共用於個人歷程 individual 與部門批次 individual）。
    呼叫前已呼叫 showPage() 或確認為第一頁；y 由此函數內部管理。
    """
    y = height - 40
    plab = (row.get("plan_title") or plan_title_override or "")[:32]
    p.setFont(chinese_font, 14)
    p.drawString(40, y, f"{plab} 教育訓練測驗成績單" if plab else "教育訓練測驗成績單")
    if print_time_str:
        p.setFont(chinese_font, 10)
        p.drawString(width - 180, y, f"列印時間：{print_time_str}")
    y -= 26
    p.setFont(chinese_font, 9)
    p.drawString(
        40, y,
        f"考生姓名：{str(row.get('name', ''))[:18]}  員工編號：{str(row.get('emp_id', ''))[:12]}",
    )
    y -= 14
    dept_str = (row.get("dept_name") or dept_name_fallback or "")[:16]
    p.drawString(40, y, f"部門：{dept_str}  訓練計畫：{plab[:28]}")
    y -= 14
    st = row.get("submit_time")
    st_str = st[:19].replace("T", " ") if st else "-"
    p.drawString(
        40, y,
        f"測驗日期：{st_str}  總分：{row.get('total_score', '')}  "
        f"結果：{'通過' if row.get('is_passed') else '未通過'}",
    )
    y -= 18
    if include_signature:
        y -= 6
        _pdf_draw_dual_signature_employee_date(p, y, width, height, chinese_font)


def _render_personal_exam_individual_to_buffer(
    db: Session,
    items: List[dict],
    include_employee_signature: bool,
    personal_plan_title: Optional[str],
) -> BytesIO:
    """個人歷程列印 individual：每次考試一頁，版式同部門批次考卷成績單。"""
    chinese_font = register_chinese_fonts()
    buffer = BytesIO()
    p = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    now_str = datetime.now(ZoneInfo("Asia/Taipei")).strftime("%Y/%m/%d %H:%M")
    sorted_items = sorted(items, key=lambda r: (r.get("submit_time") or ""))
    for idx, row in enumerate(sorted_items):
        if idx > 0:
            p.showPage()
        _render_one_individual_score_page(
            p, row, "", personal_plan_title or "",
            include_employee_signature, width, height, chinese_font,
            print_time_str=now_str,
        )
    p.save()
    buffer.seek(0)
    return buffer


def render_score_print_pdf_to_buffer(
    db: Session,
    items: List[dict],
    print_mode: str,
    include_employee_signature: bool,
    include_exam_history: bool,
    *,
    document_context: str = "default",
    personal_plan_title: Optional[str] = None,
) -> BytesIO:
    """
    產生成績列印 PDF（Admin / 個人共用）。
    document_context=personal_exam_history：歷程成績列印專用抬頭、不印筆數、
    list 時歷程改表格式＋隔列；簽名為雙欄；表頭右側列印時間（Asia/Taipei）。
    individual 時每試一頁摘要（T13；前端 2026/04/23 起暫隱藏詢問2 該選項）。
    規格對照：T13 測試問題約 208–247 行；實作索引見
    1.docs/reviews/T13-成績中心歷史記錄與考試歷程列印-變更記錄-20260423.md。
    """
    is_personal_exam = document_context == "personal_exam_history"
    if is_personal_exam and print_mode == "individual":
        return _render_personal_exam_individual_to_buffer(
            db, items, include_employee_signature, personal_plan_title
        )

    chinese_font = register_chinese_fonts()
    buffer = BytesIO()
    p = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    y = height - 40
    p.setFont(chinese_font, 16)
    if is_personal_exam:
        plan_head = (personal_plan_title or (items[0].get("plan_title") if items else None) or "")[:40]
        title_line = f"{plan_head} 教育訓練考試歷程成績列印" if plan_head else "教育訓練考試歷程成績列印"
        p.drawString(40, y, title_line)
        # T13（約 247 行）：PDF 表頭列印當下時間（與下載檔名由前端另組）
        now_str = datetime.now(ZoneInfo("Asia/Taipei")).strftime("%Y/%m/%d %H:%M")
        p.setFont(chinese_font, 10)
        p.drawString(width - 180, y, f"列印時間：{now_str}")
        p.setFont(chinese_font, 16)
    else:
        p.drawString(40, y, "教育訓練成績列印")
    y -= 24
    p.setFont(chinese_font, 10)
    if not is_personal_exam:
        p.drawString(40, y, f"筆數：{len(items)}")
        y -= 20
    else:
        y -= 4

    # T13：僅 personal_exam_history 主表最後欄顯示「考試時間」；Admin default 維持「時間」
    headers = (
        ["序號", "員編", "姓名", "部門", "計畫", "分數", "結果", "考試時間"]
        if is_personal_exam
        else ["序號", "員編", "姓名", "部門", "計畫", "分數", "結果", "時間"]
    )
    x_positions = [40, 62, 92, 132, 168, 268, 302, 338]
    p.setFont(chinese_font, 8)

    def draw_table_header():
        nonlocal y
        for i, h in enumerate(headers):
            p.drawString(x_positions[i], y, h)
        y -= 12
        p.line(40, y + 6, width - 40, y + 6)
        y -= 6

    draw_table_header()

    row_seq = 0

    def draw_data_row(row: dict, seq: int):
        nonlocal y
        if y < 50:
            p.showPage()
            y = height - 40
            p.setFont(chinese_font, 8)
            draw_table_header()
        # T13：ISO 時間顯示至分鐘；personal 與 Admin 共用欄寬，勿用 [:14] 截斷分鐘
        submit_time = row["submit_time"][:16].replace("T", " ") if row.get("submit_time") else "-"
        p.setFillColor(colors.black)
        p.drawString(x_positions[0], y, str(seq))
        p.drawString(x_positions[1], y, str(row["emp_id"])[:10])
        p.drawString(x_positions[2], y, str(row["name"])[:5])
        p.drawString(x_positions[3], y, str(row["dept_name"])[:5])
        p.drawString(x_positions[4], y, str(row["plan_title"])[:14])
        p.drawString(x_positions[5], y, str(row["total_score"]))
        p.drawString(x_positions[6], y, "通過" if row["is_passed"] else "未通")
        p.drawString(x_positions[7], y, submit_time[:16])
        y -= 12

    if print_mode == "individual":
        grouped: dict = {}
        for row in items:
            grouped.setdefault(row["emp_id"], []).append(row)

        for emp_id, records in grouped.items():
            first = records[0]
            if y < 70:
                p.showPage()
                y = height - 40
                p.setFont(chinese_font, 8)
            p.setFont(chinese_font, 10)
            p.drawString(40, y, f"員工：{first['name']}（{emp_id}） / 部門：{first['dept_name']}")
            y -= 14
            p.setFont(chinese_font, 8)
            p.line(40, y + 4, width - 40, y + 4)
            y -= 4
            for row in records:
                row_seq += 1
                draw_data_row(row, row_seq)
            y -= 6
    elif is_personal_exam:
        for row in items:
            row_seq += 1
            draw_data_row(row, row_seq)
        if include_exam_history:
            seen = set()
            for row in items:
                k = (row["emp_id"], row["plan_id"])
                if k in seen:
                    continue
                seen.add(k)
                y = _pdf_draw_exam_history_table_zebra(
                    p, y, width, height, db, row["emp_id"], row["plan_id"], chinese_font
                )
        if include_employee_signature:
            y = _pdf_draw_dual_signature_employee_date(p, y, width, height, chinese_font)
    else:
        for row in items:
            row_seq += 1
            draw_data_row(row, row_seq)
            if include_employee_signature:
                if y < 40:
                    p.showPage()
                    y = height - 40
                    p.setFont(chinese_font, 8)
                    draw_table_header()
                p.drawString(72, y, "簽名：________________")
                y -= 12

            if include_exam_history:
                history_query = (
                    db.query(models.ExamHistory)
                    .join(
                        models.ExamRecord, models.ExamHistory.record_id == models.ExamRecord.id
                    )
                    .filter(
                        models.ExamRecord.emp_id == row["emp_id"],
                        models.ExamRecord.plan_id == row["plan_id"],
                    )
                    .order_by(models.ExamHistory.submit_time.asc())
                    .all()
                )
                for h in history_query[:5]:
                    if y < 40:
                        p.showPage()
                        y = height - 40
                        p.setFont(chinese_font, 8)
                        draw_table_header()
                    htime = h.submit_time.strftime("%Y-%m-%d %H:%M") if h.submit_time else "-"
                    p.drawString(55, y, f"歷程 {htime} / {h.total_score} / {'通過' if h.is_passed else '未通過'}")
                    y -= 11

    p.save()
    buffer.seek(0)
    return buffer


@router.post("/print/pdf")
def report_print_pdf(
    scope: str = Body("plan"),
    print_mode: str = Body("list"),  # list | individual
    dept_ids: List[int] = Body(default=[]),
    plan_ids: List[int] = Body(default=[]),
    emp_ids: List[str] = Body(default=[]),
    include_employee_signature: bool = Body(False),
    include_exam_history: bool = Body(False),
    db: Session = Depends(get_db),
    current_user=check_permission("menu:report")
):
    preview = report_print_preview(
        scope=scope,
        print_mode=print_mode,
        dept_ids=dept_ids,
        plan_ids=plan_ids,
        emp_ids=emp_ids,
        include_employee_signature=include_employee_signature,
        include_exam_history=include_exam_history,
        db=db,
        current_user=current_user
    )

    buffer = render_score_print_pdf_to_buffer(
        db,
        preview["items"],
        print_mode,
        include_employee_signature,
        include_exam_history,
    )
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=report_print.pdf"}
    )


def _render_dept_plan_pdf_to_buffer(
    members: List[dict],
    plan_title: str,
    dept_name: str,
    print_mode: str,
    include_signature: bool,
    db: Optional[Session] = None,
    exam_record_map: Optional[dict] = None,
) -> "BytesIO":
    """
    部門計畫批次列印 PDF。
    - individual：每人一頁，版型與個人查看詳情預覽成績單一致（封面＋答題明細）。
    - list：成績清單（字體 9pt、列高 18、zebra、結果紅綠色、簽名僅在底部一次雙欄）。
    """
    chinese_font = register_chinese_fonts()
    buffer = BytesIO()
    p = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    now_str = datetime.now(ZoneInfo("Asia/Taipei")).strftime("%Y/%m/%d %H:%M")

    if print_mode == "individual":
        for idx, m in enumerate(members):
            if idx > 0:
                p.showPage()

            # 取得此人最後一次考試的答題明細
            question_details: List[dict] = []
            if db is not None and exam_record_map is not None:
                record = exam_record_map.get(m["emp_id"])
                if record is not None:
                    exam_details_q = (
                        db.query(models.ExamDetail, models.Question)
                        .join(models.Question, models.ExamDetail.question_id == models.Question.id)
                        .filter(models.ExamDetail.record_id == record.id)
                        .all()
                    )
                    for ed, q in exam_details_q:
                        question_details.append({
                            "question_number": len(question_details) + 1,
                            "question_id": q.id,
                            "content": q.content,
                            "question_type": q.question_type,
                            "options": q.options,
                            "correct_answer": q.answer,
                            "user_answer": ed.user_answer,
                            "is_correct": ed.is_correct,
                            "points": q.points,
                            "earned_points": q.points if ed.is_correct else 0,
                        })
                    question_details.sort(key=lambda x: x["question_id"])

            _render_dept_individual_page_with_answers(
                p, m, question_details, dept_name, plan_title,
                include_signature, width, height, chinese_font,
                print_time_str=now_str,
            )

    else:  # list mode
        y = height - 40
        p.setFont(chinese_font, 14)
        p.drawString(
            40, y,
            f"{plan_title} 教育訓練成績清單" if plan_title else "教育訓練成績清單",
        )
        p.setFont(chinese_font, 10)
        p.drawString(width - 180, y, f"列印時間：{now_str}")
        y -= 22
        p.setFont(chinese_font, 9)
        p.drawString(40, y, f"部門：{dept_name}  人數：{len(members)}")
        y -= 16
        p.line(40, y + 8, width - 40, y + 8)
        y -= 8

        # 欄位定義（字體 9pt，列高 26；text_vcenter=6 使文字垂直置中）
        headers = ["序號", "員編", "姓名", "分數", "結果", "出席狀態"]
        x_pos = [40, 64, 100, 158, 190, 232]
        row_h = 26
        text_vcenter = 6  # 列底 y-4，列頂 y+22，置中基線 ≈ y+6
        hdr_font = 9
        content_font = 9

        def draw_header():
            nonlocal y
            p.setFillColor(colors.HexColor("#e8eaf6"))
            p.rect(38, y - 4, width - 76, row_h, fill=1, stroke=0)
            p.setFillColor(colors.black)
            p.setFont(chinese_font, hdr_font)
            for i, h in enumerate(headers):
                p.drawString(x_pos[i], y + text_vcenter, h)
            y -= row_h
            p.line(40, y + 2, width - 40, y + 2)
            y -= 2

        draw_header()

        for seq, m in enumerate(members, 1):
            if y < 80:
                p.showPage()
                y = height - 40
                draw_header()
            # zebra
            fill_c = colors.HexColor("#f3f4f6") if seq % 2 == 0 else colors.white
            p.setFillColor(fill_c)
            p.rect(38, y - 4, width - 76, row_h, fill=1, stroke=0)

            has_exam = m.get("last_score") is not None
            score_str = str(m.get("last_score")) if has_exam else "-"
            result_str = ("通過" if m.get("is_passed") else "未通過") if has_exam else "未考試"
            att_status = (m.get("attendance_status") or "")[:20]

            # 出席狀態時間（check_in_time 或 absence_recorded_at），同列顯示
            raw_time = m.get("check_in_time") or m.get("absence_recorded_at")
            att_time_str = ""
            if raw_time:
                att_time_str = raw_time[:16].replace("T", " ").replace("-", "/")
            att_combined = att_status + (" " + att_time_str if att_time_str else "")

            # 結果欄顏色
            if result_str in ("未考試", "未通過"):
                result_color = colors.HexColor("#dc2626")
            else:
                result_color = colors.HexColor("#16a34a")

            p.setFillColor(colors.black)
            p.setFont(chinese_font, content_font)
            p.drawString(x_pos[0], y + text_vcenter, str(seq))
            p.drawString(x_pos[1], y + text_vcenter, str(m.get("emp_id", ""))[:10])
            p.drawString(x_pos[2], y + text_vcenter, str(m.get("name", ""))[:6])
            p.drawString(x_pos[3], y + text_vcenter, score_str)

            p.setFillColor(result_color)
            p.drawString(x_pos[4], y + text_vcenter, result_str[:4])
            p.setFillColor(colors.black)

            # 出席狀態：狀態文字 + 時間，同一列左右排列
            p.drawString(x_pos[5], y + text_vcenter, att_combined[:36])

            y -= row_h

        # 簽名僅在整份清單底部一次，雙欄樣式
        if include_signature:
            y -= 8
            _pdf_draw_dual_signature_employee_date(p, y, width, height, chinese_font)

    p.save()
    buffer.seek(0)
    return buffer


@router.post("/dept-plan/individual-print-data")
def dept_individual_print_data(
    dept_id: int = Body(...),
    plan_id: int = Body(...),
    dept_name: str = Body(""),
    plan_title: str = Body(""),
    db: Session = Depends(get_db),
    current_user=check_permission("menu:report"),
):
    """
    部門 individual 列印資料（JSON）。
    回傳每位成員的完整成績詳情，格式與 /exam/record/{id}/detail 相同，
    供前端 scoreCardPrintHtml.buildBatchPrintHtml 產生與個人路徑同源的 HTML 列印。
    """
    allowed_emp_ids = _get_report_scope_emp_ids(db, current_user)
    users_q = db.query(models.User).filter(
        models.User.dept_id == dept_id,
        models.User.status == "active",
    )
    if allowed_emp_ids is not None:
        if not allowed_emp_ids:
            raise HTTPException(status_code=403, detail="無可視範圍")
        users_q = users_q.filter(models.User.emp_id.in_(allowed_emp_ids))
    users = users_q.order_by(models.User.name).all()
    if not users:
        raise HTTPException(status_code=404, detail="此部門無成員資料")

    emp_ids = [u.emp_id for u in users]

    # 取各人最後一次考試記錄
    last_subq = (
        db.query(
            models.ExamRecord.emp_id,
            func.max(models.ExamRecord.submit_time).label("last_submit_time"),
        )
        .filter(
            models.ExamRecord.plan_id == plan_id,
            models.ExamRecord.emp_id.in_(emp_ids),
        )
        .group_by(models.ExamRecord.emp_id)
        .subquery()
    )
    exam_rows = (
        db.query(models.ExamRecord)
        .join(
            last_subq,
            and_(
                models.ExamRecord.emp_id == last_subq.c.emp_id,
                models.ExamRecord.submit_time == last_subq.c.last_submit_time,
                models.ExamRecord.plan_id == plan_id,
            ),
        )
        .all()
    )
    exam_map = {r.emp_id: r for r in exam_rows}

    # 出席/缺席記錄（與 dept_plan_print_pdf 相同）
    att_rows = (
        db.query(models.AttendanceRecord)
        .filter(
            models.AttendanceRecord.plan_id == plan_id,
            models.AttendanceRecord.emp_id.in_(emp_ids),
        )
        .all()
    )
    att_dict = {r.emp_id: r for r in att_rows}
    reason_code_map = {
        "sick_leave": "病假", "business_trip": "出差",
        "official_leave": "公假", "other": "其他",
    }
    abs_rows = (
        db.query(models.AttendanceAbsenceReason)
        .filter(
            models.AttendanceAbsenceReason.plan_id == plan_id,
            models.AttendanceAbsenceReason.emp_id.in_(emp_ids),
        )
        .all()
    )
    abs_label_map: dict = {}
    for r in abs_rows:
        label = reason_code_map.get(r.reason_code, r.reason_code)
        if r.reason_code == "other" and r.reason_text:
            label = r.reason_text
        abs_label_map[r.emp_id] = label

    # 部門名稱、計畫資訊
    dept_obj = db.query(models.Department).filter(models.Department.id == dept_id).first()
    dept_name_resolved = dept_obj.name if dept_obj else dept_name
    plan_obj = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == plan_id).first()
    passing_score = plan_obj.passing_score if plan_obj else 60
    plan_title_resolved = plan_obj.title if plan_obj else plan_title

    result = []
    for u in users:
        exam = exam_map.get(u.emp_id)
        att_record = att_dict.get(u.emp_id)
        absence = abs_label_map.get(u.emp_id)
        if exam:
            att_status = "已考試"
        elif att_record:
            att_status = "已報到/未完成"
        else:
            reason_part = f"（{absence}）" if absence else ""
            att_status = f"未應考{reason_part}"

        if exam:
            exam_details_q = (
                db.query(models.ExamDetail, models.Question)
                .join(models.Question, models.ExamDetail.question_id == models.Question.id)
                .filter(models.ExamDetail.record_id == exam.id)
                .all()
            )
            question_details = []
            for ed, q in exam_details_q:
                question_details.append({
                    "question_id": q.id,
                    "question_number": len(question_details) + 1,
                    "content": q.content,
                    "question_type": q.question_type,
                    "options": q.options,
                    "correct_answer": q.answer,
                    "user_answer": ed.user_answer,
                    "is_correct": ed.is_correct,
                    "points": q.points,
                    "earned_points": q.points if ed.is_correct else 0,
                })
            question_details.sort(key=lambda x: x["question_id"])

            duration = None
            if exam.start_time and exam.submit_time:
                duration = round((exam.submit_time - exam.start_time).total_seconds(), 0)

            detail = {
                "record_id": exam.id,
                "basic_info": {
                    "emp_id": u.emp_id,
                    "name": u.name,
                    "dept_name": dept_name_resolved,
                    "plan_id": plan_id,
                    "plan_title": plan_title_resolved,
                    "training_date": None,
                    "end_date": None,
                    "passing_score": passing_score,
                    "total_score": exam.total_score,
                    "is_passed": exam.is_passed,
                    "start_time": exam.start_time.isoformat() if exam.start_time else None,
                    "submit_time": exam.submit_time.isoformat() if exam.submit_time else None,
                    "duration": duration,
                    "attempts": exam.attempts,
                },
                "question_details": question_details,
                "history": [],
            }
            result.append({"has_exam": True, "attendance_status": att_status, "detail": detail})
        else:
            result.append({
                "has_exam": False,
                "attendance_status": att_status,
                "name": u.name,
                "emp_id": u.emp_id,
                "dept_name": dept_name_resolved,
                "plan_title": plan_title_resolved,
                "detail": None,
            })

    return result


@router.post("/dept-plan/pdf")
def dept_plan_print_pdf(
    dept_id: int = Body(...),
    dept_name: str = Body(""),
    plan_id: int = Body(...),
    plan_title: str = Body(""),
    print_mode: str = Body("list"),
    include_signature: bool = Body(False),
    db: Session = Depends(get_db),
    current_user=check_permission("menu:report"),
):
    """部門計畫批次列印 PDF（以每人最後一次考試為準，未考試者標示出席狀態）。"""
    allowed_emp_ids = _get_report_scope_emp_ids(db, current_user)

    users_q = db.query(models.User).filter(
        models.User.dept_id == dept_id,
        models.User.status == "active",
    )
    if allowed_emp_ids is not None:
        if not allowed_emp_ids:
            raise HTTPException(status_code=403, detail="無可視範圍")
        users_q = users_q.filter(models.User.emp_id.in_(allowed_emp_ids))

    users = users_q.order_by(models.User.name).all()
    if not users:
        raise HTTPException(status_code=404, detail="此部門無成員資料")

    emp_ids = [u.emp_id for u in users]

    last_subq = (
        db.query(
            models.ExamRecord.emp_id,
            func.max(models.ExamRecord.submit_time).label("last_submit_time"),
        )
        .filter(
            models.ExamRecord.plan_id == plan_id,
            models.ExamRecord.emp_id.in_(emp_ids),
        )
        .group_by(models.ExamRecord.emp_id)
        .subquery()
    )
    exam_rows = (
        db.query(models.ExamRecord)
        .join(
            last_subq,
            and_(
                models.ExamRecord.emp_id == last_subq.c.emp_id,
                models.ExamRecord.submit_time == last_subq.c.last_submit_time,
                models.ExamRecord.plan_id == plan_id,
            ),
        )
        .all()
    )
    exam_map = {r.emp_id: r for r in exam_rows}

    att_rows = (
        db.query(models.AttendanceRecord)
        .filter(
            models.AttendanceRecord.plan_id == plan_id,
            models.AttendanceRecord.emp_id.in_(emp_ids),
        )
        .all()
    )
    att_dict = {r.emp_id: r for r in att_rows}

    reason_code_map = {
        "sick_leave": "病假",
        "business_trip": "出差",
        "official_leave": "公假",
        "other": "其他",
    }
    abs_rows = (
        db.query(models.AttendanceAbsenceReason)
        .filter(
            models.AttendanceAbsenceReason.plan_id == plan_id,
            models.AttendanceAbsenceReason.emp_id.in_(emp_ids),
        )
        .all()
    )
    abs_label_map: dict = {}
    abs_obj_map: dict = {}
    for r in abs_rows:
        label = reason_code_map.get(r.reason_code, r.reason_code)
        if r.reason_code == "other" and r.reason_text:
            label = r.reason_text
        abs_label_map[r.emp_id] = label
        abs_obj_map[r.emp_id] = r

    members = []
    for u in users:
        exam = exam_map.get(u.emp_id)
        att_record = att_dict.get(u.emp_id)
        absence = abs_label_map.get(u.emp_id)
        abs_record = abs_obj_map.get(u.emp_id)
        if exam:
            att_status = "已考試"
        elif att_record:
            att_status = "已報到/未完成"
        else:
            reason_part = f"（{absence}）" if absence else ""
            att_status = f"未應考{reason_part}"
        members.append(
            {
                "emp_id": u.emp_id,
                "name": u.name,
                "last_submit_time": (
                    exam.submit_time.isoformat() if exam and exam.submit_time else None
                ),
                "last_score": exam.total_score if exam else None,
                "is_passed": exam.is_passed if exam else None,
                "attendance_status": att_status,
                "check_in_time": (
                    att_record.checkin_time.isoformat()
                    if att_record and att_record.checkin_time
                    else None
                ),
                "absence_recorded_at": (
                    abs_record.recorded_at.isoformat()
                    if abs_record and abs_record.recorded_at
                    else None
                ),
            }
        )

    buffer = _render_dept_plan_pdf_to_buffer(
        members, plan_title, dept_name, print_mode, include_signature,
        db=db, exam_record_map=exam_map,
    )
    now_ts = datetime.now(ZoneInfo("Asia/Taipei")).strftime("%Y%m%d_%H%M%S")
    mode_label = "考卷成績單" if print_mode == "individual" else "成績清單"
    safe_plan = (plan_title or "計畫")[:20].replace("/", "_").replace("\\", "_")
    safe_dept = (dept_name or "部門")[:10].replace("/", "_").replace("\\", "_")
    filename = f"{safe_plan}_{safe_dept}_{mode_label}_{now_ts}.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )
