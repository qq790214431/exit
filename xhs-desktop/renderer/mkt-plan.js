// ============ 功能模块 B：S4 甘特排期视图 + 一页纸方案导出 ============
// 注册两个 S4「开发计划」阶段按钮：
//   1. 甘特排期   —— 里程碑 + 内容日历 → 全屏甘特视图（纯 DOM/CSS）
//   2. 一页纸方案 —— 生成紧凑 Markdown，复制到剪贴板（失败时用 alert 展示）
window.MKT = window.MKT || {};

(function () {
  "use strict";

  let ganttOpen = false;

  /* ---------- 时间解析（甘特时间轴用） ---------- */
  // "2026-09-05" / "2026/9/5" / "9月5日" / "9.5" → 自纪元的天数序号
  function gntDateNum(s) {
    if (s == null) return null;
    s = String(s).trim();
    if (!s) return null;
    let m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000;
    m = s.match(/(\d{1,2})[月./](\d{1,2})日?/);
    if (m) return Date.UTC(new Date().getFullYear(), +m[1] - 1, +m[2]) / 86400000;
    return null;
  }
  // "第1周" / "W2" / "week3" / "1"（allowBare=true 时纯数字也视为周次）→ 周号
  function gntWeekNum(s, allowBare) {
    if (s == null) return null;
    s = String(s).trim();
    if (!s) return null;
    const m = s.match(/(\d{1,2})/);
    if (!m) return null;
    return (s.includes("周") || /week/i.test(s) || s.includes("W") || allowBare) ? +m[1] : null;
  }
  function gntFmtDay(dn) {
    const d = new Date(dn * 86400000);
    return (d.getMonth() + 1) + "." + d.getDate();
  }

  /* ---------- 甘特视图样式（只注入一次，随遮罩挂载） ---------- */
  const GANTT_CSS = `
#ganttMask{position:fixed;inset:0;z-index:9999;background:rgba(3,6,12,.82);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box}
#ganttMask .gnt-panel{width:min(1120px,96vw);max-height:92vh;background:#0a1322;border:1px solid rgba(0,229,255,.5);border-radius:14px;box-shadow:0 0 60px rgba(0,229,255,.35);display:flex;flex-direction:column;overflow:hidden}
#ganttMask .gnt-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid rgba(0,229,255,.18)}
#ganttMask .gnt-title{font-size:16px;font-weight:800;color:#00e5ff;letter-spacing:1px;text-shadow:0 0 12px rgba(0,229,255,.5)}
#ganttMask .gnt-sub{font-size:11px;color:#6b84b0;font-family:ui-monospace,Menlo,Consolas,monospace;margin-top:3px}
#ganttMask .gnt-close{padding:6px 16px;border-radius:8px;border:1px solid rgba(255,45,149,.55);color:#ff2d95;background:rgba(255,45,149,.08);cursor:pointer;font-size:12px;font-weight:700}
#ganttMask .gnt-close:hover{background:rgba(255,45,149,.22)}
#ganttMask .gnt-body{overflow:auto;padding:12px 18px 18px}
#ganttMask .gnt-legend{display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:#7fb4d4;margin-bottom:10px}
#ganttMask .gnt-legend .lg{display:inline-flex;align-items:center;gap:5px}
#ganttMask .gnt-legend i{display:inline-block;width:12px;height:10px;border-radius:3px}
#ganttMask .sw-a{background:linear-gradient(90deg,#00e5ff,#00ff9d)}
#ganttMask .sw-b{background:linear-gradient(90deg,#00ff9d,#7dffb0)}
#ganttMask .sw-c{background:linear-gradient(90deg,#ffb648,#ff8c3a)}
#ganttMask .sw-d{width:0!important;height:0!important;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:10px solid #ff2d95;background:none!important;border-radius:0!important}
#ganttMask .gnt-sec-title{font-size:13px;font-weight:700;color:#7fb4d4;letter-spacing:1px;margin:14px 0 8px}
#ganttMask .gnt-row{display:flex;align-items:center;gap:10px;margin:3px 0}
#ganttMask .gnt-label{width:180px;flex-shrink:0;font-size:12px;color:#d6e4ff;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.3}
#ganttMask .gnt-label small{display:block;font-size:10px;color:#6b84b0;overflow:hidden;text-overflow:ellipsis}
#ganttMask .gnt-track{position:relative;flex:1;height:28px;background:rgba(0,20,40,.5);border-radius:6px;border:1px solid rgba(0,229,255,.1)}
#ganttMask .gnt-axis{height:30px;background:rgba(0,20,40,.35);overflow:hidden}
#ganttMask .gnt-grid{position:absolute;top:0;bottom:0;width:0;border-left:1px solid rgba(0,229,255,.08)}
#ganttMask .gnt-tick{position:absolute;top:0;bottom:0;border-left:1px dashed rgba(0,229,255,.25)}
#ganttMask .gnt-tick span{position:absolute;top:3px;left:5px;font-size:10px;color:#6b84b0;white-space:nowrap}
#ganttMask .gnt-bar{position:absolute;top:6px;height:16px;border-radius:4px;min-width:6px;box-shadow:0 0 8px rgba(0,229,255,.4)}
#ganttMask .gnt-bar.c-content{background:linear-gradient(90deg,#00e5ff,#00ff9d)}
#ganttMask .gnt-bar.c-done{background:linear-gradient(90deg,#00ff9d,#7dffb0)}
#ganttMask .gnt-bar.c-doing{background:linear-gradient(90deg,#ffb648,#ff8c3a)}
#ganttMask .gnt-flag{position:absolute;top:4px;left:0;width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:13px solid #ff2d95;transform:translateX(-50%);filter:drop-shadow(0 0 6px rgba(255,45,149,.8))}
#ganttMask .gnt-pending{font-size:12px;color:#ffb648;margin-top:12px;line-height:1.7}
#ganttMask .gnt-bar.gnt-draggable{cursor:grab}
#ganttMask .gnt-bar.gnt-dragging{opacity:.45;cursor:grabbing}
#ganttMask .gnt-track.drag-over{outline:2px dashed rgba(0,229,255,.65);outline-offset:-2px;background:rgba(0,229,255,.08)}
`;

  /* ---------- 甘特排期渲染 ---------- */
  window.MKT.renderGantt = function renderGantt(project) {
    // 先清掉旧遮罩，避免残留
    const old = document.getElementById("ganttMask");
    if (old) old.remove();
    ganttOpen = false;

    const ph = (project && project.phases && project.phases.plan) || {};
    const milestones = Array.isArray(ph.milestones) ? ph.milestones : [];
    const calendar = Array.isArray(ph.content_calendar) ? ph.content_calendar : [];
    if (!milestones.length && !calendar.length) {
      window.alert("暂无甘特数据：请先在 S4 填写「里程碑」与「内容日历」");
      return;
    }

    // 组装条目（milestones: [里程碑,日期,验收标准]；content_calendar: [周次,选题,格式,卖点,达人,发布日期,状态]）
    const items = [];
    milestones.forEach((r, i) => {
      items.push({
        kind: "milestone", i,
        name: String(r[0] || "").trim() || ("里程碑 " + (i + 1)),
        raw: String(r[1] || "").trim(),
        accept: String(r[2] || "").trim(),
        date: gntDateNum(r[1]),
        week: gntWeekNum(r[1], false)
      });
    });
    calendar.forEach((r, i) => {
      items.push({
        kind: "content", i,
        topic: String(r[1] || "").trim() || ("内容 " + (i + 1)),
        format: String(r[2] || "").trim(),
        selling: String(r[3] || "").trim(),
        creator: String(r[4] || "").trim(),
        status: String(r[6] || "").trim(),
        date: gntDateNum(r[5]),
        week: gntWeekNum(r[0], true)
      });
    });

    // 时间轴模式：有真实日期 → 按天（一格≈1周）；否则按周号
    const hasDate = items.some(it => it.date != null);
    const minDate = hasDate ? Math.min(...items.map(it => it.date).filter(v => v != null)) : 0;
    const refWeek = hasDate ? Math.floor(minDate / 7) : 1;
    const pending = [];

    items.forEach(it => {
      if (hasDate) {
        if (it.date != null) {
          it.pos = it.date;
          it.end = it.kind === "content" ? it.date + 6 : it.date;   // 内容按一周跨度
        } else if (it.week != null) {
          it.pos = minDate + (it.week - refWeek) * 7;
          it.end = it.kind === "content" ? it.pos + 6 : it.pos;
        } else pending.push(it);
      } else {
        if (it.week != null) {
          it.pos = it.week;
          it.end = it.kind === "content" ? it.week + 0.9 : it.week;
        } else if (it.date != null) {
          const wk = Math.floor(it.date / 7) - refWeek + 1;
          it.pos = wk;
          it.end = it.kind === "content" ? wk + 0.9 : wk;
        } else pending.push(it);
      }
    });

    const placed = items.filter(it => it.pos != null);
    if (!placed.length) {
      window.alert("无法识别排期时间：请使用「2026-09-05」「9月5日」或「第1周」等格式");
      return;
    }
    let min = Math.min(...placed.map(it => it.pos));
    let max = Math.max(...placed.map(it => it.end));
    if (max <= min) max = min + (hasDate ? 6 : 1);
    const span = max - min + 1;
    const pct = x => ((x - min) / span) * 100;

    // 时间轴刻度 + 每行网格线
    let axisTicks = "", gridLines = "";
    if (hasDate) {
      for (let t = Math.floor(min / 7) * 7; t <= max; t += 7) {
        if (t < min) continue;
        axisTicks += `<div class="gnt-tick" style="left:${pct(t)}%"><span>${gntFmtDay(t)}</span></div>`;
        gridLines += `<div class="gnt-grid" style="left:${pct(t)}%"></div>`;
      }
    } else {
      for (let t = min; t <= max; t += 1) {
        axisTicks += `<div class="gnt-tick" style="left:${pct(t)}%"><span>第${t}周</span></div>`;
        gridLines += `<div class="gnt-grid" style="left:${pct(t)}%"></div>`;
      }
    }

    function tipOf(it) {
      if (it.kind === "milestone") {
        return `里程碑：${it.name}\n日期：${it.raw || "未填"}\n验收：${it.accept || "未填"}`;
      }
      return `选题：${it.topic}\n达人：${it.creator || "未填"} · 格式：${it.format || "未填"}\n发布日期：${it.raw || "未填"}\n状态：${it.status || "未填"}`;
    }

    function barHTML(it) {
      const tip = esc(tipOf(it));
      if (it.kind === "milestone") {
        return `<div class="gnt-flag" style="left:${pct(it.pos)}%" title="${tip}"></div>`;
      }
      const cls = /已发布|已完成|发布/.test(it.status) ? "c-done"
        : (/进行中|执行/.test(it.status) ? "c-doing" : "c-content");
      const draggable = /排期|进行/.test(it.status);
      const w = Math.max(pct(it.end) - pct(it.pos), 1);
      return `<div class="gnt-bar ${cls}${draggable ? " gnt-draggable" : ""}" style="left:${pct(it.pos)}%;width:${w}%" title="${tip}"${draggable ? ` draggable="true" data-idx="${it.i}"` : ""}></div>`;
    }

    function labelHTML(it) {
      if (it.kind === "milestone") {
        const sub = (it.raw || "未填日期") + (it.accept ? " · " + (it.accept.length > 18 ? it.accept.slice(0, 18) + "…" : it.accept) : "");
        return esc(it.name) + `<small>${esc(sub)}</small>`;
      }
      const who = [it.creator, it.format].filter(Boolean).join(" · ");
      return esc(it.topic) + `<small>${esc(who || "未填达人/格式")}</small>`;
    }

    function rowHTML(it) {
      return `<div class="gnt-row"><div class="gnt-label" title="${esc(tipOf(it))}">${labelHTML(it)}</div><div class="gnt-track">${gridLines}${barHTML(it)}</div></div>`;
    }

    function section(title, kind) {
      const list = placed.filter(it => it.kind === kind).sort((a, b) => a.pos - b.pos);
      if (!list.length) return "";
      return `<div class="gnt-sec-title">${title}（${list.length}）</div>` + list.map(rowHTML).join("");
    }

    const pendNote = pending.length
      ? `<div class="gnt-pending">⚠ 未识别到日期/周次、未上时间轴：${pending.map(it => esc(it.kind === "milestone" ? it.name : it.topic)).join("、")}</div>`
      : "";

    const sub = hasDate
      ? `时间轴 ${gntFmtDay(min)} ~ ${gntFmtDay(max)}（按天 · 一周一格）`
      : `时间轴 第${min}周 ~ 第${max}周（按周）`;

    // 样式只注入一次
    if (!document.getElementById("ganttStyle")) {
      const st = document.createElement("style");
      st.id = "ganttStyle";
      st.textContent = GANTT_CSS;
      document.head.appendChild(st);
    }

    // 向 body 追加新全屏遮罩
    const mask = document.createElement("div");
    mask.id = "ganttMask";
    mask.innerHTML = `
      <div class="gnt-panel">
        <div class="gnt-head">
          <div>
            <div class="gnt-title">◇ S4 甘特排期视图</div>
            <div class="gnt-sub">${esc(project.name || "未命名项目")} · ${esc(sub)}</div>
          </div>
          <button class="gnt-close" id="gntClose">✕ 关闭</button>
        </div>
        <div class="gnt-body">
          <div class="gnt-legend">
            <span class="lg"><i class="sw sw-a"></i>排期中</span>
            <span class="lg"><i class="sw sw-b"></i>已发布</span>
            <span class="lg"><i class="sw sw-c"></i>进行中</span>
            <span class="lg"><i class="sw sw-d"></i>里程碑</span>
          </div>
          <div class="gnt-row"><div class="gnt-label">时间轴</div><div class="gnt-track gnt-axis">${gridLines}${axisTicks}</div></div>
          ${section("里程碑", "milestone")}
          ${section("内容日历", "content")}
          ${pendNote}
        </div>
      </div>`;
    document.body.appendChild(mask);
    ganttOpen = true;

    /* ---------- B1：拖拽调期（内容条 → 时间轴 drop） ---------- */
    let dragIdx = null;
    function clearDragUI() {
      mask.querySelectorAll(".gnt-bar.gnt-dragging").forEach(el => el.classList.remove("gnt-dragging"));
      mask.querySelectorAll(".gnt-track.drag-over").forEach(el => el.classList.remove("drag-over"));
    }
    mask.querySelectorAll(".gnt-bar.gnt-draggable").forEach(el => {
      el.addEventListener("dragstart", (e) => {
        dragIdx = +el.dataset.idx;
        if (e.dataTransfer) {
          try { e.dataTransfer.setData("text/plain", String(dragIdx)); } catch (_) {}
          e.dataTransfer.effectAllowed = "move";
        }
        el.classList.add("gnt-dragging");
      });
      el.addEventListener("dragend", () => { clearDragUI(); dragIdx = null; });
    });
    // 时间轴容器 = 每条 .gnt-track（含顶部时间轴行）；时间轴外无 drop 处理器 → 不生效
    mask.querySelectorAll(".gnt-track").forEach(track => {
      track.addEventListener("dragover", (e) => {
        if (dragIdx == null) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        track.classList.add("drag-over");
      });
      track.addEventListener("dragleave", () => track.classList.remove("drag-over"));
      track.addEventListener("drop", async (e) => {
        e.preventDefault();
        track.classList.remove("drag-over");
        clearDragUI();
        if (dragIdx == null) return;
        const idx = dragIdx;
        dragIdx = null;
        const row = calendar[idx];
        const src = items.find(x => x.kind === "content" && x.i === idx);
        if (!row || !src) return;

        // 落点 x 相对时间轴宽度的比例 → 移动量（deltaX 相对该条原位置）
        const rect = track.getBoundingClientRect();
        const width = rect.width || 1;
        const dropX = e.clientX - rect.left;
        const oldX = ((src.pos - min) / span) * width;
        const move = Math.round((dropX - oldX) / width * span);

        if (hasDate) {
          // 天模式：新日期 = 旧日期 + round(deltaX / 宽度 * 总天数)
          const newNum = (src.date != null ? src.date : src.pos) + move;
          const d = new Date(newNum * 86400000);
          const pad2 = n => String(n).padStart(2, "0");
          const newVal = d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
          if (String(row[5] || "").trim() === newVal) return;   // 未变化不保存
          row[5] = newVal;
        } else {
          // 周模式：周次 ± 移动周数
          const newWeek = Math.max(1, (src.week != null ? src.week : src.pos) + move);
          const newVal = "第" + newWeek + "周";
          if (String(row[0] || "").trim() === newVal) return;
          row[0] = newVal;
        }

        // 定位当前项目对象（与 window.MKT.current 对齐），保存并同步全局
        const list = (window.MKT.projects && window.MKT.projects.projects) || [];
        const cur = list.find(x => x && String(x.id) === String(window.MKT.current)) || project;
        try {
          const res = await window.api.saveProject(cur);
          if (res && Array.isArray(res.projects)) window.MKT.projects = res;
        } catch (err) {
          console.error("[甘特排期] 保存失败", err);
        }
        window.MKT.renderGantt(cur);
      });
    });

    document.getElementById("gntClose").onclick = gntClose;
    mask.addEventListener("click", e => { if (e.target === mask) gntClose(); });
  };

  function gntClose() {
    const m = document.getElementById("ganttMask");
    if (m) m.remove();
    ganttOpen = false;
  }
  document.addEventListener("keydown", e => { if (e.key === "Escape" && ganttOpen) gntClose(); });

  /* ---------- 一页纸方案（紧凑 Markdown） ---------- */
  function onePager(project) {
    const g = (ph, k) => (ph && ph[k] != null ? String(ph[k]).trim() : "");
    const decon = (project.phases || {}).deconstruct || {};
    const research = (project.phases || {}).research || {};
    const strategy = (project.phases || {}).strategy || {};
    const plan = (project.phases || {}).plan || {};
    const brand = g(decon, "brand") || project.name || "-";
    const influencers = Array.isArray(plan.influencer_matrix) ? plan.influencer_matrix.length : 0;
    const contents = Array.isArray(plan.content_calendar) ? plan.content_calendar.length : 0;
    const pos = g(strategy, "positioning_statement");
    const diff = g(strategy, "differentiation");
    const key = [pos ? "定位陈述：" + pos : "", diff ? "差异化：" + diff : ""].filter(Boolean).join("；") || "-";
    return [
      `# 一页纸方案：${brand}`,
      "",
      `- **品牌**：${brand}`,
      `- **定位**：${g(decon, "positioning") || "-"}`,
      `- **目标人群**：${g(research, "persona") || "-"}`,
      `- **营销目标**：${g(decon, "goal") || "-"}`,
      `- **预算**：${g(decon, "budget_total") || "-"} 元${g(decon, "period") ? " ｜ 周期：" + g(decon, "period") : ""}`,
      `- **达人数量**：${influencers} 位`,
      `- **内容篇数**：${contents} 篇`,
      `- **关键策略**：${key}`,
      `- **KPI**：${g(plan, "kpi") || "-"}`
    ].join("\n");
  }

  /* ---------- 注册 S4 阶段按钮（均为 plan 阶段） ---------- */
  window.MKT.registerStageButton("plan", "甘特排期", (project) => {
    window.MKT.renderGantt(project);
  });

  window.MKT.registerStageButton("plan", "一页纸方案", async (project) => {
    const md = onePager(project);
    try {
      await navigator.clipboard.writeText(md);
      window.alert("一页纸方案已复制到剪贴板");
    } catch (e) {
      // 剪贴板不可用时直接用 alert 展示
      window.alert(md);
    }
  });
})();
