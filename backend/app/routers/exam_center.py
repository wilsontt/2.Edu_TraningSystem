"""
考試中心路由 (Exam Center Router)
負責處理學員端的考試流程，包括：
1. 我的考試列表 (區分進行中、已過期、已封存)。
2. 報到狀態檢查與報到執行。
3. 開始考試 (發放不含答案的題目)。
4. 提交答案 (自動評分、記錄歷程、更新通過狀態)。
5. 成績單預覽與 PDF 導出。
"""

from fastapi import APIRouter, HTTPException, Depends, Query, Body, Request as FastAPIRequest
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_, or_, case
from typing import List, Optional
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from pydantic import BaseModel
from .. import models, schemas
from ..database import get_db
from .auth import get_current_user
from ..access_scope import get_scope_emp_ids, is_active_user_status

_TZ_TAIPEI = ZoneInfo("Asia/Taipei")


def _training_plan_status_filter_expr_exam(status: str):
    """與 GET /training/plans、報表 overview 之 plan_status 語意一致。"""
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
    return models.TrainingPlan.is_archived == True


def _now_taipei_naive() -> datetime:
    """業務時區 Asia/Taipei 的牆上時間（naive datetime），報到與交卷需一致。"""
    return datetime.now(_TZ_TAIPEI).replace(tzinfo=None)


_ATTENDANCE_REQUIRED_MSG = "請先完成報到後再開始考試"


def _require_attendance_record(db: Session, emp_id: str, plan_id: int) -> None:
    """無報到列則拒絕開考／交卷（業務鐵律：須先報到）。"""
    exists = db.query(models.AttendanceRecord.id).filter(
        models.AttendanceRecord.emp_id == emp_id,
        models.AttendanceRecord.plan_id == plan_id,
    ).first()
    if not exists:
        raise HTTPException(status_code=403, detail=_ATTENDANCE_REQUIRED_MSG)


def _history_already_covers_record_submit(
    history_list: List[dict],
    record_submit_time: Optional[datetime],
    total_score: Optional[int],
    is_passed: Optional[bool],
) -> bool:
    """
    判斷 ExamHistory 是否已涵蓋目前 ExamRecord 的最後一次提交。
    除 ISO 字串完全一致外，亦容忍舊版 submit_exam 曾以兩次 datetime.now() 造成的微秒差。
    """
    if not record_submit_time:
        return True
    record_iso = record_submit_time.isoformat()
    if any(row.get("submit_time") == record_iso for row in history_list):
        return True
    r_naive = (
        record_submit_time.replace(tzinfo=None)
        if getattr(record_submit_time, "tzinfo", None)
        else record_submit_time
    )
    for row in history_list:
        st = row.get("submit_time")
        if not st or not isinstance(st, str):
            continue
        try:
            h_raw = datetime.fromisoformat(st.replace("Z", "+00:00"))
            h_naive = h_raw.replace(tzinfo=None) if h_raw.tzinfo else h_raw
            if abs((h_naive - r_naive).total_seconds()) > 2:
                continue
            if row.get("total_score") != total_score:
                continue
            if row.get("is_passed") != is_passed:
                continue
            return True
        except (ValueError, TypeError):
            continue
    return False


router = APIRouter(prefix="/exam", tags=["exam_center"])

# --- 權限判斷工具 ---
def is_admin_or_system_role(role_name: str) -> bool:
    normalized_role = (role_name or "").strip().lower()
    return (
        normalized_role == "admin"
        or "admin" in normalized_role
        or (role_name or "").strip() == "系統管理者"
    )


def _has_menu_report_permission(current_user: models.User) -> bool:
    if not current_user or not current_user.role or not current_user.role.functions:
        return False
    return any(f.code == "menu:report" for f in current_user.role.functions)


def _can_view_emp_id(db: Session, current_user: models.User, target_emp_id: str) -> bool:
    target_user = db.query(models.User).filter(models.User.emp_id == target_emp_id).first()
    if not target_user or not is_active_user_status(target_user.status):
        return False

    role_name = (current_user.role and current_user.role.name) or ""
    if is_admin_or_system_role(role_name):
        return True
    if target_emp_id == current_user.emp_id:
        return True
    if not _has_menu_report_permission(current_user):
        return False
    allowed_emp_ids = get_scope_emp_ids(db, current_user, active_only=True)
    return allowed_emp_ids is None or target_emp_id in allowed_emp_ids

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

    # 管理帳號（is_trainee=False）不參與訓練考試流程
    if not current_user.is_trainee:
        return []

    # 為了相容舊資料庫，is_archived 可能為 NULL，視同未封存
    base_query = db.query(models.TrainingPlan).options(
        joinedload(models.TrainingPlan.questions),
    ).filter(
        or_(
            models.TrainingPlan.is_archived == False,
            models.TrainingPlan.is_archived.is_(None),
        )
    )

    # 條件：未設定受課對象（全公司） OR 個人受訓對象含自己 OR 受課單位含自己部門
    no_targets = and_(
        ~models.TrainingPlan.target_departments.any(),
        ~models.TrainingPlan.target_users.any(),
    )
    in_target_users = models.TrainingPlan.target_users.any(emp_id=current_user.emp_id)
    or_conds = [no_targets, in_target_users]
    if current_user.dept_id is not None:
        or_conds.append(models.TrainingPlan.target_departments.any(id=current_user.dept_id))
    plans = base_query.filter(or_(*or_conds)).order_by(models.TrainingPlan.training_date.desc()).all()

    results = []

    plan_ids = [p.id for p in plans]
    record_by_plan_id: dict[int, models.ExamRecord] = {}
    if plan_ids:
        user_records = db.query(models.ExamRecord).filter(
            models.ExamRecord.emp_id == current_user.emp_id,
            models.ExamRecord.plan_id.in_(plan_ids),
        ).all()
        record_by_plan_id = {r.plan_id: r for r in user_records}

    history_count_by_record_id: dict[int, int] = {}
    if plan_ids:
        rows = db.query(
            models.ExamHistory.record_id,
            func.count(models.ExamHistory.id).label("history_count"),
        ).join(
            models.ExamRecord, models.ExamRecord.id == models.ExamHistory.record_id
        ).filter(
            models.ExamRecord.emp_id == current_user.emp_id,
            models.ExamRecord.plan_id.in_(plan_ids),
        ).group_by(models.ExamHistory.record_id).all()
        history_count_by_record_id = {int(r.record_id): int(r.history_count) for r in rows}

    for plan in plans:
        # Check if record exists
        record = record_by_plan_id.get(plan.id)
        
        status = "pending"
        score = None
        total = 100 # 預設總分
        
        # Calculate total points from questions
        # 若未優化可能導致 N+1 查詢，但通常計畫數不多，故暫時忽略
        # 計算總分
        qs = plan.questions
        calculated_total = sum([q.points for q in qs]) if qs else 0
        total = calculated_total if calculated_total > 0 else 100

        start_date = plan.training_date
        end_date = plan.end_date

        if record and record.submit_time is not None:
            status = "completed"
            score = record.total_score
        else:
            if today < start_date:
                status = "pending"
            elif end_date and today > end_date:
                status = "expired"
            else:
                status = "active"
        
        attempts = 0
        if record and record.submit_time is not None:
            history_count = history_count_by_record_id.get(record.id, 0)
            # 以 ExamHistory 筆數代表實際提交次數；舊資料無 history 時至少為 1
            attempts = history_count if history_count > 0 else 1

        # 過濾已過期訓練（不論是否已通過或提交成績）
        if end_date and today > end_date:
            continue

        results.append(ExamListItem(
            plan_id=plan.id,
            title=plan.title,
            training_date=plan.training_date,
            end_date=plan.end_date,
            status=status,
            score=score,
            total_points=total,
            attempts=attempts
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
    
    # 檢查計畫是否被封存
    if plan.is_archived:
        raise HTTPException(status_code=400, detail="該訓練計畫已被封存，無法進行考試")
        
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

    _require_attendance_record(db, current_user.emp_id, plan_id)

    # 建立或更新 ExamRecord 的 start_time（記錄開始作答時間）
    # 這樣在 submit_exam 時可以正確計算作答時間
    now = datetime.now()
    if record:
        # 如果是重考，更新 start_time 為本次開始時間
        # 只有在已經提交過（有 submit_time）或沒有 start_time 時才更新
        if record.submit_time or not record.start_time:
            # 已經提交過，表示這是重考，更新 start_time 為本次開始時間
            record.start_time = now
            db.commit()
    else:
        # 首次參加，建立新記錄並設定 start_time
        new_record = models.ExamRecord(
            emp_id=current_user.emp_id,
            plan_id=plan.id,
            start_time=now,
            attempts=0  # 尚未提交，attempts 為 0
        )
        db.add(new_record)
        db.commit()

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

def normalize_answer(answer: str, question_type: str) -> str:
    """
    正規化答案字串，用於比對。
    處理：
    1. 移除所有空格
    2. 統一轉為大寫
    3. 對於多選題：移除逗號、排序字母
    4. 對於單選題/是非題：直接正規化
    """
    if not answer:
        return ""
    
    # 移除空格並轉大寫
    normalized = answer.replace(" ", "").replace("，", ",").upper()
    
    # 如果是多選題（包含逗號或長度 > 1 的字母組合）
    if question_type == "multiple" or ("," in normalized or (len(normalized) > 1 and normalized.isalpha())):
        # 移除逗號，分割成字母，排序後重新組合
        letters = [c for c in normalized if c.isalpha()]
        letters.sort()
        return "".join(letters)
    
    # 單選題或是非題：直接返回正規化後的字串
    return normalized

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

    _require_attendance_record(db, current_user.emp_id, plan_id)

    # Fetch all questions
    questions = db.query(models.Question).filter(models.Question.plan_id == plan.id).all()
    
    total_score = 0
    earned_score = 0
    details_to_save = []
    response_details = []
    
    for q in questions:
        total_score += q.points
        user_ans = submit_data.answers.get(str(q.id)) or submit_data.answers.get(q.id, "")
        
        # 正規化答案後再比對
        normalized_user_ans = normalize_answer(str(user_ans), q.question_type)
        normalized_correct_ans = normalize_answer(q.answer, q.question_type)
        
        # Grading Logic (Normalized Match)
        is_correct = (normalized_user_ans == normalized_correct_ans)
        
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
    
    now = _now_taipei_naive()

    if existing_record:
        # Update existing record (Re-take)
        # 注意：start_time 應該在 start_exam 時已設定，這裡只更新 submit_time
        # 如果 start_time 為空（舊資料），則使用 submit_time 作為 fallback（但這不準確）
        if not existing_record.start_time:
            existing_record.start_time = now  # Fallback：如果沒有 start_time，使用 submit_time
        
        existing_record.total_score = earned_score
        existing_record.is_passed = is_passed
        existing_record.submit_time = now
        # attempts 定義為「提交次數」：首次提交應為 1（start_exam 會先建立 attempts=0 的 record）
        existing_record.attempts = (existing_record.attempts or 0) + 1
        
        # Clear old details
        db.query(models.ExamDetail).filter(models.ExamDetail.record_id == existing_record.id).delete()
        
        record_id = existing_record.id
    else:
        # Create new record
        # 注意：start_time 應該在 start_exam 時已設定，這裡只設定 submit_time
        # 如果沒有 start_time（舊流程），則使用 submit_time 作為 fallback
        new_record = models.ExamRecord(
            emp_id=current_user.emp_id,
            plan_id=plan.id,
            total_score=earned_score,
            is_passed=is_passed,
            start_time=now,  # Fallback：如果 start_exam 沒有設定，這裡設定
            submit_time=now,
            attempts=1
        )
        db.add(new_record)
        db.flush()
        record_id = new_record.id
    
    # Save Details
    for d in details_to_save:
        d.record_id = record_id
        db.add(d)
        
    # Save History Record (New Feature)
    # Serialize details to JSON
    import json
    details_json = json.dumps([
        {
            "question_id": d.question_id,
            "user_answer": d.user_answer,
            "is_correct": d.is_correct,
            # We need to store points here because question points might change in the future
            # But d (ExamDetail) doesn't have points. We need to look it up from 'questions' list.
            # Optimization: Create a map of q.id -> q
            "points": next((q.points for q in questions if q.id == d.question_id), 0),
            "content": next((q.content for q in questions if q.id == d.question_id), ""),
            "question_type": next((q.question_type for q in questions if q.id == d.question_id), ""),
            "options": next((q.options for q in questions if q.id == d.question_id), ""),
            "correct_answer": next((q.answer for q in questions if q.id == d.question_id), "")
        }
        for d in details_to_save
    ], ensure_ascii=False)

    history_record = models.ExamHistory(
        record_id=record_id,
        submit_time=now,
        total_score=earned_score,
        is_passed=is_passed,
        details=details_json
    )
    db.add(history_record)
        
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
    emp_id: Optional[str] = Query(None, description="員工編號（Admin 或具 menu:report 且範圍內可使用）"),
    plan_status: str = Query(
        "active",
        description="訓練計畫狀態：active／expired／archived（與訓練計畫管理相同）",
    ),
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
    target_emp_id = _resolve_personal_target_emp_id(db, current_user, emp_id)

    ps = (plan_status or "active").strip().lower()
    if ps not in ("active", "expired", "archived"):
        raise HTTPException(status_code=400, detail="plan_status 必須為 active、expired 或 archived")
    plan_status_expr = _training_plan_status_filter_expr_exam(ps)

    # 取得該使用者的考試記錄（依訓練計畫狀態篩選）
    records = (
        db.query(models.ExamRecord)
        .join(models.TrainingPlan, models.ExamRecord.plan_id == models.TrainingPlan.id)
        .filter(
            models.ExamRecord.emp_id == target_emp_id,
            models.ExamRecord.submit_time.isnot(None),
            plan_status_expr,
        )
        .all()
    )
    
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
    # 只計算有 start_time 和 submit_time 的記錄，且時間差必須 > 0
    total_study_time = 0
    for r in records:
        if r.start_time and r.submit_time:
            duration = (r.submit_time - r.start_time).total_seconds()
            # 只計算合理的時間差（> 0 且 < 24 小時，避免異常資料）
            if duration > 0 and duration < 86400:  # 24 小時 = 86400 秒
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

def _resolve_personal_target_emp_id(
    db: Session,
    current_user: models.User,
    emp_id: Optional[str],
) -> str:
    role_name = (current_user.role and current_user.role.name) or ""
    is_admin = is_admin_or_system_role(role_name)
    if emp_id:
        target_user = db.query(models.User).filter(models.User.emp_id == emp_id).first()
        if not target_user or not is_active_user_status(target_user.status):
            raise HTTPException(status_code=404, detail="該帳號已停用或不存在")
        if not is_admin:
            if not _has_menu_report_permission(current_user):
                raise HTTPException(status_code=403, detail="只有 Admin 或具成績中心權限者可以查看其他使用者的成績")
            allowed_emp_ids = get_scope_emp_ids(db, current_user, active_only=True)
            if allowed_emp_ids is not None and emp_id not in allowed_emp_ids:
                raise HTTPException(status_code=403, detail="目標員工不在您的可視範圍內")
        return emp_id
    return current_user.emp_id


@router.get("/personal/history")
def get_personal_history(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    emp_id: Optional[str] = Query(None, description="員工編號（Admin 或具 menu:report 且範圍內可使用）"),
    sort_by: str = Query(
        "time",
        description="排序：time / score / plan（計畫）/ name（姓名）/ dept（部門）/ attempts（重考次數）",
    ),
    order: str = Query("desc", description="排序方向：asc（升序）/desc（降序）"),
    page: int = Query(1, ge=1, description="頁碼"),
    page_size: int = Query(20, ge=1, le=100, description="每頁筆數"),
    keyword: Optional[str] = Query(None, description="關鍵字（計畫名稱、員工編號、姓名、部門）"),
):
    """
    T3.2: 獲取個人成績歷史
    - 所有考試記錄列表（時間倒序）
    - 每場考試的詳細資訊
    - 支援分頁與排序
    """
    target_emp_id = _resolve_personal_target_emp_id(db, current_user, emp_id)
    
    # 基礎查詢（含部門／姓名供關鍵字與列表顯示）
    history_counts_sq = db.query(
        models.ExamHistory.record_id.label("record_id"),
        func.count(models.ExamHistory.id).label("history_count"),
    ).group_by(models.ExamHistory.record_id).subquery()

    # list_attempts：以 ExamHistory 筆數為主；若無 history 但已有 submit_time（舊資料）視為 1
    list_attempts_expr = case(
        (
            and_(
                models.ExamRecord.submit_time.isnot(None),
                func.coalesce(history_counts_sq.c.history_count, 0) <= 0,
            ),
            1,
        ),
        else_=func.coalesce(history_counts_sq.c.history_count, 0),
    )

    base_query = db.query(
        models.ExamRecord.id,
        models.ExamRecord.plan_id,
        models.TrainingPlan.title.label("plan_title"),
        models.ExamRecord.total_score,
        models.ExamRecord.is_passed,
        models.ExamRecord.start_time,
        models.ExamRecord.submit_time,
        list_attempts_expr.label("attempts"),
        models.User.name.label("user_name"),
        models.Department.name.label("dept_name"),
    ).join(
        models.TrainingPlan, models.ExamRecord.plan_id == models.TrainingPlan.id
    ).join(
        models.User, models.ExamRecord.emp_id == models.User.emp_id
    ).outerjoin(
        models.Department, models.User.dept_id == models.Department.id
    ).outerjoin(
        history_counts_sq, models.ExamRecord.id == history_counts_sq.c.record_id
    ).filter(
        models.ExamRecord.emp_id == target_emp_id,
        models.ExamRecord.submit_time.isnot(None)
    )

    if keyword and keyword.strip():
        kw = f"%{keyword.strip()}%"
        base_query = base_query.filter(
            or_(
                models.TrainingPlan.title.ilike(kw),
                models.User.name.ilike(kw),
                models.User.emp_id.ilike(kw),
                models.Department.name.ilike(kw),
            )
        )
    
    # 排序
    if sort_by == "score":
        order_by = models.ExamRecord.total_score.desc() if order == "desc" else models.ExamRecord.total_score.asc()
    elif sort_by == "plan":
        order_by = models.TrainingPlan.title.desc() if order == "desc" else models.TrainingPlan.title.asc()
    elif sort_by == "name":
        order_by = models.User.name.desc() if order == "desc" else models.User.name.asc()
    elif sort_by == "dept":
        order_by = models.Department.name.desc() if order == "desc" else models.Department.name.asc()
    elif sort_by == "attempts":
        order_by = list_attempts_expr.desc() if order == "desc" else list_attempts_expr.asc()
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
            diff = (r.submit_time - r.start_time).total_seconds()
            duration = diff if diff >= 0 else None
        
        results.append({
            "record_id": r.id,
            "plan_id": r.plan_id,
            "plan_title": r.plan_title,
            "score": r.total_score,
            "is_passed": r.is_passed,
            "start_time": r.start_time.isoformat() if r.start_time else None,
            "submit_time": r.submit_time.isoformat() if r.submit_time else None,
            "duration": round(duration, 0) if duration else None,  # 秒數
            "attempts": int(r.attempts or 0),
            "emp_id": target_emp_id,
            "name": r.user_name or "",
            "dept_name": r.dept_name or "",
        })
    
    return {
        "emp_id": target_emp_id,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
        "records": results
    }


def _personal_score_print_rows(
    db: Session,
    target_emp_id: str,
    plan_ids: List[int],
):
    if not plan_ids:
        return []
    base_query = db.query(
        models.ExamRecord.id.label("record_id"),
        models.ExamRecord.emp_id,
        models.User.name,
        models.Department.name.label("dept_name"),
        models.ExamRecord.plan_id,
        models.TrainingPlan.title.label("plan_title"),
        models.ExamRecord.total_score,
        models.ExamRecord.is_passed,
        models.ExamRecord.submit_time,
    )     .join(models.User, models.ExamRecord.emp_id == models.User.emp_id)\
     .outerjoin(models.Department, models.User.dept_id == models.Department.id)\
     .join(models.TrainingPlan, models.ExamRecord.plan_id == models.TrainingPlan.id)\
     .filter(
        models.ExamRecord.emp_id == target_emp_id,
        models.ExamRecord.plan_id.in_(plan_ids),
        models.ExamRecord.submit_time.isnot(None),
    )
    rows = base_query.order_by(models.ExamRecord.submit_time.desc()).all()
    return [{
        "record_id": r.record_id,
        "emp_id": r.emp_id,
        "name": r.name,
        "dept_name": r.dept_name,
        "plan_id": r.plan_id,
        "plan_title": r.plan_title,
        "total_score": r.total_score,
        "is_passed": r.is_passed,
        "submit_time": r.submit_time.isoformat() if r.submit_time else None,
    } for r in rows]


@router.get("/personal/print/plan-options")
def get_personal_print_plan_options(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    emp_id: Optional[str] = Query(None, description="員工編號（Admin 或具 menu:report 且範圍內可使用）"),
):
    target_emp_id = _resolve_personal_target_emp_id(db, current_user, emp_id)
    query = db.query(
        models.TrainingPlan.id,
        models.TrainingPlan.title,
        models.TrainingPlan.training_date,
    ).join(
        models.ExamRecord, models.TrainingPlan.id == models.ExamRecord.plan_id
    ).filter(
        models.ExamRecord.emp_id == target_emp_id,
        models.ExamRecord.submit_time.isnot(None),
    ).distinct(models.TrainingPlan.id).order_by(models.TrainingPlan.training_date.desc())
    rows = query.all()
    return [
        {
            "plan_id": r.id,
            "plan_title": r.title,
            "training_date": r.training_date.isoformat() if r.training_date else None,
        }
        for r in rows
    ]


@router.post("/personal/print/preview")
def personal_print_preview(
    print_mode: str = Body("list"),
    plan_ids: List[int] = Body(default=[]),
    include_employee_signature: bool = Body(False),
    include_exam_history: bool = Body(False),
    emp_id: Optional[str] = Body(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    target_emp_id = _resolve_personal_target_emp_id(db, current_user, emp_id)
    items = _personal_score_print_rows(db, target_emp_id, plan_ids)
    return {
        "total": len(items),
        "items": items,
        "options": {
            "print_mode": print_mode,
            "include_employee_signature": include_employee_signature,
            "include_exam_history": include_exam_history,
        },
    }


@router.post("/personal/print/pdf")
def personal_print_pdf(
    print_mode: str = Body("list"),
    plan_ids: List[int] = Body(default=[]),
    include_employee_signature: bool = Body(False),
    include_exam_history: bool = Body(False),
    emp_id: Optional[str] = Body(None),
    plan_title: Optional[str] = Body(None, description="抬頭用訓練計畫名稱（歷程成績列印）"),
    document_context: str = Body("personal_exam_history", description="default | personal_exam_history，個人端固定帶歷程列印樣式"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    個人端考試歷程成績 PDF（T13）。
    `plan_title`、`document_context=personal_exam_history` 傳入 `render_score_print_pdf_to_buffer`；
    下載檔名由前端 `PlanHistoryModal` 依規格組字（見 1.docs/reviews/T13-…-20260423.md）。
    """
    from .report import render_score_print_pdf_to_buffer

    target_emp_id = _resolve_personal_target_emp_id(db, current_user, emp_id)
    items = _personal_score_print_rows(db, target_emp_id, plan_ids)
    buffer = render_score_print_pdf_to_buffer(
        db,
        items,
        print_mode,
        include_employee_signature,
        include_exam_history,
        document_context=document_context,
        personal_plan_title=plan_title,
    )
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=personal_score_print.pdf"},
    )


@router.get("/personal/analysis")
def get_personal_analysis(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    emp_id: Optional[str] = Query(None, description="員工編號（Admin 或具 menu:report 且範圍內可使用）"),
    trend_period: int = Query(6, description="成績趨勢時間範圍（月數）：3、6、12")
):
    """
    T3.3: 獲取個人學習分析
    - 擅長領域（哪些分類的成績較好）
    - 需要加強的領域（哪些分類的成績較差）
    - 學習進度（已完成 / 總計畫數）
    - 成績趨勢資料（用於折線圖）
    
    參數：
    - trend_period: 成績趨勢的時間範圍（月數），預設為 6，可選 3、6、12
    """
    # 驗證 trend_period 參數
    if trend_period not in [3, 6, 12]:
        raise HTTPException(status_code=400, detail="trend_period 參數必須為 3、6 或 12")
    
    target_emp_id = _resolve_personal_target_emp_id(db, current_user, emp_id)
    
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
    
    # 成績趨勢資料（依 trend_period 參數決定時間範圍，按月統計）
    now = datetime.now()
    trend_data = []
    # 計算要往前推幾個月（含當月）
    months_to_go_back = trend_period - 1  # 例如 6 個月：0, 1, 2, 3, 4, 5（共 6 個月）
    for i in range(months_to_go_back, -1, -1):  # 從最舊的月份到當月
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
    if not _can_view_emp_id(db, current_user, record.emp_id):
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
    
    # 取得歷史紀錄
    history_records = db.query(models.ExamHistory).filter(
        models.ExamHistory.record_id == record_id
    ).order_by(models.ExamHistory.submit_time.asc()).all()
    
    history_list = []
    for h in history_records:
        history_list.append({
            "id": h.id,
            "submit_time": h.submit_time.isoformat() if h.submit_time else None,
            "total_score": h.total_score,
            "is_passed": h.is_passed
        })

    # 舊資料可能出現 ExamRecord.attempts 已增加，但最後一次提交未寫入 ExamHistory。
    # 為了讓「考試歷程記錄」與列表重考次數一致，若缺少當前 record 的提交資訊則補一筆。
    if record.submit_time:
        has_current_submit = _history_already_covers_record_submit(
            history_list,
            record.submit_time,
            record.total_score,
            record.is_passed,
        )
        if not has_current_submit:
            record_submit_iso = record.submit_time.isoformat()
            history_list.append({
                "id": None,
                "submit_time": record_submit_iso,
                "total_score": record.total_score,
                "is_passed": record.is_passed,
            })
            history_list.sort(key=lambda x: x.get("submit_time") or "")

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
        "question_details": question_details,
        "history": history_list
    }

@router.get("/history/{history_id}")
def get_exam_history_detail(
    history_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    T4.2: 獲取單筆歷史紀錄詳情 (Snapshot)
    """
    # 1. 取得歷史紀錄
    history = db.query(models.ExamHistory).filter(models.ExamHistory.id == history_id).first()
    if not history:
        raise HTTPException(status_code=404, detail="歷史紀錄不存在")
    
    # 2. 取得關聯的 ExamRecord
    record = db.query(models.ExamRecord).filter(models.ExamRecord.id == history.record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="關聯的考試紀錄不存在")
        
    # 3. 權限控制
    if not _can_view_emp_id(db, current_user, record.emp_id):
        raise HTTPException(status_code=403, detail="您只能查看自己的成績詳情")
        
    # 4. 取得使用者資訊
    user = db.query(models.User).filter(models.User.emp_id == record.emp_id).first()
    
    # 5. 取得部門資訊
    dept = db.query(models.Department).filter(models.Department.id == user.dept_id).first()
    
    # 6. 取得訓練計畫資訊
    plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == record.plan_id).first()
    
    # 7. 解析 details JSON
    import json
    question_details = []
    if history.details:
        try:
            raw_details = json.loads(history.details)
            # 轉換格式以符合 ScoreDetail 介面
            for idx, d in enumerate(raw_details):
                question_details.append({
                    "question_id": d["question_id"],
                    "question_number": idx + 1,
                    "content": d["content"],
                    "question_type": d["question_type"],
                    "options": d["options"],
                    "correct_answer": d["correct_answer"],
                    "user_answer": d["user_answer"],
                    "is_correct": d["is_correct"],
                    "points": d["points"],
                    "earned_points": d["points"] if d["is_correct"] else 0
                })
        except Exception as e:
            print(f"Failed to parse history details: {e}")
            # Fallback: empty details or error message
            
    # 8. 取得歷史紀錄列表（同一 record 的所有嘗試）
    history_records = db.query(models.ExamHistory).filter(
        models.ExamHistory.record_id == record.id
    ).order_by(models.ExamHistory.submit_time.asc()).all()
    history_list = []
    for h in history_records:
        history_list.append({
            "id": h.id,
            "submit_time": h.submit_time.isoformat() if h.submit_time else None,
            "total_score": h.total_score,
            "is_passed": h.is_passed
        })

    # 與 /record/{record_id}/detail 一致：若缺少當前 record 的最後一次提交，補進歷程清單。
    if record.submit_time:
        has_current_submit = _history_already_covers_record_submit(
            history_list,
            record.submit_time,
            record.total_score,
            record.is_passed,
        )
        if not has_current_submit:
            record_submit_iso = record.submit_time.isoformat()
            history_list.append({
                "id": None,
                "submit_time": record_submit_iso,
                "total_score": record.total_score,
                "is_passed": record.is_passed,
            })
            history_list.sort(key=lambda x: x.get("submit_time") or "")

    # 9. 回傳資料
    return {
        "record_id": record.id, # 為了相容前端介面，這裡仍回傳 record_id
        "history_id": history.id,
        "basic_info": {
            "emp_id": user.emp_id,
            "name": user.name,
            "dept_name": dept.name if dept else "未知",
            "plan_id": plan.id,
            "plan_title": plan.title,
            "training_date": plan.training_date.isoformat() if plan.training_date else None,
            "end_date": plan.end_date.isoformat() if plan.end_date else None,
            "passing_score": plan.passing_score,
            "total_score": history.total_score, # 使用歷史紀錄的分數
            "is_passed": history.is_passed,     # 使用歷史紀錄的狀態
            "start_time": None, # 歷史紀錄目前沒存 start_time，暫時為 null
            "submit_time": history.submit_time.isoformat() if history.submit_time else None,
            "duration": None,   # 同上
            "attempts": record.attempts # 這是總次數，非當次次數，但可接受
        },
        "question_details": question_details,
        "history": history_list
    }

# --- 報到功能 API ---

@router.get("/plan/{plan_id}/attendance/status", response_model=schemas.AttendanceStatus)
def get_attendance_status(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """檢查當前用戶是否已報到該計畫"""
    attendance = db.query(models.AttendanceRecord).filter(
        models.AttendanceRecord.emp_id == current_user.emp_id,
        models.AttendanceRecord.plan_id == plan_id
    ).first()

    if attendance:
        return {
            "is_checked_in": True,
            "checkin_time": attendance.checkin_time
        }

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
    # 受課對象 = 受課單位全員（implicit）∪ 個人受課對象（explicit）；兩者皆未設定視為全公司。
    # 與 my_exams 應考名單解析一致，避免跨單位「個人受課對象」被誤擋。
    has_targets = bool(plan.target_departments) or bool(plan.target_users)
    if has_targets:
        in_dept = current_user.dept_id is not None and any(
            dept.id == current_user.dept_id for dept in plan.target_departments
        )
        in_users = any(u.emp_id == current_user.emp_id for u in plan.target_users)
        if not (in_dept or in_users):
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
        checkin_time=_now_taipei_naive(),
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
