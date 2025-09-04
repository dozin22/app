# backend/auth.py
# -*- coding: utf-8 -*-
import sqlite3
from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import (
    create_access_token, jwt_required, get_jwt_identity
)
from datetime import timedelta

from config import DB_FILE, JWT_ACCESS_TOKEN_HOURS

# ────────────────────────────────────────────────────────────────
# DB 연결 헬퍼
def get_db():
    print(f"DB 연결 시도 중 → {DB_FILE}")
    conn = sqlite3.connect(DB_FILE)
    print("✅ DB 연결 성공!")
    conn.row_factory = sqlite3.Row
    return conn


# ────────────────────────────────────────────────────────────────
bp_auth = Blueprint("auth", __name__, url_prefix="/api/auth")

# ── 회원가입 ─────────────────────────────────────────────────────
@bp_auth.route("/signup", methods=["POST"])
def signup():
    data = request.get_json(silent=True) or {}
    # 'position'도 필수 항목에 추가
    required = {"name", "email", "password", "team_id", "position"}
    if not required.issubset(data):
        return jsonify({"message": "필수 항목 누락"}), 400

    conn = get_db()

    # 이메일 중복 확인
    if conn.execute("SELECT 1 FROM users WHERE email = ?", (data["email"],)).fetchone():
        conn.close()
        return jsonify({"message": "이미 가입된 이메일입니다"}), 409

    # 비밀번호 해싱
    hashed_pw = generate_password_hash(data["password"])

    # 사용자 정보 저장
    cur = conn.cursor()
    cur.execute("""
    INSERT INTO users (user_name, email, hashed_password, position)
    VALUES (?, ?, ?, ?)
    """, (data["name"], data["email"], hashed_pw, data["position"]))

    user_id = cur.lastrowid

    # 팀 매핑 저장
    cur.execute("""
        INSERT INTO user_team_mappings (user_id, team_id)
        VALUES (?, ?)
    """, (user_id, data["team_id"]))

    # ✅ 방금 가입한 유저의 팀명을 조회하는 로직 추가
    team_row = conn.execute("""
        SELECT t.team_name
        FROM teams t
        WHERE t.team_id = ?
    """, (data["team_id"],)).fetchone()

    team_name = team_row["team_name"] if team_row else "팀 없음"

    conn.commit()
    conn.close()

    # JWT 발급
    token = create_access_token(
        identity=str(user_id),
        expires_delta=timedelta(hours=JWT_ACCESS_TOKEN_HOURS)
    )

    # ✅ position과 team 정보를 포함하여 반환
    return jsonify({
        "token": token,
        "name": data["name"],
        "position": data["position"],
        "team": team_name
    }), 201

# ── 로그인 ──────────────────────────────────────────────────────
@bp_auth.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    if not {"email", "password"}.issubset(data):
        return jsonify({"message": "이메일/비밀번호 필요"}), 400

    conn = get_db()

    # 이메일로 사용자 조회
    user = conn.execute("SELECT * FROM users WHERE email = ?", (data["email"],)).fetchone()
    if not user or not check_password_hash(user["hashed_password"], data["password"]):
        conn.close()
        return jsonify({"message": "자격 증명이 올바르지 않습니다"}), 401

    # ✅ 사용자 팀명 조회 (JOIN)
    team_row = conn.execute("""
        SELECT t.team_name
        FROM teams t
        JOIN user_team_mappings ut ON t.team_id = ut.team_id
        WHERE ut.user_id = ?
    """, (user["user_id"],)).fetchone()

    conn.close()

    team_name = team_row["team_name"] if team_row else "팀 없음"

    token = create_access_token(
        identity=str(user["user_id"]),
        expires_delta=timedelta(hours=JWT_ACCESS_TOKEN_HOURS)
    )

    return jsonify({
        "token": token,
        "name": user["user_name"],
        "position": user["position"],
        "team": team_name
    }), 200

