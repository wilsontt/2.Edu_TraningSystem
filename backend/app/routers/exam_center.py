from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, datetime
from pydantic import BaseModel
from .. import models
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
            points=q.points
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
