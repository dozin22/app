# -*- coding: utf-8 -*-
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.orm import selectinload

# orm
from orm_build import get_session, User, Team, RequestTemplate, WorkflowTemplate

# custom decorator
from user_management import require_db_admin

bp_request_management = Blueprint("request_management", __name__, url_prefix="/api/request-management")


@bp_request_management.get("/request-templates")
@jwt_required()
def get_request_templates():
    """사용자 팀에 매핑된 RequestTemplate 목록과 전체 WorkflowTemplate 목록을 반환"""
    uid = int(get_jwt_identity())
    with get_session() as s:
        current_user = s.get(User, uid)
        if not current_user or not current_user.team_id:
            return jsonify({"request_templates": [], "workflow_templates": []})

        request_templates = (
            s.query(RequestTemplate)
            .join(RequestTemplate.teams)
            .filter(Team.team_id == current_user.team_id)
            .order_by(RequestTemplate.template_name)
            .all()
        )
        workflow_templates = s.query(WorkflowTemplate).order_by(WorkflowTemplate.template_name).all()

        return jsonify({
            "request_templates": [
                {
                    "request_template_id": rt.request_template_id,
                    "template_name": rt.template_name,
                    "description": rt.description,
                    "workflow_template_id": rt.workflow_template_id,
                } for rt in request_templates
            ],
            "workflow_templates": [
                {
                    "workflow_template_id": wt.workflow_template_id,
                    "template_name": wt.template_name,
                } for wt in workflow_templates
            ]
        })

@bp_request_management.post("/request-templates")
@require_db_admin
def create_request_template():
    """새로운 RequestTemplate을 생성하고 현재 사용자의 팀에 매핑"""
    uid = int(get_jwt_identity())
    data = request.get_json()
    template_name = data.get("template_name")
    if not template_name:
        return jsonify({"message": "템플릿 이름은 필수입니다."}), 400

    with get_session() as s:
        current_user = s.get(User, uid)
        if not current_user or not current_user.team_id:
            return jsonify({"message": "유효한 사용자가 아닙니다."}), 401

        existing = s.query(RequestTemplate).filter_by(template_name=template_name).first()
        if existing:
            if not any(team.team_id == current_user.team_id for team in existing.teams):
                team_to_map = s.get(Team, current_user.team_id)
                existing.teams.append(team_to_map)
                s.commit()
                return jsonify({"message": f"기존 템플릿 '{template_name}'을 현재 팀에 추가했습니다."}), 200
            else:
                return jsonify({"message": "이미 같은 이름의 템플릿이 존재합니다."}), 409

        new_template = RequestTemplate(
            template_name=template_name,
            description=data.get("description"),
            workflow_template_id=data.get("workflow_template_id")
        )
        
        team_to_map = s.get(Team, current_user.team_id)
        new_template.teams.append(team_to_map)
        
        s.add(new_template)
        s.flush()
        
        return jsonify({
            "message": "새 요청 서식이 생성되었습니다.",
            "request_template_id": new_template.request_template_id
        }), 201

@bp_request_management.put("/request-templates/<int:template_id>")
@require_db_admin
def update_request_template(template_id: int):
    """RequestTemplate 정보를 업데이트"""
    uid = int(get_jwt_identity())
    data = request.get_json()
    with get_session() as s:
        current_user = s.get(User, uid)
        if not current_user or not current_user.team_id:
            return jsonify({"message": "유효한 사용자가 아닙니다."}), 401

        rt = s.query(RequestTemplate).options(selectinload(RequestTemplate.teams)).filter_by(request_template_id=template_id).first()
        if not rt:
            return jsonify({"message": "템플릿을 찾을 수 없습니다."}), 404

        if not any(team.team_id == current_user.team_id for team in rt.teams):
            return jsonify({"message": "이 템플릿을 수정할 권한이 없습니다."}), 403

        rt.template_name = data.get("template_name", rt.template_name)
        rt.description = data.get("description", rt.description)
        rt.workflow_template_id = data.get("workflow_template_id", rt.workflow_template_id)
        
        s.commit()
        return jsonify({"message": "요청 서식이 업데이트되었습니다."})


@bp_request_management.delete("/request-templates/<int:template_id>")
@require_db_admin
def delete_request_template(template_id: int):
    """RequestTemplate과 현재 사용자 팀의 매핑을 제거. 다른 팀에서도 사용하지 않으면 템플릿 자체를 삭제."""
    uid = int(get_jwt_identity())
    with get_session() as s:
        current_user = s.get(User, uid)
        if not current_user or not current_user.team_id:
            return jsonify({"message": "유효한 사용자가 아닙니다."}), 401

        rt = s.query(RequestTemplate).options(selectinload(RequestTemplate.teams)).filter_by(request_template_id=template_id).first()
        if not rt:
            return jsonify({"message": "템플릿을 찾을 수 없습니다."}), 404

        team_to_remove = next((team for team in rt.teams if team.team_id == current_user.team_id), None)
        if team_to_remove:
            rt.teams.remove(team_to_remove)
            
            if not rt.teams:
                s.delete(rt)
                s.commit()
                return jsonify({"message": "요청 서식이 팀에서 제거되었고, 다른 팀에서도 사용하지 않아 완전히 삭제되었습니다."}), 200
            else:
                s.commit()
                return jsonify({"message": "요청 서식이 팀에서 제거되었습니다."}), 200
        else:
            return jsonify({"message": "해당 템플릿은 현재 팀에 매핑되어 있지 않습니다."}), 404
