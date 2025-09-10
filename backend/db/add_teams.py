#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sqlite3
from pathlib import Path

DB_PATH = Path("db.sqlite3")   # 상대경로 (같은 폴더에 db.sqlite3 있다고 가정)

# 추가할 팀 목록
new_teams = [
    "글로벌SCM팀",
    "면개발팀",
    "스낵개발팀",
    "포장개발팀",
    "생산기획팀",
]

def main():
    if not DB_PATH.exists():
        raise FileNotFoundError(f"DB 파일이 없습니다: {DB_PATH}")

    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor()
        for team in new_teams:
            try:
                cur.execute("INSERT INTO teams (team_name) VALUES (?)", (team,))
                print(f"[OK] 추가됨: {team}")
            except sqlite3.IntegrityError as e:
                print(f"[SKIP] {team} (이미 존재하거나 제약 조건 충돌) -> {e}")
        conn.commit()

if __name__ == "__main__":
    main()
