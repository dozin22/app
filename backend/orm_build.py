# backend/orm_build.py
# -*- coding: utf-8 -*-
import os
from contextlib import contextmanager
from typing import Optional

from sqlalchemy import (
    create_engine, ForeignKey, UniqueConstraint, JSON,
    String, Integer, Text, TIMESTAMP
)
from sqlalchemy.orm import (
    DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker
)

from config import DB_DIR, DATABASE_URL, DEFAULT_SQLITE

from datetime import datetime

from sqlalchemy.engine import Engine
from sqlalchemy import event, func

# SQLite FK 강제
@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    try:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
    except Exception:
        pass

# ─────────────────────────────────────────────────────────────

engine = create_engine(
    DATABASE_URL,
    echo=False,
    future=True
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

class Base(DeclarativeBase):
    pass

@contextmanager
def get_session():
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

# ─────────────────────────────────────────────────────────────
# 모델 정의 (기존 sqlite 스키마를 SQLAlchemy로 1:1 매핑)
# 참고: teams, responsibilities, users, user_team_mappings, user_responsibilities,
#       task_templates, workflow_templates, workflow_template_definitions,
#       workflows, tasks, task_assignments, task_dependencies
# (원본 스키마는 사용자가 올린 db_schema.py 기준)  # :contentReference[oaicite:0]{index=0}

class Team(Base):
    __tablename__ = "teams"
    team_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    team_name: Mapped[str] = mapped_column(String, nullable=False, unique=False)

    users: Mapped[list["User"]] = relationship(back_populates="team")
    responsibilities: Mapped[list["Responsibility"]] = relationship(
        back_populates="team", cascade="all, delete-orphan"
    )
    workflows: Mapped[list["Workflow"]] = relationship(
        back_populates="assigned_team"
    )

class Responsibility(Base):
    __tablename__ = "responsibilities"
    responsibility_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    responsibility_name: Mapped[str] = mapped_column(String, nullable=False)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.team_id", ondelete="CASCADE"), nullable=False)

    __table_args__ = (
        UniqueConstraint("responsibility_name", "team_id", name="uq_resp_name_team"),
    )

    team: Mapped["Team"] = relationship(back_populates="responsibilities")
    users: Mapped[list["User"]] = relationship(
        back_populates="responsibilities", secondary="user_responsibilities"
    )
    required_by_task_templates: Mapped[list["TaskTemplate"]] = relationship(
        back_populates="required_responsibility"
    )

class User(Base):
    __tablename__ = "users"
    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    position: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP, nullable=False, server_default=func.now()
    )
    team_id: Mapped[Optional[int]] = mapped_column(ForeignKey("teams.team_id"))

    requests: Mapped[list["Request"]] = relationship(
        back_populates="requester", foreign_keys="Request.requester_user_id"
    )

    team: Mapped[Optional["Team"]] = relationship(back_populates="users")
    responsibilities: Mapped[list["Responsibility"]] = relationship(
        back_populates="users", secondary="user_responsibilities"
    )
    assigned_tasks: Mapped[list["Task"]] = relationship(
        back_populates="assigned_users", secondary="task_assignments"
    )

class UserResponsibility(Base):
    __tablename__ = "user_responsibilities"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=True)
    responsibility_id: Mapped[int] = mapped_column(ForeignKey("responsibilities.responsibility_id", ondelete="CASCADE"), primary_key=True)

class TaskTemplate(Base):
    __tablename__ = "task_templates"
    task_template_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    template_name: Mapped[str] = mapped_column(String, nullable=False)
    task_type: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    required_responsibility_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("responsibilities.responsibility_id"), nullable=True
    )

    required_responsibility: Mapped[Optional["Responsibility"]] = relationship(
        back_populates="required_by_task_templates"
    ) # :contentReference[oaicite:1]{source_path="/Users/khw/Desktop/app/backend/orm_build.py" start_line=156 end_line=160}
    workflow_definitions: Mapped[list["WorkflowTemplateDefinition"]] = relationship( # :contentReference[oaicite:1]{source_path="/Users/khw/Desktop/app/backend/orm_build.py" start_line=156 end_line=160}
        back_populates="task_template",
        foreign_keys="WorkflowTemplateDefinition.task_template_id",   # ← 이 줄 추가!
        cascade="all, delete-orphan"
    )
    upstream_defs: Mapped[list["WorkflowTemplateDefinition"]] = relationship(
        foreign_keys="WorkflowTemplateDefinition.depends_on_task_template_id",
        back_populates="depends_on"
    )
    tasks: Mapped[list["Task"]] = relationship(back_populates="task_template")

class RequestTemplate(Base):
    __tablename__ = "request_templates"
    request_template_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    template_name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    workflow_template_id: Mapped[Optional[int]] = mapped_column(ForeignKey("workflow_templates.workflow_template_id"))

    workflow_template: Mapped[Optional["WorkflowTemplate"]] = relationship(back_populates="request_templates")
    requests: Mapped[list["Request"]] = relationship(back_populates="request_template")

class Request(Base):
    __tablename__ = "requests"
    request_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    request_template_id: Mapped[Optional[int]] = mapped_column(ForeignKey("request_templates.request_template_id"))
    workflow_id: Mapped[Optional[int]] = mapped_column(ForeignKey("workflows.workflow_id"))
    requester_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.user_id"))
    status: Mapped[Optional[str]] = mapped_column(String, default="PENDING")
    created_at: Mapped[Optional[str]] = mapped_column(TIMESTAMP, nullable=True)
    completed_at: Mapped[Optional[str]] = mapped_column(TIMESTAMP, nullable=True)
    parameters: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    request_template: Mapped[Optional["RequestTemplate"]] = relationship(back_populates="requests")
    requester: Mapped[Optional["User"]] = relationship(back_populates="requests")
    workflow: Mapped[Optional["Workflow"]] = relationship(back_populates="request", uselist=False)
    

class WorkflowTemplate(Base):
    __tablename__ = "workflow_templates"
    workflow_template_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    template_name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    definitions: Mapped[list["WorkflowTemplateDefinition"]] = relationship(back_populates="workflow_template")
    workflows: Mapped[list["Workflow"]] = relationship(back_populates="workflow_template")
    request_templates: Mapped[list["RequestTemplate"]] = relationship(back_populates="workflow_template")

class WorkflowTemplateDefinition(Base):
    __tablename__ = "workflow_template_definitions"
    definition_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    workflow_template_id: Mapped[int] = mapped_column(ForeignKey("workflow_templates.workflow_template_id"))
    task_template_id: Mapped[int] = mapped_column(ForeignKey("task_templates.task_template_id"))
    depends_on_task_template_id: Mapped[Optional[int]] = mapped_column(ForeignKey("task_templates.task_template_id"))

    workflow_template: Mapped["WorkflowTemplate"] = relationship(back_populates="definitions")
    task_template: Mapped["TaskTemplate"] = relationship(
        back_populates="workflow_definitions",
        foreign_keys="[WorkflowTemplateDefinition.task_template_id]"  # ← 여기도 명시하면 더 안전
    )
    depends_on: Mapped[Optional["TaskTemplate"]] = relationship(
        foreign_keys="[WorkflowTemplateDefinition.depends_on_task_template_id]",
        back_populates="upstream_defs"
    )
class Workflow(Base):
    __tablename__ = "workflows"
    workflow_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    workflow_template_id: Mapped[Optional[int]] = mapped_column(ForeignKey("workflow_templates.workflow_template_id"))
    status: Mapped[Optional[str]] = mapped_column(String, default="PENDING")
    assigned_team_id: Mapped[Optional[int]] = mapped_column(ForeignKey("teams.team_id"))
    created_at: Mapped[Optional[str]] = mapped_column(TIMESTAMP, nullable=True)
    completed_at: Mapped[Optional[str]] = mapped_column(TIMESTAMP, nullable=True)

    workflow_template: Mapped[Optional["WorkflowTemplate"]] = relationship(back_populates="workflows")
    assigned_team: Mapped[Optional["Team"]] = relationship(back_populates="workflows")
    tasks: Mapped[list["Task"]] = relationship(back_populates="workflow")
    request: Mapped[Optional["Request"]] = relationship(back_populates="workflow", uselist=False, cascade="all, delete-orphan")

class Task(Base):
    __tablename__ = "tasks"
    task_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_template_id: Mapped[Optional[int]] = mapped_column(ForeignKey("task_templates.task_template_id"))
    workflow_id: Mapped[Optional[int]] = mapped_column(ForeignKey("workflows.workflow_id"))
    status: Mapped[Optional[str]] = mapped_column(String, default="PENDING")
    created_at: Mapped[Optional[str]] = mapped_column(TIMESTAMP, nullable=True)
    completed_at: Mapped[Optional[str]] = mapped_column(TIMESTAMP, nullable=True)
    input_params: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    output_params: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    task_template: Mapped[Optional["TaskTemplate"]] = relationship(back_populates="tasks")
    workflow: Mapped[Optional["Workflow"]] = relationship(back_populates="tasks")
    assigned_users: Mapped[list["User"]] = relationship(
        back_populates="assigned_tasks", secondary="task_assignments"
    )
    upstream_dependencies: Mapped[list["TaskDependency"]] = relationship(
        foreign_keys="TaskDependency.downstream_task_id", back_populates="downstream_task"
    )
    downstream_dependencies: Mapped[list["TaskDependency"]] = relationship(
        foreign_keys="TaskDependency.upstream_task_id", back_populates="upstream_task"
    )

class TaskAssignment(Base):
    __tablename__ = "task_assignments"
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.task_id", ondelete="CASCADE"), primary_key=True)
    assigned_user_id: Mapped[int] = mapped_column(ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=True)

class TaskDependency(Base):
    __tablename__ = "task_dependencies"
    upstream_task_id: Mapped[int] = mapped_column(ForeignKey("tasks.task_id", ondelete="CASCADE"), primary_key=True)
    downstream_task_id: Mapped[int] = mapped_column(ForeignKey("tasks.task_id", ondelete="CASCADE"), primary_key=True)

    upstream_task: Mapped["Task"] = relationship(foreign_keys=[upstream_task_id], back_populates="downstream_dependencies")
    downstream_task: Mapped["Task"] = relationship(foreign_keys=[downstream_task_id], back_populates="upstream_dependencies")


# ─────────────────────────────────────────────────────────────
def build_schema(reset: bool = False):
    if reset:
        Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Build ORM schema")
    parser.add_argument("--reset", action="store_true", help="Drop all then create all")
    args = parser.parse_args()
    build_schema(reset=args.reset)
    print("✅ ORM schema build completed.")
