import requests
import json
import os

BASE_URL = "http://localhost:8000/api"

def login():
    try:
        # First get captcha
        resp = requests.get(f"{BASE_URL}/auth/captcha")
        if resp.status_code != 200:
            print(f"Captcha failed: {resp.text}")
            return None
        captcha_id = resp.json()["captcha_id"]
        
        # Login with hardcoded answer for test env (assuming debug mode allows 0000 or logic reuse)
        # Actually in test_report.py we used "0000" and it worked because possibly we modified auth temporarily
        # or we just use normal login flow. 
        # Let's try to simulate login
        login_data = {
            "emp_id": "100057",
            "captcha_id": captcha_id,
            "answer": "0000" 
        }
        response = requests.post(f"{BASE_URL}/auth/login", json=login_data)
        if response.status_code == 200:
            print("Login successful.")
            return response.json()["access_token"]
        else:
            print(f"Login failed: {response.text}")
            return None
    except Exception as e:
        print(f"Login error: {e}")
        return None

def test_upload(token):
    headers = {"Authorization": f"Bearer {token}"}
    
    # 1. We need a valid plan_id. For query we can list plans if endpoint exists, or assume 1.
    # In seed_exam_data.py we might have created some.
    # Let's try to get plans first.
    # admin router has /admin/departments/users etc.
    # training router has /api/plans (GET /plans)
    
    try:
        resp = requests.get(f"{BASE_URL}/plans", headers=headers)
        if resp.status_code == 200 and len(resp.json()) > 0:
            plan_id = resp.json()[0]['id']
            print(f"Using Plan ID: {plan_id}")
        else:
            print("No plans found. Cannot test upload.")
            return
            
        # 2. Upload File
        with open("test_material.txt", "w") as f:
            f.write("Q: Test Question?\nA: Option A\nANS: A\nSCORE: 10")
            
        files = {'file': ('test_material.txt', open('test_material.txt', 'rb'), 'text/plain')}
        data = {'plan_id': plan_id}
        
        print("Uploading file...")
        upload_resp = requests.post(f"{BASE_URL}/admin/exams/upload", headers=headers, files=files, data=data)
        
        if upload_resp.status_code == 200:
            print("Upload successful.")
            print(upload_resp.json())
        else:
            print(f"Upload failed: {upload_resp.text}")
            
        # 3. List Materials
        print("Listing materials...")
        list_resp = requests.get(f"{BASE_URL}/admin/exams/materials/{plan_id}", headers=headers)
        if list_resp.status_code == 200:
            print("Materials:", list_resp.json())
        else:
            print(f"List failed: {list_resp.text}")
            
    except Exception as e:
        print(f"Test error: {e}")
    finally:
        if os.path.exists("test_material.txt"):
            os.remove("test_material.txt")

if __name__ == "__main__":
    token = login()
    if token:
        test_upload(token)
