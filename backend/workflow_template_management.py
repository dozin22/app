# -*- coding: utf-8 -*-
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.orm import selectinload
from sqlalchemy import select

# orm
from orm_build import get_session, User, Team, WorkflowTemplate, WorkflowTemplateDefinition, WorkflowtemplateTeamMapping

# custom decorator
from user_management import require_db_admin

bp_workflow_management = Blueprint("workflow_management", __name__, url_prefix="/api/workflow-management")

# ─────────────────────────────────────────────────────────────
# 업무 흐름 템플릿 관리 (팀장 또는 DT전문가)
# db에서 Team_id를 기준으로 업무 흐름 템플릿을 조회
def get_workflow_templates():
    user_id = get_jwt_identity()
    with get_session() as session:
        user = session.get(User, user_id)
        if not user:
            return jsonify({"message": "User not found"}), 404 # More descriptive message

        team = user.team
        if not team:
            return jsonify({"message": "User is not assigned to any team"}), 400

        workflow_templates_query = session.execute(
            select(WorkflowTemplate)
            .join(WorkflowTemplate.teams)
            .options(
                selectinload(WorkflowTemplate.definitions)
                .selectinload(WorkflowTemplateDefinition.task_template),
                selectinload(WorkflowTemplate.definitions)
                .selectinload(WorkflowTemplateDefinition.depends_on) # Load dependency information
            )
            .where(Team.team_id == team.team_id)
        ).scalars().all()

        workflow_templates_data = []
        for wt in workflow_templates_query:
            definitions_data = []
            for definition in wt.definitions:
                definitions_data.append({
                    "definition_id": definition.definition_id,
                    "task_template_id": definition.task_template_id,
                    "task_template_name": definition.task_template.template_name if definition.task_template else None,
                    "depends_on_task_template_id": definition.depends_on_task_template_id,
                    "depends_on_task_template_name": definition.depends_on.template_name if definition.depends_on else None,
                    # Add other fields from WorkflowTemplateDefinition if needed
                })
            workflow_templates_data.append({
                "workflow_template_id": wt.workflow_template_id,
                "template_name": wt.template_name,
                "description": wt.description,
                "definitions": definitions_data
            })

    return jsonify(workflow_templates_data), 200

# backend/workflow_template_management.py


# 목록 조회
@bp_workflow_management.route("/workflow-templates", methods=["GET"])
@jwt_required()
def list_workflow_templates():
    return get_workflow_templates()  # 기존 함수 재사용

# 생성
@bp_workflow_management.route("/workflow-templates", methods=["POST"])
@jwt_required()
def create_workflow_template():
    user_id = get_jwt_identity()
    data = request.get_json(silent=True) or {}
    name = (data.get("template_name") or "").strip()
    desc = (data.get("description") or None)

    if not name:
        return jsonify({"message": "template_name is required"}), 400

    with get_session() as s:
        user = s.get(User, user_id)
        if not user or not user.team:
            return jsonify({"message": "User/team not found"}), 400

        wt = WorkflowTemplate(template_name=name, description=desc)
        s.add(wt)
        s.flush()  # id 생성

        # 사용자 팀과 매핑
        s.add(WorkflowtemplateTeamMapping(
            workflow_template_id=wt.workflow_template_id,
            team_id=user.team.team_id
        ))

        return jsonify({
            "workflow_template_id": wt.workflow_template_id,
            "template_name": wt.template_name,
            "description": wt.description,
            "definitions": []
        }), 201

# 수정
@bp_workflow_management.route("/workflow-templates/<int:wt_id>", methods=["PUT"])
@jwt_required()
def update_workflow_template(wt_id):
    user_id = get_jwt_identity()
    data = request.get_json(silent=True) or {}
    with get_session() as s:
        user = s.get(User, user_id)
        if not user or not user.team:
            return jsonify({"message": "User/team not found"}), 400

        # 내 팀에 속한 템플릿만 수정
        wt = s.execute(
            select(WorkflowTemplate)
            .join(WorkflowTemplate.teams)
            .where(WorkflowTemplate.workflow_template_id == wt_id,
                   Team.team_id == user.team.team_id)
        ).scalar_one_or_none()
        if not wt:
            return jsonify({"message": "Template not found"}), 404

        if "template_name" in data:
            name = (data["template_name"] or "").strip()
            if not name:
                return jsonify({"message": "template_name is required"}), 400
            wt.template_name = name
        if "description" in data:
            wt.description = data["description"] or None
        return jsonify({"message": "ok"}), 200

# 삭제
@bp_workflow_management.route("/workflow-templates/<int:wt_id>", methods=["DELETE"])
@jwt_required()
def delete_workflow_template(wt_id):
    user_id = get_jwt_identity()
    with get_session() as s:
        user = s.get(User, user_id)
        if not user or not user.team:
            return jsonify({"message": "User/team not found"}), 400

        wt = s.execute(
            select(WorkflowTemplate)
            .join(WorkflowTemplate.teams)
            .where(WorkflowTemplate.workflow_template_id == wt_id,
                   Team.team_id == user.team.team_id)
        ).scalar_one_or_none()
        if not wt:
            return jsonify({"message": "Template not found"}), 404

        s.delete(wt)
        return jsonify({"message": "deleted"}), 200

