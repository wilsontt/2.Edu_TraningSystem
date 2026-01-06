from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from typing import List, Optional
from .. import models, schemas
from ..database import get_db
from .auth import check_permission

router = APIRouter(prefix="/admin/reports", tags=["reports"])

# --- Overview Statistics ---
@router.get("/overview")
def get_overview_statistics(db: Session = Depends(get_db), current_user = check_permission("menu:report")):
    """
    獲取總體統計數據:
    - 總考試場次 (TrainingPlans with timer_enabled maybe? Or just count records)
    - 總應考人次 (ExamRecords count)
    - 平均分數 (Avg total_score)
    - 總體及格率 (Passed count / Total count)
    """
    total_records = db.query(models.ExamRecord).count()
    if total_records == 0:
        return {
            "total_exams": 0,
            "total_records": 0,
            "average_score": 0,
            "pass_rate": 0
        }

    # 總考試場次 (以有產生成績的計畫數計算，或所有計畫數)
    # 這裡計算這段期間有考試紀錄的計畫數
    distinct_plans = db.query(models.ExamRecord.plan_id).distinct().count()
    
    avg_score = db.query(func.avg(models.ExamRecord.total_score)).scalar() or 0
    passed_count = db.query(models.ExamRecord).filter(models.ExamRecord.is_passed == True).count()
    pass_rate = (passed_count / total_records) * 100

    return {
        "total_exams": distinct_plans,
        "total_records": total_records,
        "average_score": round(avg_score, 1),
        "pass_rate": round(pass_rate, 1)
    }

# --- Department Statistics ---
@router.get("/department")
def get_department_statistics(db: Session = Depends(get_db), current_user = check_permission("menu:report")):
    """
    各部門與單位統計列表
    """
    # SQL: SELECT d.name, count(r.id), avg(r.total_score), sum(case when r.is_passed then 1 else 0 end) 
    # FROM departments d JOIN users u ON d.id = u.dept_id JOIN exam_records r ON u.emp_id = r.emp_id 
    # GROUP BY d.id
    
    try:
        results = db.query(
            models.Department.name,
            func.count(models.ExamRecord.id).label("count"),
            func.avg(models.ExamRecord.total_score).label("avg_score"),
            func.sum(case([(models.ExamRecord.is_passed == True, 1)], else_=0)).label("passed_count")
        ).join(models.User, models.Department.id == models.User.dept_id)\
         .join(models.ExamRecord, models.User.emp_id == models.ExamRecord.emp_id)\
         .group_by(models.Department.id).all()
        
        stats = []
        for r in results:
            total = r.count
            passed = r.passed_count or 0 # sum might return None
            pass_rate = (passed / total * 100) if total > 0 else 0
            stats.append({
                "name": r.name,
                "count": total,
                "avg_score": round(r.avg_score or 0, 1),
                "pass_rate": round(pass_rate, 1)
            })
        
        return stats
    except Exception as e:
        print(f"Error in department stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- Plan Statistics ---
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
            func.sum(case([(models.ExamRecord.is_passed == True, 1)], else_=0)).label("passed_count")
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

# --- PDF Export ---
from fastapi.responses import StreamingResponse
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from io import BytesIO
from typing import Optional

@router.get("/export/pdf")
def export_pdf(plan_id: Optional[int] = None, db: Session = Depends(get_db)): # current_user removed for easy browser testing
    """
    導出成績單 PDF
    """
    buffer = BytesIO()
    p = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    # Title
    p.setFont("Helvetica-Bold", 20)
    p.drawString(100, height - 50, "Training Exam Report")

    # Content
    y = height - 100
    p.setFont("Helvetica", 12)

    if plan_id:
        plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == plan_id).first()
        title = f"Plan: {plan.title}" if plan else "Unknown Plan"
        records = db.query(models.ExamRecord).filter(models.ExamRecord.plan_id == plan_id).all()
    else:
        title = "All Plans Overview"
        records = db.query(models.ExamRecord).all()

    p.drawString(50, y, title)
    y -= 30
    
    p.drawString(50, y, f"Total Records: {len(records)}")
    y -= 30

    # Table Header
    headers = ["Emp ID", "Score", "Result", "Date"]
    x_positions = [50, 150, 250, 350]
    
    for i, h in enumerate(headers):
        p.drawString(x_positions[i], y, h)
    
    y -= 20
    p.line(50, y+15, 500, y+15)

    # Table Rows
    for r in records:
        if y < 50:
            p.showPage()
            y = height - 50
        
        p.drawString(x_positions[0], y, str(r.emp_id))
        p.drawString(x_positions[1], y, str(r.total_score))
        p.drawString(x_positions[2], y, "Pass" if r.is_passed else "Fail")
        p.drawString(x_positions[3], y, str(r.submit_time.date()) if r.submit_time else "-")
        y -= 20

    p.showPage()
    p.save()

    buffer.seek(0)
    return StreamingResponse(
        buffer, 
        media_type="application/pdf", 
        headers={"Content-Disposition": "attachment; filename=report.pdf"}
    )
