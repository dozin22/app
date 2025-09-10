# backend/user_management.py
# -*- coding: utf-8 -*-
from functools import wraps
from typing import Any
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.orm import selectinload, joinedload
import time

from orm_build import get_session, User, Team, Responsibility, UserResponsibility

bp_user_management = Blueprint("user_management", __name__, url_prefix="/api/user-management")

# ─────────────────────────────────────────────────────────────
# 권한 가드: DT_Expert OR 팀장만 통과
ALLOWED_RESP = {"DT_Expert"}   # 책임(Responsibility) 이름 표준
ALLOWED_POS  = {"팀장"}        # 직위(Position) 표준

def _serialize_user(user: User) -> dict:
    # ⚠️ responsibility_name → name 으로 매핑
    return {
        "user_id": user.user_id,
        "name": user.user_name,
        "email": user.email,
        "position": user.position,
        "team_id": user.team_id,
        "team": (user.team.team_name if user.team else None),
        "responsibilities": [
            {"id": r.responsibility_id, "name": r.responsibility_name}
            for r in (user.responsibilities or [])
        ],
    }

def require_team_lead(fn):
    """팀장만 접근을 허용하는 데코레이터"""
    @wraps(fn)
    @jwt_required()
    def wrapper(*args, **kwargs):
        uid = int(get_jwt_identity())
        with get_session() as s:
            user = s.get(User, uid)
            if not user or user.position != "팀장":
                return jsonify({"message": "팀장만 접근할 수 있는 기능입니다."}), 403
        return fn(user, *args, **kwargs) # user 객체를 다음 함수로 전달
    return wrapper


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
@bp_user_management.get("/me")
@jwt_required()
def me_get():
    uid = int(get_jwt_identity())
    with get_session() as s:
        me = (
            s.query(User)
            .options(
                joinedload(User.team),
                selectinload(User.responsibilities)  # ← N+1 방지용 eager-load
            )
            .filter(User.user_id == uid)
            .first()
        )
        if not me:
            return jsonify({"message": "유저를 찾을 수 없습니다"}), 404
        return jsonify(_serialize_user(me)), 200
# ─────────────────────────────────────────────────────────────
# 내 정보 수정
@bp_user_management.route("/me", methods=["PUT"])
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
# DT 전문가 선임 (팀장 전용)
@bp_user_management.get("/team-members")
@require_team_lead
def get_team_members(current_user: User):
    """현재 로그인한 팀장의 팀원 목록과 DT 전문가 여부를 반환"""
    with get_session() as s:
        # current_user가 detached 상태일 수 있으므로 세션에 다시 attach
        s.add(current_user)
        if not current_user.team_id:
            return jsonify([]), 200

        team_members = s.query(User).filter(User.team_id == current_user.team_id).options(selectinload(User.responsibilities)).order_by(User.user_name).all()
        
        data = []
        for member in team_members:
            # is_dt_expert = any(r.responsibility_name == "DT_Expert" for r in member.responsibilities)
            data.append({
                "user_id": member.user_id,
                "name": member.user_name,
                "position": member.position,
                "email": member.email,
                "is_dt_expert": any(r.responsibility_name == "DT_Expert" for r in member.responsibilities),
                "responsibilities": [
                    {"id": r.responsibility_id, "name": r.responsibility_name}
                    for r in member.responsibilities
                ]
            })
        return jsonify(data), 200

@bp_user_management.put("/team-members/dt-expert-status")
@require_team_lead
def update_dt_expert_status(current_user: User):
    """팀원들의 DT 전문가 역할을 업데이트하고, 결과를 즉시 반환"""
    updates = request.get_json().get("updates", [])
    with get_session() as s:
        s.add(current_user)
        dt_expert_responsibility = s.query(Responsibility).filter_by(team_id=current_user.team_id, responsibility_name="DT_Expert").first()
        if not dt_expert_responsibility:
            return jsonify({"message": "해당 팀의 DT_Expert 역할이 정의되지 않았습니다."}), 400

        for update in updates:
            user_id = update.get("user_id")
            is_dt_expert = update.get("is_dt_expert")
            
            member = s.query(User).filter_by(user_id=user_id, team_id=current_user.team_id).options(selectinload(User.responsibilities)).first()
            if not member: continue

            has_resp = any(r.responsibility_id == dt_expert_responsibility.responsibility_id for r in member.responsibilities)

            if is_dt_expert and not has_resp:
                member.responsibilities.append(dt_expert_responsibility)
            elif not is_dt_expert and has_resp:
                member.responsibilities.remove(dt_expert_responsibility)
        
        # ✅ 1. 변경사항을 DB에 최종 커밋
        s.commit()

        # ✅ 2. 커밋 직후, 동일 세션에서 최신 팀원 목록을 다시 조회
        team_members = s.query(User).filter(User.team_id == current_user.team_id).options(selectinload(User.responsibilities)).order_by(User.user_name).all()
        
        updated_data = []
        for member in team_members:
            is_dt_expert = any(r.responsibility_name == "DT_Expert" for r in member.responsibilities)
            updated_data.append({
                "user_id": member.user_id,
                "name": member.user_name,
                "position": member.position,
                "email": member.email,
                "is_dt_expert": is_dt_expert
            })
        
        # ✅ 3. 성공 메시지 대신, 조회된 최신 데이터를 반환
        return jsonify(updated_data), 200

# ─────────────────────────────────────────────
# user_management.py (추가)
@bp_user_management.post("/me/responsibilities")
@jwt_required()
def me_add_responsibility():
    uid = int(get_jwt_identity())
    payload = request.get_json(silent=True) or {}
    rid = payload.get("responsibility_id")
    if not rid:
        return jsonify({"message": "responsibility_id is required"}), 400
    with get_session() as s:
        me = s.query(User).options(selectinload(User.responsibilities)).get(uid)
        resp = s.query(Responsibility).get(rid)
        if not me or not resp:
            return jsonify({"message":"not found"}), 404
        if resp in me.responsibilities:
            return jsonify({"message":"already assigned"}), 409
        # (선택) 같은 팀 제한 원하면 다음 줄 체크
        # if me.team_id and resp.team_id != me.team_id: return jsonify({"message":"forbidden"}), 403
        me.responsibilities.append(resp)
        return jsonify({"message":"ok"}), 201

@bp_user_management.delete("/me/responsibilities/<int:responsibility_id>")
@jwt_required()
def me_remove_responsibility(responsibility_id: int):
    uid = int(get_jwt_identity())
    with get_session() as s:
        me = s.query(User).options(selectinload(User.responsibilities)).get(uid)
        if not me:
            return jsonify({"message":"not found"}), 404
        target = next((r for r in me.responsibilities if r.responsibility_id == responsibility_id), None)
        if not target:
            return jsonify({"message":"not assigned"}), 404
        me.responsibilities.remove(target)
        return ("", 204)

    

@bp_user_management.get("/team-responsibilities")
@jwt_required()
def team_responsibility_list():
    """현재 로그인한 사용자의 팀에 속한 책임(responsibilities) 목록 반환"""
    uid = int(get_jwt_identity())
    with get_session() as s:
        me = (
            s.query(User)
            .options(joinedload(User.team))
            .filter(User.user_id == uid)
            .first()
        )
        if not me:
            return jsonify({"message": "유저를 찾을 수 없습니다"}), 404

        if not me.team_id:
            # 팀 미지정이면 빈 배열
            return jsonify([]), 200

        rows = (
            s.query(Responsibility.responsibility_id, Responsibility.responsibility_name)
            .filter(Responsibility.team_id == me.team_id)
            .order_by(Responsibility.responsibility_name.asc())
            .all()
        )
        return jsonify([
            {"responsibility_id": rid, "name": rname}
            for rid, rname in rows
        ]), 200