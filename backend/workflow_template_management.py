# -*- coding: utf-8 -*-
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.orm import selectinload
from sqlalchemy import select

# orm
from orm_build import get_session, User, Team, Responsibility, TaskTemplate, WorkflowTemplate, WorkflowTemplateDefinition

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
