// /frontend/js/workflow_panel.js
import { State, esc, toast, authFetch, EP_TASK_TEMPLATES } from './db_management.js';

// 최근에 사용자가 선택했던 템플릿 id를 기억해서, 갱신 후에도 선택 유지
let lastSelectedTemplateId = null;

// 이 모듈의 모든 로직을 초기화하고 이벤트 리스너를 바인딩합니다.
export function initWorkflowPanel() {
  // 1) 폼 자동제출(페이지 리로드) 방지
  document.getElementById('taskForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  // 2) 새 템플릿 버튼
  document.getElementById("btnNewTaskTemplate")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    showNewTaskTemplateForm();
  });

  // 3) 저장 버튼: 기본 submit 동작 차단 후 저장 로직 호출
  document.getElementById("btnSaveTaskTemplate")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onSaveTaskTemplate();
  });

  // ✅ 4) '복사' 버튼 이벤트 리스너 추가
  document.getElementById("btnCopyTaskTemplate")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onCopyTaskTemplate();
  });

  // ✅ 5) '삭제' 버튼 이벤트 리스너 추가
  document.getElementById("btnDeleteTaskTemplate")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onDeleteTaskTemplate();
  });

  // 6) 리스트 클릭 델리게이션
  const tableWrap = document.querySelector('.task-list-wrap');
  if (tableWrap) {
    tableWrap.addEventListener('click', (e) => {
      const tr = e.target.closest('tr.task-list-item');
      if (!tr) return;

      tableWrap.querySelectorAll('tr.task-list-item').forEach(i => i.classList.remove('active'));
      tr.classList.add('active');

      const templateId = Number(tr.dataset.id);
      lastSelectedTemplateId = templateId; // ✅ 선택 기억
      const template = State.taskTemplates.find(t => Number(t.task_template_id) === templateId);
      if (template) showTaskTemplateForm(template);
    });
  }
}

// ✅ '복사' 버튼 클릭 시 실행될 함수 추가
function onCopyTaskTemplate() {
  if (!lastSelectedTemplateId) {
    toast("복사할 템플릿을 먼저 선택하세요.");
    return;
  }

  const originalTemplate = State.taskTemplates.find(t => Number(t.task_template_id) === Number(lastSelectedTemplateId));
  if (!originalTemplate) {
    toast("원본 템플릿 정보를 찾을 수 없습니다.");
    return;
  }

  // 원본을 복사하되, ID를 제거하여 '새 템플릿'으로 인식하게 만듭니다.
  const copiedTemplate = { ...originalTemplate };
  delete copiedTemplate.task_template_id;
  
  // 사용자가 쉽게 알아보도록 이름 뒤에 '(복사)'를 붙여줍니다.
  copiedTemplate.template_name = `${originalTemplate.template_name} (복사)`;

  // 복사된 정보로 폼을 채웁니다.
  showTaskTemplateForm(copiedTemplate);
}

// ✅ '삭제' 버튼 클릭 시 실행될 함수 추가
async function onDeleteTaskTemplate() {
  if (!lastSelectedTemplateId) {
    toast("삭제할 템플릿을 먼저 선택하세요.");
    return;
  }

  const templateToDelete = State.taskTemplates.find(t => Number(t.task_template_id) === Number(lastSelectedTemplateId));
  if (!templateToDelete) {
    toast("삭제할 템플릿 정보를 찾을 수 없습니다.");
    return;
  }

  if (!confirm(`'${templateToDelete.template_name}' 템플릿을 현재 팀에서 제거하시겠습니까?\n(다른 팀에서 사용하지 않는 경우 영구적으로 삭제됩니다.)`)) {
    return;
  }

  const btn = document.getElementById("btnDeleteTaskTemplate");
  btn && (btn.disabled = true);

  const url = `${EP_TASK_TEMPLATES}/${lastSelectedTemplateId}`;

  try {
    const res = await authFetch(url, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data?.message || "템플릿 삭제 실패");
    }

    toast(data?.message || "템플릿이 삭제되었습니다.");

    lastSelectedTemplateId = null; // 선택 해제
    await loadTaskTemplates(); // 목록 새로고침

    // 폼 숨기기
    document.getElementById("taskForm")?.classList.add("hidden");
    document.getElementById("taskFormPlaceholder")?.classList.remove("hidden");

  } catch (e) {
    console.error(e);
    toast(e.message || "템플릿 삭제 중 오류가 발생했습니다.");
  } finally {
    btn && (btn.disabled = false);
  }
}


/* =========================
 * ===== 업무 정보 관리 =====
 * ========================= */

export async function loadTaskTemplates() {
  try {
    const res = await authFetch(EP_TASK_TEMPLATES);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || "업무 템플릿 로드 실패");

    State.taskTemplates = Array.isArray(data?.task_templates) ? data.task_templates : [];
    State.teamResponsibilities = Array.isArray(data?.responsibilities) ? data.responsibilities : [];
    renderTaskTemplateList();
    populateResponsibilityDropdown();

    // ✅ 갱신 후에도 사용자가 보던 템플릿 유지
    if (lastSelectedTemplateId) {
      const found = State.taskTemplates.find(t => Number(t.task_template_id) === Number(lastSelectedTemplateId));
      if (found) {
        markActiveRow(lastSelectedTemplateId);
        showTaskTemplateForm(found);
      } else {
        // 사라졌다면 폼 숨김
        document.getElementById("taskForm")?.classList.add("hidden");
        document.getElementById("taskFormPlaceholder")?.classList.remove("hidden");
      }
    }
  } catch (e) {
    console.error(e);
    toast(e.message || "업무 템플릿 로드 실패");
    State.taskTemplates = [];
    State.teamResponsibilities = [];
    renderTaskTemplateList();
    populateResponsibilityDropdown();
  }
}

function renderTaskTemplateList() {
  const tbody = document.getElementById("taskListBody");
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!State.taskTemplates.length) {
    tbody.innerHTML = `<tr><td colspan="2" style="text-align:center; padding: 20px; color: #889;">템플릿이 없습니다.</td></tr>`;
    document.getElementById("taskForm")?.classList.add("hidden");
    document.getElementById("taskFormPlaceholder")?.classList.remove("hidden");
    return;
  }

  tbody.innerHTML = State.taskTemplates.map((t, index) => `
    <tr class="task-list-item" data-id="${t.task_template_id}">
      <td class="col-num">${index + 1}</td>
      <td>${esc(t.template_name)}</td>
    </tr>
  `).join('');

  // 리스트 리렌더 후, 이전 선택이 있다면 강조만 복구
  if (lastSelectedTemplateId) markActiveRow(lastSelectedTemplateId);
}

function markActiveRow(id) {
  const tbody = document.getElementById("taskListBody");
  if (!tbody) return;
  tbody.querySelectorAll('tr.task-list-item').forEach(i => i.classList.remove('active'));
  const row = tbody.querySelector(`tr.task-list-item[data-id="${id}"]`);
  row?.classList.add('active');
}

function populateResponsibilityDropdown() {
  const selectEl = document.getElementById("selTaskResp");
  if (!selectEl) return;
  if (!State.teamResponsibilities.length) {
    selectEl.innerHTML = `<option value=""> (권한 없음/목록 없음)</option>`;
    return;
  }
  selectEl.innerHTML = State.teamResponsibilities.map(r =>
    `<option value="${r.responsibility_id}">${esc(r.responsibility_name)}</option>`
  ).join('');
}

function showNewTaskTemplateForm() {
  document.querySelectorAll('#taskListBody tr.task-list-item').forEach(i => i.classList.remove('active'));
  lastSelectedTemplateId = null; // 새로 만들 땐 선택 해제
  showTaskTemplateForm({});
}

function showTaskTemplateForm(template) {
  if (!template || typeof template !== 'object') return;
  document.getElementById("taskForm")?.classList.remove("hidden");
  document.getElementById("taskFormPlaceholder")?.classList.add("hidden");

  const isNew = !template.task_template_id;
  document.getElementById("taskFormTitle").textContent = isNew ? "새 업무 템플릿 생성" : "업무 템플릿 편집";
  
  // ✅ '삭제'와 '복사' 버튼은 새 템플릿일 때 숨김
  document.getElementById("btnDeleteTaskTemplate").classList.toggle("hidden", isNew);
  document.getElementById("btnCopyTaskTemplate").classList.toggle("hidden", isNew);

  document.getElementById("inpTaskId").value         = template.task_template_id ?? "";
  document.getElementById("inpTaskName").value       = template.template_name ?? "";
  document.getElementById("inpTaskCategory").value   = template.category ?? '';
  document.getElementById("inpTaskDesc").value       = template.description ?? '';
  document.getElementById("selTaskResp").value       = template.required_responsibility_id ?? "";
}

/* ============== 
 * ===== 저장 ==== 
 * ============== */

export async function onSaveTaskTemplate() {
  const btn = document.getElementById("btnSaveTaskTemplate");
  btn && (btn.disabled = true);

  const templateId = document.getElementById("inpTaskId")?.value;
  const isNew = !templateId;

  const payload = {
    template_name: document.getElementById("inpTaskName")?.value ?? "",
    
    category: document.getElementById("inpTaskCategory")?.value ?? "",
    description: document.getElementById("inpTaskDesc")?.value ?? "",
    required_responsibility_id: Number(document.getElementById("selTaskResp")?.value ?? 0) || null,
  };

  if (!payload.template_name) {
    toast("템플릿 이름은 필수입니다.");
    btn && (btn.disabled = false);
    return;
  }

  const url = isNew ? EP_TASK_TEMPLATES : `${EP_TASK_TEMPLATES}/${templateId}`;
  const method = isNew ? 'POST' : 'PUT';

  // 👉 이벤트 루프 다음 tick으로 살짝 밀어서 간헐 cancel 완화 (옵션)
  setTimeout(async () => {
    try {
      const res = await authFetch(url, {
        method,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData?.message || "저장 실패");
      }

      // 성공 응답은 안전하게 json 파싱, 비어있어도 OK
      const data = await res.json().catch(() => ({}));

      toast(data?.message || "저장되었습니다.");

      // 새로 생성된 경우 id를 기억하여 선택 유지
      if (isNew && data?.task_template_id) {
        lastSelectedTemplateId = Number(data.task_template_id);
      } else if (!isNew) {
        lastSelectedTemplateId = Number(templateId);
      }
      await loadTaskTemplates();

      // 갱신 후 행 강조 복구 (loadTaskTemplates 내부에서도 수행하지만 한 번 더)
      if (lastSelectedTemplateId) {
        markActiveRow(lastSelectedTemplateId);
        // 바로 폼으로도 복원
        const found = State.taskTemplates.find(t => Number(t.task_template_id) === Number(lastSelectedTemplateId));
        if (found) showTaskTemplateForm(found);
      }
    } catch (e) {
      console.error(e);
      toast(e.message || "저장 실패");
      // 실패해도 현재 선택 유지 시도
      if (lastSelectedTemplateId) markActiveRow(lastSelectedTemplateId);
    } finally {
      btn && (btn.disabled = false);
    }
  }, 0);
}
