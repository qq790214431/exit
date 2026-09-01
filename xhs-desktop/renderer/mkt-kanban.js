// ============ 功能模块：S5 执行看板（拖拽） ============
// 通过 window.MKT.registerStageButton("execution", "执行看板", fn) 注册
// 全屏三列看板（待办 / 进行中 / 已完成），HTML5 拖拽卡片跨列即更新任务状态并保存。
// 任务行结构：[任务, 负责人, 截止日期, 关联, 状态]，状态为下标 4（第 5 列）。
window.MKT = window.MKT || {};

(function () {
  "use strict";

  const KANBAN_STATUSES = ["待办", "进行中", "已完成"];

  const KANBAN_CSS = `
#kanbanMask{position:fixed;inset:0;z-index:9997;background:rgba(3,6,12,.84);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box}
#kanbanMask .knb-panel{width:min(1180px,96vw);height:min(86vh,860px);background:#0a1322;border:1px solid rgba(0,229,255,.45);border-radius:16px;box-shadow:0 0 70px rgba(0,229,255,.25);display:flex;flex-direction:column;overflow:hidden}
#kanbanMask .knb-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 20px;border-bottom:1px solid rgba(0,229,255,.16);flex-shrink:0}
#kanbanMask .knb-title{font-size:17px;font-weight:800;color:#00e5ff;letter-spacing:1px;text-shadow:0 0 14px rgba(0,229,255,.45)}
#kanbanMask .knb-sub{font-size:11px;color:#6b84b0;margin-top:4px;font-family:ui-monospace,Menlo,Consolas,monospace}
#kanbanMask .knb-close{padding:7px 18px;border-radius:8px;border:1px solid rgba(255,45,149,.55);color:#ff2d95;background:rgba(255,45,149,.08);cursor:pointer;font-size:12px;font-weight:700}
#kanbanMask .knb-close:hover{background:rgba(255,45,149,.22)}
#kanbanMask .knb-board{flex:1;display:flex;gap:14px;padding:16px 20px 20px;min-height:0;overflow:hidden}
#kanbanMask .knb-col{flex:1;min-width:0;display:flex;flex-direction:column;background:rgba(0,20,40,.45);border:1px solid rgba(0,229,255,.12);border-radius:12px;overflow:hidden;transition:border-color .15s,background .15s,box-shadow .15s}
#kanbanMask .knb-col.knb-over{border-color:rgba(0,229,255,.85);background:rgba(0,40,70,.6);box-shadow:inset 0 0 26px rgba(0,229,255,.3)}
#kanbanMask .knb-col-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(0,229,255,.12);flex-shrink:0}
#kanbanMask .knb-col-name{font-size:13px;font-weight:800;color:#d6e4ff;letter-spacing:1px}
#kanbanMask .knb-count{min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:rgba(0,229,255,.15);border:1px solid rgba(0,229,255,.35);color:#00e5ff;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center}
#kanbanMask .knb-col[data-status="进行中"] .knb-count{background:rgba(255,182,72,.15);border-color:rgba(255,182,72,.4);color:#ffb648}
#kanbanMask .knb-col[data-status="已完成"] .knb-count{background:rgba(0,255,157,.14);border-color:rgba(0,255,157,.4);color:#00ff9d}
#kanbanMask .knb-col-body{flex:1;padding:10px;display:flex;flex-direction:column;gap:10px;overflow-y:auto;min-height:120px}
#kanbanMask .knb-card{background:#101d33;border:1px solid rgba(0,229,255,.2);border-left:3px solid #ff2d95;border-radius:10px;padding:10px 12px;cursor:grab;transition:transform .12s,box-shadow .12s,border-color .12s;user-select:none}
#kanbanMask .knb-card:hover{border-color:rgba(0,229,255,.55);box-shadow:0 4px 18px rgba(0,229,255,.18);transform:translateY(-1px)}
#kanbanMask .knb-card:active{cursor:grabbing}
#kanbanMask .knb-card.knb-dragging{opacity:.4;transform:scale(.98)}
#kanbanMask .knb-col[data-status="进行中"] .knb-card{border-left-color:#ffb648}
#kanbanMask .knb-col[data-status="已完成"] .knb-card{border-left-color:#00ff9d}
#kanbanMask .knb-name{font-size:13px;font-weight:700;color:#eef4ff;line-height:1.45;word-break:break-word}
#kanbanMask .knb-meta{font-size:11px;color:#7fb4d4;line-height:1.5;margin-top:6px;word-break:break-word}
#kanbanMask .knb-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#4a638c;font-size:12px;border:1px dashed rgba(0,229,255,.18);border-radius:10px;padding:18px;text-align:center;min-height:90px;line-height:1.7}
`;

  let kanbanOpen = false;

  /* ---------- 数据 ---------- */
  // 确保 project.phases.execution.tasks 存在并返回任务数组
  function tasksOf(project) {
    project.phases = project.phases || {};
    project.phases.execution = project.phases.execution || {};
    if (!Array.isArray(project.phases.execution.tasks)) project.phases.execution.tasks = [];
    return project.phases.execution.tasks;
  }

  // 任务行：[任务, 负责人, 截止日期, 关联, 状态]，状态列是下标 4；空值默认「待办」
  function statusOf(row) {
    const s = String((row && row[4]) || "").trim();
    return KANBAN_STATUSES.includes(s) ? s : KANBAN_STATUSES[0];
  }

  /* ---------- 保存与全局同步 ---------- */
  function syncProjects(project) {
    const base = (window.MKT.projects && window.MKT.projects.projects) || [];
    if (!base.some((x) => x.id === project.id)) base.push(project);
    window.MKT.projects = { projects: base };
  }

  async function saveKanban(project) {
    try {
      const res = await window.api.saveProject(project);
      if (res && Array.isArray(res.projects)) {
        window.MKT.projects = res; // 用返回的最新列表同步全局
      } else {
        syncProjects(project);
      }
    } catch (err) {
      console.error("[执行看板] 保存失败", err);
      syncProjects(project); // 保存失败时至少让内存中的全局列表保持一致
    }
  }

  /* ---------- 关闭 ---------- */
  function kanbanClose() {
    const mask = document.getElementById("kanbanMask");
    if (mask) mask.remove();
    kanbanOpen = false;
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && kanbanOpen) kanbanClose();
  });

  /* ---------- 渲染 ---------- */
  function cardHTML(row, idx) {
    const meta = [
      row[1] ? "👤 " + esc(row[1]) : "",
      row[2] ? "📅 " + esc(row[2]) : "",
      row[3] ? "🔗 " + esc(row[3]) : ""
    ].filter(Boolean).map((s) => `<div class="knb-meta">${s}</div>`).join("");
    return `<div class="knb-card" draggable="true" data-idx="${idx}" title="拖拽到其他列更新状态">
      <div class="knb-name">${esc(row[0] || "（未命名任务）")}</div>
      ${meta}
    </div>`;
  }

  function boardHTML(tasks) {
    return KANBAN_STATUSES.map((status) => {
      const items = tasks.map((row, idx) => ({ row, idx })).filter((x) => statusOf(x.row) === status);
      const cards = items.map((x) => cardHTML(x.row, x.idx)).join("");
      return `<div class="knb-col" data-status="${status}">
        <div class="knb-col-head"><span class="knb-col-name">${status}</span><span class="knb-count">${items.length}</span></div>
        <div class="knb-col-body">${cards || `<div class="knb-empty">暂无${status}任务<br/>拖拽卡片到此列</div>`}</div>
      </div>`;
    }).join("");
  }

  function renderBoard(mask, project) {
    const tasks = tasksOf(project);
    const board = mask.querySelector(".knb-board");
    board.innerHTML = boardHTML(tasks);
    const sub = mask.querySelector(".knb-sub");
    if (sub) sub.textContent = `${project.name || "未命名项目"} · 共 ${tasks.length} 个任务 · 拖拽卡片到其他列更新状态`;
    wireDnD(mask, tasks, project);
  }

  /* ---------- HTML5 拖拽 ---------- */
  function wireDnD(mask, tasks, project) {
    let dragIdx = -1;

    mask.querySelectorAll(".knb-card").forEach((card) => {
      card.addEventListener("dragstart", (e) => {
        dragIdx = Number(card.dataset.idx);
        try { e.dataTransfer.setData("text/plain", String(dragIdx)); } catch (err) { /* 忽略 */ }
        e.dataTransfer.effectAllowed = "move";
        card.classList.add("knb-dragging");
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("knb-dragging");
        mask.querySelectorAll(".knb-col").forEach((c) => c.classList.remove("knb-over"));
      });
    });

    mask.querySelectorAll(".knb-col").forEach((col) => {
      col.addEventListener("dragover", (e) => {
        e.preventDefault(); // 必须阻止默认行为才能触发 drop
        e.dataTransfer.dropEffect = "move";
        col.classList.add("knb-over");
      });
      col.addEventListener("dragleave", () => col.classList.remove("knb-over"));
      col.addEventListener("drop", async (e) => {
        e.preventDefault();
        col.classList.remove("knb-over");
        const idx = Number(e.dataTransfer.getData("text/plain") || dragIdx);
        if (!Number.isInteger(idx) || idx < 0 || !tasks[idx]) return;
        const target = col.dataset.status;
        if (statusOf(tasks[idx]) === target) return; // 拖到同列不处理
        tasks[idx][4] = target; // 更新该任务状态列（行下标 4）
        renderBoard(mask, project); // 立即刷新列计数与空列提示
        // 若背后的 S5 行编辑器已渲染，同步状态输入框，避免关闭后表单显示旧值
        const inp = document.querySelector(`[data-row="tasks"][data-i="${idx}"][data-j="4"]`);
        if (inp) inp.value = target;
        await saveKanban(project); // 保存并同步 window.MKT.projects
      });
    });
  }

  /* ---------- 打开看板 ---------- */
  function openKanban(project) {
    kanbanClose(); // 渲染前移除旧遮罩

    // 样式只注入一次
    if (!document.getElementById("kanbanStyle")) {
      const st = document.createElement("style");
      st.id = "kanbanStyle";
      st.textContent = KANBAN_CSS;
      document.head.appendChild(st);
    }

    const mask = document.createElement("div");
    mask.id = "kanbanMask";
    mask.innerHTML = `
      <div class="knb-panel">
        <div class="knb-head">
          <div>
            <div class="knb-title">◇ S5 执行看板（拖拽）</div>
            <div class="knb-sub"></div>
          </div>
          <button class="knb-close" id="knbClose">✕ 关闭</button>
        </div>
        <div class="knb-board"></div>
      </div>`;
    document.body.appendChild(mask);
    kanbanOpen = true;

    document.getElementById("knbClose").onclick = kanbanClose;
    mask.addEventListener("click", (e) => { if (e.target === mask) kanbanClose(); }); // 点遮罩空白关闭

    renderBoard(mask, project);
  }

  /* ---------- 注册 S5 阶段按钮 ---------- */
  window.MKT.registerStageButton("execution", "执行看板", (project) => {
    openKanban(project || {});
  });
})();
