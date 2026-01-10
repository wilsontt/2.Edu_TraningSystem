from fastapi import APIRouter, HTTPException, Depends, Query, Request as FastAPIRequest
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from typing import List, Optional
from datetime import date, datetime, timedelta
from pydantic import BaseModel
from .. import models, schemas
from ..database import get_db
from .auth import get_current_user

router = APIRouter(prefix="/exam", tags=["exam_center"])

# --- 考試中心資料結構 ---
class ExamListItem(BaseModel):
    plan_id: int
    title: str
    training_date: date
    end_date: Optional[date]
    status: str  # 狀態: pending(未開始), active(進行中), completed(已完成), expired(已過期)
    score: Optional[int]
    total_points: Optional[int]
    attempts: int = 0

class QuestionItem(BaseModel):
    id: int
    content: str
    question_type: str
    options: Optional[str] = None # JSON string
    points: int
    hint: Optional[str] = None # 提示內容（可選）

class ExamStartResponse(BaseModel):
    plan_id: int
    title: str
    limit_time: int = 0 # 秒
    questions: List[QuestionItem]

# --- API 端點 ---

@router.get("/my_exams", response_model=List[ExamListItem])
def get_my_exams(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    獲取我的考試列表
    邏輯：
    1. 找出該 User 所屬部門 (dept_id) 的所有 TrainingPlan (或全公司通用的?)
       目前假設 TrainingPlan 綁定 dept_id，則 User 只能看自己部門的。
    2. 針對每個 Plan，檢查 ExamRecord 是否存在。
    3. 判斷狀態:
       - completed: 有 ExamRecord
       - active: 無 Record 且 today >= training_date (且 <= end_date if exists)
       - pending: 無 Record 且 today < training_date
       - expired: 無 Record 且 today > end_date
    """
    
    # 1. 取得 User 所屬部門的計畫
    # 如果是 Admin (超級管理員)，則可以看到所有計畫 (方便測試與管理)
    # 一般使用者只抓 user.dept_id 相符的。
    
    today = date.today()
    
    # 檢查是否為 Admin (假設 Role 名稱為 "Admin")
    # 注意: current_user.role 可能為 None (雖然 schema 定義 optional，但實務上應有)
    is_admin = current_user.role and current_user.role.name == "Admin"
    
    if is_admin:
        plans = db.query(models.TrainingPlan).order_by(models.TrainingPlan.training_date.desc()).all()
    else:
        # 篩選受課單位包含使用者所屬部門的計畫
        plans = db.query(models.TrainingPlan).filter(
            models.TrainingPlan.target_departments.any(id=current_user.dept_id)
        ).order_by(models.TrainingPlan.training_date.desc()).all()

    results = []
    
    for plan in plans:
        # Check if record exists
        record = db.query(models.ExamRecord).filter(
            models.ExamRecord.plan_id == plan.id,
            models.ExamRecord.emp_id == current_user.emp_id
        ).first()
        
        status = "pending"
        score = None
        total = 100 # 預設總分
        
        # Calculate total points from questions
        # 若未優化可能導致 N+1 查詢，但通常計畫數不多，故暫時忽略
        # 計算總分
        qs = plan.questions
        calculated_total = sum([q.points for q in qs]) if qs else 0
        total = calculated_total if calculated_total > 0 else 100

        if record:
            status = "completed"
            score = record.total_score
        else:
            # Check dates
            start_date = plan.training_date
            end_date = plan.end_date
            
            if today < start_date:
                status = "pending"
            elif end_date and today > end_date:
                status = "expired"
            else:
                status = "active"
        
        results.append(ExamListItem(
            plan_id=plan.id,
            title=plan.title,
            training_date=plan.training_date,
            end_date=plan.end_date,
            status=status,
            score=score,
            total_points=total,
            attempts=record.attempts if record else 0
        ))
        
    return results

@router.get("/start/{plan_id}", response_model=ExamStartResponse)
def start_exam(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Training plan not found")
        
    # Validation logic
    record = db.query(models.ExamRecord).filter(
        models.ExamRecord.plan_id == plan.id,
        models.ExamRecord.emp_id == current_user.emp_id
    ).first()
    
    if record and record.is_passed:
        raise HTTPException(status_code=400, detail="You have already completed and passed this exam.")
        
    today = date.today()
    if today < plan.training_date:
        raise HTTPException(status_code=400, detail="Exam has not started yet.")
    if plan.end_date and today > plan.end_date:
        # 如果是重考 (有紀錄且未通過)，則允許忽略結束日期進行補考
        # 若是首次參加或已通過 (雖然已通過會被前面擋住)，則檢查過期
        if not (record and not record.is_passed):
            raise HTTPException(status_code=400, detail="Exam has expired.")

    # Fetch questions
    # Note: We do NOT include 'answer' field here for security.
    questions = db.query(models.Question).filter(
        models.Question.plan_id == plan.id
    ).all()
    
    q_items = []
    for q in questions:
        q_items.append(QuestionItem(
            id=q.id,
            content=q.content,
            question_type=q.question_type,
            options=q.options,
            points=q.points,
            hint=q.hint  # 包含提示欄位
        ))
        
    return ExamStartResponse(
        plan_id=plan.id,
        title=plan.title,
        limit_time=(plan.time_limit * 60) if plan.timer_enabled else 0,
        questions=q_items
    )
# --- Submission Schemas ---
class ExamSubmitRequest(BaseModel):
    answers: dict[int, str] # question_id -> option_key (e.g. "A", "true")
    time_spent: int # seconds

class ExamResultDetail(BaseModel):
    question_id: int
    is_correct: bool
    user_answer: str
    correct_answer: str # Optional: send back correct answer? Yes for review.

class ExamResultResponse(BaseModel):
    plan_id: int
    score: int
    total_score: int
    is_passed: bool
    details: List[ExamResultDetail]

@router.post("/submit/{plan_id}", response_model=ExamResultResponse)
def submit_exam(
    plan_id: int,
    submit_data: ExamSubmitRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Training plan not found")

    # Fetch all questions
    questions = db.query(models.Question).filter(models.Question.plan_id == plan.id).all()
    
    total_score = 0
    earned_score = 0
    details_to_save = []
    response_details = []
    
    for q in questions:
        total_score += q.points
        user_ans = submit_data.answers.get(str(q.id)) or submit_data.answers.get(q.id, "")
        
        # Grading Logic (Strict Match)
        is_correct = (user_ans == q.answer)
        
        if is_correct:
            earned_score += q.points
            
        details_to_save.append(models.ExamDetail(
            question_id=q.id,
            user_answer=str(user_ans),
            is_correct=is_correct
        ))
        
        response_details.append(ExamResultDetail(
            question_id=q.id,
            is_correct=is_correct,
            user_answer=str(user_ans),
            correct_answer=q.answer
        ))

    # Determine Pass/Fail check
    # 使用 plan.passing_score 作為絕對分數門檻
    is_passed = (earned_score >= plan.passing_score)

    # Check if record exists
    existing_record = db.query(models.ExamRecord).filter(
        models.ExamRecord.plan_id == plan.id,
        models.ExamRecord.emp_id == current_user.emp_id
    ).first()
    
    if existing_record:
        # Update existing record (Re-take)
        existing_record.total_score = earned_score
        existing_record.is_passed = is_passed
        existing_record.submit_time = datetime.now()
        existing_record.attempts = (existing_record.attempts or 1) + 1
        
        # Clear old details
        db.query(models.ExamDetail).filter(models.ExamDetail.record_id == existing_record.id).delete()
        
        record_id = existing_record.id
    else:
        # Create new record
        new_record = models.ExamRecord(
            emp_id=current_user.emp_id,
            plan_id=plan.id,
            total_score=earned_score,
            is_passed=is_passed,
            start_time=datetime.now(),
            submit_time=datetime.now(),
            attempts=1
        )
        db.add(new_record)
        db.flush()
        record_id = new_record.id
    
    # Save Details
    for d in details_to_save:
        d.record_id = record_id
        db.add(d)
        
    db.commit()
    
    return ExamResultResponse(
        plan_id=plan.id,
        score=earned_score,
        total_score=total_score,
        is_passed=is_passed,
        details=response_details
    )

# --- T3: 個人成績查詢 API ---

@router.get("/personal/overview")
def get_personal_overview(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    emp_id: Optional[str] = Query(None, description="員工編號（僅 Admin 可使用）")
):
    """
    T3.1: 獲取個人成績總覽
    - 已完成考試數
    - 平均分數
    - 通過率
    - 最佳成績
    - 最差成績
    - 總學習時數（累積作答時間）
    
    權限控制：
    - 一般使用者只能查看自己的成績
    - Admin 可查看所有使用者成績（需 emp_id 參數）
    """
    # 權限控制
    target_emp_id = emp_id if emp_id and current_user.role and current_user.role.name == "Admin" else current_user.emp_id
    
    if emp_id and (not current_user.role or current_user.role.name != "Admin"):
        raise HTTPException(status_code=403, detail="只有 Admin 可以查看其他使用者的成績")
    
    # 取得該使用者的所有考試記錄
    records = db.query(models.ExamRecord).filter(
        models.ExamRecord.emp_id == target_emp_id,
        models.ExamRecord.submit_time.isnot(None)
    ).all()
    
    if not records:
        return {
            "emp_id": target_emp_id,
            "completed_count": 0,
            "average_score": 0,
            "pass_rate": 0,
            "best_score": 0,
            "worst_score": 0,
            "total_study_time": 0  # 秒數
        }
    
    # 計算統計資料
    completed_count = len(records)
    total_score = sum(r.total_score for r in records)
    average_score = total_score / completed_count if completed_count > 0 else 0
    
    passed_count = sum(1 for r in records if r.is_passed == True)
    pass_rate = (passed_count / completed_count * 100) if completed_count > 0 else 0
    
    scores = [r.total_score for r in records]
    best_score = max(scores) if scores else 0
    worst_score = min(scores) if scores else 0
    
    # 計算總學習時數（累積作答時間）
    total_study_time = 0
    for r in records:
        if r.start_time and r.submit_time:
            duration = (r.submit_time - r.start_time).total_seconds()
            total_study_time += duration
    
    return {
        "emp_id": target_emp_id,
        "completed_count": completed_count,
        "average_score": round(average_score, 1),
        "pass_rate": round(pass_rate, 1),
        "best_score": best_score,
        "worst_score": worst_score,
        "total_study_time": round(total_study_time, 0)  # 秒數
    }

@router.get("/personal/history")
def get_personal_history(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    emp_id: Optional[str] = Query(None, description="員工編號（僅 Admin 可使用）"),
    sort_by: str = Query("time", description="排序欄位：time（時間）/score（分數）"),
    order: str = Query("desc", description="排序方向：asc（升序）/desc（降序）"),
    page: int = Query(1, ge=1, description="頁碼"),
    page_size: int = Query(20, ge=1, le=100, description="每頁筆數")
):
    """
    T3.2: 獲取個人成績歷史
    - 所有考試記錄列表（時間倒序）
    - 每場考試的詳細資訊
    - 支援分頁與排序
    """
    # 權限控制
    target_emp_id = emp_id if emp_id and current_user.role and current_user.role.name == "Admin" else current_user.emp_id
    
    if emp_id and (not current_user.role or current_user.role.name != "Admin"):
        raise HTTPException(status_code=403, detail="只有 Admin 可以查看其他使用者的成績")
    
    # 基礎查詢
    base_query = db.query(
        models.ExamRecord.id,
        models.ExamRecord.plan_id,
        models.TrainingPlan.title.label("plan_title"),
        models.ExamRecord.total_score,
        models.ExamRecord.is_passed,
        models.ExamRecord.start_time,
        models.ExamRecord.submit_time,
        models.ExamRecord.attempts
    ).join(
        models.TrainingPlan, models.ExamRecord.plan_id == models.TrainingPlan.id
    ).filter(
        models.ExamRecord.emp_id == target_emp_id,
        models.ExamRecord.submit_time.isnot(None)
    )
    
    # 排序
    if sort_by == "score":
        order_by = models.ExamRecord.total_score.desc() if order == "desc" else models.ExamRecord.total_score.asc()
    else:  # time
        order_by = models.ExamRecord.submit_time.desc() if order == "desc" else models.ExamRecord.submit_time.asc()
    
    base_query = base_query.order_by(order_by)
    
    # 分頁
    total = base_query.count()
    offset = (page - 1) * page_size
    records = base_query.offset(offset).limit(page_size).all()
    
    results = []
    for r in records:
        # 計算作答時間
        duration = None
        if r.start_time and r.submit_time:
            duration = (r.submit_time - r.start_time).total_seconds()
        
        results.append({
            "record_id": r.id,
            "plan_id": r.plan_id,
            "plan_title": r.plan_title,
            "score": r.total_score,
            "is_passed": r.is_passed,
            "start_time": r.start_time.isoformat() if r.start_time else None,
            "submit_time": r.submit_time.isoformat() if r.submit_time else None,
            "duration": round(duration, 0) if duration else None,  # 秒數
            "attempts": r.attempts
        })
    
    return {
        "emp_id": target_emp_id,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
        "records": results
    }

@router.get("/personal/analysis")
def get_personal_analysis(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    emp_id: Optional[str] = Query(None, description="員工編號（僅 Admin 可使用）")
):
    """
    T3.3: 獲取個人學習分析
    - 擅長領域（哪些分類的成績較好）
    - 需要加強的領域（哪些分類的成績較差）
    - 學習進度（已完成 / 總計畫數）
    - 成績趨勢資料（用於折線圖）
    """
    # 權限控制
    target_emp_id = emp_id if emp_id and current_user.role and current_user.role.name == "Admin" else current_user.emp_id
    
    if emp_id and (not current_user.role or current_user.role.name != "Admin"):
        raise HTTPException(status_code=403, detail="只有 Admin 可以查看其他使用者的成績")
    
    # 取得該使用者的所有考試記錄
    records = db.query(
        models.ExamRecord,
        models.TrainingPlan,
        models.SubCategory
    ).join(
        models.TrainingPlan, models.ExamRecord.plan_id == models.TrainingPlan.id
    ).join(
        models.SubCategory, models.TrainingPlan.sub_category_id == models.SubCategory.id
    ).filter(
        models.ExamRecord.emp_id == target_emp_id,
        models.ExamRecord.submit_time.isnot(None)
    ).all()
    
    # 計算學習進度
    user = db.query(models.User).filter(models.User.emp_id == target_emp_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="使用者不存在")
    
    # 取得該使用者應考的所有計畫數（受課單位包含該使用者部門的計畫）
    total_plans = db.query(models.TrainingPlan).filter(
        models.TrainingPlan.target_departments.any(id=user.dept_id)
    ).count()
    
    completed_plans = len(set(r.ExamRecord.plan_id for r in records))
    progress_rate = (completed_plans / total_plans * 100) if total_plans > 0 else 0
    
    # 按分類統計成績
    category_stats = {}
    for r in records:
        category_id = r.SubCategory.id
        category_name = r.SubCategory.name
        
        if category_id not in category_stats:
            category_stats[category_id] = {
                "category_id": category_id,
                "category_name": category_name,
                "scores": [],
                "count": 0
            }
        
        category_stats[category_id]["scores"].append(r.ExamRecord.total_score)
        category_stats[category_id]["count"] += 1
    
    # 計算每個分類的平均分數
    category_analysis = []
    for cat_id, stats in category_stats.items():
        avg_score = sum(stats["scores"]) / len(stats["scores"]) if stats["scores"] else 0
        category_analysis.append({
            "category_id": cat_id,
            "category_name": stats["category_name"],
            "avg_score": round(avg_score, 1),
            "count": stats["count"]
        })
    
    # 排序：平均分數高的在前（擅長領域），低的在後（需要加強）
    category_analysis.sort(key=lambda x: x["avg_score"], reverse=True)
    
    # 擅長領域（平均分數 >= 80）
    strong_areas = [c for c in category_analysis if c["avg_score"] >= 80]
    
    # 需要加強的領域（平均分數 < 60）
    weak_areas = [c for c in category_analysis if c["avg_score"] < 60]
    
    # 成績趨勢資料（過去 6 個月，按月統計）
    now = datetime.now()
    trend_data = []
    for i in range(5, -1, -1):  # 過去 6 個月
        target_date = now - timedelta(days=30 * i)
        month_start = date(target_date.year, target_date.month, 1)
        if target_date.month == 12:
            month_end = date(target_date.year + 1, 1, 1) - timedelta(days=1)
        else:
            month_end = date(target_date.year, target_date.month + 1, 1) - timedelta(days=1)
        
        month_start_dt = datetime.combine(month_start, datetime.min.time())
        month_end_dt = datetime.combine(month_end, datetime.max.time())
        
        # 查詢該月的考試記錄
        month_records = [r for r in records if 
                        r.ExamRecord.submit_time and 
                        month_start_dt <= r.ExamRecord.submit_time <= month_end_dt]
        
        if month_records:
            avg_score = sum(r.ExamRecord.total_score for r in month_records) / len(month_records)
            count = len(month_records)
        else:
            avg_score = 0
            count = 0
        
        trend_data.append({
            "month": f"{target_date.year}-{target_date.month:02d}",
            "year": target_date.year,
            "month_num": target_date.month,
            "avg_score": round(avg_score, 1),
            "count": count
        })
    
    return {
        "emp_id": target_emp_id,
        "progress": {
            "completed": completed_plans,
            "total": total_plans,
            "progress_rate": round(progress_rate, 1)
        },
        "strong_areas": strong_areas,
        "weak_areas": weak_areas,
        "category_analysis": category_analysis,
        "trend_data": trend_data
    }

# --- T4: 成績詳情檢視 API ---

@router.get("/record/{record_id}/detail")
def get_exam_record_detail(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    T4.1: 獲取單筆成績詳情
    - 基本資訊：考生姓名、員工編號、部門、訓練計畫名稱、日期、考試分數、通過狀態、作答時間、提交時間、重考次數
    - 答題詳情：每題的題目內容、使用者答案 vs 正確答案、是否答對、配分與得分
    
    權限控制：
    - 使用者只能查看自己的成績詳情
    - Admin 可查看所有成績詳情
    """
    # 取得考試記錄
    record = db.query(models.ExamRecord).filter(models.ExamRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="考試記錄不存在")
    
    # 權限控制
    is_admin = current_user.role and current_user.role.name == "Admin"
    if not is_admin and record.emp_id != current_user.emp_id:
        raise HTTPException(status_code=403, detail="您只能查看自己的成績詳情")
    
    # 取得使用者資訊
    user = db.query(models.User).filter(models.User.emp_id == record.emp_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="使用者不存在")
    
    # 取得部門資訊
    dept = db.query(models.Department).filter(models.Department.id == user.dept_id).first()
    
    # 取得訓練計畫資訊
    plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == record.plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="訓練計畫不存在")
    
    # 計算作答時間
    duration = None
    if record.start_time and record.submit_time:
        duration = (record.submit_time - record.start_time).total_seconds()
    
    # 取得答題詳情
    exam_details = db.query(
        models.ExamDetail,
        models.Question
    ).join(
        models.Question, models.ExamDetail.question_id == models.Question.id
    ).filter(
        models.ExamDetail.record_id == record_id
    ).all()
    
    # 整理答題詳情
    question_details = []
    for detail, question in exam_details:
        # 計算該題得分
        earned_points = question.points if detail.is_correct else 0
        
        question_details.append({
            "question_id": question.id,
            "question_number": len(question_details) + 1,
            "content": question.content,
            "question_type": question.question_type,
            "options": question.options,  # JSON 字串
            "correct_answer": question.answer,
            "user_answer": detail.user_answer,
            "is_correct": detail.is_correct,
            "points": question.points,
            "earned_points": earned_points
        })
    
    # 按題目 ID 排序（保持原始順序）
    question_details.sort(key=lambda x: x["question_id"])
    
    return {
        "record_id": record.id,
        "basic_info": {
            "emp_id": user.emp_id,
            "name": user.name,
            "dept_name": dept.name if dept else "未知",
            "plan_id": plan.id,
            "plan_title": plan.title,
            "training_date": plan.training_date.isoformat() if plan.training_date else None,
            "end_date": plan.end_date.isoformat() if plan.end_date else None,
            "passing_score": plan.passing_score,
            "total_score": record.total_score,
            "is_passed": record.is_passed,
            "start_time": record.start_time.isoformat() if record.start_time else None,
            "submit_time": record.submit_time.isoformat() if record.submit_time else None,
            "duration": round(duration, 0) if duration else None,  # 秒數
            "attempts": record.attempts
        },
        "question_details": question_details
    }

# --- 報到功能 API ---

@router.get("/plan/{plan_id}/attendance/status", response_model=schemas.AttendanceStatus)
def get_attendance_status(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """檢查當前用戶是否已報到該計畫"""
    # 查詢報到記錄
    attendance = db.query(models.AttendanceRecord).filter(
        models.AttendanceRecord.emp_id == current_user.emp_id,
        models.AttendanceRecord.plan_id == plan_id
    ).first()
    
    if attendance:
        return {
            "is_checked_in": True,
            "checkin_time": attendance.checkin_time
        }
    else:
        return {
            "is_checked_in": False,
            "checkin_time": None
        }

@router.post("/plan/{plan_id}/attendance/checkin", response_model=schemas.CheckInResponse)
def check_in_attendance(
    plan_id: int,
    request: FastAPIRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """執行報到動作"""
    # 1. 檢查計畫是否存在
    plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="訓練計畫不存在")
    
    # 2. 檢查是否已報到（避免重複報到）
    existing = db.query(models.AttendanceRecord).filter(
        models.AttendanceRecord.emp_id == current_user.emp_id,
        models.AttendanceRecord.plan_id == plan_id
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="您已經報到過此訓練計畫")
    
    # 3. 檢查計畫是否在有效期間內
    today = date.today()
    if today < plan.training_date:
        raise HTTPException(status_code=400, detail="訓練計畫尚未開始")
    if plan.end_date and today > plan.end_date:
        raise HTTPException(status_code=400, detail="訓練計畫已結束")
    
    # 4. 檢查用戶是否在受課對象中
    if plan.target_departments:
        user_dept_ids = [dept.id for dept in plan.target_departments]
        if current_user.dept_id not in user_dept_ids:
            raise HTTPException(status_code=403, detail="您不在本訓練計畫的受課對象中")
    
    # 5. 獲取客戶端 IP 地址
    client_ip = None
    if request:
        # 嘗試從多個 header 中獲取 IP（考慮代理情況）
        if "x-forwarded-for" in request.headers:
            client_ip = request.headers["x-forwarded-for"].split(",")[0].strip()
        elif "x-real-ip" in request.headers:
            client_ip = request.headers["x-real-ip"]
        else:
            client_ip = request.client.host if request.client else None
    
    # 6. 建立報到記錄
    attendance = models.AttendanceRecord(
        emp_id=current_user.emp_id,
        plan_id=plan_id,
        checkin_time=datetime.utcnow(),
        ip_address=client_ip
    )
    
    db.add(attendance)
    try:
        db.commit()
        db.refresh(attendance)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"報到失敗：{str(e)}")
    
    return {
        "success": True,
        "checkin_time": attendance.checkin_time
    }
