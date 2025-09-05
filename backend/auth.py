# backend/auth.py
# -*- coding: utf-8 -*-
from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from datetime import timedelta
from sqlalchemy.orm import joinedload # JOIN을 위해 추가

from config import JWT_ACCESS_TOKEN_HOURS
# 🔽 ORM 모델과 세션 가져오기
from orm_build import get_session, User, Team

# ────────────────────────────────────────────────────────────────
bp_auth = Blueprint("auth", __name__, url_prefix="/api/auth")

# ── 회원가입 ─────────────────────────────────────────────────────
@bp_auth.route("/signup", methods=["POST"])
def signup():
    data = request.get_json(silent=True) or {}
    required = {"name", "email", "password", "team_id", "position"}
    if not required.issubset(data):
        return jsonify({"message": "필수 항목 누락"}), 400

    # ## ORM 사용으로 변경
    with get_session() as s:
        # 이메일 중복 확인
        if s.query(User).filter_by(email=data["email"]).first():
            return jsonify({"message": "이미 가입된 이메일입니다"}), 409

        # 팀 존재 여부 확인
        team = s.get(Team, data["team_id"])
        if not team:
            return jsonify({"message": "존재하지 않는 팀입니다"}), 400

        # 새 User 객체 생성
        new_user = User(
            user_name=data["name"],
            email=data["email"],
            hashed_password=generate_password_hash(data["password"]),
            position=data["position"]
        )
        # User와 Team 관계 설정 (user_team_mappings 테이블에 자동 반영됨)
        new_user.teams.append(team)

        s.add(new_user)
        s.flush() # user_id를 JWT에 담기 위해 DB에 미리 반영

        # JWT 발급
        token = create_access_token(
            identity=str(new_user.user_id),
            expires_delta=timedelta(hours=JWT_ACCESS_TOKEN_HOURS)
        )

        return jsonify({
            "token": token,
            "name": new_user.user_name,
            "position": new_user.position,
            "team": team.team_name
        }), 201

# ── 로그인 ──────────────────────────────────────────────────────
@bp_auth.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    if not {"email", "password"}.issubset(data):
        return jsonify({"message": "이메일/비밀번호 필요"}), 400

    # ## ORM 사용으로 변경
    with get_session() as s:
        # 이메일로 사용자 조회
        user = s.query(User).filter_by(email=data["email"]).first()

        if not user or not check_password_hash(user.hashed_password, data["password"]):
            return jsonify({"message": "자격 증명이 올바르지 않습니다"}), 401
        
        # 관계(relationship)를 통해 팀 정보 가져오기
        team_name = user.teams[0].team_name if user.teams else "팀 없음"

        token = create_access_token(
            identity=str(user.user_id),
            expires_delta=timedelta(hours=JWT_ACCESS_TOKEN_HOURS)
        )

        return jsonify({
            "token": token,
            "name": user.user_name,
            "email": user.email,
            "position": user.position,
            "team": team_name
        }), 200
