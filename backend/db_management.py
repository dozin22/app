# backend/db_management.py
# -*- coding: utf-8 -*-
from functools import wraps
from typing import Any, Callable
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.orm import selectinload, joinedload  # joinedload는 /me_get 유지용
# from sqlalchemy import select  # 현재 미사용이면 주석처리

from orm_build import get_session, User, Team, Responsibility

bp_db_management = Blueprint("db_management", __name__, url_prefix="/api/db-management")

# ─────────────────────────────────────────────────────────────
# 권한 가드: DT_Expert OR 팀장만 통과
ALLOWED_RESP = {"DT_Expert"}   # 책임(Responsibility) 이름 표준
ALLOWED_POS  = {"팀장"}        # 직위(Position) 표준

def _serialize_user(user: User) -> dict[str, Any]:
    """User 객체를 JSON 직렬화 가능한 딕셔너리로 변환합니다."""
    if not user:
        return {}
    return {
        "user_id": user.user_id,
        "name": user.user_name,
        "email": user.email,
        "position": user.position,
        "team_id": user.team.team_id if user.team else None,
        "team": user.team.team_name if user.team else "팀 없음",
    }



def require_db_admin(fn):
    """DT_Expert 또는 팀장만 접근 허용하는 데코레이터"""
    @wraps(fn)
    @jwt_required()
    def wrapper(*args, **kwargs):
        # 토큰 → user_id 획득
        try:
            uid = int(get_jwt_identity())
        except (ValueError, TypeError):
            return jsonify({"message": "잘못된 토큰 식별자"}), 401

        # 권한 확인 (책임/직위)
        with get_session() as s:
            user = (
                s.query(User)
                .options(selectinload(User.responsibilities))
                .get(uid)
            )
            if not user:
                return jsonify({"message": "유저 없음"}), 404

            pos_ok = (user.position or "").strip() in ALLOWED_POS
            resp_ok = any((r.responsibility_name or "").strip() in ALLOWED_RESP
                          for r in user.responsibilities)

            if not (pos_ok or resp_ok):
                return jsonify({"message": "접근 권한이 없습니다 (DT_Expert 또는 팀장 전용)"}), 403

        # 권한 통과 시 실제 핸들러 실행
        return fn(*args, **kwargs)
    return wrapper

# ─────────────────────────────────────────────────────────────
# 내 정보 조회
@bp_db_management.route("/me", methods=["GET"])
@jwt_required()
def me_get():
    try:
        uid = int(get_jwt_identity())  # 전역 정책: identity는 user_id 문자열
    except (ValueError, TypeError):
        return jsonify({"message": "잘못된 토큰 식별자"}), 401

    with get_session() as s:
        user = (
            s.query(User)
            .options(joinedload(User.team))  # 여기선 JOIN으로 한 방에
            .filter_by(user_id=uid)
            .first()
        )
        if not user:
            return jsonify({"message": "유저를 찾을 수 없습니다"}), 404

        return jsonify(_serialize_user(user)), 200

# ─────────────────────────────────────────────────────────────
# 내 정보 수정
@bp_db_management.route("/me", methods=["PUT"])
@jwt_required()
def me_update():
    try:
        uid = int(get_jwt_identity())
    except (ValueError, TypeError):
        return jsonify({"message": "잘못된 토큰 식별자"}), 401

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip()
    position = (data.get("position") or "").strip()
    team_id = data.get("team_id")

    if not all([name, email, position]):
        return jsonify({"message": "name/email/position은 필수입니다"}), 400

    # team_id 안전 캐스팅
    if team_id is not None:
        try:
            team_id = int(team_id)
        except (ValueError, TypeError):
            return jsonify({"message": "team_id 형식이 올바르지 않습니다"}), 400

    with get_session() as s:
        user = s.get(User, uid)
        if not user:
            return jsonify({"message": "유저 없음"}), 404

        # 이메일 중복 체크 (자기 자신 제외)
        if email != user.email:
            exists = (
                s.query(User)
                .filter(User.email == email, User.user_id != uid)
                .first()
            )
            if exists:
                return jsonify({"message": "이미 사용 중인 이메일입니다"}), 409

        # 기본 정보 업데이트
        user.user_name = name
        user.email = email
        user.position = position

        # 팀 매핑 업데이트 (옵션)
        if team_id is not None:
            new_team = s.get(Team, team_id)
            if not new_team:
                return jsonify({"message": "존재하지 않는 team_id"}), 400
            user.team = new_team  # 직접 관계 할당
        
        response_data = _serialize_user(user)
        response_data["message"] = "저장되었습니다"
        return jsonify(response_data), 200

# ─────────────────────────────────────────────────────────────
# DT 전문가 목록 조회 (기준정보) — DT_Expert OR 팀장만 접근
@bp_db_management.get("/dt-experts")
@require_db_admin
def list_dt_experts():
    with get_session() as s:
        query = (
            s.query(User)
            .options(selectinload(User.team))  # N+1 방지
            .order_by(User.user_name)
        )
        
        experts = query.filter(User.responsibilities.any(Responsibility.responsibility_name == "DT_Expert")).all()
        
        users_to_render = experts
        is_expert_list = True
        if not experts:
            users_to_render = query.all()
            is_expert_list = False

        data = []
        for u in users_to_render:
            data.append({
                "name": u.user_name,
                "team_name": u.team.team_name if u.team else "팀 없음",
                "role": "DT_Expert" if is_expert_list else "—",
                "updated_at": None,
                "level": None,
                "cert": None,
            })

        return jsonify(data), 200

# ─────────────────────────────────────────────────────────────
@bp_db_management.get("/teams")
def list_teams():
    with get_session() as s:
        teams = s.query(Team).order_by(Team.team_name).all()
        data = [{"team_id": t.team_id, "team_name": t.team_name} for t in teams]
        return jsonify(data), 200
