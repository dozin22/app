
// /frontend/js/user_panel.js
import {
    State, esc, toast, authFetch, EP_ME, EP_TEAMS, EP_TEAM_MEMBERS, 
    FIXED_DOMAIN, EMAIL_KEY, POS_KEY, TEAM_KEY,
    getLocalFromEmail, buildEmail, setKvEmailView, setKvEmailEdit
} from './db_shared.js';

// 이 모듈의 모든 로직을 초기화하고 이벤트 리스너를 바인딩합니다.
export function initUserPanel() {
  // ✅ 폼 자동 제출(페이지 리로드) 방지: DT 섹션 폼 id가 있으면 막기
  document.getElementById('dtForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  // ✅ 공통 바인더: 클릭 기본동작/버블 차단
  const bind = (id, handler) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handler(e);
    });
  };

  bind("btnEditMe", onToggleEditMe);
  bind("btnMeCancel", onCancelEditMe);
  bind("btnDTReload", () => loadTeamMembers());
  bind("btnDTSave", () => onSaveDTExperts());
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

      State.me = { ...State.me, ...data };
      localStorage.setItem(EMAIL_KEY, State.me.email || "");
      localStorage.setItem(POS_KEY,   State.me.position || "");
      localStorage.setItem(TEAM_KEY,  State.me.team || "");

      setKvEmailView(getLocalFromEmail(State.me.email));
      const posCell = document.getElementById("kvPosition");
      const teamCell = document.getElementById("kvTeam");
      if (posCell) posCell.textContent = State.me.position || "—";
      if (teamCell) teamCell.textContent = State.me.team || "—";

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
  if(htmls.kvEmail   != null) document.getElementById("kvEmail").innerHTML = htmls.kvEmail;
  if(htmls.kvPosition!= null) document.getElementById("kvPosition").innerHTML = htmls.kvPosition;
  if(htmls.kvTeam    != null) document.getElementById("kvTeam").innerHTML = htmls.kvTeam;

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

// ===== DT 전문가 선임 =====
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
  btn && (btn.disabled = true);

  const payload = [];
  document.querySelectorAll('#tblDTList tbody tr').forEach(tr => {
    const userId = tr.dataset.userId;
    const isExpert = tr.querySelector('.dt-expert-select')?.value === 'true';
    if (userId) payload.push({ user_id: Number(userId), is_dt_expert: isExpert });
  });

  // 👉 setTimeout으로 다음 tick에 fetch 실행
  setTimeout(async () => {
    try {
      const res = await authFetch(`${EP_TEAM_MEMBERS}/dt-expert-status`, {
        method: 'PUT',
        body: JSON.stringify({ updates: payload })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || '저장 중 오류 발생');

      toast('DT 전문가 정보가 저장되었습니다.');
      await loadTeamMembers();
    } catch (e) {
      console.error(e);
      toast(e.message || '저장 실패');
    } finally {
      btn && (btn.disabled = false);
    }
  }, 0);
}
