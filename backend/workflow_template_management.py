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
@bp_workflow_management.route("/workflow-templates", methods=["GET"])
@jwt_required()
@require_db_admin
def get_workflow_templates():
    user_id = get_jwt_identity()
    with get_session() as session:
        user = session.get(User, user_id)
        if not user:
            return jsonify({"msg": "nd"}), 404

        team = user.team
        if not team:
            return jsonify({"msg": "User is not assigned to any team"}), 400
        

        # 사용자의 팀에 매핑된 WorkflowTemplate 목록 조회
        # workflow template definition를 로드하여 하위 task template 정보도 함께 가져옴
        # 이렇게 가져온 task_template_definition 정보로 업무 흐름도의 틀 생성
        workflow_templates = session.execute(
            select(WorkflowTemplate)
            .join(WorkflowTemplate.teams)
            .options(selectinload(WorkflowTemplate.definitions).selectinload(WorkflowTemplateDefinition.task_template))
            .where(Team.team_id == team.team_id)
        ).scalars().all()

    return jsonify(workflow_templates), 200