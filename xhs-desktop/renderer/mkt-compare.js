// ============ 功能模块 A1：多项目对比（工具栏全屏弹层） ============
// 通过 window.MKT.registerToolbarButton("多项目对比", fn) 注册到营销工具栏。
// 流程：全屏弹层勾选项目（默认勾选当前项目 + 最近创建的另一个，至少 2 个）
//       → "开始对比" 渲染对比表（品牌/行业/预算/关键词数/竞品数/达人数量/内容篇数/
//         任务完成 x/y/进度/状态/KPI）+ 纯 DOM 横向柱状图对比整体进度。
// 依赖全局：window.MKT.registerToolbarButton / window.MKT.projects / window.MKT.current
//           $ (byId) / esc(v) / fmt(n)。
window.MKT = window.MKT || {};

(function () {
  "use strict";

  let cmpOpen = false;

  /* ---------- 弹层样式（注入 <style id="cmpStyle">） ---------- */
  const CMP_CSS = `
#cmpMask{position:fixed;inset:0;z-index:9994;background:rgba(3,6,12,.85);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box}
#cmpMask .cmp-panel{width:min(1120px,96vw);max-height:94vh;background:#0a1322;border:1px solid rgba(0,229,255,.5);border-radius:14px;box-shadow:0 0 60px rgba(0,229,255,.35);display:flex;flex-direction:column;overflow:hidden}
#cmpMask .cmp-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid rgba(0,229,255,.18);flex-shrink:0}
#cmpMask .cmp-title{font-size:16px;font-weight:800;color:#00e5ff;letter-spacing:1px;text-shadow:0 0 12px rgba(0,229,255,.5)}
#cmpMask .cmp-sub{font-size:11px;color:#6b84b0;margin-top:4px;font-family:ui-monospace,Menlo,Consolas,monospace}
#cmpMask .cmp-close{padding:6px 16px;border-radius:8px;border:1px solid rgba(255,45,149,.55);color:#ff2d95;background:rgba(255,45,149,.08);cursor:pointer;font-size:12px;font-weight:700}
#cmpMask .cmp-close:hover{background:rgba(255,45,149,.22)}
#cmpMask .cmp-body{overflow:auto;padding:14px 18px 20px}
#cmpMask .cmp-hint{font-size:12px;color:#6b84b0;line-height:1.7;margin-bottom:10px}
#cmpMask .cmp-hint b{color:#00ff9d}
#cmpMask .cmp-pick{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:10px;background:rgba(0,20,40,.55);border:1px solid rgba(0,229,255,.2);margin-bottom:8px;cursor:pointer;transition:border-color .15s,background .15s}
#cmpMask .cmp-pick:hover{border-color:rgba(0,229,255,.55)}
#cmpMask .cmp-pick input[type="checkbox"]{width:16px;height:16px;accent-color:#00e5ff;cursor:pointer;flex-shrink:0}
#cmpMask .cmp-pick .cmp-pk-name{font-size:14px;font-weight:700;color:#fff;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#cmpMask .cmp-pick .cmp-pk-name .tag{font-size:10px;font-weight:400;color:#00ff9d;border:1px solid rgba(0,255,157,.45);background:rgba(0,255,157,.08);padding:1px 8px;border-radius:10px;margin-left:8px;vertical-align:1px}
#cmpMask .cmp-pick .cmp-pk-meta{font-size:11px;color:#6b84b0;flex-shrink:0}
#cmpMask .cmp-start{margin-top:16px;width:100%;padding:12px;border:none;border-radius:10px;background:linear-gradient(90deg,#00e5ff,#7fb0ff);color:#04121f;font-size:14px;font-weight:800;letter-spacing:2px;cursor:pointer;box-shadow:0 0 22px rgba(0,229,255,.35)}
#cmpMask .cmp-start:hover{filter:brightness(1.12)}
#cmpMask .cmp-start:disabled{opacity:.5;cursor:not-allowed;filter:none}
#cmpMask .cmp-sec-title{font-size:13px;font-weight:700;color:#7fb4d4;letter-spacing:1px;margin:6px 0 10px}
#cmpMask .cmp-sec-title small{color:#6b84b0;font-weight:400;letter-spacing:0}
#cmpMask .cmp-table-wrap{background:rgba(0,20,40,.5);border:1px solid rgba(0,229,255,.16);border-radius:10px;overflow:auto;max-width:100%}
#cmpMask table.cmp-table{border-collapse:collapse;min-width:100%}
#cmpMask .cmp-table th{font-size:11px;color:#7fb4d4;letter-spacing:1px;text-align:left;padding:8px 12px;border-bottom:1px solid rgba(0,229,255,.18);background:rgba(0,229,255,.05);white-space:nowrap}
#cmpMask .cmp-table td{font-size:12px;color:#d6e4ff;padding:8px 12px;border-bottom:1px solid rgba(0,229,255,.08);vertical-align:top;min-width:120px;max-width:260px}
#cmpMask .cmp-table td.cmp-cell{word-break:break-word}
#cmpMask .cmp-table td.num,#cmpMask .cmp-table th.num{font-family:ui-monospace,Menlo,Consolas,monospace;text-align:right;white-space:nowrap}
#cmpMask .cmp-table tr:last-child td{border-bottom:none}
#cmpMask .cmp-table th.cmp-fix,#cmpMask .cmp-table td.cmp-fix{position:sticky;left:0;z-index:1;background:#0d1830;min-width:110px;max-width:150px;font-weight:700;color:#7fb4d4;border-right:1px solid rgba(0,229,255,.2)}
#cmpMask .cmp-table th.cmp-fix{background:#0f1c38;z-index:2}
#cmpMask .cmp-prog-cell{display:flex;align-items:center;gap:8px;min-width:150px}
#cmpMask .cmp-prog-cell .bar{flex:1;height:10px;background:rgba(0,20,40,.7);border-radius:5px;overflow:hidden;border:1px solid rgba(0,229,255,.18)}
#cmpMask .cmp-prog-cell .fill{height:100%;background:linear-gradient(90deg,#00e5ff,#7fb0ff,#ff2d95);box-shadow:0 0 10px rgba(0,229,255,.55)}
#cmpMask .cmp-prog-cell b{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:#00e5ff;text-shadow:0 0 8px rgba(0,229,255,.45);min-width:38px;text-align:right}
#cmpMask .cmp-status{display:inline-block;font-size:11px;padding:2px 10px;border-radius:12px;border:1px solid rgba(0,255,157,.45);color:#00ff9d;background:rgba(0,255,157,.08);white-space:nowrap}
#cmpMask .cmp-status.arch{color:#ff4d6d;border-color:rgba(255,77,109,.5);background:rgba(255,77,109,.08)}
#cmpMask .cmp-bars{display:flex;flex-direction:column;gap:10px}
#cmpMask .cmp-bar-row{display:flex;align-items:center;gap:10px}
#cmpMask .cmp-bar-name{width:150px;flex-shrink:0;font-size:12px;color:#d6e4ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#cmpMask .cmp-bar-track{flex:1;height:16px;background:rgba(0,20,40,.7);border-radius:8px;overflow:hidden;border:1px solid rgba(0,229,255,.18)}
#cmpMask .cmp-bar-fill{height:100%;background:linear-gradient(90deg,#00e5ff,#7fb0ff,#ff2d95);box-shadow:0 0 12px rgba(0,229,255,.55);transition:width .5s;border-radius:8px}
#cmpMask .cmp-bar-val{width:52px;flex-shrink:0;text-align:right;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;font-weight:700;color:#00e5ff;text-shadow:0 0 8px rgba(0,229,255,.45)}
#cmpMask .cmp-empty{color:#6b84b0;font-size:12px;padding:14px 12px;line-height:1.7}
@media (max-width:720px){
  #cmpMask .cmp-bar-name{width:96px}
}`;

  /* ---------- 数据辅助 ---------- */
  // 取阶段对象，容错缺 phases / 缺某阶段
  function phaseOf(project, key) {
    return ((project && project.phases) || {})[key] || {};
  }

  // 数组长度容错
  function arrLen(v) {
    return Array.isArray(v) ? v.length : 0;
  }

  // 预算文本：纯数字 → fmt 格式化 + "元"；否则原样
  function moneyText(v) {
    const s = String(v ?? "").trim();
    if (!s) return "-";
    const n = Number(s.replace(/,/g, ""));
    if (!isNaN(n) && /^[\d,.]+$/.test(s)) return fmt(n) + " 元";
    return s;
  }

  // 关键词数：数组按长度；字符串按逗号/顿号/分号/换行切分统计非空项
  function keywordCount(research) {
    const k = research.keywords;
    if (Array.isArray(k)) return k.length;
    const s = String(k || "").trim();
    if (!s) return 0;
    return s.split(/[,，、;；\n]/).map((x) => x.trim()).filter(Boolean).length;
  }

  // 任务完成统计：状态列（行下标 4）含 完成/done 计为已完成
  function taskStats(execution) {
    const tasks = Array.isArray(execution.tasks) ? execution.tasks : [];
    const done = tasks.filter((r) => /完成|done/i.test(String((r && r[4]) || ""))).length;
    return { done, total: tasks.length };
  }

  // 整体进度：按 5 阶段字段填满度统计（与全局 mktProgress 口径一致）
  const PROGRESS_STAGES = [
    { key: "deconstruct", fields: ["brand", "industry", "products", "budget_total", "goal"] },
    { key: "research", fields: ["market", "persona", "keywords"], rows: ["competitors"] },
    { key: "strategy", fields: ["stp_segments", "stp_target", "positioning_statement", "swot", "differentiation"] },
    { key: "plan", fields: ["kpi"], rows: ["content_calendar", "influencer_matrix", "budget_alloc", "milestones"] },
    { key: "execution", fields: ["results", "notes"], rows: ["tasks"] }
  ];
  function progressOf(project) {
    let filled = 0, total = 0;
    for (const st of PROGRESS_STAGES) {
      const ph = phaseOf(project, st.key);
      for (const k of (st.rows || [])) { total++; if (Array.isArray(ph[k]) && ph[k].length) filled++; }
      for (const k of (st.fields || [])) { total++; if (ph[k] && String(ph[k]).trim()) filled++; }
    }
    return total ? Math.round((filled / total) * 100) : 0;
  }

  // 项目列表 + 定位当前项目（兼容 id 字符串差异）
  function allProjects() {
    return ((window.MKT.projects && window.MKT.projects.projects) || []).filter(Boolean);
  }
  function findCurrent() {
    const list = allProjects();
    return list.find((x) => String(x.id) === String(window.MKT.current)) || null;
  }

  /* ---------- 弹层生命周期 ---------- */
  function cmpClose() {
    const mask = document.getElementById("cmpMask");
    if (mask) mask.remove();
    const style = document.getElementById("cmpStyle");
    if (style) style.remove();
    cmpOpen = false;
  }

  // 渲染前移除旧弹层并重建：注入样式 → 创建 mask → 挂到 body → 接线关闭
  function buildMask(innerHTML) {
    cmpClose(); // 渲染前移除旧弹层（含旧样式）

    const style = document.createElement("style");
    style.id = "cmpStyle";
    style.textContent = CMP_CSS;
    document.head.appendChild(style);

    const mask = document.createElement("div");
    mask.id = "cmpMask";
    mask.innerHTML = innerHTML;
    document.body.appendChild(mask);
    cmpOpen = true;

    mask.querySelectorAll(".cmp-close").forEach((btn) => {
      btn.addEventListener("click", cmpClose);
    });
    mask.addEventListener("click", (e) => { if (e.target === mask) cmpClose(); }); // 点遮罩空白关闭
    return mask;
  }

  /* ---------- 视图 1：项目选择 ---------- */
  function renderPicker() {
    const list = allProjects();
    const cur = findCurrent();

    // 最近创建的另一个：按 created_at 倒序（无时间的保持原顺序），排除当前项目后取第一个
    const ordered = list
      .map((p, i) => ({ p, i }))
      .sort((a, b) => {
        const ta = String(a.p.created_at || "");
        const tb = String(b.p.created_at || "");
        if (ta && tb && ta !== tb) return ta < tb ? 1 : -1;
        return a.i - b.i;
      })
      .map((x) => x.p);
    const recentOther = ordered.find((p) => p !== cur) || null;

    const items = list.map((p) => {
      const isCur = p === cur;
      const checked = isCur || p === recentOther;
      return `<label class="cmp-pick">
        <input type="checkbox" data-pid="${esc(p.id)}"${checked ? " checked" : ""} />
        <span class="cmp-pk-name">${esc(p.name || "未命名项目")}${isCur ? '<span class="tag">当前</span>' : ""}</span>
        <span class="cmp-pk-meta">${esc(p.client || "未填客户")} · ${esc(p.status || "进行中")} · 进度 ${progressOf(p)}%</span>
      </label>`;
    }).join("");

    const mask = buildMask(`
      <div class="cmp-panel">
        <div class="cmp-head">
          <div>
            <div class="cmp-title">◇ 多项目对比</div>
            <div class="cmp-sub">共 ${list.length} 个项目 · 至少勾选 2 个</div>
          </div>
          <button class="cmp-close">✕ 关闭</button>
        </div>
        <div class="cmp-body">
          <div class="cmp-hint">勾选要对比的项目（已默认勾选<b>当前项目</b>与<b>最近创建的项目</b>），点击「开始对比」查看对比表与整体进度图。</div>
          ${items}
          <button class="cmp-start" id="cmpStart">开始对比</button>
        </div>
      </div>`);

    // 点整行切换勾选状态
    mask.querySelectorAll(".cmp-pick").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.type === "checkbox") return; // 直接点复选框交给原生行为
        const cb = row.querySelector('input[type="checkbox"]');
        if (cb) cb.checked = !cb.checked;
      });
    });

    document.getElementById("cmpStart").addEventListener("click", () => {
      const pids = Array.from(mask.querySelectorAll('input[type="checkbox"]:checked'))
        .map((cb) => cb.dataset.pid);
      if (pids.length < 2) {
        alert("请至少勾选 2 个项目后再对比");
        return;
      }
      const picked = list.filter((p) => pids.includes(String(p.id)));
      renderCompare(picked);
    });
  }

  /* ---------- 视图 2：对比表 + 进度柱状图 ---------- */
  function renderCompare(projects) {
    // 每项目指标
    const rows = projects.map((p) => {
      const decon = phaseOf(p, "deconstruct");
      const research = phaseOf(p, "research");
      const plan = phaseOf(p, "plan");
      const execution = phaseOf(p, "execution");
      const tasks = taskStats(execution);
      const prog = progressOf(p);
      const status = String(p.status || "进行中");
      const kpi = String(plan.kpi || "").trim() || "-";
      return {
        p,
        brand: String(decon.brand || "").trim() || "-",
        industry: String(decon.industry || "").trim() || "-",
        budget: moneyText(decon.budget_total),
        keywords: keywordCount(research),
        competitors: arrLen(research.competitors),
        influencers: arrLen(plan.influencer_matrix),
        contents: arrLen(plan.content_calendar),
        tasks,
        prog,
        status,
        kpi,
        statusArch: status === "已归档"
      };
    });

    // 指标行定义：label + 取值函数
    const metricRows = [
      { label: "品牌", val: (r) => r.brand },
      { label: "行业", val: (r) => r.industry },
      { label: "预算", val: (r) => r.budget, num: true },
      { label: "关键词数", val: (r) => r.keywords, num: true },
      { label: "竞品数", val: (r) => r.competitors, num: true },
      { label: "达人数量", val: (r) => r.influencers, num: true },
      { label: "内容篇数", val: (r) => r.contents, num: true },
      { label: "任务完成", val: (r) => `${r.tasks.done}/${r.tasks.total}`, num: true },
      { label: "进度", val: (r) => r.prog + "%", num: true, prog: true },
      { label: "状态", val: (r) => r.status, status: true },
      { label: "KPI", val: (r) => r.kpi }
    ];

    const head = `<tr>
      <th class="cmp-fix">指标</th>
      ${rows.map((r) => `<th class="num">${esc(r.p.name || "未命名项目")}</th>`).join("")}
    </tr>`;

    const body = metricRows.map((m) => {
      const cells = rows.map((r) => {
        const v = m.val(r);
        if (m.status) {
          return `<td class="num"><span class="cmp-status${r.statusArch ? " arch" : ""}">${esc(v)}</span></td>`;
        }
        if (m.prog) {
          return `<td class="num"><div class="cmp-prog-cell">
            <div class="bar"><div class="fill" style="width:${r.prog}%"></div></div><b>${r.prog}%</b>
          </div></td>`;
        }
        return `<td class="num${m.num ? "" : " cmp-cell"}">${esc(v)}</td>`;
      }).join("");
      return `<tr><td class="cmp-fix">${m.label}</td>${cells}</tr>`;
    }).join("");

    // 纯 DOM 横向柱状图：整体进度
    const bars = rows.map((r) => `
      <div class="cmp-bar-row">
        <div class="cmp-bar-name" title="${esc(r.p.name || "")}">${esc(r.p.name || "未命名项目")}</div>
        <div class="cmp-bar-track"><div class="cmp-bar-fill" style="width:${r.prog}%"></div></div>
        <div class="cmp-bar-val">${r.prog}%</div>
      </div>`).join("");

    const maxProg = Math.max(...rows.map((r) => r.prog), 0);

    buildMask(`
      <div class="cmp-panel">
        <div class="cmp-head">
          <div>
            <div class="cmp-title">◇ 多项目对比</div>
            <div class="cmp-sub">${rows.map((r) => esc(r.p.name || "未命名项目")).join(" · ")}</div>
          </div>
          <button class="cmp-close">✕ 关闭</button>
        </div>
        <div class="cmp-body">
          <div class="cmp-sec-title">对比表 <small>${rows.length} 个项目 · 横向滚动查看</small></div>
          <div class="cmp-table-wrap">
            <table class="cmp-table">
              <thead>${head}</thead>
              <tbody>${body}</tbody>
            </table>
          </div>

          <div class="cmp-sec-title" style="margin-top:18px">整体进度对比 <small>最高 ${maxProg}%</small></div>
          <div class="cmp-bars">${bars}</div>
        </div>
      </div>`);
  }

  /* ---------- 注册工具栏按钮 ---------- */
  window.MKT.registerToolbarButton("多项目对比", () => {
    if (allProjects().length < 2) {
      alert("至少需要 2 个项目才能进行对比");
      return;
    }
    renderPicker();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && cmpOpen) cmpClose();
  });
})();
