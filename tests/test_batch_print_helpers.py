"""
成績中心批次列印 — 純函式單元測試（Wave 1）。

僅測試不依賴資料庫的輔助函式：
- _group_batch_print_items：依 (dept_name, plan_title) 分組
- _sanitize_filename_segment：檔名消毒
- _build_unique_zip_filename：ZIP 內檔名重複時自動加尾綴

執行方式：
    cd backend && export PYTHONPATH=$PYTHONPATH:. && ../.venv/bin/python3 -m pytest ../tests/test_batch_print_helpers.py
（或專案根目錄：backend/.venv/bin/python3 -m pytest tests/test_batch_print_helpers.py，
  需確保 PYTHONPATH 含 backend 目錄）
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.routers.report import (  # noqa: E402
    _group_batch_print_items,
    _sanitize_filename_segment,
    _build_unique_zip_filename,
)


def test_group_batch_print_items_groups_by_dept_and_plan():
    items = [
        {"emp_id": "A1", "dept_name": "資訊部", "plan_title": "資安教育訓練"},
        {"emp_id": "A2", "dept_name": "資訊部", "plan_title": "資安教育訓練"},
        {"emp_id": "B1", "dept_name": "人資部", "plan_title": "資安教育訓練"},
        {"emp_id": "C1", "dept_name": "資訊部", "plan_title": "消防演習"},
    ]
    grouped = _group_batch_print_items(items)

    assert set(grouped.keys()) == {
        ("資訊部", "資安教育訓練"),
        ("人資部", "資安教育訓練"),
        ("資訊部", "消防演習"),
    }
    assert len(grouped[("資訊部", "資安教育訓練")]) == 2
    assert [i["emp_id"] for i in grouped[("資訊部", "資安教育訓練")]] == ["A1", "A2"]


def test_group_batch_print_items_handles_missing_keys():
    items = [{"emp_id": "X1"}]
    grouped = _group_batch_print_items(items)
    assert grouped == {("", ""): [{"emp_id": "X1"}]}


def test_sanitize_filename_segment_replaces_illegal_chars():
    assert _sanitize_filename_segment("資訊/安全:部門") == "資訊_安全_部門"
    assert _sanitize_filename_segment('A*B?C"D<E>F|G\\H') == "A_B_C_D_E_F_G_H"


def test_sanitize_filename_segment_truncates_long_names():
    long_name = "部" * 60
    result = _sanitize_filename_segment(long_name, max_len=40)
    assert len(result) == 40


def test_sanitize_filename_segment_empty_falls_back():
    assert _sanitize_filename_segment("") == "未命名"
    assert _sanitize_filename_segment(None) == "未命名"


def test_build_unique_zip_filename_no_collision():
    used = set()
    name = _build_unique_zip_filename("資訊部-資安教育訓練_20260624.pdf", used)
    assert name == "資訊部-資安教育訓練_20260624.pdf"


def test_build_unique_zip_filename_appends_suffix_on_collision():
    used = set()
    first = _build_unique_zip_filename("部門-計畫_20260624.pdf", used)
    second = _build_unique_zip_filename("部門-計畫_20260624.pdf", used)
    third = _build_unique_zip_filename("部門-計畫_20260624.pdf", used)

    assert first == "部門-計畫_20260624.pdf"
    assert second == "部門-計畫_20260624_2.pdf"
    assert third == "部門-計畫_20260624_3.pdf"
    assert len({first, second, third}) == 3
