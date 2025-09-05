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

# ── 내 정보 조회 ──────────────────────────────────────────────────
@bp_auth.route("/me", methods=["GET"])
@jwt_required()
def me_get():
    try:
        uid = int(get_jwt_identity())
    except (ValueError, TypeError):
        return jsonify({"message": "잘못된 토큰 식별자"}), 401

    # ## ORM 사용으로 변경
    with get_session() as s:
        # User를 조회할 때 teams 정보도 함께 JOIN해서 가져오기 (N+1 문제 방지)
        user = s.query(User).options(joinedload(User.teams)).filter_by(user_id=uid).first()

        if not user:
            return jsonify({"message": "유저를 찾을 수 없습니다"}), 404

        team = user.teams[0] if user.teams else None

        return jsonify({
            "user_id": user.user_id,
            "name": user.user_name,
            "email": user.email,
            "position": user.position,
            "team_id": team.team_id if team else None,
            "team": team.team_name if team else "팀 없음",
        }), 200

# ── 내 정보 수정 ──────────────────────────────────────────────────
@bp_auth.route("/me", methods=["PUT"])
@jwt_required()
def me_update():
    try:
        uid = int(get_jwt_identity())
    except (ValueError, TypeError):
        return jsonify({"message": "잘못된 토큰 식별자"}), 401

    data = request.get_json(silent=True) or {}
    name = data.get("name", "").strip()
    email = data.get("email", "").strip()
    position = data.get("position", "").strip()
    team_id = data.get("team_id")

    if not all([name, email, position]):
        return jsonify({"message": "name/email/position은 필수입니다"}), 400

    # ## ORM 사용으로 변경
    with get_session() as s:
        user = s.get(User, uid)
        if not user:
            return jsonify({"message": "유저 없음"}), 404

        # 이메일 변경 시 중복 체크 (자기 자신은 제외)
        if email != user.email:
            if s.query(User).filter(User.email == email, User.user_id != uid).first():
                return jsonify({"message": "이미 사용 중인 이메일입니다"}), 409

        # 유저 정보 업데이트 (객체 속성만 바꾸면 commit 시 UPDATE 쿼리 자동 생성)
        user.user_name = name
        user.email = email
        user.position = position

        # 팀 매핑 업데이트(선택)
        new_team = None
        if team_id is not None:
            new_team = s.get(Team, team_id)
            if not new_team:
                return jsonify({"message": "존재하지 않는 team_id"}), 400
            # 관계 리스트를 새로 할당하면 SQLAlchemy가 알아서 중간 테이블을 정리함
            user.teams = [new_team]
        
        # 업데이트된 정보를 바로 사용 (재조회 필요 없음)
        team = user.teams[0] if user.teams else None

        return jsonify({
            "user_id": user.user_id,
            "name": user.user_name,
            "email": user.email,
            "position": user.position,
            "team_id": team.team_id if team else None,
            "team": team.team_name if team else "팀 없음",
            "message": "저장되었습니다"
        }), 200