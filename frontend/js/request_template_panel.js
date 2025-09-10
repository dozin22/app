// /frontend/js/request_template_panel.js
import { State, esc, toast, authFetch, EP_REQUEST_TEMPLATES } from './db_management.js';

// 최근에 사용자가 선택했던 템플릿 id를 기억해서, 갱신 후에도 선택 유지
let lastSelectedTemplateId = null;

// 이 모듈의 모든 로직을 초기화하고 이벤트 리스너를 바인딩합니다.
export function initRequestTemplatePanel() {
  // 1) 폼 자동제출(페이지 리로드) 방지
  document.getElementById('requestForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  // 2) 새 템플릿 버튼
  document.getElementById("btnNewRequestTemplate")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    showNewRequestTemplateForm();
  });

  // 3) 저장 버튼: 기본 submit 동작 차단 후 저장 로직 호출
  document.getElementById("btnSaveRequestTemplate")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onSaveRequestTemplate();
  });

  // 4) '복사' 버튼 이벤트 리스너 추가
  document.getElementById("btnCopyRequestTemplate")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onCopyRequestTemplate();
  });

  // 5) '삭제' 버튼 이벤트 리스너 추가
  document.getElementById("btnDeleteRequestTemplate")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onDeleteRequestTemplate();
  });

  // 6) 리스트 클릭 델리게이션
  const tableWrap = document.querySelector('.request-list-wrap');
  if (tableWrap) {
    tableWrap.addEventListener('click', (e) => {
      const tr = e.target.closest('tr.request-list-item');
      if (!tr) return;

      tableWrap.querySelectorAll('tr.request-list-item').forEach(i => i.classList.remove('active'));
      tr.classList.add('active');

      const templateId = Number(tr.dataset.id);
      lastSelectedTemplateId = templateId; // ✅ 선택 기억
      const template = State.requestTemplates.find(t => Number(t.request_template_id) === templateId);
      if (template) showRequestTemplateForm(template);
    });
  }
}

// '복사' 버튼 클릭 시 실행될 함수 추가
function onCopyRequestTemplate() {
  if (!lastSelectedTemplateId) {
    toast("복사할 템플릿을 먼저 선택하세요.");
    return;
  }

  const originalTemplate = State.requestTemplates.find(t => Number(t.request_template_id) === Number(lastSelectedTemplateId));
  if (!originalTemplate) {
    toast("원본 템플릿 정보를 찾을 수 없습니다.");
    return;
  }

  const copiedTemplate = { ...originalTemplate };
  delete copiedTemplate.request_template_id;
  
  copiedTemplate.template_name = `${originalTemplate.template_name} (복사)`;

  showRequestTemplateForm(copiedTemplate);
}

// '삭제' 버튼 클릭 시 실행될 함수 추가
async function onDeleteRequestTemplate() {
  if (!lastSelectedTemplateId) {
    toast("삭제할 템플릿을 먼저 선택하세요.");
    return;
  }

  const templateToDelete = State.requestTemplates.find(t => Number(t.request_template_id) === Number(lastSelectedTemplateId));
  if (!templateToDelete) {
    toast("삭제할 템플릿 정보를 찾을 수 없습니다.");
    return;
  }

  if (!confirm(`'${templateToDelete.template_name}' 템플릿을 현재 팀에서 제거하시겠습니까?
(다른 팀에서 사용하지 않는 경우 영구적으로 삭제됩니다.)`)) {
    return;
  }

  const btn = document.getElementById("btnDeleteRequestTemplate");
  btn && (btn.disabled = true);

  const url = `${EP_REQUEST_TEMPLATES}/${lastSelectedTemplateId}`;

  try {
    const res = await authFetch(url, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data?.message || "템플릿 삭제 실패");
    }

    toast(data?.message || "템플릿이 삭제되었습니다.");

    lastSelectedTemplateId = null; // 선택 해제
    await loadRequestTemplates(); // 목록 새로고침

    document.getElementById("requestForm")?.classList.add("hidden");
    document.getElementById("requestFormPlaceholder")?.classList.remove("hidden");

  } catch (e) {
    console.error(e);
    toast(e.message || "템플릿 삭제 중 오류가 발생했습니다.");
  } finally {
    btn && (btn.disabled = false);
  }
}

/* =========================
 * ===== 요청 정보 관리 =====
 * ========================= */

export async function loadRequestTemplates() {
  try {
    const res = await authFetch(EP_REQUEST_TEMPLATES);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || "요청 템플릿 로드 실패");

    State.requestTemplates = Array.isArray(data?.request_templates) ? data.request_templates : [];
    renderRequestTemplateList();

    if (lastSelectedTemplateId) {
      const found = State.requestTemplates.find(t => Number(t.request_template_id) === Number(lastSelectedTemplateId));
      if (found) {
        markActiveRow(lastSelectedTemplateId);
        showRequestTemplateForm(found);
      } else {
        document.getElementById("requestForm")?.classList.add("hidden");
        document.getElementById("requestFormPlaceholder")?.classList.remove("hidden");
      }
    }
  } catch (e) {
    console.error(e);
    toast(e.message || "요청 템플릿 로드 실패");
    State.requestTemplates = [];
    renderRequestTemplateList();
  }
}

function renderRequestTemplateList() {
  const tbody = document.getElementById("requestListBody");
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!State.requestTemplates.length) {
    tbody.innerHTML = `<tr><td colspan="2" style="text-align:center; padding: 20px; color: #889;">템플릿이 없습니다.</td></tr>`;
    document.getElementById("requestForm")?.classList.add("hidden");
    document.getElementById("requestFormPlaceholder")?.classList.remove("hidden");
    return;
  }

  tbody.innerHTML = State.requestTemplates.map((t, index) => `
    <tr class="request-list-item" data-id="${t.request_template_id}">
      <td class="col-num">${index + 1}</td>
      <td>${esc(t.template_name)}</td>
    </tr>
  `).join('');

  if (lastSelectedTemplateId) markActiveRow(lastSelectedTemplateId);
}

function markActiveRow(id) {
  const tbody = document.getElementById("requestListBody");
  if (!tbody) return;
  tbody.querySelectorAll('tr.request-list-item').forEach(i => i.classList.remove('active'));
  const row = tbody.querySelector(`tr.request-list-item[data-id="${id}"]`);
  row?.classList.add('active');
}


function showNewRequestTemplateForm() {
  document.querySelectorAll('#requestListBody tr.request-list-item').forEach(i => i.classList.remove('active'));
  lastSelectedTemplateId = null;
  showRequestTemplateForm({});
}

function showRequestTemplateForm(template) {
  if (!template || typeof template !== 'object') return;
  document.getElementById("requestForm")?.classList.remove("hidden");
  document.getElementById("requestFormPlaceholder")?.classList.add("hidden");

  const isNew = !template.request_template_id;
  document.getElementById("requestFormTitle").textContent = isNew ? "새 요청 템플릿 생성" : "요청 템플릿 편집";
  
  document.getElementById("btnDeleteRequestTemplate").classList.toggle("hidden", isNew);
  document.getElementById("btnCopyRequestTemplate").classList.toggle("hidden", isNew);

  document.getElementById("inpRequestId").value         = template.request_template_id ?? "";
  document.getElementById("inpRequestName").value       = template.template_name ?? "";
  document.getElementById("inpRequestDesc").value       = template.description ?? '';
  
}

/* ============== 
 * ===== 저장 ==== 
 * ============== */

export async function onSaveRequestTemplate() {
  const btn = document.getElementById("btnSaveRequestTemplate");
  if (!btn) return;

  btn.disabled = true;
  btn.textContent = "저장 중...";

  const templateId = document.getElementById("inpRequestId")?.value;
  const isNew = !templateId;

  const payload = {
    template_name: document.getElementById("inpRequestName")?.value ?? "",
    category: document.getElementById("inpRequestCategory")?.value ?? "",
    description: document.getElementById("inpRequestDesc")?.value ?? "",
  };

  if (!payload.template_name) {
    toast("템플릿 이름은 필수입니다.");
    btn && (btn.disabled = false);
    btn.textContent = "저장";
    return;
  }

  const url = isNew ? EP_REQUEST_TEMPLATES : `${EP_REQUEST_TEMPLATES}/${templateId}`;
  const method = isNew ? 'POST' : 'PUT';

  setTimeout(async () => {
    try {
      const res = await authFetch(url, {
        method,
        body: JSON.stringify(payload)
      });

      const updatedRequestTemplate = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(updatedRequestTemplate?.message || "저장 실패");
      }

      if (isNew && updatedRequestTemplate?.request_template_id) {
        State.requestTemplates.push(updatedRequestTemplate);
        lastSelectedTemplateId = Number(updatedRequestTemplate.request_template_id);
      } else if (!isNew) {
        const index = State.requestTemplates.findIndex(t => Number(t.request_template_id) === Number(templateId));
        if (index !== -1) {
          State.requestTemplates[index] = { ...State.requestTemplates[index], ...updatedRequestTemplate };
        }
        lastSelectedTemplateId = Number(templateId);
      }

      requestAnimationFrame(() => {
        renderRequestTemplateList();
        toast(updatedRequestTemplate?.message || "저장되었습니다.");
      });

      if (lastSelectedTemplateId) {
        markActiveRow(lastSelectedTemplateId);
        const found = State.requestTemplates.find(t => Number(t.request_template_id) === Number(lastSelectedTemplateId));
        if (found) showRequestTemplateForm(found);
      }
    } catch (e) {
      console.error(e);
      toast(e.message || "저장 실패");
      if (lastSelectedTemplateId) markActiveRow(lastSelectedTemplateId);
    } finally {
      btn.disabled = false;
      btn.textContent = "저장";
    }
  }, 0);
}
