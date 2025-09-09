# -*- coding: utf-8 -*-
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.orm import selectinload
from sqlalchemy import select

# orm
from orm_build import get_session, User, Team, TaskTemplateTeamMapping, TaskTemplate, WorkflowTemplate, WorkflowTemplateDefinition, WorkflowtemplateTeamMapping

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


bp_workflow_management = Blueprint("workflow_management", __name__, url_prefix="/api/workflow-management")

def _get_user_and_team(session, user_id):
    user = session.get(User, user_id)
    if not user:
        return None, None, (jsonify({"message": "User not found"}), 404)
    team = user.team
    if not team:
        return None, None, (jsonify({"message": "User is not assigned to any team"}), 400)
    return user, team, None

def _assert_template_belongs_to_team(session, wt_id, team_id):
    wt = session.execute(
        select(WorkflowTemplate)
        .join(WorkflowTemplate.teams)
        .where(WorkflowTemplate.workflow_template_id == wt_id, Team.team_id == team_id)
    ).scalar_one_or_none()
    return wt

# ----- (A) 후보 업무: 우리 팀에 매핑된 TaskTemplate 목록 -----
@bp_workflow_management.route("/workflow-templates/<int:wt_id>/candidates", methods=["GET"])
@jwt_required()
def list_task_candidates(wt_id):
    user_id = get_jwt_identity()
    with get_session() as s:
        user, team, err = _get_user_and_team(s, user_id)
        if err: return err
        wt = _assert_template_belongs_to_team(s, wt_id, team.team_id)
        if not wt:
            return jsonify({"message": "Template not found"}), 404

        rows = s.execute(
            select(TaskTemplate)
            .join(TaskTemplateTeamMapping, TaskTemplateTeamMapping.task_template_id == TaskTemplate.task_template_id)
            .where(TaskTemplateTeamMapping.team_id == team.team_id)
            .order_by(TaskTemplate.template_name.asc())
        ).scalars().all()
        return jsonify([
            {"task_template_id": t.task_template_id, "template_name": t.template_name}
            for t in rows
        ]), 200

# ----- (B) 정의 목록 -----
@bp_workflow_management.route("/workflow-templates/<int:wt_id>/definitions", methods=["GET"])
@jwt_required()
def list_definitions(wt_id):
    user_id = get_jwt_identity()
    with get_session() as s:
        user, team, err = _get_user_and_team(s, user_id)
        if err: return err
        wt = _assert_template_belongs_to_team(s, wt_id, team.team_id)
        if not wt:
            return jsonify({"message": "Template not found"}), 404

        defs = s.execute(
            select(WorkflowTemplateDefinition)
            .where(WorkflowTemplateDefinition.workflow_template_id == wt_id)
            .options(
                selectinload(WorkflowTemplateDefinition.task_template),
                selectinload(WorkflowTemplateDefinition.depends_on),
            )
            .order_by(WorkflowTemplateDefinition.definition_id.asc())
        ).scalars().all()

        data = [{
            "definition_id": d.definition_id,
            "task_template_id": d.task_template_id,
            "task_template_name": d.task_template.template_name if d.task_template else None,
            "depends_on_task_template_id": d.depends_on_task_template_id,
            "depends_on_task_template_name": d.depends_on.template_name if d.depends_on else None,
        } for d in defs]

        # 노드(업무) 세트도 같이 제공 (그래프용)
        node_ids = set([d.task_template_id for d in defs] + [d.depends_on_task_template_id for d in defs if d.depends_on_task_template_id])
        nodes = []
        if node_ids:
            tts = s.execute(select(TaskTemplate).where(TaskTemplate.task_template_id.in_(node_ids))).scalars().all()
            nodes = [{"task_template_id": t.task_template_id, "template_name": t.template_name} for t in tts]

        return jsonify({"workflow_template_id": wt_id, "definitions": data, "nodes": nodes}), 200

# ----- (C) 정의 추가 -----
@bp_workflow_management.route("/workflow-templates/<int:wt_id>/definitions", methods=["POST"])
@jwt_required()
def add_definition(wt_id):
    user_id = get_jwt_identity()
    body = request.get_json(silent=True) or {}
    task_id = body.get("task_template_id")
    dep_id  = body.get("depends_on_task_template_id")

    if not task_id:
        return jsonify({"message": "task_template_id is required"}), 400
    if dep_id == task_id and dep_id is not None:
        return jsonify({"message": "A task cannot depend on itself"}), 400

    with get_session() as s:
        user, team, err = _get_user_and_team(s, user_id)
        if err: return err
        wt = _assert_template_belongs_to_team(s, wt_id, team.team_id)
        if not wt:
            return jsonify({"message": "Template not found"}), 404

        # 후보 업무 제한: 우리 팀에 매핑된 업무만
        allowed_ids = s.execute(
            select(TaskTemplate.task_template_id)
            .join(TaskTemplateTeamMapping, TaskTemplateTeamMapping.task_template_id == TaskTemplate.task_template_id)
            .where(TaskTemplateTeamMapping.team_id == team.team_id)
        ).scalars().all()
        if task_id not in allowed_ids or (dep_id and dep_id not in allowed_ids):
            return jsonify({"message": "task not allowed for this team"}), 403

        # 중복 방지
        exists = s.execute(
            select(WorkflowTemplateDefinition).where(
                WorkflowTemplateDefinition.workflow_template_id == wt_id,
                WorkflowTemplateDefinition.task_template_id == task_id,
                WorkflowTemplateDefinition.depends_on_task_template_id.is_(dep_id if dep_id is not None else None)
            )
        ).scalar_one_or_none()
        if exists:
            return jsonify({"message":"duplicate definition"}), 409

        # (선택) 간단 사이클 방지: dep_id -> ... -> task_id 경로가 이미 있으면 금지
        if dep_id:
            # 인접리스트 구축
            edges = s.execute(select(
                WorkflowTemplateDefinition.depends_on_task_template_id,
                WorkflowTemplateDefinition.task_template_id
            ).where(WorkflowTemplateDefinition.workflow_template_id == wt_id,
                    WorkflowTemplateDefinition.depends_on_task_template_id.is_not(None))
            ).all()
            adj = {}
            for u,v in edges:
                adj.setdefault(u, set()).add(v)
            # DFS로 task_id에서 dep_id로 가는 경로가 이미 있으면 (dep->task 추가 시 사이클)
            def dfs(u, target, seen):
                if u == target: return True
                for w in adj.get(u, ()):
                    if w not in seen:
                        seen.add(w)
                        if dfs(w, target, seen): return True
                return False
            if dfs(task_id, dep_id, set()):
                return jsonify({"message": "edge would create a cycle"}), 400

        d = WorkflowTemplateDefinition(
            workflow_template_id = wt_id,
            task_template_id = task_id,
            depends_on_task_template_id = dep_id
        )
        s.add(d)
        s.flush()
        return jsonify({"definition_id": d.definition_id}), 201

# ----- (D) 정의 수정 -----
@bp_workflow_management.route("/workflow-templates/<int:wt_id>/definitions/<int:def_id>", methods=["PUT"])
@jwt_required()
def update_definition(wt_id, def_id):
    user_id = get_jwt_identity()
    body = request.get_json(silent=True) or {}
    new_task_id = body.get("task_template_id")
    new_dep_id  = body.get("depends_on_task_template_id")

    if new_dep_id == new_task_id and new_dep_id is not None:
        return jsonify({"message": "A task cannot depend on itself"}), 400

    with get_session() as s:
        user, team, err = _get_user_and_team(s, user_id)
        if err: return err
        wt = _assert_template_belongs_to_team(s, wt_id, team.team_id)
        if not wt:
            return jsonify({"message": "Template not found"}), 404

        d = s.get(WorkflowTemplateDefinition, def_id)
        if not d or d.workflow_template_id != wt_id:
            return jsonify({"message":"Definition not found"}), 404

        # 허용 업무 체크
        allowed_ids = s.execute(
            select(TaskTemplate.task_template_id)
            .join(TaskTemplateTeamMapping, TaskTemplateTeamMapping.task_template_id == TaskTemplate.task_template_id)
            .where(TaskTemplateTeamMapping.team_id == team.team_id)
        ).scalars().all()

        if new_task_id and new_task_id not in allowed_ids:
            return jsonify({"message":"task not allowed"}), 403
        if new_dep_id is not None and new_dep_id not in allowed_ids:
            return jsonify({"message":"dependency not allowed"}), 403

        task_id = new_task_id if new_task_id else d.task_template_id
        dep_id  = new_dep_id if (new_dep_id is not None) else d.depends_on_task_template_id

        # 중복 방지
        dup = s.execute(
            select(WorkflowTemplateDefinition).where(
                WorkflowTemplateDefinition.workflow_template_id == wt_id,
                WorkflowTemplateDefinition.task_template_id == task_id,
                (WorkflowTemplateDefinition.depends_on_task_template_id == dep_id)
                if dep_id is not None else
                (WorkflowTemplateDefinition.depends_on_task_template_id.is_(None)),
                WorkflowTemplateDefinition.definition_id != def_id
            )
        ).scalar_one_or_none()
        if dup:
            return jsonify({"message":"duplicate definition"}), 409

        # 간단 사이클 체크
        if dep_id:
            edges = s.execute(select(
                WorkflowTemplateDefinition.depends_on_task_template_id,
                WorkflowTemplateDefinition.task_template_id
            ).where(WorkflowTemplateDefinition.workflow_template_id == wt_id,
                    WorkflowTemplateDefinition.definition_id != def_id,
                    WorkflowTemplateDefinition.depends_on_task_template_id.is_not(None))
            ).all()
            adj = {}
            for u,v in edges:
                adj.setdefault(u, set()).add(v)
            def dfs(u, target, seen):
                if u == target: return True
                for w in adj.get(u, ()):
                    if w not in seen:
                        seen.add(w)
                        if dfs(w, target, seen): return True
                return False
            if dfs(task_id, dep_id, set()):
                return jsonify({"message": "edge would create a cycle"}), 400

        d.task_template_id = task_id
        d.depends_on_task_template_id = dep_id
        return jsonify({"message":"ok"}), 200

# ----- (E) 정의 삭제 -----
@bp_workflow_management.route("/workflow-templates/<int:wt_id>/definitions/<int:def_id>", methods=["DELETE"])
@jwt_required()
def delete_definition(wt_id, def_id):
    user_id = get_jwt_identity()
    with get_session() as s:
        user, team, err = _get_user_and_team(s, user_id)
        if err: return err
        wt = _assert_template_belongs_to_team(s, wt_id, team.team_id)
        if not wt:
            return jsonify({"message": "Template not found"}), 404

        d = s.get(WorkflowTemplateDefinition, def_id)
        if not d or d.workflow_template_id != wt_id:
            return jsonify({"message":"Definition not found"}), 404
        s.delete(d)
        return jsonify({"message":"deleted"}), 200

# (옵션) 특정 업무 노드 자체 삭제: 해당 업무에 대한 모든 정의 제거
@bp_workflow_management.route("/workflow-templates/<int:wt_id>/tasks/<int:task_template_id>", methods=["DELETE"])
@jwt_required()
def delete_task_node(wt_id, task_template_id):
    user_id = get_jwt_identity()
    with get_session() as s:
        user, team, err = _get_user_and_team(s, user_id)
        if err: return err
        wt = _assert_template_belongs_to_team(s, wt_id, team.team_id)
        if not wt:
            return jsonify({"message":"Template not found"}), 404
        cnt = s.execute(
            select(WorkflowTemplateDefinition.definition_id).where(
                WorkflowTemplateDefinition.workflow_template_id == wt_id,
                WorkflowTemplateDefinition.task_template_id == task_template_id
            )
        ).scalars().all()
        if not cnt:
            return jsonify({"message":"nothing to delete"}), 404
        s.query(WorkflowTemplateDefinition)\
         .filter(WorkflowTemplateDefinition.workflow_template_id == wt_id,
                 WorkflowTemplateDefinition.task_template_id == task_template_id).delete()
        return jsonify({"message":"deleted", "count": len(cnt)}), 200