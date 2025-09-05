import sqlite3
import os
from werkzeug.security import generate_password_hash


DB_FILE = "db.sqlite3"

def seed_initial_data(cursor):
    """
    테이블에 기본 샘플 데이터를 삽입합니다.
    """
    print("\n초기 데이터 삽입을 시작합니다...")

    try:
        # 1. 팀 생성 (Responsibility보다 먼저 생성해야 함)
        print("[1] teams 삽입 시도...")
        teams = [
            (1, '품질관리팀'), (2, '업무팀'), (3, '생산 1팀'), 
            (4, '생산 2팀'), (5, '환경공무팀')
        ]
        cursor.executemany("INSERT INTO teams (team_id, team_name) VALUES (?, ?)", teams)
        print(" -> teams 완료")

        # 2. 품질관리팀(team_id=1)의 역할(responsibility) 생성
        print("[2] 품질관리팀 responsibilities 삽입 시도...")
        qc_responsibilities = [
            ('분석실 관리', 1), ('수출 제품 품질 관리', 1), ('1팀 용기면 품질 관리', 1),
            ('1팀 봉지면 품질 관리', 1), ('클레임 관리', 1), ('2팀 봉지면 품질 관리', 1),
            ('2팀 스낵 품질 관리', 1), ('공장 기획', 1), ('원자재 검수', 1),
            ('부자재 검수', 1), ('대관 업무', 1), ('HACCP 담당', 1),
            ('ISO 14001 담당', 1), ('ISO 45001 담당', 1), ('ISO 9001 담당', 1),
            ('FSSC 22000 담당', 1)
        ]
        cursor.executemany(
            "INSERT INTO responsibilities (responsibility_name, team_id) VALUES (?, ?)", 
            qc_responsibilities
        )
        print(" -> 품질관리팀 responsibilities 완료")

        # 3. 각 팀별로 'DT_Expert' 역할 추가
        print("[3] 각 팀별 DT_Expert 역할 삽입 시도...")
        for team_id, team_name in teams:
            cursor.execute(
                "INSERT INTO responsibilities (responsibility_name, team_id) VALUES (?, ?)",
                ('DT_Expert', team_id)
            )
        print(" -> DT_Expert 역할 완료")

        # 4. 사용자 생성
        print("[4] users 삽입 시도...")
        plain_password_1 = "123123"
        hashed_password_1 = generate_password_hash(plain_password_1)

        cursor.execute(
            "INSERT INTO users (user_id, user_name, email, position, hashed_password) VALUES (?, ?, ?, ?, ?)",
            (101, '권형우', '12345@nongshim.com', '주임', hashed_password_1)
        )

        print(" -> users 완료")

        # 5. 사용자를 팀에 매핑
        print("[5] user_team_mappings 삽입 시도...")
        cursor.execute("INSERT INTO user_team_mappings VALUES (101, 1);") # 권형우 -> 품질관리팀
        print(" -> user_team_mappings 완료")

        # 6. 사용자에게 역할 부여 (DB에서 ID를 직접 조회하여 안전하게 부여)
        print("[6] user_responsibilities 삽입 시도...")
        # '분석실 관리'와 '수출 제품 품질 관리' 역할의 ID를 조회 (둘 다 품질관리팀 소속)
        cursor.execute("SELECT responsibility_id FROM responsibilities WHERE responsibility_name = '분석실 관리' AND team_id = 1")
        resp1_id = cursor.fetchone()[0]
        cursor.execute("SELECT responsibility_id FROM responsibilities WHERE responsibility_name = '수출 제품 품질 관리' AND team_id = 1")
        resp2_id = cursor.fetchone()[0]
        
        cursor.execute("INSERT INTO user_responsibilities VALUES (?, ?), (?, ?);", (101, resp1_id, 101, resp2_id))
        print(" -> user_responsibilities 완료")

        # 7. Task 템플릿 생성 (역할 ID를 DB에서 조회하여 사용)
        print("[7] task_templates 삽입 시도...")
        # 'HACCP 담당'과 '분석실 관리' 역할의 ID 조회
        haccp_resp_id = cursor.execute("SELECT responsibility_id FROM responsibilities WHERE responsibility_name = 'HACCP 담당' AND team_id = 1").fetchone()[0]
        quality_resp_id = cursor.execute("SELECT responsibility_id FROM responsibilities WHERE responsibility_name = '분석실 관리' AND team_id = 1").fetchone()[0]
        
        cursor.execute("""
        INSERT INTO task_templates (task_template_id, template_name, task_type, category, description, required_responsibility_id) VALUES
            (101, '원자재 위해요소 기준 추가', 'Info_CRUD', 'HACCP', '원자재 위해요소의 기준을 추가합니다.', ?),
            (102, '원자재 위해요소 분석', 'Analysis', 'HACCP', '원자재 위해요소 기준에 따라 분석을 실시하고 결과를 기록합니다.', ?),
            (201, '제품 자가품질검사', 'Analysis', 'Quality', '완제품의 자가품질 분석을 수행합니다.', ?);
        """, (haccp_resp_id, haccp_resp_id, quality_resp_id))
        print(" -> task_templates 완료")
        
        # 8. Workflow 템플릿 생성
        print("[8] workflow_templates 삽입 시도...")
        cursor.execute(
            "INSERT INTO workflow_templates (workflow_template_id, template_name, description) VALUES (1, '용기면 신제품 생산', '용기면 신제품 출시 준비와 관련된 워크플로우');"
        )
        print(" -> workflow_templates 완료")
        
        # 9. Workflow 템플릿 구조 정의
        print("[9] workflow_template_definitions 삽입 시도...")
        cursor.execute("""
        INSERT INTO workflow_template_definitions (workflow_template_id, task_template_id, depends_on_task_template_id) VALUES
            (1, 101, NULL),
            (1, 102, 101)
        """)
        print(" -> workflow_template_definitions 완료")

        print("✅ 초기 데이터 삽입이 완료되었습니다.")
        return True

    except Exception as e:
        print(f"❌ 데이터 삽입 중 오류 발생!\n -> 마지막 단계 로그 참고\n -> 에러 메시지: {e}")
        return False


if __name__ == '__main__':
    print(f"단독 실행 모드: '{DB_FILE}'에 초기 데이터를 삽입합니다.")
    db_path = os.path.join(os.path.dirname(__file__), DB_FILE)
    if not os.path.exists(db_path):
        print("DB 파일이 없습니다. manage_db.py --create-only를 먼저 실행하세요.")
    else:
        con = sqlite3.connect(db_path)
        cur = con.cursor()
        cur.execute("PRAGMA foreign_keys = ON;")
        if seed_initial_data(cur):
            con.commit()
        con.close()

