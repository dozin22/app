// ======= 상단 import/API 경로는 기존 그대로 =======
import { API_URL } from './config.js';

const TOKEN_KEY = "token";
const NAME_KEY  = "name";
const POS_KEY   = "position";
const TEAM_KEY  = "team";
const EMAIL_KEY = "email";

const EP_TEAM_MEMBERS = `${API_URL}/db-management/team-members`;
const EP_TASK_TEMPLATES = `${API_URL}/db-management/task-templates`;
const EP_TEAMS        = `${API_URL}/db-management/teams`;
const EP_ME           = `${API_URL}/db-management/me`;

// 🔒 이메일 도메인 고정
const FIXED_DOMAIN = '@nongshim.com';

// ───────────────── 유틸 ─────────────────
function getToken(){ return localStorage.getItem(TOKEN_KEY); }
function esc(v){ return String(v ?? "").replace(/[&<>"'`=\/]/g, s => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;","/":"&#x2F;","`":"&#x60;","=":"&#x3D;"}[s])); }
function setText(id, text){ const el=document.getElementById(id); if(el) el.textContent = text ?? "—"; }
function authFetch(url, opt = {}){
  const token = getToken();
  const headers = {
    "Content-Type":"application/json",
    ...(opt.headers || {}),
    ...(token ? { "Authorization": `Bearer ${token}` } : {})
  };
  return fetch(url, { ...opt, headers });
}
function toast(msg){ console.log("[알림]", msg); alert(msg); }

// 이메일 조작 유틸
function getLocalFromEmail(email){
  const v = (email || '').trim();
  if (!v) return '';
  if (v.toLowerCase().endsWith(FIXED_DOMAIN.toLowerCase())) {
    return v.slice(0, -FIXED_DOMAIN.length).replace(/@$/, '');
  }
  return v.includes('@') ? v.split('@')[0] : v;
}
function buildEmail(local){
  const lp = String(local || '').replace(/\s+/g, '').replace(/@.*/g, '');
  return lp ? `${lp}${FIXED_DOMAIN}` : '';
}
function setKvEmailView(local){
  const cell = document.getElementById('kvEmail');
  if (!cell) return;
  cell.innerHTML = `<span id="kvEmailLocal">${esc(local || '')}</span><span class="email-domain">${FIXED_DOMAIN}</span>`;
}
function setKvEmailEdit(local){
  const cell = document.getElementById('kvEmail');
  if (!cell) return;
  cell.innerHTML = ` 
    <input id="inpEmailLocal" type="text" value="${esc(local || '')}" placeholder="아이디" style="width:100%;max-width:220px;">
    <span class="email-domain">${FIXED_DOMAIN}</span>
  `;
  const input = document.getElementById('inpEmailLocal');
  input.addEventListener('input', () => { input.value = (input.value || '').replace(/\s+/g, '').replace(/@.*/g, ''); });
  input.addEventListener('keydown', (e) => { if (e.key === '@') e.preventDefault(); });
}

// ───────────────── 상태 ─────────────────
const State = {
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
  editBackup: null, // { email, position, team, team_id, htmls:{kvEmail,kvPosition,kvTeam} }
};

// ===== 부팅 =====
window.addEventListener("DOMContentLoaded", async () => {
  guardAuth();
  await hydrateMeFromServer(); // 서버에서 최신 내 정보 가져와 동기화
  paintUserTop();
  bindTabs();
  bindActions();
  applyRoleBasedUI();
  showPanel("user");
});

function guardAuth(){
  const token = getToken();
  if(!token){
    alert("로그인이 필요합니다!");
    window.location.replace("login.html");
  }
}

// 서버에서 내 정보 조회
async function hydrateMeFromServer(){
  try{
    const res = await authFetch(EP_ME);
    const data = await res.json();
    if(!res.ok) throw new Error(data?.message || "내 정보 조회 실패");
    State.me = {
      name: data.name, email: data.email, position: data.position,
      team: data.team, team_id: data.team_id
    };
    localStorage.setItem(NAME_KEY,  data.name || "");
    localStorage.setItem(EMAIL_KEY, data.email || "");
    localStorage.setItem(POS_KEY,   data.position || "");
    localStorage.setItem(TEAM_KEY,  data.team || "");
  }catch(e){ console.error(e); }
}

// 상단 사용자 정보 표시
function paintUserTop(){
  const { name, position, team, email } = State.me;
  setText("userName", name);
  setText("userSub", team || "—");
  setText("kvName", name);           // 이름은 편집 불가
  setText("kvTeam", team || "—");
  // setText("kvEmail", email || "—");  // ← 기존
  setKvEmailView(getLocalFromEmail(email)); // ← 로컬파트 + 고정 도메인
  setText("kvPosition", position);
  State.isLead = (position || "").trim() === "팀장";
}

// ===== UI 제어 및 탭 =====
function applyRoleBasedUI() {
  const dtTab = document.getElementById('tabDT');
  if (dtTab && !State.isLead) {
    dtTab.style.display = 'none'; // 팀장이 아니면 탭 숨김
  }

  // 역할에 따라 UI가 변경된 후, 보이는 탭들의 번호를 다시 매김
  let visibleTabIndex = 1;
  document.querySelectorAll('.v-tabs .v-tab').forEach(tab => {
    if (tab.style.display !== 'none') {
      tab.querySelector('span').textContent = visibleTabIndex++;
    }
  });
}




function bindTabs(){
  document.querySelectorAll(".v-tab").forEach(btn => {
    btn.addEventListener("click", async () => {
      const tab = btn.getAttribute("data-tab");
      showPanel(tab); markActive(btn);
      if(tab === "dt" && State.isLead && State.teamMembers.length === 0){ await loadTeamMembers(); }
      if(tab === "work" && State.isLead && State.taskTemplates.length === 0) {
        await loadTaskTemplates();
      }
    });
  });
}
function markActive(activeBtn){
  document.querySelectorAll(".v-tab").forEach(b => b.classList.remove("active"));
  activeBtn.classList.add("active");
}
function showPanel(key){
  const ids = { user:"panel-user", dt:"panel-dt", work:"panel-work", tree:"panel-tree" };
  Object.values(ids).forEach(id => document.getElementById(id).classList.add("hidden"));
  document.getElementById(ids[key]).classList.remove("hidden");
}

// ===== 버튼 바인딩 =====
function bindActions(){
  document.getElementById("btnLogout")?.addEventListener("click", () => {
    localStorage.clear(); alert("로그아웃 되었습니다."); window.location.replace("login.html");
  });

  document.getElementById("btnEditMe")?.addEventListener("click", onToggleEditMe);
  document.getElementById("btnMeCancel")?.addEventListener("click", onCancelEditMe);

  document.getElementById("btnDTReload")?.addEventListener("click", loadTeamMembers);
  document.getElementById("btnDTSave")?.addEventListener("click", onSaveDTExperts);

  // 업무 정보 패널 버튼
  document.getElementById("btnSaveTaskTemplate")?.addEventListener("click", onSaveTaskTemplate);
}

// ===== 인라인 편집 =====
async function onToggleEditMe(){
  const btn = document.getElementById("btnEditMe");
  const cancelBtn = document.getElementById("btnMeCancel");
  if(!State.editing){
    // --- 편집 모드 진입 ---
    State.editing = true;
    btn.textContent = "저장";
    cancelBtn.classList.remove("hidden");
    document.getElementById('kvEmail').classList.add('editing-mode');

    // 백업
    State.editBackup = {
      email: State.me.email,
      position: State.me.position,
      team: State.me.team,
      team_id: State.me.team_id,
      htmls: {
        kvEmail: document.getElementById("kvEmail").innerHTML,
        kvPosition: document.getElementById("kvPosition").innerHTML,
        kvTeam: document.getElementById("kvTeam").innerHTML,
      }
    };

    // 팀 목록 로드 (권한으로 막혀도 실패 허용 → 읽기전용 표시 유지)
    await loadTeams();

    // 이메일: 로컬파트만 편집
    setKvEmailEdit(getLocalFromEmail(State.me.email));

    // 직책 select
    const positions = ["팀장", "책임", "선임", "주임", "사원"];
    const posCell = document.getElementById("kvPosition");
    posCell.innerHTML = `<select id="inpPosition">${positions.map(p=>(
      `<option value="${esc(p)}"${p===State.me.position?" selected":""}>${esc(p)}</option>`
    )).join("")}</select>`;

    // 팀: 권한에 따라 select 또는 읽기전용
    const teamCell = document.getElementById("kvTeam");
    if (Array.isArray(State.teams) && State.teams.length > 0) {
      const opts = [`<option value="">— (미지정)</option>`].concat(
        State.teams.map(t => `<option value="${t.team_id}"${Number(State.me.team_id)===Number(t.team_id)?" selected":""}>${esc(t.team_name)}</option>`)
      ).join("");
      teamCell.innerHTML = `<select id="inpTeam">${opts}</select>`;
    } else {
      // 팀 목록 접근 불가/없음 → 읽기전용 유지
      teamCell.textContent = State.me.team || "—";
    }

  }else{
    // --- 저장 ---
    const localEl  = document.getElementById("inpEmailLocal");
    const email    = localEl ? buildEmail(localEl.value) : (State.me.email || '').trim();
    const posSel   = document.getElementById("inpPosition");
    const teamSel  = document.getElementById("inpTeam");

    const position = (posSel?.value || "").trim();
    const teamVal  = teamSel ? teamSel.value : ""; // 읽기전용이면 teamSel 없음
    const team_id  = teamVal === "" ? null : Number(teamVal);

    if(!email || !position){
      return alert("이메일/직책은 필수입니다.");
    }
    if (!email.endsWith(FIXED_DOMAIN)) {
      return alert(`이메일은 ${FIXED_DOMAIN} 도메인만 허용됩니다.`);
    }

    try{
      const res = await authFetch(EP_ME, {
        method: "PUT",
        body: JSON.stringify({
          name: State.me.name,   // 이름은 변경하지 않음
          email, position, team_id
        })
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data?.message || "저장 실패");

      // 상태/로컬스토리지 반영
      State.me.email    = data.email;
      State.me.position = data.position;
      State.me.team     = data.team;
      State.me.team_id  = data.team_id;

      localStorage.setItem(EMAIL_KEY, data.email || "");
      localStorage.setItem(POS_KEY,   data.position || "");
      localStorage.setItem(TEAM_KEY,  data.team || "");

      // 다시 텍스트로 표시 (이메일은 로컬+도메인)
      setKvEmailView(getLocalFromEmail(data.email));
      document.getElementById("kvPosition").textContent = data.position || "—";
      document.getElementById("kvTeam").textContent     = data.team || "—";

      toast("저장되었습니다.");
      // 편집 종료
      State.editing = false;
      btn.textContent = "수정";
      cancelBtn.classList.add("hidden");
      document.getElementById('kvEmail')?.classList.remove('editing-mode');
    }catch(e){
      console.error(e);
      alert(e.message);
    }
  }
}

function onCancelEditMe(){
  if(!State.editing) return;
  const btn = document.getElementById("btnEditMe");
  const cancelBtn = document.getElementById("btnMeCancel");

  // 백업해둔 HTML로 원복
  const htmls = State.editBackup?.htmls || {};
  if(htmls.kvEmail   != null) document.getElementById("kvEmail").innerHTML = htmls.kvEmail;
  if(htmls.kvPosition!= null) document.getElementById("kvPosition").innerHTML = htmls.kvPosition;
  if(htmls.kvTeam    != null) document.getElementById("kvTeam").innerHTML = htmls.kvTeam;

  State.editing = false;
  btn.textContent = "수정";
  cancelBtn.classList.add("hidden");
  State.editBackup = null;
  document.getElementById('kvEmail')?.classList.remove('editing-mode');
}

// 팀 목록 (권한 없으면 빈 배열로 두고 읽기전용 처리)
async function loadTeams(){
  try{
    const res = await authFetch(EP_TEAMS);
    const data = await res.json();
    if(!res.ok) throw new Error(data?.message || "팀 목록 로드 실패");
    State.teams = Array.isArray(data) ? data : [];
  }catch(e){
    console.warn("[teams] 로드 실패(권한/네트워크 등):", e?.message || e);
    State.teams = [];
  }
}

// ===== DT 전문가 선임 =====
async function loadTeamMembers(){
  if(!State.isLead) return;
  try{
    const res = await authFetch(EP_TEAM_MEMBERS);
    const data = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(data?.message || "팀원 목록 로드 실패");
    State.teamMembers = Array.isArray(data) ? data : [];
    renderTeamMembers(State.teamMembers);
  }catch(err){
    console.error(err);
    renderTeamMembers([]);
    toast(err.message);
  }
}

function renderTeamMembers(members){
  const tbody = document.querySelector("#tblDTList tbody");
  const title = document.getElementById("dtListTitle");
  if(!tbody) return;

  if (title) {
    title.textContent = `${esc(State.me.team || '팀')} DT 전문가 선임`;
  }

  tbody.innerHTML = "";
  if(!members || members.length === 0){
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 4; td.textContent = "팀원이 없습니다."; td.style.color = "#889";
    tr.appendChild(td); tbody.appendChild(tr); return;
  }
  members.forEach(m => {
    const tr = document.createElement("tr");
    tr.dataset.userId = m.user_id;
    tr.innerHTML = `
      <td>${esc(m.name)}</td>
      <td>${esc(m.position)}</td>
      <td>${esc(m.email)}</td>
      <td>
        <select class="dt-expert-select">
          <option value="false"${!m.is_dt_expert ? ' selected' : ''}>아니오</option>
          <option value="true"${m.is_dt_expert ? ' selected' : ''}>예</option>
        </select>
      </td>`;
    tbody.appendChild(tr);
  });
}

async function onSaveDTExperts() {
  const payload = [];
  document.querySelectorAll('#tblDTList tbody tr').forEach(tr => {
    const userId = tr.dataset.userId;
    const isExpert = tr.querySelector('.dt-expert-select').value === 'true';
    if (userId) {
      payload.push({ user_id: Number(userId), is_dt_expert: isExpert });
    }
  });

  try {
    const res = await authFetch(`${EP_TEAM_MEMBERS}/dt-expert-status`, {
      method: 'PUT',
      body: JSON.stringify({ updates: payload })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || '저장 중 오류 발생');
    toast('DT 전문가 정보가 저장되었습니다.');
    await loadTeamMembers(); // 저장 후 목록 새로고침
  } catch (e) {
    console.error(e);
    toast(e.message);
  }
}

// ===== 업무 정보 관리 =====
async function loadTaskTemplates() {
    if (!State.isLead) return;
    try {
        const res = await authFetch(EP_TASK_TEMPLATES);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "업무 템플릿 로드 실패");
        State.taskTemplates = data.task_templates || [];
        State.teamResponsibilities = data.responsibilities || [];
        renderTaskTemplateList();
        populateResponsibilityDropdown();
    } catch (e) {
        toast(e.message);
        console.error(e);
    }
}

function renderTaskTemplateList() {
    const listEl = document.getElementById("taskList");
    if (!listEl) return;
    listEl.innerHTML = State.taskTemplates.map(t => `
        <div class="task-list-item" data-id="${t.task_template_id}">
            ${esc(t.template_name)}
        </div>
    `).join('');

    listEl.querySelectorAll('.task-list-item').forEach(item => {
        item.addEventListener('click', () => {
            listEl.querySelectorAll('.task-list-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            const templateId = Number(item.dataset.id);
            const template = State.taskTemplates.find(t => t.task_template_id === templateId);
            showTaskTemplateForm(template);
        });
    });
}

function populateResponsibilityDropdown() {
    const selectEl = document.getElementById("selTaskResp");
    if (!selectEl) return;
    selectEl.innerHTML = State.teamResponsibilities.map(r =>
        `<option value="${r.responsibility_id}">${esc(r.responsibility_name)}</option>`
    ).join('');
}

function showTaskTemplateForm(template) {
    document.getElementById("taskForm").classList.remove("hidden");
    document.getElementById("taskFormPlaceholder").classList.add("hidden");

    document.getElementById("inpTaskId").value = template.task_template_id;
    document.getElementById("inpTaskName").value = template.template_name;
    document.getElementById("inpTaskType").value = template.task_type;
    document.getElementById("inpTaskCategory").value = template.category || '';
    document.getElementById("inpTaskDesc").value = template.description || '';
    document.getElementById("selTaskResp").value = template.required_responsibility_id;
}

async function onSaveTaskTemplate() {
    const templateId = document.getElementById("inpTaskId").value;
    if (!templateId) {
        return toast("먼저 템플릿을 선택하세요.");
    }

    const payload = {
        template_name: document.getElementById("inpTaskName").value,
        task_type: document.getElementById("inpTaskType").value,
        category: document.getElementById("inpTaskCategory").value,
        description: document.getElementById("inpTaskDesc").value,
        required_responsibility_id: Number(document.getElementById("selTaskResp").value),
    };

    try {
        const res = await authFetch(`${EP_TASK_TEMPLATES}/${templateId}`, { method: 'PUT', body: JSON.stringify(payload) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "저장 실패");
        toast(data.message);
        await loadTaskTemplates(); // 목록 새로고침
    } catch (e) {
        toast(e.message);
        console.error(e);
    }
}
