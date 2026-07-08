"""
考試中心時間語意回歸測試。

目標：確保報到／交卷時間使用 UTC naive 儲存，
可與前端 parseBackendDateTime()（naive 視為 UTC）契合，避免 +8 小時偏移。
"""
from datetime import datetime
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.routers.exam_center import _now_utc_naive


def test_now_utc_naive_should_be_close_to_utc_now():
    ts = _now_utc_naive()
    assert ts.tzinfo is None
    assert abs((datetime.utcnow() - ts).total_seconds()) < 3

