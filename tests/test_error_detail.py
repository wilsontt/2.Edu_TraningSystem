#!/usr/bin/env python3
import requests
import json

BASE_URL = "http://localhost:8000/api"

# 取得 Token
r = requests.get(f"{BASE_URL}/auth/captcha")
c = r.json()
r2 = requests.post(f"{BASE_URL}/auth/login", json={"emp_id": "admin", "captcha_id": c["captcha_id"], "answer": "0000"})
token = r2.json()["access_token"]

headers = {"Authorization": f"Bearer {token}"}

# 測試有問題的 API
print("測試 Overview API (2026年1月):")
r = requests.get(f"{BASE_URL}/admin/reports/overview?year=2026&month=1", headers=headers)
print(f"狀態碼: {r.status_code}")
print(f"回應: {r.text}")
print()

print("測試 Department Comparison API:")
r = requests.get(f"{BASE_URL}/admin/reports/department-comparison", headers=headers)
print(f"狀態碼: {r.status_code}")
print(f"回應: {r.text}")
