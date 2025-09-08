# backend/workflow_management.py
# -*- coding: utf-8 -*-
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.orm import selectinload

# orm
from orm_build import get_session, User, Team, Responsibility, TaskTemplate

# custom decorator
from user_management import require_db_admin

bp_workflow_management = Blueprint("workflow_management", __name__, url_prefix="/api/workflow-management")


# ─────────────────────────────────────────────────────────────
# 업무 정보 관리 (팀장 또는 DT전문가)
@bp_workflow_management.get("/task-templates")
@require_db_admin  # 팀장 또는 DT전문가
def get_task_templates():
    """사용자 팀에 매핑된 TaskTemplate 목록과 Responsibility 목록을 반환"""
    uid = int(get_jwt_identity())
    with get_session() as s:
        current_user = s.get(User, uid)
        if not current_user or not current_user.team_id:
            return jsonify({"task_templates": [], "responsibilities": []})

        # 사용자의 팀에 매핑된 TaskTemplate 목록 조회 (task_template_team_mappings 기반)
        task_templates = (
            s.query(TaskTemplate)
            .join(TaskTemplate.teams)
            .filter(Team.team_id == current_user.team_id)
            .order_by(TaskTemplate.template_name)
            .all()
        )

        # 프론트엔드에서 담당 책임(Responsibility)을 선택할 수 있도록 팀의 전체 책임 목록 전달
        responsibilities = s.query(Responsibility).filter_by(team_id=current_user.team_id).all()

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

@bp_workflow_management.put("/task-templates/<int:template_id>")
@require_db_admin  # 팀장 또는 DT전문가
def update_task_template(template_id: int):
    """TaskTemplate 정보를 업데이트"""
    uid = int(get_jwt_identity())
    data = request.get_json()
    
    with get_session() as s:
        current_user = s.get(User, uid)
        if not current_user or not current_user.team_id:
            return jsonify({"message": "유효한 사용자가 아닙니다."}), 401

        # 템플릿 조회 (팀 관계 포함)
        tt = s.query(TaskTemplate).options(selectinload(TaskTemplate.teams)).filter_by(task_template_id=template_id).first()
        if not tt:
            return jsonify({"message": "템플릿을 찾을 수 없습니다."}), 404

        # (보안) 해당 템플릿이 사용자의 팀에 매핑되어 있는지 확인
        if not any(team.team_id == current_user.team_id for team in tt.teams):
            return jsonify({"message": "이 템플릿을 수정할 권한이 없습니다."}), 403

        # 정보 업데이트
        tt.template_name = data.get("template_name", tt.template_name)
        tt.task_type = data.get("task_type", tt.task_type)
        tt.category = data.get("category", tt.category)
        tt.description = data.get("description", tt.description)
        
        # required_responsibility_id 업데이트 시, 해당 책임이 사용자 팀 소속인지 확인
        new_resp_id = data.get("required_responsibility_id")
        if new_resp_id:
            resp = s.get(Responsibility, new_resp_id)
            if not resp or resp.team_id != current_user.team_id:
                return jsonify({"message": "유효하지 않은 담당 책임입니다."}), 400
            tt.required_responsibility_id = new_resp_id
        else:
            tt.required_responsibility_id = None


        s.commit()
        return jsonify({"message": "업무 템플릿이 업데이트되었습니다."})


@bp_workflow_management.post("/task-templates")
@require_db_admin  # 팀장 또는 DT전문가
def create_task_template():
    """새로운 TaskTemplate을 생성하고 현재 사용자의 팀에 매핑"""
    uid = int(get_jwt_identity())
    data = request.get_json()
    
    template_name = data.get("template_name")
    if not template_name:
        return jsonify({"message": "템플릿 이름은 필수입니다."}), 400

    with get_session() as s:
        current_user = s.get(User, uid)
        if not current_user or not current_user.team_id:
            return jsonify({"message": "유효한 사용자가 아닙니다."}), 401

        # (중복 방지) 같은 이름의 템플릿이 이미 있는지 확인
        existing = s.query(TaskTemplate).filter_by(template_name=template_name).first()
        if existing:
            # 이미 존재하지만, 현재 팀에 매핑되지 않았다면 매핑만 추가
            if not any(team.team_id == current_user.team_id for team in existing.teams):
                team_to_map = s.get(Team, current_user.team_id)
                existing.teams.append(team_to_map)
                s.commit()
                return jsonify({"message": f"기존 템플릿 '{template_name}'을 현재 팀에 추가했습니다."}), 200
            else:
                return jsonify({"message": "이미 같은 이름의 템플릿이 존재합니다."}), 409

        # 새 템플릿 생성
        new_template = TaskTemplate(
            template_name=template_name,
            task_type=data.get("task_type"),
            category=data.get("category"),
            description=data.get("description"),
            required_responsibility_id=data.get("required_responsibility_id")
        )
        
        # 생성한 템플릿을 현재 사용자의 팀에 매핑
        team_to_map = s.get(Team, current_user.team_id)
        new_template.teams.append(team_to_map)
        
        s.add(new_template)
        s.flush() # ID를 받아오기 위해 flush
        
        return jsonify({
            "message": "새 업무 템플릿이 생성되었습니다.",
            "task_template_id": new_template.task_template_id
        }), 201


@bp_workflow_management.delete("/task-templates/<int:template_id>")
@require_db_admin  # 팀장 또는 DT전문가
def delete_task_template(template_id: int):
    """TaskTemplate과 현재 사용자 팀의 매핑을 제거. 다른 팀에서도 사용하지 않으면 템플릿 자체를 삭제."""
    uid = int(get_jwt_identity())
    
    with get_session() as s:
        current_user = s.get(User, uid)
        if not current_user or not current_user.team_id:
            return jsonify({"message": "유효한 사용자가 아닙니다."}), 401

        tt = s.query(TaskTemplate).options(selectinload(TaskTemplate.teams)).filter_by(task_template_id=template_id).first()
        if not tt:
            return jsonify({"message": "템플릿을 찾을 수 없습니다."}), 404

        # 현재 팀과의 매핑 제거
        team_to_remove = next((team for team in tt.teams if team.team_id == current_user.team_id), None)
        if team_to_remove:
            tt.teams.remove(team_to_remove)
            
            # 다른 팀에서도 이 템플릿을 사용하지 않는다면, 템플릿 자체를 삭제
            if not tt.teams:
                s.delete(tt)
                s.commit()
                return jsonify({"message": "업무 템플릿이 팀에서 제거되었고, 다른 팀에서도 사용하지 않아 완전히 삭제되었습니다."}), 200
            else:
                s.commit()
                return jsonify({"message": "업무 템플릿이 팀에서 제거되었습니다."}), 200
        else:
            return jsonify({"message": "해당 템플릿은 현재 팀에 매핑되어 있지 않습니다."}), 404

@bp_workflow_management.before_request
def _skip_jwt_on_options_workflow():
    if request.method == "OPTIONS":
        return ("", 204)