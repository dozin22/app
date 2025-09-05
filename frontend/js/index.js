import { API_URL } from './config.js'; // 이 줄을 추가하세요.
import { initCalendar } from './calendar.js'; // calendar.js를 사용하기 위해 import

let currentDate = new Date();

// ==============================
// DOM이 로드되면 바로 실행 (window.onload 대신 사용)
document.addEventListener('DOMContentLoaded', () => {
  // 1. 가장 먼저 인증 상태부터 확인
  const token = localStorage.getItem('token');
  const name = localStorage.getItem('name');
  const position = localStorage.getItem('position');
  const team = localStorage.getItem('team');
  const email = localStorage.getItem('email');

  // 토큰이 없거나 유효하지 않으면 즉시 로그인 페이지로 이동
  if (!token || token === "undefined") {
    alert("로그인이 필요합니다.");
    window.location.href = "login.html";
    return; // 인증 실패 시, 아래 코드를 더 이상 실행하지 않음
  }

  // 2. 인증 성공 시, 페이지의 나머지 부분을 초기화
  initializePage({ name, position, team, email });
});

/**
 * 인증 성공 후 페이지의 모든 기능을 초기화하는 함수
 * @param {object} userInfo - { name, position, team }
 */
function initializePage(userInfo) {

  // 달력 렌더링
  renderCalendar();

  // 이벤트 리스너 연결
  document.getElementById('prev-month').addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
  });

  document.getElementById('next-month').addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
  });

  
}


// ==============================
// 달력 렌더링 (기존 코드와 동일)
async function renderCalendar() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  document.getElementById('calendar-title').innerText = `${year}년 ${month}월`;

  const grid = document.querySelector('.calendar-grid');
  // 기존 날짜 셀들만 제거 (요일 이름은 유지)
  while (grid.children.length > 7) {
    grid.removeChild(grid.lastChild);
  }

  const firstDayOfMonth = new Date(year, month - 1, 1).getDay(); // 해당 월의 첫 날의 요일
  const daysInMonth = new Date(year, month, 0).getDate(); // 해당 월의 총 일수

  // 첫 날 시작 위치를 맞추기 위한 빈 셀 추가
  for (let i = 0; i < firstDayOfMonth; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'calendar-cell empty';
    grid.appendChild(emptyCell);
  }

  // 날짜 셀 추가
  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement('div');
    cell.className = 'calendar-cell';
    cell.innerText = day;
    grid.appendChild(cell);
  }
}

// ==============================
function paintUserTop(){
  const name = localStorage.getItem("name") || "—";
  const team = localStorage.getItem("team") || "—";
  document.getElementById("userName").textContent = name;
  document.getElementById("userSub").textContent = team;
}

document.addEventListener("DOMContentLoaded", () => {
  paintUserTop();
  document.getElementById("btnLogout")?.addEventListener("click", () => {
    localStorage.clear();
    alert("로그아웃 되었습니다.");
    window.location.replace("login.html");
  });
});
