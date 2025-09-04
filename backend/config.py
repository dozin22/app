# backend/config.py
# -*- coding: utf-8 -*-
import os
from pathlib import Path
from dotenv import load_dotenv

# 루트 경로
BACKEND_ROOT = Path(__file__).resolve().parent
print(BACKEND_ROOT)
PROJECT_ROOT = BACKEND_ROOT.parent

# .env 로드
load_dotenv(PROJECT_ROOT / ".env")

# ────────────── DB 설정 ──────────────
DB_PATH = PROJECT_ROOT / "backend" / "db" / "db.sqlite3"
print(DB_PATH)
DB_FILE = str(DB_PATH)
print(DB_FILE)

# ────────────── 시크릿 설정 ──────────────
SECRET_KEY = os.getenv("SECRET_KEY", "fallback-secret")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin")

# ────────────── JWT 설정 ──────────────
JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret")
JWT_ACCESS_TOKEN_HOURS = int(os.getenv("JWT_ACCESS_TOKEN_HOURS", "12"))
JWT_REFRESH_TOKEN_DAYS = int(os.getenv("JWT_REFRESH_TOKEN_DAYS", "3"))
