# backend/app.py
from flask import Flask
from flask_cors import CORS

from flask_jwt_extended import JWTManager
from config import (
JWT_SECRET,
JWT_ACCESS_TOKEN_HOURS,
SECRET_KEY,
DATABASE_URL,
SQLALCHEMY_TRACK_MODIFICATIONS
)


# blueprints
from calendark import bp_calendar
from auth import bp_auth
from user_management import bp_user_management
from workflow_management import bp_workflow_management

def create_app():
    app = Flask(__name__)

    # JWT
    app.config["JWT_SECRET_KEY"] = JWT_SECRET
    JWTManager(app)

    # ✅ CORS 설정 강화: Authorization 헤더/OPTIONS/메서드 전부 허용
    CORS(
        app,
        resources={
            r"/api/*": {
                "origins": [
                    "http://localhost:5500",   # VSCode Live Server 등
                    "http://127.0.0.1:5500",
                    "http://localhost:5501"
                ],
                "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
                "allow_headers": ["Content-Type", "Authorization"],
                "expose_headers": ["Content-Type", "Authorization"],
            }
        },
        supports_credentials=False,  # 토큰을 헤더로 쓰는 구조면 보통 False
    )


    # 블루프린트 등록
    app.register_blueprint(bp_auth)
    app.register_blueprint(bp_calendar)
    app.register_blueprint(bp_user_management)
    app.register_blueprint(bp_workflow_management)


    return app

# backend/app.py

if __name__ == "__main__":
    app = create_app()
    # use_reloader=False 옵션을 추가하여 자동 재시작을 비활성화합니다.
    app.run(debug=False, use_reloader=False)