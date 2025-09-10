// /frontend/js/user_panel.js

import {
  State, esc, toast, authFetch,
  EP_ME, EP_TEAMS, EP_TEAM_MEMBERS, EP_TEAM_RESPONSIBILITIES, EP_ME_RESPONSIBILITIES,
  FIXED_DOMAIN, EMAIL_KEY, POS_KEY, TEAM_KEY,
  getLocalFromEmail, buildEmail, setKvEmailView, setKvEmailEdit,
  markActiveByTabKey, setText, 
} from './db_management.js';

// 이 모듈의 모든 로직을 초기화하고 이벤트 리스너를 바인딩합니다.
export function initUserPanel() {
  // 기존 이벤트 리스너
  document.getElementById('dtForm')?.addEventListener('submit', (e) => e.preventDefault());
  bind("btnEditMe", onToggleEditMe);
  bind("btnMeCancel", onCancelEditMe);
  bind("btnDTReload", () => loadTeamMembers());
  bind("btnDTSave", onSaveDTExperts);

  // 담당 업무 관리 이벤트 리스너
  bind("btnAddResponsibility", onAddResponsibility);
  document.getElementById('userResponsibilities')?.addEventListener('click', (e) => {
    if (e.target.matches('.close')) {
      const pill = e.target.closest('.pill');
      const responsibilityId = pill?.dataset.id;
      if (responsibilityId) onRemoveResponsibility(Number(responsibilityId));
    }
  });

  // 초기 렌더링 (팀장 여부와 무관하게 본인 업무 관리 가능)
  renderResponsibilities(State.me?.responsibilities || []);
  loadTeamResponsibilitiesForDropdown();
}

function bind(id, handler) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setTimeout(() => handler(e), 0);
  });
}

// ===== 인라인 편집 =====
async function onToggleEditMe(){
  const btn = document.getElementById("btnEditMe");
  const cancelBtn = document.getElementById("btnMeCancel");
  if(!btn || !cancelBtn) return;

  if(!State.editing){
    State.editing = true;
    btn.textContent = "저장";
    cancelBtn.classList.remove("hidden");
    document.getElementById('kvEmail')?.classList.add('editing-mode');

    State.editBackup = {
      email: State.me.email,
      position: State.me.position,
      team: State.me.team,
      team_id: State.me.team_id,
      htmls: {
        kvEmail: document.getElementById("kvEmail")?.innerHTML,
        kvPosition: document.getElementById("kvPosition")?.innerHTML,
        kvTeam: document.getElementById("kvTeam")?.innerHTML,
      }
    };

    await loadTeams();
    setKvEmailEdit(getLocalFromEmail(State.me.email));

    const positions = ["팀장", "책임", "선임", "주임", "사원"];
    const posCell = document.getElementById("kvPosition");
    if (posCell) {
      posCell.innerHTML = `<select id="inpPosition">${positions.map(p=>(
        `<option value="${esc(p)}"${p===State.me.position?" selected":""}>${esc(p)}</option>`
      )).join("")}</select>`;
    }

    const teamCell = document.getElementById("kvTeam");
    if (teamCell) {
      if (Array.isArray(State.teams) && State.teams.length > 0) {
        const opts = [`<option value="">— (미지정)</option>`].concat(
          State.teams.map(t => `<option value="${t.team_id}"${Number(State.me.team_id)===Number(t.team_id)?" selected":""}>${esc(t.team_name)}</option>`)
        ).join("");
        teamCell.innerHTML = `<select id="inpTeam">${opts}</select>`;
      } else {
        teamCell.textContent = State.me.team || "—";
      }
    }
  } else {
    const localEl  = document.getElementById("inpEmailLocal");
    const email    = localEl ? buildEmail(localEl.value) : (State.me.email || '').trim();
    const posSel   = document.getElementById("inpPosition");
    const teamSel  = document.getElementById("inpTeam");

    const position = (posSel?.value || "").trim();
    const teamVal  = teamSel ? teamSel.value : "";
    const team_id  = teamVal === "" ? null : Number(teamVal);

    if(!email || !position) return alert("이메일/직책은 필수입니다.");
    if (!email.endsWith(FIXED_DOMAIN)) return alert(`이메일은 ${FIXED_DOMAIN} 도메인만 허용됩니다.`);

    try{
      btn.disabled = true;
      const res = await authFetch(EP_ME, {
        method: "PUT",
        body: JSON.stringify({ name: State.me.name, email, position, team_id })
      });
      const data = await res.json().catch(()=> ({}));
      if(!res.ok) throw new Error(data?.message || "저장 실패");

      await refreshMyInfo(); // 수정 후 내 정보 다시 로드
      toast("저장되었습니다.");

      State.editing = false;
      btn.textContent = "수정";
      cancelBtn.classList.add("hidden");
      document.getElementById('kvEmail')?.classList.remove('editing-mode');
      State.editBackup = null;
    } catch(e) {
      console.error(e);
      alert(e.message || "저장 실패");
    } finally {
      btn.disabled = false;
    }
  }
}

function onCancelEditMe(){
  if(!State.editing) return;
  const btn = document.getElementById("btnEditMe");
  const cancelBtn = document.getElementById("btnMeCancel");

  const { htmls } = State.editBackup || {};
  if(htmls?.kvEmail   != null) document.getElementById("kvEmail").innerHTML = htmls.kvEmail;
  if(htmls?.kvPosition!= null) document.getElementById("kvPosition").innerHTML = htmls.kvPosition;
  if(htmls?.kvTeam    != null) document.getElementById("kvTeam").innerHTML = htmls.kvTeam;

  State.editing = false;
  if (btn) btn.textContent = "수정";
  if (cancelBtn) cancelBtn.classList.add("hidden");
  State.editBackup = null;
  document.getElementById('kvEmail')?.classList.remove('editing-mode');
}

async function loadTeams(){
  try{
    const res = await authFetch(EP_TEAMS);
    const data = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(data?.message || "팀 목록 로드 실패");
    State.teams = Array.isArray(data) ? data : [];
  }catch(e){
    console.warn("[teams] 로드 실패(권한/네트워크 등):", e?.message || e);
    State.teams = [];
  }
}

// ===== DT 전문가 선임 (팀장 전용) =====
export async function loadTeamMembers(){
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
    toast(err.message || "팀원 목록 로드 실패");
  }
}

function renderTeamMembers(members){
  const tbody = document.querySelector("#tblDTList tbody");
  const title = document.getElementById("dtListTitle");
  if(!tbody) return;

  if (title) title.textContent = `${esc(State.me.team || '팀')} DT 전문가 선임`;

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
  const btn = document.getElementById("btnDTSave");
  if (!btn) return;

  const currentTabKey = State.activeTab;
  btn.disabled = true;
  btn.textContent = "저장 중...";

  const payload = [];
  document.querySelectorAll('#tblDTList tbody tr').forEach(tr => {
    const userId = tr.dataset.userId;
    const isExpert = tr.querySelector('.dt-expert-select')?.value === 'true';
    if (userId) payload.push({ user_id: Number(userId), is_dt_expert: isExpert });
  });

  try {
    const res = await authFetch(`${EP_TEAM_MEMBERS}/dt-expert-status`, {
      method: 'PUT',
      body: JSON.stringify({ updates: payload })
    });
    
    const updatedTeamMembers = await res.json().catch(() => null);
    if (!res.ok) throw new Error(updatedTeamMembers?.message || '저장 중 오류가 발생했습니다.');
    
    State.teamMembers = updatedTeamMembers || [];
    renderTeamMembers(State.teamMembers);
    toast('DT 전문가 정보가 저장되었습니다.');
  } catch (e) {
    console.error(e);
    toast(e.message || '저장 실패');
  } finally {
    markActiveByTabKey(currentTabKey);
    btn.disabled = false;
    btn.textContent = "저장";
  }
}

// ===== 담당업무 관리 =====
function renderResponsibilities(responsibilities) {
  const container = document.getElementById('userResponsibilities');
  const addSection = document.getElementById('addRespSection');
  if (!container || !addSection) return;

  container.innerHTML = '';
  if (Array.isArray(responsibilities) && responsibilities.length > 0) {
    responsibilities.forEach(r => {
      const pill = document.createElement('div');
      pill.className = 'pill';
      pill.dataset.id = r.id;
      pill.innerHTML = `
        <span>${esc(r.name)}</span>
        <button class="close" data-id="${r.id}" aria-label="담당업무 삭제">&times;</button>
      `;
      container.appendChild(pill);
    });
  } else {
    container.innerHTML = `<span class="muted">담당 업무가 없습니다.</span>`;
  }

  // 모든 사용자에게 추가 섹션 활성
  addSection.style.display = 'grid';
}

async function loadTeamResponsibilitiesForDropdown() {
  try {
    const res = await authFetch(EP_TEAM_RESPONSIBILITIES);
    const data = await res.json().catch(() => []);
    if (!res.ok) throw new Error((data && data.message) || '팀 담당업무 목록 로드 실패');
    
    const select = document.getElementById('selAddResponsibility');
    if (!select) return;

    const currentRespIds = new Set((State.me?.responsibilities || []).map(r => r.id));
    const filteredOptions = (Array.isArray(data) ? data : []).filter(r => !currentRespIds.has(r.responsibility_id));

    select.innerHTML = '<option value="">-- 선택 --</option>' + filteredOptions
      .map(r => `<option value="${r.responsibility_id}">${esc(r.name)}</option>`)
      .join('');
  } catch (e) {
    toast(e.message || '팀 담당업무 목록 로드 실패', 'error');
  }
}

async function onAddResponsibility() {
  const select = document.getElementById('selAddResponsibility');
  if (!select) return;
  const responsibilityId = select.value;
  if (!responsibilityId) {
    toast('추가할 업무를 선택하세요.', 'warn');
    return;
  }

  try {
    // ✅ 본인 전용(me) 엔드포인트 사용
    const res = await authFetch(EP_ME_RESPONSIBILITIES, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ responsibility_id: Number(responsibilityId) })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || '추가 실패');

    toast('담당 업무가 추가되었습니다.');
    await refreshMyInfo();
    // 드롭다운 갱신
    await loadTeamResponsibilitiesForDropdown();
  } catch (e) {
    toast(e.message || '오류가 발생했습니다.', 'error');
  }
}

async function onRemoveResponsibility(responsibilityId) {
  if (!confirm('정말 이 담당 업무를 삭제하시겠습니까?')) return;

  try {
    // ✅ 본인 전용(me) 엔드포인트 사용
    const res = await authFetch(`${EP_ME_RESPONSIBILITIES}/${responsibilityId}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || '삭제 실패');

    toast('담당 업무가 삭제되었습니다.');
    await refreshMyInfo();
    // 드롭다운 갱신
    await loadTeamResponsibilitiesForDropdown();
  } catch (e) {
    toast(e.message || '오류가 발생했습니다.', 'error');
  }
}

async function refreshMyInfo() {
  try {
    const res = await authFetch(EP_ME);
    if (!res.ok) throw new Error('내 정보 갱신 실패');
    const data = await res.json();
    State.me = { ...State.me, ...data };
    
    // 기본 정보 다시 그리기
    setText("kvName", State.me.name);
    setText("kvTeam", State.me.team || "—");
    setKvEmailView(getLocalFromEmail(State.me.email));
    setText("kvPosition", State.me.position);

    // 담당 업무 다시 그리기
    renderResponsibilities(State.me.responsibilities || []);
  } catch (e) {
    toast(e.message || '내 정보 갱신 실패', 'error');
  }
}
