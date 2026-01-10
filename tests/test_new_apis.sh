#!/bin/bash

# 測試新建立的 API 端點
# 需要先啟動後端服務：.venv/bin/python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

BASE_URL="http://localhost:8000/api/admin/reports"
TOKEN="YOUR_TOKEN_HERE"  # 需要替換為實際的 JWT Token

echo "=== 測試 T1.1: 擴充的 Overview API ==="
echo ""
curl -X GET "${BASE_URL}/overview" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" | jq '.'

echo ""
echo "=== 測試 T1.1: Overview API (帶時間篩選) ==="
echo ""
curl -X GET "${BASE_URL}/overview?year=2026&month=1" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" | jq '.'

echo ""
echo "=== 測試 T1.2.1: Trends API ==="
echo ""
curl -X GET "${BASE_URL}/trends?months=6" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" | jq '.'

echo ""
echo "=== 測試 T1.2.2: Department Comparison API ==="
echo ""
curl -X GET "${BASE_URL}/department-comparison" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" | jq '.'

echo ""
echo "=== 測試 T1.2.3: Plan Popularity API ==="
echo ""
curl -X GET "${BASE_URL}/plan-popularity?limit=10" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" | jq '.'

echo ""
echo "=== 測試 T1.3.1: Active Exams API ==="
echo ""
curl -X GET "${BASE_URL}/active-exams" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" | jq '.'

echo ""
echo "=== 測試 T1.3.2: Expiring Soon API ==="
echo ""
curl -X GET "${BASE_URL}/expiring-soon?days=3" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" | jq '.'

echo ""
echo "=== 測試 T1.3.3: Retake Needed API ==="
echo ""
curl -X GET "${BASE_URL}/retake-needed" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" | jq '.'

echo ""
echo "=== 測試完成 ==="
