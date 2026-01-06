from app.database import SessionLocal
from app import models

db = SessionLocal()
admin_role = db.query(models.Role).filter(models.Role.name == "Admin").first()
print(f"Role: {admin_role.name}")
print("Permissions:")
for f in admin_role.functions:
    print(f" - {f.name} ({f.code})")
db.close()
