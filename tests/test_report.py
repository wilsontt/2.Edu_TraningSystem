import requests
import json

BASE_URL = "http://localhost:8000/api"
TOKEN = "" # Will verify login first

def login():
    global TOKEN
    payload = {
        "emp_id": "admin",
        "password": "password",
        "captcha_id": "debug_uuid", # Mock ID if validation allows, or we need to fetch a real captcha first
        "answer": "0000" 
    }
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json=payload)
        if resp.status_code == 200:
            data = resp.json()
            TOKEN = data["access_token"]
            print("Login successful.")
        else:
            print(f"Login failed: {resp.text}")
    except Exception as e:
        print(f"Login error: {e}")

def get_headers():
    return {"Authorization": f"Bearer {TOKEN}"}

def test_reports():
    headers = get_headers()
    
    # 1. Overview
    print("\nAttempting GET /admin/reports/overview...")
    try:
        resp = requests.get(f"{BASE_URL}/admin/reports/overview", headers=headers)
        print(f"Status Code: {resp.status_code}")
        if resp.status_code == 200:
            print(f"Response: {resp.json()}")
        else:
            print(f"Error: {resp.text}")
    except Exception as e:
        print(f"Error: {e}")

    # 2. Department
    print("\nAttempting GET /admin/reports/department...")
    try:
        resp = requests.get(f"{BASE_URL}/admin/reports/department", headers=headers)
        print(f"Status Code: {resp.status_code}")
        if resp.status_code == 200:
            print(f"Response: {json.dumps(resp.json(), indent=2, ensure_ascii=False)}")
        else:
            print(f"Error: {resp.text}")
    except Exception as e:
        print(f"Error: {e}")

    # 3. Plan
    print("\nAttempting GET /admin/reports/plan...")
    try:
        resp = requests.get(f"{BASE_URL}/admin/reports/plan", headers=headers)
        print(f"Status Code: {resp.status_code}")
        if resp.status_code == 200:
            print(f"Response: {json.dumps(resp.json(), indent=2, ensure_ascii=False)}")
        else:
            print(f"Error: {resp.text}")
    except Exception as e:
        print(f"Error: {e}")

    # 4. PDF Export
    print("\nAttempting GET /admin/reports/export/pdf...")
    try:
        resp = requests.get(f"{BASE_URL}/admin/reports/export/pdf", headers=headers)
        print(f"Status Code: {resp.status_code}")
        if resp.status_code == 200:
            print(f"Success. Content-Type: {resp.headers.get('content-type')}, Size: {len(resp.content)} bytes")
            # Save to file to verify
            with open("test_report.pdf", "wb") as f:
                f.write(resp.content)
            print("Saved to test_report.pdf")
        else:
            print(f"Error: {resp.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    login()
    if TOKEN:
        test_reports()
