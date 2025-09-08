# backend/db_management.py
# -*- coding: utf-8 -*-
from functools import wraps
from typing import Any, Callable
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.orm import selectinload, joinedload  # joinedload는 /me_get 유지용
# from sqlalchemy import select  # 현재 미사용이면 주석처리

from orm_build import get_session, User, Team, Responsibility, TaskTemplate

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
# DT 전문가 선임 (팀장 전용)
@bp_db_management.get("/team-members")
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
            is_dt_expert = any(r.responsibility_name == "DT_Expert" for r in member.responsibilities)
            data.append({
                "user_id": member.user_id,
                "name": member.user_name,
                "position": member.position,
                "email": member.email,
                "is_dt_expert": is_dt_expert
            })
        return jsonify(data), 200

@bp_db_management.put("/team-members/dt-expert-status")
@require_team_lead
def update_dt_expert_status(current_user: User):
    """팀원들의 DT 전문가 역할을 업데이트"""
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

    return jsonify({"message": "DT 전문가 정보가 업데이트되었습니다."}), 200

# ─────────────────────────────────────────────────────────────
# 업무 정보 관리 (팀장 전용)
@bp_db_management.get("/task-templates")
@require_team_lead
def get_task_templates(current_user: User):
    """팀장의 팀에 속한 TaskTemplate 목록과 Responsibility 목록을 반환"""
    with get_session() as s:
        s.add(current_user)
        if not current_user.team_id:
            return jsonify({"task_templates": [], "responsibilities": []})

        # 팀의 Responsibility 목록 조회
        responsibilities = s.query(Responsibility).filter_by(team_id=current_user.team_id).all()
        resp_ids = [r.responsibility_id for r in responsibilities]

        # 해당 Responsibility에 연결된 TaskTemplate 목록 조회
        task_templates = s.query(TaskTemplate).filter(TaskTemplate.required_responsibility_id.in_(resp_ids)).order_by(TaskTemplate.template_name).all()

        return jsonify({
            "task_templates": [
                {
                    "task_template_id": tt.task_template_id,
                    "template_name": tt.template_name,
                    "task_type": tt.task_type,
                    "category": tt.category,
                    "description": tt.description,
                    "required_responsibility_id": tt.required_responsibility_id,
                } for tt in task_templates
            ],
            "responsibilities": [
                {"responsibility_id": r.responsibility_id, "responsibility_name": r.responsibility_name} for r in responsibilities
            ]
        })

@bp_db_management.put("/task-templates/<int:template_id>")
@require_team_lead
def update_task_template(current_user: User, template_id: int):
    """TaskTemplate 정보를 업데이트"""
    data = request.get_json()
    with get_session() as s:
        s.add(current_user)
        tt = s.get(TaskTemplate, template_id)
        if not tt:
            return jsonify({"message": "템플릿을 찾을 수 없습니다."}), 404

        # 해당 템플릿이 팀장의 팀 소속인지 확인 (보안)
        resp = s.get(Responsibility, tt.required_responsibility_id)
        if not resp or resp.team_id != current_user.team_id:
            return jsonify({"message": "권한이 없습니다."}), 403

        tt.template_name = data.get("template_name", tt.template_name)
        tt.task_type = data.get("task_type", tt.task_type)
        tt.category = data.get("category", tt.category)
        tt.description = data.get("description", tt.description)
        tt.required_responsibility_id = data.get("required_responsibility_id", tt.required_responsibility_id)

        return jsonify({"message": "업무 템플릿이 업데이트되었습니다."})
