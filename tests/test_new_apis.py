#!/usr/bin/env python3
"""
測試新建立的 API 端點
需要先啟動後端服務
"""

import requests
import json
from typing import Optional

BASE_URL = "http://localhost:8000/api"
REPORTS_BASE = f"{BASE_URL}/admin/reports"

def get_token(emp_id: str = "admin", captcha_answer: str = "0000") -> Optional[str]:
    """取得認證 Token（使用測試用的 0000 驗證碼）"""
    try:
        # 先取得驗證碼
        captcha_resp = requests.get(f"{BASE_URL}/auth/captcha")
        if captcha_resp.status_code != 200:
            print("❌ 無法取得驗證碼")
            return None
        
        captcha_data = captcha_resp.json()
        captcha_id = captcha_data.get("captcha_id")
        
        # 登入（使用測試驗證碼 0000）
        login_resp = requests.post(
            f"{BASE_URL}/auth/login",
            json={
                "emp_id": emp_id,
                "captcha_id": captcha_id,
                "answer": captcha_answer
            }
        )
        
        if login_resp.status_code == 200:
            data = login_resp.json()
            return data.get("access_token")
        else:
            print(f"❌ 登入失敗: {login_resp.status_code}")
            print(login_resp.text)
            return None
    except Exception as e:
        print(f"❌ 取得 Token 時發生錯誤: {e}")
        return None

def test_api(name: str, url: str, token: str, params: dict = None):
    """測試 API 端點"""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.get(url, headers=headers, params=params)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ {name}")
            print(f"   回應: {json.dumps(data, ensure_ascii=False, indent=2)[:200]}...")
            return True
        else:
            print(f"❌ {name} - 狀態碼: {response.status_code}")
            print(f"   錯誤: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ {name} - 發生錯誤: {e}")
        return False

def main():
    print("=" * 60)
    print("測試新建立的 API 端點")
    print("=" * 60)
    print()
    
    # 取得 Token
    print("1. 取得認證 Token...")
    token = get_token()
    if not token:
        print("❌ 無法取得 Token，請確認後端服務已啟動且資料庫有測試資料")
        return
    
    print(f"✅ Token 取得成功")
    print()
    
    # 測試各個 API
    tests = [
        ("T1.1: Overview API (基本)", f"{REPORTS_BASE}/overview", None),
        ("T1.1: Overview API (2026年1月)", f"{REPORTS_BASE}/overview", {"year": 2026, "month": 1}),
        ("T1.1: Overview API (2026年度)", f"{REPORTS_BASE}/overview", {"year": 2026}),
        ("T1.2.1: Trends API (6個月)", f"{REPORTS_BASE}/trends", {"months": 6}),
        ("T1.2.2: Department Comparison", f"{REPORTS_BASE}/department-comparison", None),
        ("T1.2.3: Plan Popularity", f"{REPORTS_BASE}/plan-popularity", {"limit": 10}),
        ("T1.3.1: Active Exams", f"{REPORTS_BASE}/active-exams", None),
        ("T1.3.2: Expiring Soon (3天)", f"{REPORTS_BASE}/expiring-soon", {"days": 3}),
        ("T1.3.3: Retake Needed", f"{REPORTS_BASE}/retake-needed", None),
    ]
    
    results = []
    for name, url, params in tests:
        success = test_api(name, url, token, params)
        results.append((name, success))
        print()
    
    # 總結
    print("=" * 60)
    print("測試結果總結")
    print("=" * 60)
    passed = sum(1 for _, success in results if success)
    total = len(results)
    print(f"通過: {passed}/{total}")
    print()
    
    for name, success in results:
        status = "✅" if success else "❌"
        print(f"{status} {name}")

if __name__ == "__main__":
    main()
