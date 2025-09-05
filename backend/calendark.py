from flask import Blueprint, jsonify, request
from datetime import datetime

bp_calendar = Blueprint("calendar", __name__, url_prefix="/api/calendar")

@bp_calendar.route("/", methods=["GET"])
def get_calendar_dates():
    year = request.args.get("year", type=int)
    month = request.args.get("month", type=int)

    if not year or not month:
        return jsonify({"error": "year and month are required"}), 400

    # 현재 월의 일수 계산
    from calendar import monthrange
    days_in_month = monthrange(year, month)[1]

    # YYYY-MM-DD 형식 날짜 리스트 생성
    date_list = [
        f"{year}-{str(month).zfill(2)}-{str(day).zfill(2)}"
        for day in range(1, days_in_month + 1)
    ]

    return jsonify({"dates": date_list})
