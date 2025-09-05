# backend/models.py
from app import db  # app.py에서 만든 db 객체를 가져옵니다.
from datetime import datetime

# 다대다 관계를 위한 연결 테이블들
# 이제 Base를 상속받지 않고, db.Table을 사용하여 간단히 정의합니다.
user_team_mappings = db.Table('user_team_mappings',
    db.Column('user_id', db.Integer, db.ForeignKey('users.user_id', ondelete="CASCADE"), primary_key=True),
    db.Column('team_id', db.Integer, db.ForeignKey('teams.team_id', ondelete="CASCADE"), primary_key=True)
)

user_responsibilities = db.Table('user_responsibilities',
    db.Column('user_id', db.Integer, db.ForeignKey('users.user_id', ondelete="CASCADE"), primary_key=True),
    db.Column('responsibility_id', db.Integer, db.ForeignKey('responsibilities.responsibility_id', ondelete="CASCADE"), primary_key=True)
)

task_assignments = db.Table('task_assignments',
    db.Column('task_id', db.Integer, db.ForeignKey('tasks.task_id', ondelete="CASCADE"), primary_key=True),
    db.Column('assigned_user_id', db.Integer, db.ForeignKey('users.user_id', ondelete="CASCADE"), primary_key=True)
)

# 이제 모든 모델 클래스는 DeclarativeBase 대신 `db.Model`을 상속받습니다.
# Mapped, mapped_column 대신 db.Mapped, db.mapped_column을 사용합니다.

class Team(db.Model):
    __tablename__ = "teams"
    team_id: db.Mapped[int] = db.mapped_column(db.Integer, primary_key=True)
    team_name: db.Mapped[str] = db.mapped_column(db.String, nullable=False, unique=True) # unique=True로 변경 권장

    responsibilities: db.Mapped[list["Responsibility"]] = db.relationship(back_populates="team", cascade="all, delete-orphan")
    workflows: db.Mapped[list["Workflow"]] = db.relationship(back_populates="assigned_team")

class Responsibility(db.Model):
    __tablename__ = "responsibilities"
    responsibility_id: db.Mapped[int] = db.mapped_column(db.Integer, primary_key=True)
    responsibility_name: db.Mapped[str] = db.mapped_column(db.String, nullable=False)
    team_id: db.Mapped[int] = db.mapped_column(db.ForeignKey("teams.team_id", ondelete="CASCADE"), nullable=False)
    __table_args__ = (db.UniqueConstraint("responsibility_name", "team_id", name="uq_resp_name_team"),)

    team: db.Mapped["Team"] = db.relationship(back_populates="responsibilities")
    required_by_task_templates: db.Mapped[list["TaskTemplate"]] = db.relationship(back_populates="required_responsibility")

class User(db.Model):
    __tablename__ = "users"
    user_id: db.Mapped[int] = db.mapped_column(db.Integer, primary_key=True)
    user_name: db.Mapped[str] = db.mapped_column(db.String, nullable=False)
    email: db.Mapped[str] = db.mapped_column(db.String, nullable=False, unique=True)
    hashed_password: db.Mapped[str] = db.mapped_column(db.String, nullable=False)
    position: db.Mapped[str] = db.mapped_column(db.String, nullable=False)
    created_at: db.Mapped[datetime] = db.mapped_column(db.TIMESTAMP, nullable=False, server_default=db.func.now())

    teams: db.Mapped[list["Team"]] = db.relationship(secondary=user_team_mappings, backref='users')
    responsibilities: db.Mapped[list["Responsibility"]] = db.relationship(secondary=user_responsibilities, backref='users')
    assigned_tasks: db.Mapped[list["Task"]] = db.relationship(secondary=task_assignments, backref='assigned_users')

class TaskTemplate(db.Model):
    __tablename__ = "task_templates"
    task_template_id: db.Mapped[int] = db.mapped_column(db.Integer, primary_key=True)
    template_name: db.Mapped[str] = db.mapped_column(db.String, nullable=False)
    task_type: db.Mapped[str] = db.mapped_column(db.String, nullable=False)
    category: db.Mapped[str | None] = db.mapped_column(db.String)
    description: db.Mapped[str | None] = db.mapped_column(db.Text)
    required_responsibility_id: db.Mapped[int | None] = db.mapped_column(db.ForeignKey("responsibilities.responsibility_id"))

    required_responsibility: db.Mapped["Responsibility" | None] = db.relationship(back_populates="required_by_task_templates")
    tasks: db.Mapped[list["Task"]] = db.relationship(back_populates="task_template")

# ... (WorkflowTemplate, WorkflowTemplateDefinition, Workflow, Task, TaskDependency 등 나머지 모델도 동일한 방식으로 변환) ...
# 여기서는 생략했지만, 실제로는 모든 모델을 이 파일로 옮겨야 합니다.
