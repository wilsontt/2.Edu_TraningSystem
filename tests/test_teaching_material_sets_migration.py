"""教材套組遷移腳本測試：建表 + Wave1→Wave2 資料搬移 + 冪等性。"""
import importlib.util
import os
import sqlite3


def _load_migration_module():
    path = os.path.join(os.path.dirname(__file__), "..", "backend", "migrations", "add_teaching_material_sets.py")
    spec = importlib.util.spec_from_file_location("add_teaching_material_sets", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _make_wave1_db(tmp_path):
    db_path = str(tmp_path / "wave1.db")
    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE teaching_materials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id INTEGER, title VARCHAR, material_type_id INTEGER,
            description VARCHAR, tags TEXT, original_filename VARCHAR,
            stored_filename VARCHAR, storage_path VARCHAR, file_format VARCHAR,
            file_size_bytes INTEGER, year VARCHAR, sub_category_id INTEGER,
            uploaded_by VARCHAR, uploaded_at DATETIME, is_active BOOLEAN DEFAULT 1,
            deactivated_at DATETIME, deactivated_by VARCHAR,
            replaced_by_id INTEGER, replaces_id INTEGER
        )
    """)
    conn.execute(
        "INSERT INTO teaching_materials "
        "(plan_id, title, material_type_id, original_filename, stored_filename, storage_path, "
        "file_format, file_size_bytes, year, uploaded_by, uploaded_at, is_active) "
        "VALUES (7, '操作手冊 v1', 1, 'manual.pdf', '1.pdf', '2026/7/teaching/opm/1.pdf', "
        "'pdf', 12345, '2026', 'admin1', '2026-01-01 00:00:00', 1)"
    )
    conn.execute(
        "INSERT INTO teaching_materials "
        "(plan_id, title, material_type_id, original_filename, stored_filename, storage_path, "
        "file_format, file_size_bytes, year, uploaded_by, uploaded_at, is_active) "
        "VALUES (NULL, '已停用教材', 1, 'old.pdf', '2.pdf', '2026/general/teaching/opm/2.pdf', "
        "'pdf', 999, '2026', 'admin1', '2026-01-01 00:00:00', 0)"
    )
    conn.commit()
    conn.close()
    return db_path


def test_migration_creates_tables_and_migrates_active_rows(tmp_path):
    mod = _load_migration_module()
    db_path = _make_wave1_db(tmp_path)

    mod.run_migration(db_path)

    conn = sqlite3.connect(db_path)
    sets = conn.execute(
        "SELECT title, material_type_id, year, uploaded_by FROM teaching_material_sets"
    ).fetchall()
    assert sets == [("操作手冊 v1", 1, "2026", "admin1")]  # 已停用的舊筆不遷移

    files = conn.execute(
        "SELECT set_id, original_filename, storage_path, migrated_from_id FROM teaching_material_files"
    ).fetchall()
    assert len(files) == 1
    assert files[0][1] == "manual.pdf"
    assert files[0][2] == "2026/7/teaching/opm/1.pdf"  # 路徑沿用原值，不搬動實體檔
    assert files[0][3] == 1

    plans = conn.execute("SELECT set_id, plan_id FROM teaching_material_set_plans").fetchall()
    assert plans == [(1, 7)]
    conn.close()


def test_migration_is_idempotent(tmp_path):
    mod = _load_migration_module()
    db_path = _make_wave1_db(tmp_path)

    mod.run_migration(db_path)
    mod.run_migration(db_path)

    conn = sqlite3.connect(db_path)
    count = conn.execute("SELECT COUNT(*) FROM teaching_material_sets").fetchone()[0]
    assert count == 1
    conn.close()
