# backend/workflow_template_management.py
# -*- coding: utf-8 -*-
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import select
from sqlalchemy.orm import selectinload

# orm
from orm_build import (
    get_session, User, Team,
    TaskTemplateTeamMapping, TaskTemplate,
    WorkflowTemplate, WorkflowTemplateDefinition,
    WorkflowtemplateTeamMapping
)

# custom decorator
from user_management import require_db_admin

# ─────────────────────────────────────────────────────────────
# Blueprint: 반드시 한 번만 생성!
bp_workflow_management = Blueprint(
    "workflow_management", __name__, url_prefix="/api/workflow-management"
)

# ─────────────────────────────────────────────────────────────
# 공통 유틸
def _get_user_and_team(session, user_id):
    user = session.get(User, user_id)
    if not user:
        return None, None, (jsonify({"message": "User not found"}), 404)
    team = user.team
    if not team:
        return None, None, (jsonify({"message": "User is not assigned to any team"}), 400)
    return user, team, None

def _assert_template_belongs_to_team(session, wt_id, team_id):
    # 매핑 테이블을 명시적으로 join해서 소속 확인
    hit = session.execute(
        select(WorkflowtemplateTeamMapping).where(
            WorkflowtemplateTeamMapping.workflow_template_id == wt_id,
            WorkflowtemplateTeamMapping.team_id == team_id
        )
    ).scalar_one_or_none()
    return session.get(WorkflowTemplate, wt_id) if hit else None

# ─────────────────────────────────────────────────────────────
# 템플릿 목록 (정의 일부까지 eager-load)
@bp_workflow_management.route("/workflow-templates", methods=["GET"])
@jwt_required()
@require_db_admin
def list_workflow_templates():
    user_id = get_jwt_identity()
    with get_session() as s:
        user, team, err = _get_user_and_team(s, user_id)
        if err: return err

        rows = s.execute(
            select(WorkflowTemplate)
            .join(
                WorkflowtemplateTeamMapping,
                WorkflowtemplateTeamMapping.workflow_template_id == WorkflowTemplate.workflow_template_id
            )
            .where(WorkflowtemplateTeamMapping.team_id == team.team_id)
            .options(
                selectinload(WorkflowTemplate.definitions).selectinload(WorkflowTemplateDefinition.task_template),
                selectinload(WorkflowTemplate.definitions).selectinload(WorkflowTemplateDefinition.depends_on),
            )
            .order_by(WorkflowTemplate.template_name.asc())
        ).scalars().all()

        out = []
        for wt in rows:
            defs = [{
                "definition_id": d.definition_id,
                "task_template_id": d.task_template_id,
                "task_template_name": d.task_template.template_name if d.task_template else None,
                "depends_on_task_template_id": d.depends_on_task_template_id,
                "depends_on_task_template_name": d.depends_on.template_name if d.depends_on else None,
            } for d in wt.definitions]
            out.append({
                "workflow_template_id": wt.workflow_template_id,
                "template_name": wt.template_name,
                "description": wt.description,
                "definitions": defs
            })
        return jsonify(out), 200

# 템플릿 생성
@bp_workflow_management.route("/workflow-templates", methods=["POST"])
@jwt_required()
@require_db_admin
def create_workflow_template():
    user_id = get_jwt_identity()
    data = request.get_json(silent=True) or {}
    name = (data.get("template_name") or "").strip()
    desc = (data.get("description") or None)
    if not name:
        return jsonify({"message": "template_name is required"}), 400

    with get_session() as s:
        user, team, err = _get_user_and_team(s, user_id)
        if err: return err

        wt = WorkflowTemplate(template_name=name, description=desc)
        s.add(wt)
        s.flush()  # id 생성

        # 사용자 팀과 매핑
        s.add(WorkflowtemplateTeamMapping(
            workflow_template_id=wt.workflow_template_id,
            team_id=team.team_id
        ))

        return jsonify({
            "workflow_template_id": wt.workflow_template_id,
            "template_name": wt.template_name,
            "description": wt.description,
            "definitions": []
        }), 201

# 템플릿 수정
@bp_workflow_management.route("/workflow-templates/<int:wt_id>", methods=["PUT"])
@jwt_required()
@require_db_admin
def update_workflow_template(wt_id):
    user_id = get_jwt_identity()
    data = request.get_json(silent=True) or {}
    with get_session() as s:
        user, team, err = _get_user_and_team(s, user_id)
        if err: return err

        wt = _assert_template_belongs_to_team(s, wt_id, team.team_id)
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

# 템플릿 삭제
@bp_workflow_management.route("/workflow-templates/<int:wt_id>", methods=["DELETE"])
@jwt_required()
@require_db_admin
def delete_workflow_template(wt_id):
    user_id = get_jwt_identity()
    with get_session() as s:
        user, team, err = _get_user_and_team(s, user_id)
        if err: return err

        wt = _assert_template_belongs_to_team(s, wt_id, team.team_id)
        if not wt:
            return jsonify({"message": "Template not found"}), 404

        s.delete(wt)
        return jsonify({"message": "deleted"}), 200

# 템플릿 복제
@bp_workflow_management.route("/workflow-templates/<int:wt_id>/duplicate", methods=["POST"])
@jwt_required()
@require_db_admin
def duplicate_workflow_template(wt_id):
    user_id = get_jwt_identity()
    with get_session() as s:
        user, team, err = _get_user_and_team(s, user_id)
        if err: return err

        # 1. 원본 템플릿 조회 및 권한 확인
        source_wt = _assert_template_belongs_to_team(s, wt_id, team.team_id)
        if not source_wt:
            return jsonify({"message": "Template not found"}), 404

        # 2. 새 템플릿 생성
        new_wt = WorkflowTemplate(
            template_name=f"[복제] {source_wt.template_name}",
            description=source_wt.description
        )
        s.add(new_wt)
        s.flush()  # 새 ID 확보

        # 3. 새 템플릿을 현재 유저의 팀에 매핑
        s.add(WorkflowtemplateTeamMapping(
            workflow_template_id=new_wt.workflow_template_id,
            team_id=team.team_id
                ))
        # 4. 원본의 모든 정의(연결)를 복제 (Bulk Insert로 최적화)
        if source_wt.definitions:
            new_defs_data = [
                {
                    "workflow_template_id": new_wt.workflow_template_id,
                    "task_template_id": old_def.task_template_id,
                    "depends_on_task_template_id": old_def.depends_on_task_template_id
                }
                for old_def in source_wt.definitions
            ]
            s.bulk_insert_mappings(WorkflowTemplateDefinition, new_defs_data)
        # 5. 새 템플릿 정보 반환
        s.flush()
        return jsonify({
            "workflow_template_id": new_wt.workflow_template_id,
            "template_name": new_wt.template_name,
            "description": new_wt.description,
        }), 201

# ─────────────────────────────────────────────────────────────
# (A) 후보 업무: 우리 팀에 매핑된 TaskTemplate 목록
# /backend/workflow_template_management.py

@bp_workflow_management.route("/workflow-templates/<int:wt_id>/candidates", methods=["GET"])
@jwt_required()
@require_db_admin
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
            {
                "task_template_id": t.task_template_id,
                "template_name": t.template_name,
                "category": t.category,             # ★ 추가
            }
        for t in rows]), 200


# (B) 정의 목록
# /backend/workflow_template_management.py

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
            # (옵션) 행 자체에도 카테고리를 넣고 싶다면:
            # "task_template_category": d.task_template.category if d.task_template else None,
            # "depends_on_category": d.depends_on.category if d.depends_on else None,
        } for d in defs]

        node_ids = set([d.task_template_id for d in defs] + [d.depends_on_task_template_id for d in defs if d.depends_on_task_template_id])
        nodes = []
        if node_ids:
            tts = s.execute(select(TaskTemplate).where(TaskTemplate.task_template_id.in_(node_ids))).scalars().all()
            nodes = [{
                "task_template_id": t.task_template_id,
                "template_name": t.template_name,
                "category": t.category,              # ★ 추가
            } for t in tts]

        return jsonify({"workflow_template_id": wt_id, "definitions": data, "nodes": nodes}), 200


# (C) 정의 추가
@bp_workflow_management.route("/workflow-templates/<int:wt_id>/definitions", methods=["POST"])
@jwt_required()
@require_db_admin
def add_definition(wt_id):
    user_id = get_jwt_identity()
    body = request.get_json(silent=True) or {}
    task_id = body.get("task_template_id")
    dep_id  = body.get("depends_on_task_template_id")

    if not task_id:
        return jsonify({"message": "task_template_id is required"}), 400
    if dep_id is not None and dep_id == task_id:
        return jsonify({"message": "A task cannot depend on itself"}), 400

    with get_session() as s:
        user, team, err = _get_user_and_team(s, user_id)
        if err: return err
        wt = _assert_template_belongs_to_team(s, wt_id, team.team_id)
        if not wt:
            return jsonify({"message": "Template not found"}), 404

        # 후보 업무 제한: 우리 팀에 매핑된 업무만
        allowed_ids = set(s.execute(
            select(TaskTemplate.task_template_id)
            .join(TaskTemplateTeamMapping, TaskTemplateTeamMapping.task_template_id == TaskTemplate.task_template_id)
            .where(TaskTemplateTeamMapping.team_id == team.team_id)
        ).scalars().all())
        if task_id not in allowed_ids or (dep_id is not None and dep_id not in allowed_ids):
            return jsonify({"message": "task not allowed for this team"}), 403

        # 중복 방지
        dup = s.execute(
            select(WorkflowTemplateDefinition).where(
                WorkflowTemplateDefinition.workflow_template_id == wt_id,
                WorkflowTemplateDefinition.task_template_id == task_id,
                (WorkflowTemplateDefinition.depends_on_task_template_id == dep_id)
                if dep_id is not None else
                (WorkflowTemplateDefinition.depends_on_task_template_id.is_(None))
            )
        ).scalar_one_or_none()
        if dup:
            return jsonify({"message":"duplicate definition"}), 409

        d = WorkflowTemplateDefinition(
            workflow_template_id=wt_id,
            task_template_id=task_id,
            depends_on_task_template_id=dep_id
        )
        s.add(d); s.flush()
        return jsonify({"definition_id": d.definition_id}), 201

# (D) 정의 수정
@bp_workflow_management.route("/workflow-templates/<int:wt_id>/definitions/<int:def_id>", methods=["PUT"])
@jwt_required()
@require_db_admin
def update_definition(wt_id, def_id):
    user_id = get_jwt_identity()
    body = request.get_json(silent=True) or {}
    new_task_id = body.get("task_template_id")
    new_dep_id  = body.get("depends_on_task_template_id")

    if new_dep_id is not None and new_task_id is not None and new_dep_id == new_task_id:
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

        task_id = new_task_id if new_task_id is not None else d.task_template_id
        dep_id  = new_dep_id  if new_dep_id  is not None else d.depends_on_task_template_id

        # 허용 업무 체크
        allowed_ids = set(s.execute(
            select(TaskTemplate.task_template_id)
            .join(TaskTemplateTeamMapping, TaskTemplateTeamMapping.task_template_id == TaskTemplate.task_template_id)
            .where(TaskTemplateTeamMapping.team_id == team.team_id)
        ).scalars().all())
        if task_id not in allowed_ids or (dep_id is not None and dep_id not in allowed_ids):
            return jsonify({"message":"task not allowed"}), 403

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

        d.task_template_id = task_id
        d.depends_on_task_template_id = dep_id
        return jsonify({"message":"ok"}), 200

# (E) 정의 삭제
@bp_workflow_management.route("/workflow-templates/<int:wt_id>/definitions/<int:def_id>", methods=["DELETE"])
@jwt_required()
@require_db_admin
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
@require_db_admin
def delete_task_node(wt_id, task_template_id):
    user_id = get_jwt_identity()
    with get_session() as s:
        user, team, err = _get_user_and_team(s, user_id)
        if err: return err
        wt = _assert_template_belongs_to_team(s, wt_id, team.team_id)
        if not wt:
            return jsonify({"message":"Template not found"}), 404

        ids = s.execute(
            select(WorkflowTemplateDefinition.definition_id).where(
                WorkflowTemplateDefinition.workflow_template_id == wt_id,
                WorkflowTemplateDefinition.task_template_id == task_template_id
            )
        ).scalars().all()
        if not ids:
            return jsonify({"message":"nothing to delete"}), 404

        s.query(WorkflowTemplateDefinition)\
         .filter(
             WorkflowTemplateDefinition.workflow_template_id == wt_id,
             WorkflowTemplateDefinition.task_template_id == task_template_id
         ).delete()
        return jsonify({"message":"deleted", "count": len(ids)}), 200
