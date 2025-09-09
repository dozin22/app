# backend/app.py
from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager

from config import JWT_SECRET

# Blueprints
from calendark import bp_calendar
from auth import bp_auth
from user_management import bp_user_management
from task_template_management import bp_task_management
from workflow_template_management import bp_workflow_management

def create_app():
    app = Flask(__name__)

    # ✅ CORS 설정을 최상단으로 이동하여 먼저 적용되도록 합니다.
    #    origins를 "*"로 설정하여 모든 출처를 허용하고,
    #    보다 명시적으로 헤더를 지정하여 안정성을 높입니다.
    CORS(
        app,
        resources={r"/api/*": {"origins": "*"}},
        supports_credentials=True # Credential을 허용하는 경우 True로 설정
    )

    # JWT 설정
    app.config["JWT_SECRET_KEY"] = JWT_SECRET
    JWTManager(app)

    # 블루프린트 등록
    app.register_blueprint(bp_auth)
    app.register_blueprint(bp_calendar)
    app.register_blueprint(bp_workflow_management)  
    app.register_blueprint(bp_user_management)
    app.register_blueprint(bp_task_management)

    return app

if __name__ == "__main__":
    app = create_app()
    app.run(debug=True, use_reloader=False) # 디버깅을 위해 debug=True로 변경