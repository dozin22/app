import { API_URL } from './config.js'; // 이 줄을 추가하세요.

const calendarAPI = `${API_URL}/calendar/status`; // API_URL_LIST -> API_URL 로 변경

let currentDate = new Date();


// 현재 날짜 상태 외부에서도 쓸 수 있게 export
export function initCalendar(token) {
    renderCalendar(token);

    document.getElementById('prev-month').addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar(token);
    });

    document.getElementById('next-month').addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar(token);
    });
}

export async function renderCalendar(token) {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;

    document.getElementById('calendar-title').innerText = `${year}년 ${month}월`;

    const res = await fetch(`${calendarAPI}?year=${year}&month=${month}`, {
        headers: { 'Authorization': 'Bearer ' + token }
    });
    const tasks = await res.json();

    const grid = document.querySelector('.calendar-grid');
    const today = new Date();

    while (grid.children.length > 7) {
        grid.removeChild(grid.lastChild);
    }

    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'calendar-cell empty';
        grid.appendChild(empty);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-cell';

        const dateLabel = document.createElement('div');
        dateLabel.className = 'date-number';
        dateLabel.innerText = day;
        cell.appendChild(dateLabel);

        const thisDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        const overdue = tasks.filter(t => new Date(t.due_date) < today && t.due_date === thisDateStr);
        const upcoming = tasks.filter(t => {
            const diff = (new Date(t.due_date) - today) / (1000 * 60 * 60 * 24);
            return diff >= 0 && diff <= 3 && t.due_date === thisDateStr;
        });

        const dotBox = document.createElement('div');
        dotBox.className = 'dot-box';

        if (overdue.length > 0) {
            const redDot = document.createElement('div');
            redDot.className = 'dot red';
            dotBox.appendChild(redDot);
        }
        if (upcoming.length > 0) {
            const yellowDot = document.createElement('div');
            yellowDot.className = 'dot yellow';
            dotBox.appendChild(yellowDot);
        }

        if (dotBox.children.length > 0) {
            cell.appendChild(dotBox);
        }

        cell.addEventListener('click', () => openCalendarModal(thisDateStr, overdue, upcoming));
        grid.appendChild(cell);
    }
}

// ==============================
// 캘린더 모달
function openCalendarModal(dateStr, overdue, upcoming) {
    const modal = document.getElementById('calendar-modal');
    const modalContent = document.getElementById('calendar-modal-content');

    let html = `<h3>${dateStr} 업무 현황</h3>`;

    if (overdue.length === 0 && upcoming.length === 0) {
        html += `<p>🎉 모든 업무를 완료하였습니다. 축하합니다! 🎉</p>`;
    } else {
        if (overdue.length > 0) {
            html += `<h4>🔴 마감일 지남</h4><ul>`;
            overdue.forEach(t => {
                html += `<li>${t.name} (마감일: ${t.due_date})</li>`;
            });
            html += `</ul>`;
        }
        if (upcoming.length > 0) {
            html += `<h4>🟡 마감 3일 이내</h4><ul>`;
            upcoming.forEach(t => {
                html += `<li>${t.name} (마감일: ${t.due_date})</li>`;
            });
            html += `</ul>`;
        }
    }

    modalContent.innerHTML = html;
    modal.style.display = 'block';

    window.onclick = function(event) {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    };
}
