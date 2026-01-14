#!/usr/bin/env python3
"""移除亂碼帳號的腳本"""
import sys
import os

# 添加 app 目錄到路徑
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app import models
import re

def remove_bad_user():
    """刪除亂碼帳號"""
    db = SessionLocal()
    try:
        # 查找亂碼帳號
        bad_emp_id = '㝡劈户崍亅亅肀廛郣乍𡕷秈㞗末刷末檗廛黂𠂆'
        user = db.query(models.User).filter(models.User.emp_id == bad_emp_id).first()
        
        if user:
            print(f"找到亂碼帳號:")
            print(f"  員工編號: {user.emp_id}")
            print(f"  姓名: {user.name}")
            print(f"  狀態: {user.status}")
            print(f"\n正在刪除...")
            db.delete(user)
            db.commit()
            print(f"✓ 成功刪除亂碼帳號！")
        else:
            print("未找到亂碼帳號，可能已經被刪除了。")
            
        # 顯示剩餘用戶數量
        total = db.query(models.User).count()
        print(f"\n目前資料庫中共有 {total} 個用戶。")
            
    except Exception as e:
        print(f"發生錯誤: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    remove_bad_user()
