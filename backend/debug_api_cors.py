
import requests
import json
import os

BASE_URL = "http://localhost:8000/api"

def login():
    # Attempt simple login first
    payload = {
        "emp_id": "admin",
        "captcha_id": "dummy",
        "answer": "0000"
    }
    resp = requests.post(f"{BASE_URL}/auth/login", json=payload)
    
    # If standard login fails (maybe captcha), I will rely on manual token if I had one, 
    # but I'll try to automate login first.
    if resp.status_code == 200:
        return resp.json()["access_token"]
    else:
        print(f"Login failed: {resp.status_code} {resp.text}")
        return None

def test_create_function(token):
    headers = {"Authorization": f"Bearer {token}"}
    
    # Debug 1: Check Auth
    print("\nAttempting GET /auth/me...")
    resp = requests.get(f"{BASE_URL}/auth/me", headers=headers)
    print(f"Status Code: {resp.status_code}")
    print(f"Response: {resp.text}")

    # Debug 2: Check GET Functions
    print("\nAttempting GET /admin/functions...")
    resp = requests.get(f"{BASE_URL}/admin/functions", headers=headers)
    print(f"Status Code: {resp.status_code}")
    # print(f"Response: {resp.text}") # Too long maybe

    # Debug 3: Check Simple POST
    print("\nAttempting POST /admin/test-debug...")
    try:
        resp = requests.post(f"{BASE_URL}/admin/test-debug", json={"test": "data"}, headers=headers)
        print(f"Status Code: {resp.status_code}")
        print(f"Response: {resp.text}")
    except Exception as e:
        print(f"Debug POST failed: {e}")

    payload = {
        "name": "TestScriptRoot",
        "code": "test:script:root",
        "path": "/test-script",
        "parent_id": None
    }
    
    print("\nAttempting POST /admin/functions...")
    try:
        resp = requests.post(f"{BASE_URL}/admin/functions", json=payload, headers=headers)
        print(f"Status Code: {resp.status_code}")
        print(f"Response: {resp.text}")
        return resp.status_code == 200
    except Exception as e:
        print(f"Exception during request: {e}")
        return False

def main():
    print("Getting token...")
    # NOTE: In a real scenario I might need to fetch a valid user/pass from seed data or config.
    # Assuming 'admin' / 'password' and 0000 captcha for now based on typical dev setups.
    # If captcha is random, this script might fail to login. 
    # But I can check 'check_db.py' or 'seed_data.py' to see if there's a workaround.
    # Actually, previous edits showed 'auth.py' captcha was hardcoded then reverted.
    # So I might need to cheat or use an existing token?
    # Let's try to just hit the endpoint with a dummy token if login fails, 
    # just to see if we get 401 (Auth error) vs 'Connection Refused'.
    
    token = login()
    if not token:
        # Fallback: try to see if we can use a hardcoded token if we had one from browser dumps? 
        # No, that's unreliable.
        # I'll try to disable captcha check effectively by looking at the code later if this fails.
        # validation: 'check_db.py' creates admin user. default password usually 'password'.
        print("Cannot proceed without token.")
        return

    test_create_function(token)

if __name__ == "__main__":
    main()
