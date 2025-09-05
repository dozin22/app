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
from db_management import bp_db_management
from auth import bp_auth


def create_app():
    app = Flask(__name__)


    # 기본 설정
    app.config["SECRET_KEY"] = SECRET_KEY
    app.config["JWT_SECRET_KEY"] = JWT_SECRET
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = 60 * 60 * JWT_ACCESS_TOKEN_HOURS


    # SQLAlchemy 설정
    app.config["SQLALCHEMY_DATABASE_URI"] = DATABASE_URL
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = SQLALCHEMY_TRACK_MODIFICATIONS


    # 확장 프로그램 초기화
    JWTManager(app)
    CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)


    # 블루프린트 등록
    app.register_blueprint(bp_auth)
    app.register_blueprint(bp_db_management)
    app.register_blueprint(bp_calendar)


    return app

if __name__ == "__main__":
    app = create_app()
    app.run(debug=True)