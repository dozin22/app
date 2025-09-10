const API_URL = "http://localhost:5000/api/auth";

// ───────────────────────────────────────────────
// 공통 fetch 요청 헬퍼
async function request(path, options = {}) {
    const res  = await fetch(API_URL + path, {
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        },
        ...options
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "오류 발생");
    return data;
}

// ───────────────────────────────────────────────
// 회원가입 (SIGN-UP)
async function signup(event) {
    event?.preventDefault();

    const name     = document.getElementById("name").value.trim();
    const email    = document.getElementById("email_local").value.trim() + "@nongshim.com";
    const password = document.getElementById("password").value.trim();
    const team_id  = Number(document.getElementById("team").value);
    const position = document.getElementById("position").value.trim();

    try {
        const data = await request("/signup", {
            method: "POST",
            body: JSON.stringify({ name, email, password, team_id, position })
        });

        // 저장
        localStorage.setItem("token", data.token);
        localStorage.setItem("name", data.name);
        localStorage.setItem("position", data.position);
        localStorage.setItem("team", data.team);
        localStorage.setItem("email", data.email);

        alert("회원가입 성공 🎉");
        setTimeout(() => {
            window.location.href = "index.html";
        }, 0); 
    } catch (err) {
        alert(err.message);
    }
}

// ───────────────────────────────────────────────
// 로그인 (LOG-IN)
async function login(event) {
    event?.preventDefault();

    const email    = document.getElementById("email_local").value.trim() + "@nongshim.com";
    const password = document.getElementById("password").value.trim();

    try {
        const data = await request("/login", {
            method: "POST",
            body: JSON.stringify({ email, password })
        });

        // 저장
        localStorage.setItem("token", data.token);
        localStorage.setItem("name", data.name);
        localStorage.setItem("email", data.email);
        localStorage.setItem("position", data.position);
        localStorage.setItem("team", data.team);

        alert("로그인 성공 🎉");
        window.location.replace("index.html");
    } catch (err) {
        alert(err.message);
    }
}

// ───────────────────────────────────────────────
// 로그인된 유저만 접근 가능하도록 제한
function requireAuth() {
    const token = localStorage.getItem("token");
    if (!token) {
        alert("로그인이 필요합니다!");
        window.location.replace("login.html");
    }
}
window.addEventListener('DOMContentLoaded', () => {
    // 회원가입 페이지에만 signup-btn이 있으므로, 해당 버튼이 존재할 때만 이벤트를 연결합니다.
    const signupButton = document.getElementById('signup-btn');
    if (signupButton) {
        signupButton.addEventListener('click', signup);
        populateTeamsDropdown(); // 팀 목록 채우기 함수 호출
    }

});

// 팀 목록을 동적으로 채우는 함수
async function populateTeamsDropdown() {
    const teamSelect = document.getElementById('team');
    if (!teamSelect) return;

    try {
        const teams = await request("/teams"); // GET 요청
        teamSelect.innerHTML = '<option value="">팀을 선택하세요...</option>'; // 기본 옵션
        teams.forEach(team => {
            const option = document.createElement('option');
            option.value = team.id;
            option.textContent = team.name;
            teamSelect.appendChild(option);
        });
    } catch (err) {
        console.error("팀 목록을 불러오는 데 실패했습니다:", err);
        teamSelect.innerHTML = '<option value="">팀 목록을 불러올 수 없습니다.</option>';
    }
}


// ───────────────────────────────────────────────