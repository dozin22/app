# backend/config.py
# -*- coding: utf-8 -*-
import os
from pathlib import Path
from dotenv import load_dotenv

# 루트 경로 (SQLAlchemy DB 파일 경로 설정 포함)
BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
DB_DIR = os.path.join(BACKEND_DIR, "db")
os.makedirs(DB_DIR, exist_ok=True)
DEFAULT_SQLITE = f"sqlite:///{os.path.join(DB_DIR, 'db.sqlite3')}"
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_SQLITE)

# SQLAlchemy 설정
SQLALCHEMY_TRACK_MODIFICATIONS = False


print(f"Backend_dir: {BACKEND_DIR}")
print(f"DB_DIR: {DB_DIR}")


# .env 로드
load_dotenv(PROJECT_ROOT / ".env")

# ────────────── 시크릿 설정 ──────────────
SECRET_KEY = os.getenv("SECRET_KEY", "fallback-secret")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin")

# ────────────── JWT 설정 ──────────────
JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret")
JWT_ACCESS_TOKEN_HOURS = int(os.getenv("JWT_ACCESS_TOKEN_HOURS", "12"))
JWT_REFRESH_TOKEN_DAYS = int(os.getenv("JWT_REFRESH_TOKEN_DAYS", "3"))


