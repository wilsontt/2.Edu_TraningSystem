"""
新增 material_file_formats 表，並植入預設允許格式與「影音教材」類型（20260704）。

執行方式（於 backend 目錄）：
  Windows: .\\.venv\\Scripts\\python.exe migrations/add_material_file_formats.py
  Linux/macOS: .venv/bin/python3 migrations/add_material_file_formats.py

備註：應用啟動時 Base.metadata.create_all 亦會建立缺少的表；本腳本供既有資料庫
明確、可重複執行之遷移（CREATE TABLE IF NOT EXISTS + 冪等植入）。執行前請先備份資料庫。
"""
import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "..", "..", "data", "education_training.db")

CREATE_MATERIAL_FILE_FORMATS = """
CREATE TABLE IF NOT EXISTS material_file_formats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ext VARCHAR UNIQUE,
    label VARCHAR,
    sort_order INTEGER DEFAULT 0,
    max_file_bytes INTEGER,
    is_active BOOLEAN DEFAULT 1,
    mime_types TEXT
)
"""

DEFAULT_FORMATS = [
    ("pdf", "PDF", 52428800, 10),
    ("doc", "Word DOC", 52428800, 20),
    ("docx", "Word DOCX", 52428800, 21),
    ("xls", "Excel XLS", 31457280, 30),
    ("xlsx", "Excel XLSX", 31457280, 31),
    ("ppt", "PowerPoint PPT", 52428800, 40),
    ("pptx", "PowerPoint PPTX", 52428800, 41),
    ("md", "Markdown", 5242880, 50),
    ("txt", "純文字", 5242880, 51),
    ("mp4", "影片 MP4", 524288000, 60),
    ("webm", "影片 WebM", 524288000, 61),
]

DEFAULT_MATERIAL_TYPES = [
    ("影音教材", "影音教材", 524288000, 70),
]


def run_migration():
    if not os.path.exists(db_path):
        print(f"Database {db_path} not found.")
        return

    print(f"Migrating database: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        cursor.execute(CREATE_MATERIAL_FILE_FORMATS)
        for ext, label, max_bytes, order in DEFAULT_FORMATS:
            cursor.execute("SELECT 1 FROM material_file_formats WHERE ext = ?", (ext,))
            if not cursor.fetchone():
                cursor.execute(
                    "INSERT INTO material_file_formats "
                    "(ext, label, max_file_bytes, sort_order, is_active) "
                    "VALUES (?, ?, ?, ?, 1)",
                    (ext, label, max_bytes, order),
                )
        for name, slug, max_bytes, order in DEFAULT_MATERIAL_TYPES:
            cursor.execute("SELECT 1 FROM material_types WHERE slug = ?", (slug,))
            if not cursor.fetchone():
                cursor.execute(
                    "INSERT INTO material_types "
                    "(name, slug, max_file_bytes, sort_order, is_active) "
                    "VALUES (?, ?, ?, ?, 1)",
                    (name, slug, max_bytes, order),
                )
        conn.commit()
        print("Migration completed successfully.")
    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    run_migration()
