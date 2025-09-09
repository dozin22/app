# backend/orm_seed.py
from werkzeug.security import generate_password_hash

from orm_build import (
    get_session, build_schema,
    Team, Responsibility, User, TaskTemplate,
    WorkflowTemplate, WorkflowTemplateDefinition,
)

def upsert_team(session, team_id: int, team_name: str):
    t = session.get(Team, team_id)
    if not t:
        t = Team(team_id=team_id, team_name=team_name)
        session.add(t)
    else:
        t.team_name = team_name
    return t

def upsert_user(session, user_id: int, user_name: str, email: str, position: str, plain_pw: str):
    u = session.get(User, user_id)
    if not u:
        u = User(
            user_id=user_id,
            user_name=user_name,
            email=email,
            position=position,
            hashed_password=generate_password_hash(plain_pw),
        )
        session.add(u)
    else:
        u.user_name = user_name
        u.email = email
        u.position = position
        # 비번은 필요시만 갱신
    return u

def create_responsibility(session, name: str, team_id: int):
    r = session.query(Responsibility).filter_by(responsibility_name=name, team_id=team_id).first()
    if not r:
        r = Responsibility(responsibility_name=name, team_id=team_id)
        session.add(r)
        session.flush()
    return r

def upsert_task_template(session, tid: int, name: str, category: str, desc: str, req_resp_id: int | None):
    tt = session.get(TaskTemplate, tid)
    if not tt:
        tt = TaskTemplate(
            task_template_id=tid,
            template_name=name,
            category=category,
            description=desc,
            required_responsibility_id=req_resp_id
        )
        session.add(tt)
    else:
        tt.template_name = name
        tt.category = category
        tt.description = desc
        tt.required_responsibility_id = req_resp_id
    return tt

def upsert_workflow_template(session, wtid: int, name: str, desc: str):
    wt = session.get(WorkflowTemplate, wtid)
    if not wt:
        wt = WorkflowTemplate(workflow_template_id=wtid, template_name=name, description=desc)
        session.add(wt)
    else:
        wt.template_name = name
        wt.description = desc
    return wt

def add_wt_definition(session, workflow_template_id: int, task_template_id: int, depends_on_task_template_id: int | None):
    session.add(WorkflowTemplateDefinition(
        workflow_template_id=workflow_template_id,
        task_template_id=task_template_id,
        depends_on_task_template_id=depends_on_task_template_id
    ))

def seed():
    # 0) 스키마 없으면 먼저 생성
    build_schema(reset=False)

    with get_session() as s:
        # 1) teams
        team_data = [
            (1, '품질관리팀'), (2, '업무팀'), (3, '생산 1팀'),
            (4, '생산 2팀'), (5, '환경공무팀')
        ]
        teams = {tid: upsert_team(s, tid, name) for tid, name in team_data}
        qc_team = teams[1]

        # 2) 품질관리팀 responsibilities
        qc_respons = [
            '분석실 관리', '수출 제품 품질 관리', '1팀 용기면 품질 관리',
            '1팀 봉지면 품질 관리', '클레임 관리', '2팀 봉지면 품질 관리',
            '2팀 스낵 품질 관리', '공장 기획', '원자재 검수',
            '부자재 검수', '대관 업무', 'HACCP 담당',
            'ISO 14001 담당', 'ISO 45001 담당', 'ISO 9001 담당',
            'FSSC 22000 담당'
        ]
        for name in qc_respons:
            create_responsibility(s, name, team_id=qc_team.team_id)

        # 3) 각 팀별 DT_Expert
        for team_obj in teams.values():
            create_responsibility(s, 'DT_Expert', team_id=team_obj.team_id)

        # 4) users 기본계정 101
        u = upsert_user(
            s, user_id=101, user_name='권형우',
            email='12345@nongshim.com', position='주임',
            plain_pw='123123'
        )

        # 5) 사용자에게 팀과 책임을 관계(relationship)로 직접 할당
        u.team = qc_team

        resp1 = s.query(Responsibility).filter_by(responsibility_name='분석실 관리', team_id=qc_team.team_id).first()
        resp2 = s.query(Responsibility).filter_by(responsibility_name='수출 제품 품질 관리', team_id=qc_team.team_id).first()
        
        # 사용자가 이미 책임을 가지고 있는지 확인 후 추가
        if resp1 and resp1 not in u.responsibilities:
            u.responsibilities.append(resp1)
        if resp2 and resp2 not in u.responsibilities:
            u.responsibilities.append(resp2)

        # 6) TaskTemplate 생성에 필요한 Responsibility 객체 미리 조회
        haccp_resp = s.query(Responsibility).filter_by(responsibility_name='HACCP 담당', team_id=qc_team.team_id).first()
        quality_resp = s.query(Responsibility).filter_by(responsibility_name='분석실 관리', team_id=qc_team.team_id).first()

        # 7) task_templates 생성
        tt1 = upsert_task_template(
            s, 101, '원자재 위해요소 기준 추가', 'HACCP',
            '원자재 위해요소의 기준을 추가합니다.',
            haccp_resp.responsibility_id if haccp_resp else None
        )
        tt2 = upsert_task_template(
            s, 102, '원자재 위해요소 분석', 'HACCP',
            '원자재 위해요소 기준에 따라 분석을 실시하고 결과를 기록합니다.',
            haccp_resp.responsibility_id if haccp_resp else None
        )
        tt3 = upsert_task_template(
            s, 201, '제품 자가품질검사', 'Quality',
            '완제품의 자가품질 분석을 수행합니다.',
            quality_resp.responsibility_id if quality_resp else None
        )

        # 7-1) 생성된 모든 TaskTemplate을 품질관리팀에 할당
        qc_team.task_templates.extend([tt1, tt2, tt3])

        # 8) workflow_templates
        wt = upsert_workflow_template(
            s, 1, '용기면 신제품 생산', '용기면 신제품 출시 준비와 관련된 워크플로우'
        )

        # 9) workflow_template_definitions (1→101 선행, 102는 101 의존)  # :contentReference[oaicite:4]{index=4}
        # 중복 방지를 위해 현재 정의는 싹 지우고 다시 넣어도 됨(필요시)
        s.query(WorkflowTemplateDefinition).filter_by(workflow_template_id=wt.workflow_template_id).delete()
        add_wt_definition(s, workflow_template_id=1, task_template_id=101, depends_on_task_template_id=None)
        add_wt_definition(s, workflow_template_id=1, task_template_id=102, depends_on_task_template_id=101)

        print("✅ 초기 데이터 삽입 완료.")

if __name__ == "__main__":
    seed()