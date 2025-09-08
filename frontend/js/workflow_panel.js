// /frontend/js/workflow_panel.js
import { State, esc, toast, authFetch, EP_TASK_TEMPLATES } from './db_shared.js';

// 이 모듈의 모든 로직을 초기화하고 이벤트 리스너를 바인딩합니다.
export function initWorkflowPanel() {
  // 1) 폼 자동제출(페이지 리로드) 방지: 폼 id가 있다면 꼭 막아주기
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

  // 4) 리스트 클릭 델리게이션(그대로 유지)
  const tableWrap = document.querySelector('.task-list-wrap');
  if (tableWrap) {
    tableWrap.addEventListener('click', (e) => {
      const tr = e.target.closest('tr.task-list-item');
      if (!tr) return;

      tableWrap.querySelectorAll('tr.task-list-item').forEach(i => i.classList.remove('active'));
      tr.classList.add('active');

      const templateId = Number(tr.dataset.id);
      const template = State.taskTemplates.find(t => Number(t.task_template_id) === templateId);
      if (template) showTaskTemplateForm(template);
    });
  }
}


// ===== 업무 정보 관리 =====
export async function loadTaskTemplates() {
  try {
    const res = await authFetch(EP_TASK_TEMPLATES);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || "업무 템플릿 로드 실패");
    State.taskTemplates = Array.isArray(data?.task_templates) ? data.task_templates : [];
    State.teamResponsibilities = Array.isArray(data?.responsibilities) ? data.responsibilities : [];
    renderTaskTemplateList();
    populateResponsibilityDropdown();
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
}

function populateResponsibilityDropdown() {
  const selectEl = document.getElementById("selTaskResp");
  if (!selectEl) return;
  if (!State.teamResponsibilities.length) {
    selectEl.innerHTML = `<option value="">(권한 없음/목록 없음)</option>`;
    return;
  }
  selectEl.innerHTML = State.teamResponsibilities.map(r =>
    `<option value="${r.responsibility_id}">${esc(r.responsibility_name)}</option>`
  ).join('');
}

function showNewTaskTemplateForm() {
    document.querySelectorAll('#taskListBody tr.task-list-item').forEach(i => i.classList.remove('active'));
    showTaskTemplateForm({});
}

function showTaskTemplateForm(template) {
  document.getElementById("taskForm")?.classList.remove("hidden");
  document.getElementById("taskFormPlaceholder")?.classList.add("hidden");

  const isNew = !template.task_template_id;
  document.getElementById("taskFormTitle").textContent = isNew ? "새 업무 템플릿 생성" : "업무 템플릿 편집";
  document.getElementById("btnDeleteTaskTemplate").classList.toggle("hidden", isNew);

  document.getElementById("inpTaskId").value         = template.task_template_id ?? "";
  document.getElementById("inpTaskName").value       = template.template_name ?? "";
  document.getElementById("inpTaskType").value       = template.task_type ?? "";
  document.getElementById("inpTaskCategory").value   = template.category ?? '';
  document.getElementById("inpTaskDesc").value       = template.description ?? '';
  document.getElementById("selTaskResp").value       = template.required_responsibility_id ?? "";
}

async function onSaveTaskTemplate() {
  const templateId = document.getElementById("inpTaskId")?.value;
  const isNew = !templateId;

  const payload = {
    template_name: document.getElementById("inpTaskName")?.value ?? "",
    task_type: document.getElementById("inpTaskType")?.value ?? "",
    category: document.getElementById("inpTaskCategory")?.value ?? "",
    description: document.getElementById("inpTaskDesc")?.value ?? "",
    required_responsibility_id: Number(document.getElementById("selTaskResp")?.value ?? 0) || null,
  };

  if (!payload.template_name) {
      return toast("템플릿 이름은 필수입니다.");
  }

  const url = isNew ? EP_TASK_TEMPLATES : `${EP_TASK_TEMPLATES}/${templateId}`;
  const method = isNew ? 'POST' : 'PUT';

  try {
    const res = await authFetch(url, {
      method,
      body: JSON.stringify(payload)
    });

    const responseText = await res.text();
    
    if (!res.ok) {
        let errorMessage = "저장 실패";
        try {
            const errorData = JSON.parse(responseText);
            errorMessage = errorData.message || errorMessage;
        } catch (e) {}
        throw new Error(errorMessage);
    }

    const data = responseText ? JSON.parse(responseText) : {};
    toast(data.message || "저장되었습니다.");
    
    await loadTaskTemplates();

    if (isNew && data.task_template_id) {
        setTimeout(() => {
            const newNode = document.querySelector(`tr[data-id='${data.task_template_id}']`);
            if (newNode) newNode.click();
        }, 100);
    } else if (!isNew) {
        setTimeout(() => {
            const updatedNode = document.querySelector(`tr[data-id='${templateId}']`);
            if (updatedNode) updatedNode.classList.add('active');
        }, 100);
    }

  } catch (e) {
    console.error(e);
    toast(e.message || "저장 실패");
  }
}