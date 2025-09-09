// /frontend/js/workflow_template_panel.js
// panel-flow: 목록/폼 + 정의 CRUD + 실시간 그래프

import { authFetch, esc, toast, EP_WORKFLOW_TEMPLATES } from './db_management.js';

const WF = {
  loaded: false,
  list: [],
  selectedId: null,
  defs: [],
  nodes: [],
  candidates: [],
};

function qs(id){ return document.getElementById(id); }
function show(el){ el?.classList.remove('hidden'); }
function hide(el){ el?.classList.add('hidden'); }
async function safeText(res){ try{ return await res.text(); }catch{ return String(res.status); } }

// ---------- 초기 바인딩 ----------
function bindOnce(){
  if (WF.loaded) return;
  WF.loaded = true;

  const $tbody   = qs('workflowListBody');
  const $form    = qs('workflowForm');
  const $formPh  = qs('workflowFormPlaceholder');
  const $id      = qs('inpWorkflowId');
  const $name    = qs('inpWorkflowName');
  const $desc    = qs('inpWorkflowDesc');

  const $btnNew    = qs('btnNewWorkflowTemplate');
  const $btnSave   = qs('btnSaveWorkflowTemplate');
  const $btnDelete = qs('btnDeleteWorkflowTemplate');
  const $btnDuplicate = qs('btnDuplicateWorkflowTemplate');


  // 정의 관련
  const $defsBody   = qs('defsBody');
  const $selAddTask = qs('selAddTask');
  const $selAddDep  = qs('selAddDepends');
  const $btnAddDef  = qs('btnAddDef');

  // ★ 새로 추가: 가운데/오른쪽 카드 자체를 제어
  const $formCard  = document.querySelector('.workflow-form-pane');
  const $graphCard = document.querySelector('.workflow-graph-pane');
  const hideWorkPanes = () => { hide($formCard); hide($graphCard); };
  const showWorkPanes = () => { show($formCard); show($graphCard); };

  // 처음 진입 시에는 감춤
  hideWorkPanes();

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
      showWorkPanes();          // ★ 선택하면 카드 노출
      refreshDefinitions();
    }
  });

  // 새로 만들기
  $btnNew?.addEventListener('click', () => {
    WF.selectedId = null;
    fillForm({ workflow_template_id: '', template_name: '', description: '' });
    highlightRow(null);
    clearDefsUI();
    showWorkPanes();            // ★ 새로 만들 때도 카드 노출
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
    hideWorkPanes();            // ★ 선택 해제 상태이므로 카드 감춤
  });

  // 복제
  $btnDuplicate?.addEventListener('click', async () => {
    if (!WF.selectedId) return toast('복제할 항목을 선택하세요.', 'warn');
    if (!confirm('이 흐름도를 복제하시겠습니까?')) return;

    const res = await authFetch(`${EP_WORKFLOW_TEMPLATES}/${WF.selectedId}/duplicate`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
    });

    if (!res.ok) {
        return toast(`복제 실패: ${await safeText(res)}`, 'error');
    }

    const duplicated = await res.json().catch(() => ({}));
    toast('흐름도가 복제되었습니다.');

    await loadList();
    renderList();

    // 새로 복제된 아이템을 선택
    WF.selectedId = duplicated?.workflow_template_id ?? null;
    const item = WF.list.find(x => x.workflow_template_id === WF.selectedId);
    if (item) {
        fillForm(item);
        highlightRow(WF.selectedId);
        await refreshDefinitions();
    }
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

  // ★ 모달 이벤트 핸들러 추가
  qs('btnGraphExpand')?.addEventListener('click', openGraphModal);
  qs('btnGraphClose')?.addEventListener('click', closeGraphModal);
  qs('graphModal')?.querySelector('.modal-backdrop')?.addEventListener('click', closeGraphModal);


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
  if (selTask) selTask.innerHTML = '';
  if (selDep) selDep.innerHTML = '<option value="">(선행 없음)</option>';
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

  const nodes = getNodesFromDefs();
  selDep.innerHTML = `<option value="">(선행 없음)</option>` + nodes.map(n =>
    `<option value="${esc(n.task_template_id)}">${esc(n.template_name)}</option>`).join('');
}

function getNodesFromDefs(){
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
// ──────────────────────────────────────────────
// === 색상 & 라벨 줄바꿈 helpers (이전 버전 사용 중이면 그대로 둬도 OK) ===
function colorForCategory(cat) {
  const FIXED = {
    'HACCP':     { fill:'#EAF5FF', stroke:'#4A90E2' },
    'Quality':   { fill:'#FFF4E6', stroke:'#F5A623' },
    'Safety':    { fill:'#F0F9F0', stroke:'#66BB6A' },
    'R&D':       { fill:'#F6ECFF', stroke:'#9B59B6' },
    'Production':{ fill:'#FFF0F0', stroke:'#E57373' },
  };
  if (cat && FIXED[cat]) return FIXED[cat];
  if (!cat) return { fill:'#FFFFFF', stroke:'#99B' };
  const PASTELS = [
    ['#EAF5FF','#4A90E2'],['#F0F9F0','#66BB6A'],['#FFF4E6','#F5A623'],
    ['#F6ECFF','#9B59B6'],['#FFF0F0','#E57373'],['#EEF4FF','#4C8DFF'],
  ];
  let h = 0; for (let i=0;i<cat.length;i++) h = (h*31 + cat.charCodeAt(i))>>>0;
  const [fill, stroke] = PASTELS[h % PASTELS.length];
  return { fill, stroke };
}
function wrapLabelToTspans(textEl, label, maxWidth, fontSize=12, maxLines=3) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `${fontSize}px sans-serif`;
  const measure = s => ctx.measureText(s).width;

  // 단어 기반 → 없으면 문자 기반
  const words = (label||'').toString().split(/\s+/).filter(Boolean);
  const lines = []; let cur = '';
  const push = s => lines.push(s.trim());

  if (words.length) {
    for (const w of words) {
      const tryStr = cur ? `${cur} ${w}` : w;
      if (measure(tryStr) <= maxWidth) cur = tryStr;
      else { if (cur) push(cur); cur = w; if (lines.length >= maxLines-1) break; }
    }
    if (cur && lines.length < maxLines) push(cur);
  } else {
    let buf = '';
    for (const ch of (label||'')) {
      if (measure(buf + ch) <= maxWidth) buf += ch;
      else { push(buf); buf = ch; if (lines.length >= maxLines-1) break; }
    }
    if (buf && lines.length < maxLines) push(buf);
  }
  const last = lines[lines.length-1] || '';
  if (measure(last) > maxWidth) {
    let s = last; while (s && measure(s+'…') > maxWidth) s = s.slice(0,-1);
    lines[lines.length-1] = s+'…';
  }
  textEl.textContent = '';
  const lh = fontSize + 2;
  const startDy = -((lines.length-1)*lh)/2;
  lines.forEach((line,i)=>{
    const tspan = document.createElementNS('http://www.w3.org/2000/svg','tspan');
    tspan.setAttribute('x', textEl.getAttribute('x'));
    tspan.setAttribute('dy', i===0 ? startDy : lh);
    tspan.textContent = line;
    textEl.appendChild(tspan);
  });
}

// ---------- 탭 진입 시 바인딩 ----------
document.addEventListener('panel:activated', (e) => {
  if (e.detail.targetId === '#panel-flow') {
    bindOnce();
  }
});

// === 모달 열고/닫기 ===
function openGraphModal() {
  const modal = document.getElementById('graphModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  drawGraph('workflowGraphModal'); // 모달 캔버스에 즉시 렌더
}
function closeGraphModal() {
  const modal = document.getElementById('graphModal');
  if (modal) modal.classList.add('hidden');
}

// === DAG 렌더러 (레이어 스윕 + 곡선 라우팅 + 간격 확장) ===
function drawGraph(targetId = 'workflowGraph') {
  const prefix = targetId.replace(/[^\w-]/g, '');
  const BOX  = { w: 120, h: 84, rx: 12, ry: 12, padX: 16, padY: 8 };
  // ★ 상하 간격을 기존 24에서 48로 늘려서 시각적 여유 확보
  const GAP  = { col: 160, row: 48, canvas: 24 };
  const FONT = 12;

  // 1) 노드/엣지 구성
  const nodes = (() => {
    const idSet = new Map();
    WF.defs.forEach(d => {
      if (d.task_template_id) idSet.set(d.task_template_id, d.task_template_name);
      if (d.depends_on_task_template_id) idSet.set(d.depends_on_task_template_id, d.depends_on_task_template_name);
    });
    return Array.from(idSet.entries()).map(([id, name]) => ({ id, name }));
  })();
  const edges = WF.defs
    .filter(d => d.depends_on_task_template_id)
    .map(d => ({ from: d.depends_on_task_template_id, to: d.task_template_id }));

  // 카테고리 색
  const catMap = new Map();
  (WF.nodes || []).forEach(n => { if (n?.category != null) catMap.set(n.task_template_id, n.category); });
  (WF.candidates || []).forEach(n => { if (n?.category != null && !catMap.has(n.task_template_id)) catMap.set(n.task_template_id, n.category); });

  // 빠른 조회
  const N = new Map(nodes.map(n => [n.id, { ...n, in: [], out: [] }]));
  edges.forEach(e => { N.get(e.from)?.out.push(e); N.get(e.to)?.in.push(e); });

  // 2) 레벨(열) 배치
  const { level, maxLevel } = computeLevels(N, edges);

  // 3) 레이어 배열
  let layers = Array.from({ length: maxLevel + 1 }, () => []);
  nodes.forEach(n => layers[level.get(n.id)].push(n.id));

  // 4) 레이어 순서 최적화 (교차 최소화)
  layers = orderLayersByBarycenter(layers, N, 3);

  // 5) 위치 계산
  const colX = L => GAP.canvas + L * (BOX.w + GAP.col);
  const colHeights = layers.map(col => col.length * BOX.h + Math.max(0, col.length - 1) * GAP.row);
  const maxW = colX(maxLevel) + BOX.w + GAP.canvas;
  const maxH = Math.max(...colHeights, 0) + GAP.canvas * 2;

  const pos = new Map();
  layers.forEach((col, L) => {
    const totalH = colHeights[L] || 0;
    const startY = GAP.canvas + Math.max(0, (maxH - GAP.canvas * 2 - totalH) / 2);
    col.forEach((nodeId, i) => pos.set(nodeId, { x: colX(L), y: startY + i * (BOX.h + GAP.row) }));
  });

  // 6) SVG 렌더링
  const wrap = document.getElementById(targetId); if (!wrap) return;
  wrap.innerHTML = '';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('viewBox', `0 0 ${Math.max(maxW, 640)} ${Math.max(maxH, 360)}`);
  wrap.appendChild(svg);

  // Defs (정의)
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  // Grid
  const patId = `${prefix}-grid`;
  const pat = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
  pat.setAttribute('id', patId);
  pat.setAttribute('patternUnits', 'userSpaceOnUse');
  pat.setAttribute('width', '16'); pat.setAttribute('height', '16');
  const gline = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  gline.setAttribute('d', 'M 16 0 L 0 0 0 16');
  gline.setAttribute('fill', 'none'); gline.setAttribute('stroke', '#EFF3F8'); gline.setAttribute('stroke-width', '1');
  pat.appendChild(gline); defs.appendChild(pat);
  // Arrow
  const arrowId = `${prefix}-arrow`;
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', arrowId); marker.setAttribute('orient', 'auto');
  marker.setAttribute('markerWidth', '10'); marker.setAttribute('markerHeight', '10');
  marker.setAttribute('refX', '8'); marker.setAttribute('refY', '3.5');
  const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  arrowPath.setAttribute('d', 'M0,0 L8,3.5 L0,7 Z'); arrowPath.setAttribute('fill', '#97A3B6');
  marker.appendChild(arrowPath); defs.appendChild(marker);
  // Shadow
  const shadowId = `${prefix}-nodeShadow`;
  const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
  filter.setAttribute('id', shadowId);
  filter.setAttribute('x', '-20%'); filter.setAttribute('y', '-20%');
  filter.setAttribute('width', '140%'); filter.setAttribute('height', '140%');
  const fe = document.createElementNS('http://www.w3.org/2000/svg', 'feDropShadow');
  fe.setAttribute('dx', '0'); fe.setAttribute('dy', '1.2'); fe.setAttribute('stdDeviation', '1.6');
  fe.setAttribute('flood-color', '#000'); fe.setAttribute('flood-opacity', '0.16');
  filter.appendChild(fe); defs.appendChild(filter);
  svg.appendChild(defs);

  // 배경
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', '0'); bg.setAttribute('y', '0');
  bg.setAttribute('width', Math.max(maxW, 640)); bg.setAttribute('height', Math.max(maxH, 360));
  bg.setAttribute('fill', `url(#${patId})`);
  svg.appendChild(bg);

  // 7) 간선 라우팅 (★ 곡선으로 변경)
  edges.forEach(e => {
    const a = pos.get(e.from), b = pos.get(e.to);
    if (!a || !b) return;

    const x1 = a.x + BOX.w, y1 = a.y + BOX.h / 2;
    const x2 = b.x,          y2 = b.y + BOX.h / 2;

    // 수평 제어점 오프셋: 두 노드 x좌표 차이의 절반으로 설정하여 부드러운 S-커브 생성
    const curveFactor = (x2 - x1) * 0.5;
    const c1x = x1 + curveFactor;
    const c1y = y1;
    const c2x = x2 - curveFactor;
    const c2y = y2;

    const d = `M${x1},${y1} C${c1x},${c1y} ${c2x},${c2y} ${x2},${y2}`;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#97A3B6');
    path.setAttribute('stroke-width', '1.8');
    path.setAttribute('marker-end', `url(#${arrowId})`);
    svg.appendChild(path);
  });

  // 8) 노드 + 라벨 렌더링
  nodes.forEach(n => {
    const p = pos.get(n.id); if (!p) return;
    const cat = catMap.get(n.id) || null;
    const { fill, stroke } = colorForCategory(cat);

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', p.x); rect.setAttribute('y', p.y);
    rect.setAttribute('rx', String(BOX.rx)); rect.setAttribute('ry', String(BOX.ry));
    rect.setAttribute('width', String(BOX.w)); rect.setAttribute('height', String(BOX.h));
    rect.setAttribute('fill', fill); rect.setAttribute('stroke', stroke);
    rect.setAttribute('stroke-width', '1.4'); rect.setAttribute('filter', `url(#${shadowId})`);
    rect.addEventListener('mouseenter', () => rect.setAttribute('stroke-width', '2'));
    rect.addEventListener('mouseleave', () => rect.setAttribute('stroke-width', '1.4'));

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', p.x + BOX.w / 2);
    text.setAttribute('y', p.y + BOX.h / 2 + 1);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', String(FONT));
    text.setAttribute('fill', '#111');

    g.appendChild(rect); g.appendChild(text); svg.appendChild(g);

    wrapLabelToTspans(text, n.name || (`#${n.id}`), BOX.w - BOX.padX * 2, FONT, 3);
  });
}

/* ---------- helpers (그대로 파일 하단에 두세요) ---------- */

// Kahn + 긴 경로 우선
function computeLevels(N, edges) {
  const indeg = new Map(); const adj = new Map();
  N.forEach((v, id) => { indeg.set(id, 0); adj.set(id, []); });
  edges.forEach(e => {
    if (!adj.has(e.from) || !indeg.has(e.to)) return;
    adj.get(e.from).push(e.to);
    indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
  });

  const q = []; indeg.forEach((v, k) => { if (v === 0) q.push(k); });
  const level = new Map(); q.forEach(k => level.set(k, 0));

  while (q.length) {
    const u = q.shift();
    const lu = level.get(u) || 0;
    (adj.get(u) || []).forEach(v => {
      level.set(v, Math.max(level.get(v) || 0, lu + 1));
      indeg.set(v, (indeg.get(v) || 0) - 1);
      if (indeg.get(v) === 0) q.push(v);
    });
  }
  // 고립/사이클 보호
  N.forEach((_, id) => { if (!level.has(id)) level.set(id, 0); });

  const maxLevel = Math.max(...Array.from(level.values()), 0);
  return { level, maxLevel };
}

// 레이어 스윕(barycenter)
function orderLayersByBarycenter(layers, N, iter = 3) {
  const copy = layers.map(col => col.slice());

  const posOf = cols => {
    const m = new Map();
    cols.forEach(col => col.forEach((id, idx) => m.set(id, idx)));
    return m;
  };
  const bary = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : Number.POSITIVE_INFINITY;

  for (let k = 0; k < iter; k++) {
    // 위→아래
    let pos = posOf(copy);
    for (let L = 1; L < copy.length; L++) {
      copy[L].sort((a, b) => {
        const A = bary(N.get(a).in.map(e => pos.get(e.from)).filter(v => v != null));
        const B = bary(N.get(b).in.map(e => pos.get(e.from)).filter(v => v != null));
        return A - B || a - b;
      });
      pos = posOf(copy);
    }
    // 아래→위
    pos = posOf(copy);
    for (let L = copy.length - 2; L >= 0; L--) {
      copy[L].sort((a, b) => {
        const A = bary(N.get(a).out.map(e => pos.get(e.to)).filter(v => v != null));
        const B = bary(N.get(b).out.map(e => pos.get(e.to)).filter(v => v != null));
        return A - B || a - b;
      });
      pos = posOf(copy);
    }
  }
  return copy;
}