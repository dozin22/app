// ======= 상단 import/API 경로는 기존 그대로 =======
import { API_URL } from './config.js';

const TOKEN_KEY = "token";
const NAME_KEY  = "name";
const POS_KEY   = "position";
const TEAM_KEY  = "team";
const EMAIL_KEY = "email";

const EP_DT_LIST = `${API_URL}/db-management/dt-experts`;
const EP_TEAMS   = `${API_URL}/db-management/teams`;
const EP_ME      = `${API_URL}/db-management/me`;

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
  dtList: [],
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
  applyPositionGuard?.(); // 기존에 있으면 사용
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

// ===== 탭 (기존) =====
function bindTabs(){
  document.querySelectorAll(".v-tab").forEach(btn => {
    btn.addEventListener("click", async () => {
      const tab = btn.getAttribute("data-tab");
      if(tab === "dt" && !State.isLead){ showPanel("dt"); showDTGuard(true); markActive(btn); return; }
      showPanel(tab); markActive(btn);
      if(tab === "dt" && State.isLead && State.dtList.length === 0){ await loadDTList(); }
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
function showDTGuard(show){ document.getElementById("dtGuard")?.classList.toggle("hidden", !show); }

// ===== 버튼 바인딩 =====
function bindActions(){
  document.getElementById("btnLogout")?.addEventListener("click", () => {
    localStorage.clear(); alert("로그아웃 되었습니다."); window.location.replace("login.html");
  });

  document.getElementById("btnEditMe")?.addEventListener("click", onToggleEditMe);
  document.getElementById("btnMeCancel")?.addEventListener("click", onCancelEditMe);

  document.getElementById("btnDTReload")?.addEventListener("click", loadDTList);
  document.getElementById("btnDTAdd")?.addEventListener("click", () => {
    if(!State.isLead){ return alert("팀장만 등록할 수 있어요!"); }
    alert("신규 등록 폼은 추후 연결 예정! (미구현)");
  });
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

// ===== (기존) DT 목록 =====
async function loadDTList(){
  if(!State.isLead){ renderDTList([]); showDTGuard(true); return; }
  try{
    const res = await authFetch(EP_DT_LIST);
    const data = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(data?.message || "DT 목록 로드 실패");
    const rows = Array.isArray(data) ? data : (data.rows || []);
    State.dtList = rows; renderDTList(State.dtList); showDTGuard(false);
  }catch(err){
    console.error(err);
    renderDTList([]); showDTGuard(false);
    toast("DT 전문가 API 응답이 없어 빈 목록으로 표시합니다(미구현 가능).");
  }
}
function renderDTList(rows){
  const tbody = document.querySelector("#tblDTList tbody");
  if(!tbody) return;
  tbody.innerHTML = "";
  if(!rows || rows.length === 0){
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5; td.textContent = "데이터가 없습니다."; td.style.color = "#889";
    tr.appendChild(td); tbody.appendChild(tr); return;
  }
  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(r.name ?? r.user_name ?? "—")}</td>
      <td>${esc(r.team_name ?? r.team ?? "—")}</td>
      <td>${esc(r.role ?? r.responsibility_name ?? "—")}</td>
      <td>${esc(r.level ?? r.cert ?? "—")}</td>
      <td>${esc(r.updated_at ?? r.updatedAt ?? "—")}</td>`;
    tbody.appendChild(tr);
  });
}
