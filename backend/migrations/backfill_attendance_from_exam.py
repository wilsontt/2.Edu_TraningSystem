"""
歷史報到資料補齊：有交卷紀錄但無 attendance_records 者，
以該員工該訓練計畫的第一次考試時間補登 checkin_time。

取值順序：
  1. MIN(exam_history.submit_time)
  2. exam_records.start_time（無 history 時）
  3. exam_records.submit_time

執行前請備份 data/education_training.db
執行：cd backend && .venv/bin/python3 migrations/backfill_attendance_from_exam.py
"""
import os
import sqlite3
from datetime import datetime

_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.abspath(os.path.join(_script_dir, "..", ".."))
db_path = os.path.join(_project_root, "data", "education_training.db")


def _resolve_first_exam_time(cursor: sqlite3.Cursor, record_id: int, start_time, submit_time):
    cursor.execute(
        """
        SELECT MIN(submit_time) FROM exam_history
        WHERE record_id = ?
        """,
        (record_id,),
    )
    row = cursor.fetchone()
    if row and row[0]:
        return row[0]
    if start_time:
        return start_time
    return submit_time


def run_backfill() -> dict:
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"Database not found: {db_path}")

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    inserted = 0
    skipped = 0
    no_time = 0

    try:
        cursor.execute(
            """
            SELECT er.id, er.emp_id, er.plan_id, er.start_time, er.submit_time
            FROM exam_records er
            LEFT JOIN attendance_records ar
              ON ar.emp_id = er.emp_id AND ar.plan_id = er.plan_id
            WHERE er.submit_time IS NOT NULL
              AND ar.id IS NULL
            """
        )
        rows = cursor.fetchall()

        for record_id, emp_id, plan_id, start_time, submit_time in rows:
            checkin_time = _resolve_first_exam_time(cursor, record_id, start_time, submit_time)
            if not checkin_time:
                no_time += 1
                print(f"  [SKIP no time] emp_id={emp_id} plan_id={plan_id} record_id={record_id}")
                continue

            cursor.execute(
                """
                SELECT id FROM attendance_records
                WHERE emp_id = ? AND plan_id = ?
                """,
                (emp_id, plan_id),
            )
            if cursor.fetchone():
                skipped += 1
                continue

            cursor.execute(
                """
                INSERT INTO attendance_records (emp_id, plan_id, checkin_time, ip_address)
                VALUES (?, ?, ?, NULL)
                """,
                (emp_id, plan_id, checkin_time),
            )
            inserted += 1
            print(f"  [INSERT] emp_id={emp_id} plan_id={plan_id} checkin_time={checkin_time}")

        conn.commit()

        cursor.execute(
            """
            SELECT COUNT(*) FROM exam_records er
            LEFT JOIN attendance_records ar
              ON ar.emp_id = er.emp_id AND ar.plan_id = er.plan_id
            WHERE er.submit_time IS NOT NULL AND ar.id IS NULL
            """
        )
        gap_count = cursor.fetchone()[0]

        return {
            "inserted": inserted,
            "skipped": skipped,
            "no_time": no_time,
            "gap_remaining": gap_count,
        }
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    print(f"Backfill attendance from exam records")
    print(f"Database: {db_path}")
    print(f"Started at: {datetime.now().isoformat()}")
    result = run_backfill()
    print("---")
    print(f"Inserted: {result['inserted']}")
    print(f"Skipped (already exists): {result['skipped']}")
    print(f"Skipped (no time): {result['no_time']}")
    print(f"Gap remaining (expect 0): {result['gap_remaining']}")
