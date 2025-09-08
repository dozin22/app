// /frontend/js/db_management.js

// 공용 모듈과 각 패널의 초기화 함수를 가져옵니다.
import {
    State, authFetch, EP_ME, toast, setText, 
    getLocalFromEmail, setKvEmailView, NAME_KEY, EMAIL_KEY, POS_KEY, TEAM_KEY
} from './db_shared.js';
import { initUserPanel, loadTeamMembers } from './user_panel.js';
import { initWorkflowPanel, loadTaskTemplates } from './workflow_panel.js';

// ===== 어플리케이션 부팅 =====
window.addEventListener("DOMContentLoaded", async () => {
  guardAuth();
  await hydrateMeFromServer();
  paintUserTop();
  applyRoleBasedUI();
  bindTabs();
  showPanel("user");

  // 각 패널의 이벤트 리스너를 초기화합니다.
  initUserPanel();
  initWorkflowPanel();
});

// ===== 초기화 함수들 =====

function guardAuth(){
  const token = localStorage.getItem("token");
  if(!token){
    alert("로그인이 필요합니다!");
    window.location.replace("login.html");
  }
}

async function hydrateMeFromServer(){
  try{
    const res = await authFetch(EP_ME);
    const data = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(data?.message || "내 정보 조회 실패");

    State.me = {
      name: data.name ?? "—",
      email: data.email ?? "—",
      position: data.position ?? "—",
      team: data.team ?? "—",
      team_id: data.team_id ?? null,
    };

    localStorage.setItem(NAME_KEY,  State.me.name || "");
    localStorage.setItem(EMAIL_KEY, State.me.email || "");
    localStorage.setItem(POS_KEY,   State.me.position || "");
    localStorage.setItem(TEAM_KEY,  State.me.team || "");
  }catch(e){
    console.error("[hydrateMeFromServer]", e);
    toast(e.message || "내 정보 조회 실패");
  }
}

function paintUserTop(){
  const { name, position, team, email } = State.me;
  setText("userName", name);
  setText("userSub", team || "—");
  setText("kvName", name);
  setText("kvTeam", team || "—");
  setKvEmailView(getLocalFromEmail(email));
  setText("kvPosition", position);

  State.isLead = (String(position || "").trim() === "팀장");
}

function applyRoleBasedUI() {
  const dtTab = document.getElementById('tabDT');
  if (dtTab && !State.isLead) {
    dtTab.style.display = 'none';
  }

  let visibleTabIndex = 1;
  document.querySelectorAll('.v-tabs .v-tab').forEach(tab => {
    if (tab && tab.style.display !== 'none') {
      const span = tab.querySelector('span');
      if (span) span.textContent = visibleTabIndex++;
    }
  });
}

function bindTabs(){
  document.querySelectorAll(".v-tab").forEach(btn => {
    btn.addEventListener("click", async () => {
      const tab = btn.getAttribute("data-tab");
      showPanel(tab); 
      markActive(btn);

      if(tab === "dt" && State.isLead && State.teamMembers.length === 0){
        await loadTeamMembers();
      }

      if(tab === "work" && State.taskTemplates.length === 0) {
        await loadTaskTemplates();
      }
    });
  });

  document.getElementById("btnLogout")?.addEventListener("click", () => {
    localStorage.clear();
    alert("로그아웃 되었습니다.");
    window.location.replace("login.html");
  });
}

function markActive(activeBtn){
  document.querySelectorAll(".v-tab").forEach(b => b.classList.remove("active"));
  activeBtn.classList.add("active");
}

function showPanel(key){
  const ids = { user:"panel-user", dt:"panel-dt", work:"panel-work", tree:"panel-tree" };
  Object.values(ids).forEach(id => document.getElementById(id)?.classList.add("hidden"));
  document.getElementById(ids[key])?.classList.remove("hidden");
}