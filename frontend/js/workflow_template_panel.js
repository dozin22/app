// /frontend/js/workflow_template_panel.js
// panel-flow: 목록/폼 + 정의 CRUD + 실시간 그래프

import { authFetch, esc, toast, EP_WORKFLOW_TEMPLATES } from './db_management.js';

const WF = {
  loaded: false,
  list: [],
  selectedId: null,
  defs: [],        // [{definition_id, task_template_id, task_template_name, depends_on_task_template_id, depends_on_task_template_name}]
  nodes: [],       // [{task_template_id, template_name}]
  candidates: [],  // 우리팀 가능 업무
};

function qs(id){ return document.getElementById(id); }
function show(el){ el?.classList.remove('hidden'); }
function hide(el){ el?.classList.add('hidden'); }
async function safeText(res){ try{ return await res.text(); }catch{ return String(res.status); } }

// ---------- 초기 바인딩 ----------
function bindOnce(){
  if (WF.loaded) return;
  WF.loaded = true;

  const $tbody = qs('workflowListBody');
  const $form  = qs('workflowForm');
  const $formPh= qs('workflowFormPlaceholder');
  const $id    = qs('inpWorkflowId');
  const $name  = qs('inpWorkflowName');
  const $desc  = qs('inpWorkflowDesc');

  const $btnNew    = qs('btnNewWorkflowTemplate');
  const $btnSave   = qs('btnSaveWorkflowTemplate');
  const $btnDelete = qs('btnDeleteWorkflowTemplate');

  // 정의 관련
  const $defsBody  = qs('defsBody');
  const $selAddTask = qs('selAddTask');
  const $selAddDep  = qs('selAddDepends');
  const $btnAddDef  = qs('btnAddDef');

  // 목록 클릭
  $tbody?.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const id = Number(tr.getAttribute('data-id'));
    const item = WF.list.find(x => x.workflow_template_id === id);
    if (item) {
      WF.selectedId = id;
      fillForm(item);
      highlightRow(id);
      refreshDefinitions();
    }
  });

  // 새로 만들기
  $btnNew?.addEventListener('click', () => {
    WF.selectedId = null;
    fillForm({ workflow_template_id: '', template_name: '', description: '' });
    highlightRow(null);
    clearDefsUI();
  });

  // 저장 (생성/수정)
  $btnSave?.addEventListener('click', async () => {
    const payload = {
      template_name: ($name.value || '').trim(),
      description: ($desc.value || '').trim() || null,
    };
    if (!payload.template_name) return toast('이름을 입력하세요.', 'warn');

    if (!WF.selectedId) {
      // CREATE
      const res = await authFetch(EP_WORKFLOW_TEMPLATES, {
        method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
      });
      if (!res.ok) return toast(`생성 실패: ${await safeText(res)}`, 'error');
      const created = await res.json().catch(()=> ({}));
      toast('생성 완료');
      await loadList(); renderList();
      WF.selectedId = created?.workflow_template_id ?? null;
      const item = WF.list.find(x => x.workflow_template_id === WF.selectedId);
      fillForm(item); highlightRow(WF.selectedId);
      await refreshDefinitions();
      return;
    }

    // UPDATE
    const res = await authFetch(`${EP_WORKFLOW_TEMPLATES}/${WF.selectedId}`, {
      method: 'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
    });
    if (!res.ok) return toast(`저장 실패: ${await safeText(res)}`, 'error');
    toast('저장 완료');
    await loadList(); renderList();
    const item = WF.list.find(x => x.workflow_template_id === WF.selectedId);
    fillForm(item);
  });

  // 삭제
  $btnDelete?.addEventListener('click', async () => {
    if (!WF.selectedId) return toast('삭제할 항목이 없습니다.', 'warn');
    if (!confirm('정말 삭제하시겠습니까?')) return;
    const res = await authFetch(`${EP_WORKFLOW_TEMPLATES}/${WF.selectedId}`, { method:'DELETE' });
    if (!res.ok) return toast(`삭제 실패: ${await safeText(res)}`, 'error');
    toast('삭제 완료');
    WF.selectedId = null;
    await loadList(); renderList();
    clearForm(); clearDefsUI(); highlightRow(null);
  });

  // 정의 추가
  $btnAddDef?.addEventListener('click', async () => {
    if (!WF.selectedId) return toast('먼저 템플릿을 선택/저장하세요.', 'warn');
    const task = Number($selAddTask.value || 0);
    const dep  = $selAddDep.value ? Number($selAddDep.value) : null;
    if (!task) return toast('업무를 선택하세요.', 'warn');

    const res = await authFetch(`${EP_WORKFLOW_TEMPLATES}/${WF.selectedId}/definitions`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ task_template_id: task, depends_on_task_template_id: dep })
    });
    if (!res.ok) return toast(`추가 실패: ${await safeText(res)}`, 'error');

    await refreshDefinitions();
    toast('추가 완료');
  });

  // 정의 편집/삭제(위임)
  $defsBody?.addEventListener('click', async (e) => {
    const btnDel = e.target.closest('button[data-del]');
    const btnEdit= e.target.closest('button[data-edit]');
    const btnSave= e.target.closest('button[data-save]');
    const btnCanc= e.target.closest('button[data-cancel]');
    const tr = e.target.closest('tr[data-def-id]');
    if (!tr) return;
    const defId = Number(tr.getAttribute('data-def-id'));

    if (btnDel) {
      if (!confirm('이 연결을 삭제할까요?')) return;
      const res = await authFetch(`${EP_WORKFLOW_TEMPLATES}/${WF.selectedId}/definitions/${defId}`, { method:'DELETE' });
      if (!res.ok) return toast(`삭제 실패: ${await safeText(res)}`, 'error');
      await refreshDefinitions(); toast('삭제 완료');
    }

    if (btnEdit) {
      enterRowEdit(tr);
    }
    if (btnCanc) {
      renderDefs(); // 원복
    }
    if (btnSave) {
      const selTask = tr.querySelector('select[data-task]');
      const selDep  = tr.querySelector('select[data-dep]');
      const task = Number(selTask?.value || 0);
      const dep  = selDep?.value ? Number(selDep.value) : null;
      const res = await authFetch(`${EP_WORKFLOW_TEMPLATES}/${WF.selectedId}/definitions/${defId}`, {
        method:'PUT', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ task_template_id: task, depends_on_task_template_id: dep })
      });
      if (!res.ok) return toast(`수정 실패: ${await safeText(res)}`, 'error');
      await refreshDefinitions(); toast('수정 완료');
    }
  });

  // 첫 로드
  loadList().then(renderList).catch(err => {
    console.error(err); toast('업무 흐름도 목록을 불러오지 못했습니다.', 'error');
  });

  // 내부 유틸
  function clearForm(){ hide($form); show($formPh); $id.value=''; $name.value=''; $desc.value=''; }
  function fillForm(item){
    if (!item){ clearForm(); return; }
    show($form); hide($formPh);
    $id.value = item.workflow_template_id || '';
    $name.value = item.template_name || '';
    $desc.value = item.description || '';
  }
  function highlightRow(id){
    document.querySelectorAll('#workflowListBody tr').forEach(tr => {
      if (id != null && String(tr.getAttribute('data-id'))===String(id)) tr.classList.add('active'); else tr.classList.remove('active');
    });
  }
}

// ---------- 데이터 로드 & 렌더 ----------
async function loadList(){
  const res = await authFetch(EP_WORKFLOW_TEMPLATES, { method:'GET' });
  if (!res.ok) throw new Error('list fetch failed');
  const data = await res.json().catch(()=>[]);
  WF.list = (data||[]).map(x => ({
    workflow_template_id: x.workflow_template_id,
    template_name: x.template_name,
    description: x.description,
    // x.definitions 도 서버가 주면 활용 가능하지만, 선택 시 별도 호출로 항상 최신 반영
  }));
}

function renderList(){
  const $tbody = qs('workflowListBody');
  if (!$tbody) return;
  if (!WF.list.length){
    $tbody.innerHTML = `<tr><td class="col-num">—</td><td class="muted">데이터가 없습니다.</td></tr>`;
    return;
  }
  $tbody.innerHTML = WF.list.map((x,i)=>`
    <tr data-id="${esc(x.workflow_template_id)}">
      <td class="col-num">${esc(String(i+1))}</td>
      <td>${esc(x.template_name||'')}</td>
    </tr>
  `).join('');
}

// ---------- 정의 & 그래프 ----------
function clearDefsUI(){
  const body = qs('defsBody'); if (body) body.innerHTML = '';
  const selTask = qs('selAddTask'); const selDep = qs('selAddDepends');
  if (selTask) selTask.innerHTML = ''; if (selDep) selDep.innerHTML = '<option value="">(선행 없음)</option>';
  const g = qs('workflowGraph'); if (g) g.innerHTML='';
}

async function refreshDefinitions(){
  if (!WF.selectedId) return clearDefsUI();

  // 후보 업무
  const resC = await authFetch(`${EP_WORKFLOW_TEMPLATES}/${WF.selectedId}/candidates`);
  WF.candidates = resC.ok ? await resC.json().catch(()=>[]) : [];

  // 정의 목록
  const resD = await authFetch(`${EP_WORKFLOW_TEMPLATES}/${WF.selectedId}/definitions`);
  if (!resD.ok){ toast(`정의 조회 실패: ${await safeText(resD)}`, 'error'); return; }
  const { definitions=[], nodes=[] } = await resD.json().catch(()=>({definitions:[], nodes:[]}));
  WF.defs = definitions; WF.nodes = nodes;

  renderAddSelectors();
  renderDefs();
  drawGraph();
}

function renderAddSelectors(){
  const selTask = qs('selAddTask'); const selDep = qs('selAddDepends');
  if (!selTask || !selDep) return;

  selTask.innerHTML = WF.candidates.map(t =>
    `<option value="${esc(t.task_template_id)}">${esc(t.template_name)}</option>`).join('');

  // 선행 후보는 현재 워크플로 노드들
  const nodes = getNodesFromDefs();
  selDep.innerHTML = `<option value="">(선행 없음)</option>` + nodes.map(n =>
    `<option value="${esc(n.task_template_id)}">${esc(n.template_name)}</option>`).join('');
}

function getNodesFromDefs(){
  // defs에서 등장하는 task_template_id들의 unique 집합
  const idSet = new Map();
  WF.defs.forEach(d => {
    if (d.task_template_id) idSet.set(d.task_template_id, d.task_template_name);
    if (d.depends_on_task_template_id)
      idSet.set(d.depends_on_task_template_id, d.depends_on_task_template_name);
  });
  return Array.from(idSet.entries()).map(([id,name]) => ({task_template_id:id, template_name:name}));
}

function renderDefs(){
  const $body = qs('defsBody'); if (!$body) return;
  if (!WF.defs.length){
    $body.innerHTML = `<tr><td colspan="4" class="muted">정의가 없습니다. 위에서 추가하세요.</td></tr>`;
    return;
  }
  $body.innerHTML = WF.defs.map(d => `
    <tr data-def-id="${esc(d.definition_id)}">
      <td>${esc(d.definition_id)}</td>
      <td>${esc(d.task_template_name||'')}</td>
      <td>${esc(d.depends_on_task_template_name||'(없음)')}</td>
      <td>
        <button class="btn" data-edit>수정</button>
        <button class="btn" data-del>삭제</button>
      </td>
    </tr>
  `).join('');
}

function enterRowEdit(tr){
  const defId = Number(tr.getAttribute('data-def-id'));
  const d = WF.defs.find(x => x.definition_id === defId);
  const nodes = getNodesFromDefs();

  const taskSel = `<select data-task>${
    WF.candidates.map(t =>
      `<option value="${esc(t.task_template_id)}" ${t.task_template_id===d.task_template_id?'selected':''}>${esc(t.template_name)}</option>`).join('')
  }</select>`;

  const depSel = `<select data-dep>
      <option value="" ${!d.depends_on_task_template_id?'selected':''}>(선행 없음)</option>
      ${nodes.map(n => `<option value="${esc(n.task_template_id)}" ${n.task_template_id===d.depends_on_task_template_id?'selected':''}>${esc(n.template_name)}</option>`).join('')}
    </select>`;

  tr.innerHTML = `
    <td>${esc(d.definition_id)}</td>
    <td>${taskSel}</td>
    <td>${depSel}</td>
    <td>
      <button class="btn primary" data-save>저장</button>
      <button class="btn" data-cancel>취소</button>
    </td>
  `;
}

// ---------- 간단 DAG 렌더러 (SVG) ----------
function drawGraph(){
  const boxW = 140, boxH = 40, colGap = 120, rowGap = 30, pad = 20;

  // 노드 목록/엣지 목록
  const nodes = getNodesFromDefs();
  const edges = WF.defs
    .filter(d => d.depends_on_task_template_id)
    .map(d => ({ from: d.depends_on_task_template_id, to: d.task_template_id }));

  // 레벨 계산 (Kahn)
  const id2idx = new Map(nodes.map((n,i)=>[n.task_template_id, i]));
  const indeg = new Map(nodes.map(n => [n.task_template_id, 0]));
  const adj = new Map(nodes.map(n => [n.task_template_id, []]));
  edges.forEach(e => {
    if (!id2idx.has(e.from) || !id2idx.has(e.to)) return;
    indeg.set(e.to, (indeg.get(e.to)||0)+1);
    adj.get(e.from).push(e.to);
  });

  const q = []; indeg.forEach((v,k)=>{ if(v===0) q.push(k); });
  const levels = new Map(); // id -> level
  const order = [];
  while(q.length){
    const u = q.shift();
    order.push(u);
    const lu = levels.get(u)||0;
    (adj.get(u)||[]).forEach(v=>{
      if (!levels.has(v)) levels.set(v, Math.max(levels.get(v)||0, lu+1));
      indeg.set(v, indeg.get(v)-1);
      if (indeg.get(v)===0) q.push(v);
    });
  }
  // 레벨 미지정 노드(사이클/고립)는 0레벨로
  nodes.forEach(n => { if (!levels.has(n.task_template_id)) levels.set(n.task_template_id, 0); });

  // 레벨별 그룹
  const maxLevel = Math.max(...Array.from(levels.values()), 0);
  const cols = Array.from({length:maxLevel+1}, ()=>[]);
  nodes.forEach(n => cols[levels.get(n.task_template_id)].push(n));

  // 위치 계산
  const colX = (level)=> pad + level*(boxW+colGap);
  const colHeights = cols.map(col => col.length*boxH + (col.length-1)*rowGap);
  const maxW = colX(maxLevel)+boxW+pad;
  const maxH = Math.max(...colHeights, 0) + pad*2;

  const pos = new Map(); // id -> {x,y}
  cols.forEach((col, L)=>{
    const totalH = colHeights[L] || 0;
    const startY = pad + (maxH - 2*pad - totalH)/2;
    col.forEach((n, i)=>{
      const x = colX(L);
      const y = startY + i*(boxH+rowGap);
      pos.set(n.task_template_id, {x,y});
    });
  });

  const wrap = qs('workflowGraph'); if (!wrap) return;
  wrap.innerHTML = '';
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('width','100%');
  svg.setAttribute('height','100%');
  svg.setAttribute('viewBox', `0 0 ${Math.max(maxW, 600)} ${Math.max(maxH, 300)}`);
  wrap.appendChild(svg);

  // edges
  edges.forEach(e=>{
    const a = pos.get(e.from), b = pos.get(e.to);
    if (!a||!b) return;
    const x1 = a.x + boxW, y1 = a.y + boxH/2;
    const x2 = b.x,        y2 = b.y + boxH/2;
    const mid = (x1 + x2)/2;
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d', `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`);
    path.setAttribute('fill','none');
    path.setAttribute('stroke','#88a');
    path.setAttribute('stroke-width','2');
    svg.appendChild(path);
  });

  // nodes
  nodes.forEach(n=>{
    const p = pos.get(n.task_template_id); if (!p) return;
    const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    const rect = document.createElementNS('http://www.w3.org/2000/svg','rect');
    rect.setAttribute('x', p.x); rect.setAttribute('y', p.y);
    rect.setAttribute('rx','8'); rect.setAttribute('ry','8');
    rect.setAttribute('width', boxW); rect.setAttribute('height', boxH);
    rect.setAttribute('fill','#fff'); rect.setAttribute('stroke','#99b');
    rect.setAttribute('stroke-width','1.2');
    const text = document.createElementNS('http://www.w3.org/2000/svg','text');
    text.setAttribute('x', p.x + boxW/2);
    text.setAttribute('y', p.y + boxH/2 + 4);
    text.setAttribute('text-anchor','middle');
    text.setAttribute('font-size','12');
    text.textContent = n.template_name || (`#${n.task_template_id}`);
    g.appendChild(rect); g.appendChild(text);
    svg.appendChild(g);
  });
}

// ---------- 탭 진입 시 바인딩 ----------
document.addEventListener('DOMContentLoaded', () => {
  const visible = document.querySelector('#panel-flow') && !document.querySelector('#panel-flow')?.classList.contains('hidden');
  if (visible) bindOnce();
});
document.addEventListener('click', (e) => {
  const btn = e.target.closest('#tabFlow'); if (!btn) return;
  setTimeout(() => {
    const panel = document.querySelector('#panel-flow');
    if (panel && !panel.classList.contains('hidden')) bindOnce();
  }, 0);
});
