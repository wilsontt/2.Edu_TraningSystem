from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, case, and_, or_, extract, select, text, Integer
from typing import List, Optional
from datetime import datetime, date, timedelta
from .. import models, schemas
from ..database import get_db
from .auth import check_permission

router = APIRouter(prefix="/admin/reports", tags=["reports"])

# --- 總覽統計 ---
@router.get("/overview")
def get_overview_statistics(
    db: Session = Depends(get_db),
    current_user = check_permission("menu:report"),
    year: Optional[int] = Query(None, description="年度篩選（例如：2026）"),
    month: Optional[int] = Query(None, description="月份篩選（1-12），需配合 year 使用"),
    quarter: Optional[int] = Query(None, description="季度篩選（1-4），需配合 year 使用")
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
    
    # 本月時間範圍
    month_start_dt = datetime(current_year, current_month, 1, 0, 0, 0)
    if current_month == 12:
        month_end_dt = datetime(current_year + 1, 1, 1, 0, 0, 0) - timedelta(seconds=1)
    else:
        month_end_dt = datetime(current_year, current_month + 1, 1, 0, 0, 0) - timedelta(seconds=1)
    
    # 基礎查詢（套用時間篩選，只查詢有 submit_time 的記錄）
    try:
        base_query = db.query(models.ExamRecord).filter(models.ExamRecord.submit_time.isnot(None))
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
            models.TrainingPlan.training_date <= month_end_date
        )
    ).count()
    
    # 本月應考人次
    monthly_records = db.query(models.ExamRecord).filter(
        and_(
            models.ExamRecord.submit_time >= month_start_dt,
            models.ExamRecord.submit_time <= month_end_dt
        )
    ).count()
    
    # 待考試人數（已指派但尚未完成考試的人員數）
    # 邏輯：找出所有有效的訓練計畫（今天在 training_date 和 end_date 之間）
    # 然後找出這些計畫的 target_departments 中的所有使用者
    # 再排除已經有 ExamRecord 的使用者
    today = date.today()
    active_plans = db.query(models.TrainingPlan).filter(
        and_(
            models.TrainingPlan.training_date <= today,
            or_(
                models.TrainingPlan.end_date.is_(None),
                models.TrainingPlan.end_date >= today
            )
        )
    ).all()
    
    # 收集所有應考人員（從 active_plans 的 target_departments）
    target_user_ids = set()
    for plan in active_plans:
        for dept in plan.target_departments:
            for user in dept.users:
                target_user_ids.add(user.emp_id)
    
    # 找出已完成考試的人員（有 ExamRecord 且 is_passed=True）
    completed_user_ids = set()
    for plan in active_plans:
        records = db.query(models.ExamRecord).filter(
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
    include_advanced: bool = Query(False, description="是否包含進階分析資料")
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
         .filter(models.ExamRecord.submit_time.isnot(None))
        
        if time_filter:
            base_query = base_query.filter(time_filter)
        
        results = base_query.group_by(models.Department.id).all()
        
        stats = []
        for r in results:
            total = r.count
            
            # 計算及格數（使用 Python 邏輯避免 case() 問題）
            dept_records_query = db.query(models.ExamRecord).join(
                models.User, models.ExamRecord.emp_id == models.User.emp_id
            ).filter(
                models.User.dept_id == r.id,
                models.ExamRecord.submit_time.isnot(None)
            )
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
                dept_users = db.query(models.User).filter(models.User.dept_id == r.id).count()
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
                    ).filter(
                        models.User.dept_id == r.id,
                        models.ExamRecord.submit_time.isnot(None),
                        prev_filter
                    ).all()
                    
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
def get_plan_statistics(db: Session = Depends(get_db), current_user = check_permission("menu:report")):
    """
    各訓練計畫統計列表
    """
    try:
        results = db.query(
            models.TrainingPlan.title,
            models.TrainingPlan.training_date,
            func.count(models.ExamRecord.id).label("count"),
            func.avg(models.ExamRecord.total_score).label("avg_score"),
            func.sum(case((models.ExamRecord.is_passed == True, 1), else_=0)).label("passed_count")
        ).join(models.ExamRecord, models.TrainingPlan.id == models.ExamRecord.plan_id)\
         .group_by(models.TrainingPlan.id).all()

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
        month_records = db.query(models.ExamRecord).filter(
            and_(
                models.ExamRecord.submit_time >= month_start_dt,
                models.ExamRecord.submit_time <= month_end_dt
            )
        ).all()
        
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
        # 取得各部門統計（不使用 case()，改用 Python 邏輯計算）
        dept_stats = db.query(
            models.Department.id,
            models.Department.name,
            func.count(models.ExamRecord.id).label("count"),
            func.avg(models.ExamRecord.total_score).label("avg_score")
        ).join(models.User, models.Department.id == models.User.dept_id)\
         .join(models.ExamRecord, models.User.emp_id == models.ExamRecord.emp_id)\
         .group_by(models.Department.id).all()
        
        results = []
        for r in dept_stats:
            total = r.count
            
            # 使用 Python 邏輯計算及格數（避免 case() 語法問題）
            dept_records = db.query(models.ExamRecord).join(
                models.User, models.ExamRecord.emp_id == models.User.emp_id
            ).filter(
                models.User.dept_id == r.id
            ).all()
            
            passed = sum(1 for record in dept_records if record.is_passed == True)
            pass_rate = (passed / total * 100) if total > 0 else 0
            
            # 計算完成率（該部門已完成考試的人數 / 應考人數）
            dept_users = db.query(models.User).filter(models.User.dept_id == r.id).count()
            completed_users = db.query(models.ExamRecord).join(
                models.User, models.ExamRecord.emp_id == models.User.emp_id
            ).filter(
                models.User.dept_id == r.id,
                models.ExamRecord.is_passed == True
            ).distinct(models.ExamRecord.emp_id).count()
            
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
        # 取得各計畫統計
        plan_stats = db.query(
            models.TrainingPlan.id,
            models.TrainingPlan.title,
            func.count(models.ExamRecord.id).label("count"),
            func.avg(models.ExamRecord.total_score).label("avg_score")
        ).join(models.ExamRecord, models.TrainingPlan.id == models.ExamRecord.plan_id)\
         .group_by(models.TrainingPlan.id)\
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
    
    # 找出所有有效的訓練計畫（今天在 training_date 和 end_date 之間）
    active_plans = db.query(models.TrainingPlan).filter(
        and_(
            models.TrainingPlan.training_date <= today,
            or_(
                models.TrainingPlan.end_date.is_(None),
                models.TrainingPlan.end_date >= today
            )
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
        ).distinct(models.ExamRecord.emp_id).count()
        
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
    expiry_date = today + timedelta(days=days)
    
    # 找出即將到期的訓練計畫
    expiring_plans = db.query(models.TrainingPlan).filter(
        and_(
            models.TrainingPlan.end_date.isnot(None),
            models.TrainingPlan.end_date >= today,
            models.TrainingPlan.end_date <= expiry_date
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
        ).distinct(models.ExamRecord.emp_id).count()
        
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
    failed_records = db.query(models.ExamRecord).filter(
        models.ExamRecord.is_passed == False
    ).all()
    
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
                "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",  # 文泉驛微米黑
                "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",  # 文泉驛正黑
                "/usr/share/fonts/truetype/arphic/uming.ttc",  # AR PL UMing
                "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",  # Noto Sans CJK
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
def export_pdf(plan_id: Optional[int] = None, db: Session = Depends(get_db)): # current_user removed for easy browser testing
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
    if plan_id:
        plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == plan_id).first()
        if plan:
            title = f"訓練計畫：{plan.title}"
            records = db.query(models.ExamRecord).filter(models.ExamRecord.plan_id == plan_id).order_by(models.ExamRecord.submit_time.desc()).all()
        else:
            title = "未知計畫"
            records = []
    else:
        title = "全部計畫總覽"
        records = db.query(models.ExamRecord).order_by(models.ExamRecord.submit_time.desc()).all()

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
