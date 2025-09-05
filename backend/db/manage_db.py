import os
import sqlite3
import argparse
from db_schema import create_schema, DB_FILE
from db_seeder import seed_initial_data


# DB_FILE 경로를 스크립트 위치 기준으로 설정
DB_PATH = os.path.join(os.path.dirname(__file__), DB_FILE)

def main():
    parser = argparse.ArgumentParser(description="db 데이터베이스 관리 스크립트")
    parser.add_argument(
        '--reset',
        action='store_true',
        help='DB 파일을 삭제하고, 스키마를 새로 생성한 뒤 초기 데이터를 삽입합니다.'
    )
    parser.add_argument(
        '--create-only',
        action='store_true',
        help='DB 파일을 삭제하고, 비어있는 스키마만 새로 생성합니다.'
    )
    parser.add_argument(
        '--seed-only',
        action='store_true',
        help='기존 DB에 초기 데이터를 삽입합니다. (테이블이 이미 존재해야 함)'
    )

    args = parser.parse_args()

    if args.reset:
        print("--- 데이터베이스 전체 초기화를 시작합니다 ---")
        if os.path.exists(DB_PATH):
            os.remove(DB_PATH)
            print(f"기존 DB 파일 '{DB_PATH}'을(를) 삭제했습니다.")
        
        con = sqlite3.connect(DB_PATH)
        cur = con.cursor()
        cur.execute("PRAGMA foreign_keys = ON;")
        
        create_schema(cur)
        seed_initial_data(cur)

        con.commit()
        con.close()
        print("\n--- 데이터베이스 전체 초기화가 완료되었습니다 ---")

    elif args.create_only:
        print("--- 비어있는 데이터베이스 생성을 시작합니다 ---")
        if os.path.exists(DB_PATH):
            os.remove(DB_PATH)
            print(f"기존 DB 파일 '{DB_PATH}'을(를) 삭제했습니다.")

        con = sqlite3.connect(DB_PATH)
        cur = con.cursor()
        cur.execute("PRAGMA foreign_keys = ON;")
        
        create_schema(cur)

        con.commit()
        con.close()
        print("\n--- 비어있는 데이터베이스 생성이 완료되었습니다 ---")

    elif args.seed_only:
        print("--- 기존 데이터베이스에 데이터 삽입을 시작합니다 ---")
        if not os.path.exists(DB_PATH):
            print(f"오류: '{DB_PATH}' 파일이 존재하지 않습니다. 먼저 DB를 생성하세요.")
            return

        con = sqlite3.connect(DB_PATH)
        cur = con.cursor()
        cur.execute("PRAGMA foreign_keys = ON;")

        seed_initial_data(cur)
        
        con.commit()
        con.close()
        print("\n--- 데이터 삽입이 완료되었습니다 ---")
    
    else:
        print("실행할 작업을 선택해주세요. (예: --reset, --create-only, --seed-only)")
        parser.print_help()


if __name__ == "__main__":
    main()


"""cd backend/db
python manage_db.py --reset"""