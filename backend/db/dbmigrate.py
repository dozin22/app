#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Copy ALL tables from a source SQLite DB into a target SQLite DB.
- Default relative files: ./db copy.sqlite3  ->  ./db.sqlite3
- Creates missing tables in target using source's CREATE SQL.
- Copies rows for every source table; leaves empty tables as-is.
- Aligns columns by intersection; target-only columns are filled with NULL.
- Ignores internal sqlite_* tables.
- Disables foreign keys during copy; restores afterwards.

Usage:
  python sqlite_copy_all_tables.py                 # uses defaults in current directory
  python sqlite_copy_all_tables.py --src "db copy.sqlite3" --dst "db.sqlite3"
  python sqlite_copy_all_tables.py --src ./a.sqlite3 --dst ./b.sqlite3

"""
import argparse
import sqlite3
import shutil
from pathlib import Path
from typing import List

def qident(name: str) -> str:
    """SQLite identifier quoting with double quotes."""
    return '"' + name.replace('"', '""') + '"'

def get_tables(conn: sqlite3.Connection) -> List[str]:
    q = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    return [r[0] for r in conn.execute(q).fetchall()]

def get_create_sql(conn: sqlite3.Connection, table: str) -> str:
    row = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone()
    return row[0] if row and row[0] else None

def get_table_cols(conn: sqlite3.Connection, table: str) -> List[str]:
    rows = conn.execute(f"PRAGMA table_info({qident(table)})").fetchall()
    rows.sort(key=lambda r: r[0])  # cid order
    return [r[1] for r in rows]

def count_rows(conn: sqlite3.Connection, table: str) -> int:
    try:
        return conn.execute(f"SELECT COUNT(*) FROM {qident(table)}").fetchone()[0]
    except Exception:
        return None

def ensure_dir(p: Path):
    p.parent.mkdir(parents=True, exist_ok=True)

def copy_all_tables(src_path: Path, dst_path: Path) -> None:
    if not src_path.exists():
        raise FileNotFoundError(f"Source DB not found: {src_path}")
    if not dst_path.exists():
        raise FileNotFoundError(f"Target DB not found: {dst_path}")

    # Backup target
    backup = dst_path.with_suffix(dst_path.suffix + ".bak")
    shutil.copy2(dst_path, backup)
    print(f"[i] Backup created: {backup}")

    with sqlite3.connect(str(src_path)) as src, sqlite3.connect(str(dst_path)) as dst:
        dst.execute("PRAGMA foreign_keys=OFF")
        try:
            src_tables = get_tables(src)
            print(f"[i] Found {len(src_tables)} source tables.")
            for t in src_tables:
                create_sql = get_create_sql(src, t)
                # Ensure target has table
                tgt_has = dst.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (t,)).fetchone() is not None
                if not tgt_has:
                    if create_sql:
                        dst.execute(create_sql)
                        print(f"[+] Created table in target: {t}")
                    else:
                        print(f"[!] Skip (no CREATE SQL): {t}")
                        continue

                s_cols = get_table_cols(src, t)
                d_cols = get_table_cols(dst, t)
                common = [c for c in s_cols if c in d_cols]
                target_only = [c for c in d_cols if c not in common]

                if not common:
                    print(f"[!] Skip (no common columns): {t}")
                    continue

                # Read rows from source
                sel_sql = f"SELECT {', '.join(qident(c) for c in common)} FROM {qident(t)}"
                rows = src.execute(sel_sql).fetchall()
                if not rows:
                    print(f"[-] Source empty, nothing to copy: {t}")
                    continue

                # Prepare insert into target
                insert_cols = common + target_only
                placeholders = ", ".join(["?"] * len(insert_cols))
                ins_sql = f"INSERT INTO {qident(t)} ({', '.join(qident(c) for c in insert_cols)}) VALUES ({placeholders})"

                to_insert = []
                for r in rows:
                    base = list(r)
                    base.extend([None] * len(target_only))  # NULL for target-only cols (e.g., 'parameter')
                    to_insert.append(tuple(base))

                cur = dst.cursor()
                try:
                    cur.execute("BEGIN")
                    cur.executemany(ins_sql, to_insert)
                    dst.commit()
                    print(f"[OK] {t}: copied {len(to_insert)} rows"
                          + (f" | filled NULL for: {', '.join(target_only)}" if target_only else ""))
                except Exception as e:
                    dst.rollback()
                    print(f"[ERR] {t}: {e}")
                finally:
                    cur.close()
        finally:
            dst.execute("PRAGMA foreign_keys=ON")

def main():
    parser = argparse.ArgumentParser(description="Copy all tables from one SQLite DB into another (relative-path friendly).")
    parser.add_argument("--src", default="db copy.sqlite3", help="Source SQLite file (default: 'db copy.sqlite3')")
    parser.add_argument("--dst", default="db.sqlite3", help="Target SQLite file (default: 'db.sqlite3')")
    args = parser.parse_args()

    src_path = Path(args.src)
    dst_path = Path(args.dst)
    ensure_dir(dst_path)

    copy_all_tables(src_path, dst_path)

if __name__ == "__main__":
    main()
