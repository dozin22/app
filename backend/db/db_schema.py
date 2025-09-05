import sqlite3
import os

DB_FILE = "db.sqlite3"

# 모든 CREATE TABLE 구문을 하나의 문자열로 정의
SCHEMA_SQL = """
    -- 팀 정보 (responsibilities 보다 먼저 생성되어야 함)
    CREATE TABLE teams (
        team_id INTEGER PRIMARY KEY,
        team_name TEXT NOT NULL
    );

    -- 역할/책임(Responsibility) 정의 (team_id 추가)
    CREATE TABLE responsibilities (
        responsibility_id INTEGER PRIMARY KEY,
        responsibility_name TEXT NOT NULL,
        team_id INTEGER NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
        UNIQUE(responsibility_name, team_id) -- 팀 내에서 역할 이름은 고유해야 함
    );

    -- 사용자 정보
    CREATE TABLE users (
        user_id INTEGER PRIMARY KEY,
        user_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        hashed_password TEXT NOT NULL,
        position TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    -- 사용자와 팀의 관계
    CREATE TABLE user_team_mappings (
        user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
        team_id INTEGER REFERENCES teams(team_id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, team_id)
    );

    -- 사용자가 가진 역할/책임
    CREATE TABLE user_responsibilities (
        user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
        responsibility_id INTEGER REFERENCES responsibilities(responsibility_id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, responsibility_id)
    );

    -- Task 템플릿
    CREATE TABLE task_templates (
        task_template_id INTEGER PRIMARY KEY,
        template_name TEXT NOT NULL,
        task_type TEXT NOT NULL,
        category TEXT,
        description TEXT,
        required_responsibility_id INTEGER REFERENCES responsibilities(responsibility_id)
    );

    -- Workflow 템플릿
    CREATE TABLE workflow_templates (
        workflow_template_id INTEGER PRIMARY KEY,
        template_name TEXT UNIQUE NOT NULL,
        description TEXT
    );

    -- Workflow 템플릿의 구조
    CREATE TABLE workflow_template_definitions (
        definition_id INTEGER PRIMARY KEY,
        workflow_template_id INTEGER REFERENCES workflow_templates(workflow_template_id),
        task_template_id INTEGER REFERENCES task_templates(task_template_id),
        depends_on_task_template_id INTEGER REFERENCES task_templates(task_template_id)
    );

    -- 실제 발생한 Workflow
    CREATE TABLE workflows (
        workflow_id INTEGER PRIMARY KEY,
        workflow_template_id INTEGER REFERENCES workflow_templates(workflow_template_id),
        status TEXT DEFAULT 'PENDING',
        assigned_team_id INTEGER REFERENCES teams(team_id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
    );

    -- Workflow에 속한 실제 Task
    CREATE TABLE tasks (
        task_id INTEGER PRIMARY KEY,
        task_template_id INTEGER REFERENCES task_templates(task_template_id),
        workflow_id INTEGER REFERENCES workflows(workflow_id),
        status TEXT DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
    );

    -- 실제 Task와 담당자 할당 정보
    CREATE TABLE task_assignments (
        task_id INTEGER REFERENCES tasks(task_id) ON DELETE CASCADE,
        assigned_user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
        PRIMARY KEY (task_id, assigned_user_id)
    );

    -- 실제 Task 인스턴스 간의 의존 관계
    CREATE TABLE task_dependencies (
        upstream_task_id INTEGER REFERENCES tasks(task_id) ON DELETE CASCADE,
        downstream_task_id INTEGER REFERENCES tasks(task_id) ON DELETE CASCADE,
        PRIMARY KEY (upstream_task_id, downstream_task_id)
    );
"""

def create_schema(cursor):
    """
    제공된 SQL 스크립트를 실행하여 데이터베이스 스키마를 생성합니다.
    """
    print("스키마 생성을 시작합니다...")
    cursor.executescript(SCHEMA_SQL)
    print("✅ 스키마 생성이 완료되었습니다.")

if __name__ == '__main__':
    print("단독 실행 모드: 비어있는 데이터베이스를 생성합니다.")
    db_path = os.path.join(os.path.dirname(__file__), DB_FILE)
    if os.path.exists(db_path):
        os.remove(db_path)
    
    con = sqlite3.connect(db_path)
    cur = con.cursor()
    cur.execute("PRAGMA foreign_keys = ON;")
    create_schema(cur)
    con.commit()
    con.close()
    print(f"'{db_path}' 파일이 성공적으로 생성되었습니다.")

