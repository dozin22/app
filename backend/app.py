# backend/app.py
from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from calendark import bp_calendar

from auth import bp_auth
from config import (
    JWT_SECRET,
    JWT_ACCESS_TOKEN_HOURS,
    SECRET_KEY
)

def create_app():
    app = Flask(__name__)

    # ── 환경 설정 반영 ─────────────────────
    app.config["SECRET_KEY"] = SECRET_KEY  # Flask 내부용 세션 보안
    app.config["JWT_SECRET_KEY"] = JWT_SECRET
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = 60 * 60 * JWT_ACCESS_TOKEN_HOURS

    # ── 블루프린트 등록 ───────────────────
    app.register_blueprint(bp_auth)

    app.register_blueprint(bp_calendar)

    # ── 확장 모듈 초기화 ───────────────────
    JWTManager(app)
    CORS(
        app,
        resources={r"/api/*": {"origins": "*"}},
        supports_credentials=True,
        methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"]
    )

    return app

if __name__ == "__main__":
    create_app().run(port=5001, debug=True)
