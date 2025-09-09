// /frontend/js/workflow_template_panel.js
// - panel-flow 전용 모듈
// - 목록(좌) + 폼(우) CRUD
// - 공용 유틸: db_shared.js 의 authFetch/esc/toast 사용

import { authFetch, esc, toast } from './db_management.js';

// 필요 시 여기만 수정
const EP_WORKFLOW_TEMPLATES = '/api/workflow-templates';

const WF = {
  loaded: false,
  list: [],
  selectedId: null,
};

function qs(id)  { return document.getElementById(id); }
function show(el) { el?.classList.remove('hidden'); }
function hide(el) { el?.classList.add('hidden'); }

async function safeText(res) {
  try { return await res.text(); } catch { return String(res.status); }
}

// -------- 바인딩 (최초 1회) --------
function bindOnce() {
  if (WF.loaded) return;
  WF.loaded = true;

  const $tbody = qs('workflowListBody');
  const $form = qs('workflowForm');
  const $formPh = qs('workflowFormPlaceholder');

  const $id   = qs('inpWorkflowId');
  const $name = qs('inpWorkflowName');
  const $desc = qs('inpWorkflowDesc');

  const $btnNew    = qs('btnNewWorkflowTemplate');
  const $btnSave   = qs('btnSaveWorkflowTemplate');
  const $btnDelete = qs('btnDeleteWorkflowTemplate');

  // 목록 클릭 (위임)
  $tbody?.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const id = Number(tr.getAttribute('data-id'));
    const item = WF.list.find(x => x.workflow_template_id === id);
    if (item) {
      WF.selectedId = id;
      fillForm(item);
      highlightRow(id);
    }
  });

  // 새로 만들기
  $btnNew?.addEventListener('click', () => {
    WF.selectedId = null;
    fillForm({ workflow_template_id: '', template_name: '', description: '' });
    highlightRow(null);
  });

  // 저장
  $btnSave?.addEventListener('click', async () => {
    const payload = {
      template_name: ($name.value || '').trim(),
      description: ($desc.value || '').trim() || null,
    };
    if (!payload.template_name) {
      toast('이름을 입력하세요.', 'warn');
      return;
    }

    // CREATE
    if (!WF.selectedId) {
      const res = await authFetch(EP_WORKFLOW_TEMPLATES, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        toast(`생성 실패: ${await safeText(res)}`, 'error');
        return;
      }
      const created = await res.json().catch(() => ({}));
      toast('생성 완료');
      await loadList();
      renderList();
      WF.selectedId = created?.workflow_template_id ?? null;
      if (WF.selectedId) {
        const item = WF.list.find(x => x.workflow_template_id === WF.selectedId);
        fillForm(item);
        highlightRow(WF.selectedId);
      }
      return;
    }

    // UPDATE
    const res = await authFetch(`${EP_WORKFLOW_TEMPLATES}/${WF.selectedId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      toast(`저장 실패: ${await safeText(res)}`, 'error');
      return;
    }
    toast('저장 완료');
    await loadList();
    renderList();
    const item = WF.list.find(x => x.workflow_template_id === WF.selectedId);
    fillForm(item);
  });

  // 삭제
  $btnDelete?.addEventListener('click', async () => {
    if (!WF.selectedId) {
      toast('삭제할 항목이 없습니다.', 'warn');
      return;
    }
    if (!confirm('정말 삭제하시겠습니까?')) return;

    const res = await authFetch(`${EP_WORKFLOW_TEMPLATES}/${WF.selectedId}`, { method: 'DELETE' });
    if (!res.ok) {
      toast(`삭제 실패: ${await safeText(res)}`, 'error');
      return;
    }
    toast('삭제 완료');
    WF.selectedId = null;
    await loadList();
    renderList();
    clearForm();
    highlightRow(null);
  });

  // 초기 로드
  loadList().then(renderList).catch(err => {
    console.error(err);
    toast('업무 흐름도 목록을 불러오지 못했습니다.', 'error');
  });

  // ---- 내부 유틸 ----
  function clearForm() {
    hide($form);
    show($formPh);
    $id.value = '';
    $name.value = '';
    $desc.value = '';
  }

  function fillForm(item) {
    if (!item) { clearForm(); return; }
    show($form);
    hide($formPh);

    $id.value   = item.workflow_template_id || '';
    $name.value = item.template_name || '';
    $desc.value = item.description || '';
  }

  function highlightRow(id) {
    document.querySelectorAll('#workflowListBody tr').forEach(tr => {
      if (id != null && String(tr.getAttribute('data-id')) === String(id)) tr.classList.add('active');
      else tr.classList.remove('active');
    });
  }
}

// -------- 데이터 로드 & 렌더 --------
async function loadList() {
  const res = await authFetch(EP_WORKFLOW_TEMPLATES, { method: 'GET' });
  if (!res.ok) throw new Error('list fetch failed');
  const data = await res.json().catch(() => []);
  // 표준화
  WF.list = (data || []).map((x) => ({
    workflow_template_id: x.workflow_template_id,
    template_name: x.template_name,
    description: x.description,
  }));
}

function renderList() {
  const $tbody = qs('workflowListBody');
  if (!$tbody) return;

  if (!WF.list.length) {
    $tbody.innerHTML = `<tr><td class="col-num">—</td><td class="muted">데이터가 없습니다.</td></tr>`;
    return;
  }

  const rows = WF.list
    .map((x, i) => `
      <tr data-id="${esc(x.workflow_template_id)}">
        <td class="col-num">${esc(String(i + 1))}</td>
        <td>${esc(x.template_name || '')}</td>
      </tr>
    `)
    .join('');
  $tbody.innerHTML = rows;
}

// -------- 탭 진입 시 초기화 --------
// 1) 페이지 로드 시 panel-flow가 이미 보이는 경우
document.addEventListener('DOMContentLoaded', () => {
  const visible = document.querySelector('#panel-flow') && !document.querySelector('#panel-flow')?.classList.contains('hidden');
  if (visible) bindOnce();
});

// 2) 탭 버튼 클릭(단순 구현: id=tabFlow 이면 바인딩 시도)
//    프로젝트의 탭 전환 로직이 별도로 있다면, 그 로직에서 panel-flow가 보여질 때 bindOnce() 호출해도 됨.
document.addEventListener('click', (e) => {
  const btn = e.target.closest('#tabFlow');
  if (!btn) return;
  // 약간의 지연 후 panel-flow 가시성 판단 (클래스 토글 직후를 대비)
  setTimeout(() => {
    const panel = document.querySelector('#panel-flow');
    if (panel && !panel.classList.contains('hidden')) bindOnce();
  }, 0);
});
