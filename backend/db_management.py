# backend/db_management.py
# -*- coding: utf-8 -*-
from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.orm import joinedload

# 🔽 ORM 모델과 세션 가져오기
from orm_build import get_session, User, Team, Responsibility

bp_db_management = Blueprint("db_management", __name__, url_prefix="/api/db-management")

# ── DT 전문가 목록 조회 (팀장 전용) ──────────────────────────────
@bp_db_management.get("/dt-experts")
@jwt_required()
def list_dt_experts():
    """ DT 전문가 목록 (팀장 전용) """
    try:
        uid = int(get_jwt_identity())
    except (ValueError, TypeError):
        return jsonify({"message": "잘못된 토큰 식별자"}), 401

    # ## ORM 사용으로 변경
    with get_session() as s:
        # 요청을 보낸 사용자 정보 확인
        current_user = s.get(User, uid)
        if not current_user or (current_user.position or "").strip() != "팀장":
            return jsonify({"message": "팀장 전용입니다."}), 403

        # 1안) 'DT_Expert' 책임을 가진 사용자 조회
        # User 모델에서 시작하여 teams와 responsibilities를 JOIN합니다.
        # options(joinedload(...))는 N+1 쿼리 문제를 방지하기 위해 사용합니다.
        experts = s.query(User)\
            .options(joinedload(User.teams))\
            .join(User.responsibilities)\
            .filter(Responsibility.responsibility_name == 'DT_Expert')\
            .order_by(User.user_name)\
            .all()

        data = []
        if experts:
            for user in experts:
                team = user.teams[0] if user.teams else None
                data.append({
                    "name": user.user_name,
                    "team_name": team.team_name if team else "팀 없음",
                    "role": "DT_Expert",
                    # ORM 모델에 updated_at이 없으므로 None으로 처리
                    "updated_at": None,
                    "level": None,
                    "cert": None,
                })
        else:
            # 2안) DT_Expert가 한 명도 없으면, 전체 사용자 목록을 기본값으로 보여줌
            all_users = s.query(User)\
                .options(joinedload(User.teams))\
                .order_by(User.user_name)\
                .all()
            for user in all_users:
                team = user.teams[0] if user.teams else None
                data.append({
                    "name": user.user_name,
                    "team_name": team.team_name if team else "팀 없음",
                    "role": "—", # 자격 미표시
                    "updated_at": None,
                    "level": None,
                    "cert": None,
                })

        return jsonify(data), 200

# ── 팀 목록 조회 ────────────────────────────────────────────────
@bp_db_management.get("/teams")
@jwt_required()
def list_teams():
    # ## ORM 사용으로 변경
    with get_session() as s:
        # Team 객체를 이름순으로 모두 조회
        teams = s.query(Team).order_by(Team.team_name).all()
        
        # 각 Team 객체를 dictionary로 변환
        data = [
            {"team_id": team.team_id, "team_name": team.team_name}
            for team in teams
        ]
        return jsonify(data), 200