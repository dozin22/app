
// /frontend/js/db_shared.js

// API 엔드포인트와 공용 상수를 정의하고 내보냅니다.
import { API_URL } from './config.js';

export const TOKEN_KEY = "token";
export const NAME_KEY  = "name";
export const POS_KEY   = "position";
export const TEAM_KEY  = "team";
export const EMAIL_KEY = "email";

export const EP_TEAM_MEMBERS   = `${API_URL}/user-management/team-members`;
export const EP_TASK_TEMPLATES = `${API_URL}/workflow-management/task-templates`;
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
};

// 공용 유틸리티 함수들입니다.
export function getToken(){ return localStorage.getItem(TOKEN_KEY); }

export function esc(v){
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;',
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
  return fetch(url, { ...opt, headers });
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
