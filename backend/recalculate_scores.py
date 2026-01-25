#!/usr/bin/env python3
"""
重新計算所有考試記錄的成績
使用修正後的答案正規化邏輯（處理多選題的逗號問題）

使用方法：
    python3 recalculate_scores.py [--plan-id PLAN_ID] [--dry-run]

參數：
    --plan-id PLAN_ID: 只重新計算指定計劃的成績（可選）
    --dry-run: 只顯示會修改的內容，不實際更新資料庫（可選）
"""

import sys
import os
import json
import argparse
from datetime import datetime

# 加入專案路徑
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app import models

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
    
    # 移除空格並轉大寫（處理全形逗號）
    normalized = answer.replace(" ", "").replace("，", ",").upper()
    
    # 如果是多選題（包含逗號或長度 > 1 的字母組合）
    if question_type == "multiple" or ("," in normalized or (len(normalized) > 1 and normalized.isalpha())):
        # 移除逗號，分割成字母，排序後重新組合
        letters = [c for c in normalized if c.isalpha()]
        letters.sort()
        return "".join(letters)
    
    # 單選題或是非題：直接返回正規化後的字串
    return normalized

def recalculate_record_score(record: models.ExamRecord, db, dry_run: bool = False):
    """
    重新計算單一考試記錄的分數
    """
    # 取得訓練計劃
    plan = record.training_plan
    if not plan:
        print(f"  警告：記錄 {record.id} 找不到對應的訓練計劃")
        return None
    
    # 取得該計劃的所有題目
    questions = db.query(models.Question).filter(
        models.Question.plan_id == plan.id
    ).all()
    
    if not questions:
        print(f"  警告：計劃 {plan.id} ({plan.title}) 沒有題目")
        return None
    
    # 建立題目 ID 到題目的映射
    question_map = {q.id: q for q in questions}
    
    # 取得該記錄的所有答題詳情
    details = db.query(models.ExamDetail).filter(
        models.ExamDetail.record_id == record.id
    ).all()
    
    # 計算總分和得分
    total_score = sum(q.points for q in questions)
    earned_score = 0
    updated_count = 0
    
    changes = []
    
    for detail in details:
        question = question_map.get(detail.question_id)
        if not question:
            continue
        
        # 使用正規化函數重新比對答案
        normalized_user_ans = normalize_answer(str(detail.user_answer), question.question_type)
        normalized_correct_ans = normalize_answer(question.answer, question.question_type)
        
        new_is_correct = (normalized_user_ans == normalized_correct_ans)
        
        # 檢查是否需要更新
        if detail.is_correct != new_is_correct:
            changes.append({
                "question_id": detail.question_id,
                "old_is_correct": detail.is_correct,
                "new_is_correct": new_is_correct,
                "user_answer": detail.user_answer,
                "correct_answer": question.answer,
                "points": question.points
            })
            detail.is_correct = new_is_correct
            updated_count += 1
        
        if new_is_correct:
            earned_score += question.points
    
    # 計算是否通過
    new_is_passed = (earned_score >= plan.passing_score)
    
    # 檢查是否需要更新記錄
    record_changed = False
    if record.total_score != earned_score:
        changes.append({
            "type": "total_score",
            "old": record.total_score,
            "new": earned_score
        })
        record.total_score = earned_score
        record_changed = True
    
    if record.is_passed != new_is_passed:
        changes.append({
            "type": "is_passed",
            "old": record.is_passed,
            "new": new_is_passed
        })
        record.is_passed = new_is_passed
        record_changed = True
    
    # 如果有變更，顯示並更新
    if changes:
        print(f"  記錄 {record.id} (考生: {record.emp_id}, 計劃: {plan.title})")
        print(f"    總分變更: {record.total_score if not record_changed else '舊值'} -> {earned_score}")
        print(f"    通過狀態: {record.is_passed if not record_changed else '舊值'} -> {new_is_passed}")
        print(f"    更新了 {updated_count} 題的答對狀態")
        
        if not dry_run:
            db.commit()
            print(f"    ✓ 已更新")
        else:
            print(f"    [DRY RUN] 未實際更新")
            db.rollback()
    
    return {
        "record_id": record.id,
        "emp_id": record.emp_id,
        "plan_id": plan.id,
        "plan_title": plan.title,
        "old_score": record.total_score if not record_changed else None,
        "new_score": earned_score,
        "old_passed": record.is_passed if not record_changed else None,
        "new_passed": new_is_passed,
        "updated_details": updated_count,
        "has_changes": len(changes) > 0
    }

def recalculate_history_snapshot(history: models.ExamHistory, db, dry_run: bool = False):
    """
    重新計算並更新 ExamHistory 中的快照資料
    """
    # 取得對應的 ExamRecord
    record = history.exam_record
    if not record:
        return None
    
    plan = record.training_plan
    if not plan:
        return None
    
    # 取得題目
    questions = db.query(models.Question).filter(
        models.Question.plan_id == plan.id
    ).all()
    question_map = {q.id: q for q in questions}
    
    # 解析現有的快照資料
    try:
        details_data = json.loads(history.details) if history.details else []
    except:
        details_data = []
    
    # 重新計算每個題目的 is_correct
    updated_details = []
    total_score = 0
    earned_score = 0
    
    for d in details_data:
        question = question_map.get(d.get("question_id"))
        if not question:
            continue
        
        # 重新比對答案
        normalized_user_ans = normalize_answer(str(d.get("user_answer", "")), question.question_type)
        normalized_correct_ans = normalize_answer(question.answer, question.question_type)
        new_is_correct = (normalized_user_ans == normalized_correct_ans)
        
        # 更新資料
        d["is_correct"] = new_is_correct
        d["points"] = question.points
        d["content"] = question.content
        d["question_type"] = question.question_type
        d["options"] = question.options
        d["correct_answer"] = question.answer
        
        updated_details.append(d)
        
        total_score += question.points
        if new_is_correct:
            earned_score += question.points
    
    # 計算是否通過
    new_is_passed = (earned_score >= plan.passing_score)
    
    # 檢查是否需要更新
    if (history.total_score != earned_score or 
        history.is_passed != new_is_passed or 
        history.details != json.dumps(updated_details, ensure_ascii=False)):
        
        print(f"  歷史記錄 {history.id} (記錄 ID: {record.id})")
        print(f"    總分變更: {history.total_score} -> {earned_score}")
        print(f"    通過狀態: {history.is_passed} -> {new_is_passed}")
        
        if not dry_run:
            history.total_score = earned_score
            history.is_passed = new_is_passed
            history.details = json.dumps(updated_details, ensure_ascii=False)
            db.commit()
            print(f"    ✓ 已更新")
        else:
            print(f"    [DRY RUN] 未實際更新")
            db.rollback()
        
        return {
            "history_id": history.id,
            "old_score": history.total_score,
            "new_score": earned_score,
            "old_passed": history.is_passed,
            "new_passed": new_is_passed,
            "has_changes": True
        }
    
    return None

def main():
    parser = argparse.ArgumentParser(description="重新計算所有考試記錄的成績")
    parser.add_argument("--plan-id", type=int, help="只重新計算指定計劃的成績")
    parser.add_argument("--dry-run", action="store_true", help="只顯示會修改的內容，不實際更新")
    args = parser.parse_args()
    
    db = SessionLocal()
    
    try:
        print("=" * 60)
        print("重新計算考試成績")
        print("=" * 60)
        if args.dry_run:
            print("⚠️  DRY RUN 模式：不會實際更新資料庫")
        print()
        
        # 查詢所有已提交的考試記錄
        query = db.query(models.ExamRecord).filter(
            models.ExamRecord.submit_time.isnot(None)
        )
        
        if args.plan_id:
            query = query.filter(models.ExamRecord.plan_id == args.plan_id)
            plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == args.plan_id).first()
            if plan:
                print(f"只處理計劃：{plan.id} - {plan.title}")
            else:
                print(f"錯誤：找不到計劃 ID {args.plan_id}")
                return
        else:
            print("處理所有計劃的考試記錄")
        
        records = query.all()
        print(f"找到 {len(records)} 筆考試記錄\n")
        
        # 統計資訊
        stats = {
            "total_records": len(records),
            "updated_records": 0,
            "updated_histories": 0,
            "total_score_changes": 0,
            "pass_status_changes": 0
        }
        
        # 處理每筆記錄
        for i, record in enumerate(records, 1):
            print(f"[{i}/{len(records)}] 處理記錄 ID: {record.id}")
            result = recalculate_record_score(record, db, args.dry_run)
            
            if result and result["has_changes"]:
                stats["updated_records"] += 1
                if result["old_score"] != result["new_score"]:
                    stats["total_score_changes"] += 1
                if result["old_passed"] != result["new_passed"]:
                    stats["pass_status_changes"] += 1
            
            # 處理該記錄的歷史快照
            histories = db.query(models.ExamHistory).filter(
                models.ExamHistory.record_id == record.id
            ).all()
            
            for history in histories:
                history_result = recalculate_history_snapshot(history, db, args.dry_run)
                if history_result and history_result["has_changes"]:
                    stats["updated_histories"] += 1
        
        print()
        print("=" * 60)
        print("統計結果")
        print("=" * 60)
        print(f"總記錄數：{stats['total_records']}")
        print(f"更新記錄數：{stats['updated_records']}")
        print(f"更新歷史快照數：{stats['updated_histories']}")
        print(f"分數變更數：{stats['total_score_changes']}")
        print(f"通過狀態變更數：{stats['pass_status_changes']}")
        
        if args.dry_run:
            print()
            print("⚠️  這是 DRY RUN，資料庫未實際更新")
            print("   若要實際更新，請移除 --dry-run 參數")
        
    except Exception as e:
        print(f"錯誤：{e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    main()
