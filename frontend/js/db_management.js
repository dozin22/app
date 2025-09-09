// /frontend/js/db_management.js

// 각 패널의 초기화 함수를 가져옵니다.
import { initUserPanel, loadTeamMembers } from './user_panel.js';
import { initTaskTemplatePanel, loadTaskTemplates } from './task_template_panel.js';


// API 엔드포인트와 공용 상수를 정의하고 내보냅니다.
import { API_URL } from './config.js';

export const TOKEN_KEY = "token";
export const NAME_KEY  = "name";
export const POS_KEY   = "position";
export const TEAM_KEY  = "team";
export const EMAIL_KEY = "email";

export const EP_TEAM_MEMBERS   = `${API_URL}/user-management/team-members`;
export const EP_TASK_TEMPLATES = `${API_URL}/task-management/task-templates`;
export const EP_WORKFLOW_TEMPLATES = `${API_URL}/workflow-management/workflow-templates`;
export const EP_TEAMS          = `${API_URL}/db-management/teams`;
export const EP_ME             = `${API_URL}/user-management/me`;

export const FIXED_DOMAIN = '@nongshim.com';

// 어플리케이션의 전역 상태를 관리하는 객체입니다.
export const State = {
  me: {
    name: localStorage.getItem(NAME_KEY)  || "—",
    position: localStorage.getItem(POS_KEY) || "—",
    team: localStorage.getItem(TEAM_KEY) || "—",
    email: localStorage.getItem(EMAIL_KEY) || "—",
    team_id: null,
  },
  isLead: false,
  teamMembers: [],
  taskTemplates: [],
  teamResponsibilities: [],
  teams: [],
  editing: false,
  editBackup: null,
  activeTab: 'user', // ✅ 현재 활성 탭을 기억할 변수 추가
};

// 공용 유틸리티 함수들입니다.
export function getToken(){ return localStorage.getItem(TOKEN_KEY); }

export function esc(v){
  const map = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    '/': '&#x2F;', '`': '&#x60;', '=': '&#x3D;',
  };
  return String(v ?? "").replace(/[&<>"'`=\/]/g, s => map[s]);
}

export function setText(id, text){
  const el = document.getElementById(id);
  if(el) el.textContent = (text ?? "—");
}

export function toast(msg){
  console.log("[알림]", msg);
  alert(msg);
}

export function authFetch(url, opt = {}){
  const token = getToken();
  const headers = {
    "Content-Type":"application/json",
    ...(opt.headers || {}),
    ...(token ? { "Authorization": `Bearer ${token}` } : {})
  };
  return fetch(url, { ...opt, headers }).then(res => {
    if (res.status === 401) {
      localStorage.clear();
      alert("세션이 만료되었거나 유효하지 않습니다. 다시 로그인해주세요.");
      window.location.replace("login.html");
    }
    return res;
  });
}

export function getLocalFromEmail(email){
  const v = (email || "").trim();
  if (!v) return '';
  if (v.toLowerCase().endsWith(FIXED_DOMAIN.toLowerCase())) {
    return v.slice(0, -FIXED_DOMAIN.length).replace(/@$/, '');
  }
  return v.includes('@') ? v.split('@')[0] : v;
}

export function buildEmail(local){
  const lp = String(local || "").replace(/\s+/g, '').replace(/@.*/g, '');
  return lp ? `${lp}${FIXED_DOMAIN}` : '';
}

export function setKvEmailView(local){
  const cell = document.getElementById('kvEmail');
  if (!cell) return;
  cell.innerHTML = `<span id="kvEmailLocal">${esc(local || '')}</span><span class="email-domain">${FIXED_DOMAIN}</span>`;
}

export function setKvEmailEdit(local){
  const cell = document.getElementById('kvEmail');
  if (!cell) return;
  cell.innerHTML = `
    <input id="inpEmailLocal" type="text" value="${esc(local || '')}" placeholder="아이디" style="width:100%;max-width:220px;">
    <span class="email-domain">${FIXED_DOMAIN}</span>
  `;
  const input = document.getElementById('inpEmailLocal');
  if (!input) return;
  input.addEventListener('input', () => {
    input.value = (input.value || "").replace(/\s+/g, '').replace(/@.*/g, '');
  });
  input.addEventListener('keydown', (e) => { if (e.key === '@') e.preventDefault(); });
}

// ===== 어플리케이션 부팅 =====
window.addEventListener("DOMContentLoaded", async () => {
  guardAuth();
  await hydrateMeFromServer();
  paintUserTop();
  applyRoleBasedUI();
  bindTabs();
  showPanel(State.activeTab); // ✅ State에 저장된 탭으로 시작
  markActiveByTabKey(State.activeTab); // ✅ State에 저장된 탭으로 마킹

  initUserPanel();
  initTaskTemplatePanel();
  // 워크플로우 템플릿 패널은 import 시 이벤트 구독 + 탭 진입 시 자동 초기화
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
    State.me = { ...State.me, ...data };
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
      const tabKey = btn.getAttribute("data-tab");
      State.activeTab = tabKey; // ✅ 클릭 시 State 업데이트
      showPanel(tabKey);
      markActive(btn);

      if(tabKey === "dt" && State.isLead && State.teamMembers.length === 0){
        await loadTeamMembers();
      }
      if(tabKey === "work" && State.taskTemplates.length === 0) {
        await loadTaskTemplates();
      }
      // 🔹 flow 탭은 workflow_template_panel.js가 탭 노출 시 자체 로딩함
      //    별도 호출 필요 없음. 필요 시 여기서 커스텀 이벤트를 쏴도 됨.
      // document.dispatchEvent(new CustomEvent('panel:activated', { detail: { targetId: '#panel-flow' }}));
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

// ✅ '키'를 기반으로 탭을 활성화하는 함수
export function markActiveByTabKey(key) {
  const selector = `.v-tab[data-tab="${key}"]`;
  const activeBtn = document.querySelector(selector);
  if (activeBtn) {
    markActive(activeBtn);
  }
}

// 🔹 flow 패널을 매핑에 포함
function showPanel(key){
  const ids = {
    user: "panel-user",
    dt:   "panel-dt",
    work: "panel-work",
    flow: "panel-flow", // ★ 추가
    tree: "panel-tree"
  };
  Object.values(ids).forEach(id => document.getElementById(id)?.classList.add("hidden"));
  document.getElementById(ids[key])?.classList.remove("hidden");

  // 필요 시 패널 활성화 이벤트 발행 (다른 모듈과 호환)
  document.dispatchEvent(new CustomEvent('panel:activated', { detail: { targetId: `#${ids[key]}` } }));
}
