// ============ 功能模块 A2：项目看板总览（全屏看板） ============
// 通过 window.MKT.registerToolbarButton("项目看板", fn) 注册到营销工具栏，
// 打开当前项目后渲染全屏看板：项目信息 + 5 阶段进度 + 关键指标卡 + 预算分配表。
window.MKT = window.MKT || {};

(function () {
  "use strict";

  let dashOpen = false;

  /* ---------- 阶段进度定义（按阶段字段填满度） ---------- */
  const STAGES = [
    { key: "deconstruct", title: "S1 拆解业务", items: [
      { k: "brand", label: "品牌名" },
      { k: "industry", label: "行业/类目" },
      { k: "products", label: "产品" },
      { k: "budget_total", label: "总预算" },
      { k: "goal", label: "营销目标" }
    ]},
    { key: "research", title: "S2 调研市场", items: [
      { k: "keywords", label: "关键词" },
      { k: "competitors", label: "竞品矩阵", arr: true }
    ]},
    { key: "strategy", title: "S3 理解业务", items: [
      { k: "positioning_statement", label: "定位陈述" }
    ]},
    { key: "plan", title: "S4 开发计划", items: [
      { k: "kpi", label: "KPI" },
      { k: "content_calendar", label: "内容日历", arr: true },
      { k: "influencer_matrix", label: "达人矩阵", arr: true },
      { k: "budget_alloc", label: "预算分配", arr: true },
      { k: "milestones", label: "里程碑", arr: true }
    ]},
    { key: "execution", title: "S5 落地执行", items: [
      { k: "tasks", label: "任务清单", arr: true },
      { k: "results", label: "执行结果" }
    ]}
  ];

  // 字段是否有实质内容：数组看长度、字符串看非空、其他看非空值
  function filled(v, isArr) {
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "string") return v.trim() !== "";
    return v !== undefined && v !== null && v !== "";
  }
  const arrLen = (v) => (Array.isArray(v) ? v.length : 0);

  // 取阶段对象，容错缺 phases / 缺某阶段
  function phaseOf(project, key) {
    return ((project && project.phases) || {})[key] || {};
  }

  // 预算文本：纯数字 → fmt 格式化 + "元"；否则原样
  function moneyText(v) {
    const s = String(v ?? "").trim();
    if (!s) return "-";
    const n = Number(s.replace(/,/g, ""));
    if (!isNaN(n) && /^[\d,.]+$/.test(s)) return fmt(n) + " 元";
    return s;
  }

  /* ---------- 看板样式（注入 <style id="mktDashStyle">） ---------- */
  const DASH_CSS = `
#mktDashMask{position:fixed;inset:0;z-index:9998;background:rgba(3,6,12,.85);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box}
#mktDashMask .dash-panel{width:min(1120px,96vw);max-height:94vh;background:#0a1322;border:1px solid rgba(0,229,255,.5);border-radius:14px;box-shadow:0 0 60px rgba(0,229,255,.35);display:flex;flex-direction:column;overflow:hidden}
#mktDashMask .dash-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid rgba(0,229,255,.18)}
#mktDashMask .dash-title{font-size:16px;font-weight:800;color:#00e5ff;letter-spacing:1px;text-shadow:0 0 12px rgba(0,229,255,.5)}
#mktDashMask .dash-close{padding:6px 16px;border-radius:8px;border:1px solid rgba(255,45,149,.55);color:#ff2d95;background:rgba(255,45,149,.08);cursor:pointer;font-size:12px;font-weight:700}
#mktDashMask .dash-close:hover{background:rgba(255,45,149,.22)}
#mktDashMask .dash-body{overflow:auto;padding:14px 18px 20px}
#mktDashMask .dash-proj{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:12px 14px;border-radius:10px;background:rgba(0,20,40,.55);border:1px solid rgba(0,229,255,.2);margin-bottom:14px}
#mktDashMask .dash-proj-name{font-size:17px;font-weight:800;color:#fff;background:linear-gradient(90deg,#00e5ff,#7fb0ff,#ff2d95);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
#mktDashMask .dash-proj-meta{font-size:12px;color:#6b84b0}
#mktDashMask .dash-tag{font-size:11px;padding:3px 10px;border-radius:12px;border:1px solid rgba(0,255,157,.45);color:#00ff9d;background:rgba(0,255,157,.08)}
#mktDashMask .dash-tag.arch{color:#ff4d6d;border-color:rgba(255,77,109,.5);background:rgba(255,77,109,.08)}
#mktDashMask .dash-overall{flex:1;min-width:220px;display:flex;align-items:center;gap:10px}
#mktDashMask .dash-overall .bar{flex:1;height:12px;background:rgba(0,20,40,.7);border-radius:6px;overflow:hidden;border:1px solid rgba(0,229,255,.18)}
#mktDashMask .dash-overall .fill{height:100%;background:linear-gradient(90deg,#00e5ff,#7fb0ff,#ff2d95);box-shadow:0 0 14px rgba(0,229,255,.6);transition:width .5s}
#mktDashMask .dash-overall b{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:15px;color:#00e5ff;text-shadow:0 0 10px rgba(0,229,255,.5)}
#mktDashMask .dash-sec-title{font-size:13px;font-weight:700;color:#7fb4d4;letter-spacing:1px;margin:4px 0 10px}
#mktDashMask .dash-sec-title small{color:#6b84b0;font-weight:400;letter-spacing:0}
#mktDashMask .dash-stages{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px}
#mktDashMask .dash-stage{background:rgba(0,20,40,.5);border:1px solid rgba(0,229,255,.16);border-radius:10px;padding:10px 12px}
#mktDashMask .dash-stage-name{font-size:12px;font-weight:700;color:#d6e4ff;margin-bottom:6px}
#mktDashMask .dash-chips{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0 8px}
#mktDashMask .dash-chip{font-size:10px;padding:1px 7px;border-radius:9px;border:1px solid rgba(0,229,255,.18);color:#6b84b0;background:rgba(0,20,40,.4)}
#mktDashMask .dash-chip.ok{color:#00ff9d;border-color:rgba(0,255,157,.4);background:rgba(0,255,157,.07)}
#mktDashMask .dash-stage-bar{display:flex;align-items:center;gap:8px}
#mktDashMask .dash-stage-bar .bar{flex:1;height:9px;background:rgba(0,20,40,.7);border-radius:5px;overflow:hidden;border:1px solid rgba(0,229,255,.15)}
#mktDashMask .dash-stage-bar .fill{height:100%;background:linear-gradient(90deg,#00e5ff,#00ff9d);box-shadow:0 0 8px rgba(0,229,255,.5);transition:width .5s}
#mktDashMask .dash-stage-bar em{font-style:normal;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;color:#00e5ff;min-width:34px;text-align:right}
#mktDashMask .dash-metrics{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px}
#mktDashMask .dash-metric{background:rgba(0,20,40,.5);border:1px solid rgba(0,229,255,.2);border-radius:10px;padding:12px 10px;text-align:center;box-shadow:inset 0 0 18px rgba(0,229,255,.04)}
#mktDashMask .dash-metric .lb{font-size:11px;color:#6b84b0;letter-spacing:1px;margin-bottom:6px}
#mktDashMask .dash-metric .val{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:21px;font-weight:700;color:#00e5ff;text-shadow:0 0 12px rgba(0,229,255,.45)}
#mktDashMask .dash-metric .val.kpi{font-size:12px;line-height:1.5;word-break:break-all;max-height:58px;overflow:hidden}
#mktDashMask .dash-metric .sub{font-size:10px;color:#6b84b0;margin-top:4px}
#mktDashMask .dash-metric.hl .val{color:#00ff9d;text-shadow:0 0 12px rgba(0,255,157,.45)}
#mktDashMask .dash-table-wrap{background:rgba(0,20,40,.5);border:1px solid rgba(0,229,255,.16);border-radius:10px;overflow:hidden}
#mktDashMask table.dash-table{width:100%;border-collapse:collapse}
#mktDashMask .dash-table th{font-size:11px;color:#7fb4d4;letter-spacing:1px;text-align:left;padding:8px 12px;border-bottom:1px solid rgba(0,229,255,.18);background:rgba(0,229,255,.05)}
#mktDashMask .dash-table td{font-size:12px;color:#d6e4ff;padding:7px 12px;border-bottom:1px solid rgba(0,229,255,.08)}
#mktDashMask .dash-table tr:last-child td{border-bottom:none}
#mktDashMask .dash-table td.num,#mktDashMask .dash-table th.num{font-family:ui-monospace,Menlo,Consolas,monospace;text-align:right}
#mktDashMask .dash-table tfoot td{font-weight:700;color:#00e5ff;background:rgba(0,229,255,.06)}
#mktDashMask .dash-empty{color:#6b84b0;font-size:12px;padding:14px 12px}
@media (max-width:900px){
  #mktDashMask .dash-stages{grid-template-columns:repeat(2,1fr)}
  #mktDashMask .dash-metrics{grid-template-columns:repeat(2,1fr)}
}`;

  /* ---------- 渲染看板 ---------- */
  function renderDash(project) {
    // 渲染前移除旧遮罩
    const old = document.getElementById("mktDashMask");
    if (old) old.remove();
    const oldStyle = document.getElementById("mktDashStyle");
    if (oldStyle) oldStyle.remove();

    const decon = phaseOf(project, "deconstruct");
    const research = phaseOf(project, "research");
    const strategy = phaseOf(project, "strategy");
    const plan = phaseOf(project, "plan");
    const execution = phaseOf(project, "execution");

    // 1) 5 阶段进度（按字段填满度）
    const stageStats = STAGES.map((st) => {
      const ph = phaseOf(project, st.key);
      const filledN = st.items.filter((it) => filled(ph[it.k], it.arr)).length;
      const total = st.items.length;
      const pct = total ? Math.round((filledN / total) * 100) : 0;
      const chips = st.items.map((it) => {
        const ok = filled(ph[it.k], it.arr);
        const n = it.arr ? " " + arrLen(ph[it.k]) : "";
        return `<span class="dash-chip${ok ? " ok" : ""}">${ok ? "✓" : "·"} ${esc(it.label)}${n}</span>`;
      }).join("");
      return { ...st, filledN, total, pct, chips };
    });
    const overallPct = Math.round(stageStats.reduce((a, s) => a + s.pct, 0) / stageStats.length);

    // 2) 关键指标卡
    const contentN = arrLen(plan.content_calendar);
    const influencerN = arrLen(plan.influencer_matrix);
    const tasks = Array.isArray(execution.tasks) ? execution.tasks : [];
    const taskDone = tasks.filter((r) => /完成|done/i.test(String(r[4] || ""))).length;
    const kpi = String(plan.kpi || "").trim() || "-";
    const metrics = [
      { lb: "预算", val: moneyText(decon.budget_total), sub: "S1 总预算" },
      { lb: "内容篇数", val: contentN, sub: "S4 内容日历" },
      { lb: "达人数量", val: influencerN, sub: "S4 达人矩阵" },
      { lb: "任务完成", val: `${taskDone}/${tasks.length}`, sub: "S5 任务清单", hl: true },
      { lb: "KPI", val: kpi, sub: "S4 KPI 目标", kpi: true }
    ];
    const metricHTML = metrics.map((m) => `
      <div class="dash-metric${m.hl ? " hl" : ""}" title="${esc(m.val)}">
        <div class="lb">${m.lb}</div>
        <div class="val${m.kpi ? " kpi" : ""}">${esc(m.val)}</div>
        <div class="sub">${esc(m.sub)}</div>
      </div>`).join("");

    // 3) 预算分配表
    const alloc = Array.isArray(plan.budget_alloc) ? plan.budget_alloc : [];
    const allocTotal = alloc.reduce((acc, r) => {
      const n = Number(String(r[1] || "").replace(/[^\d.]/g, ""));
      return acc + (isNaN(n) ? 0 : n);
    }, 0);
    const allocBody = alloc.length
      ? alloc.map((r) => `<tr>
          <td>${esc(r[0] || "-")}</td>
          <td class="num">${esc(r[1] || "-")}</td>
          <td class="num">${esc(r[2] || "-")}</td>
        </tr>`).join("") +
        `<tr><td>合计</td><td class="num">${fmt(allocTotal)} 元</td><td class="num"></td></tr>`
      : `<tr><td colspan="3"><div class="dash-empty">暂无预算分配数据（在 S4 开发计划 → 预算分配中填写）</div></td></tr>`;

    const status = String(project.status || "进行中");
    const statusTag = status === "已归档"
      ? `<span class="dash-tag arch">${esc(status)}</span>`
      : `<span class="dash-tag">${esc(status)}</span>`;

    // 4) 注入样式（覆盖旧样式）
    const style = document.createElement("style");
    style.id = "mktDashStyle";
    style.textContent = DASH_CSS;
    document.head.appendChild(style);

    // 5) 追加全屏遮罩
    const mask = document.createElement("div");
    mask.id = "mktDashMask";
    mask.innerHTML = `
      <div class="dash-panel">
        <div class="dash-head">
          <div class="dash-title">◇ 项目看板总览</div>
          <button class="dash-close" id="mktDashClose">✕ 关闭</button>
        </div>
        <div class="dash-body">
          <div class="dash-proj">
            <span class="dash-proj-name">${esc(project.name || "未命名项目")}</span>
            <span class="dash-proj-meta">客户：${esc(project.client || "未填客户")}</span>
            ${statusTag}
            <div class="dash-overall">
              <div class="bar"><div class="fill" style="width:${overallPct}%"></div></div>
              <b>${overallPct}%</b>
            </div>
          </div>

          <div class="dash-sec-title">阶段进度 <small>按各阶段字段填满度统计</small></div>
          <div class="dash-stages">
            ${stageStats.map((s) => `
              <div class="dash-stage" data-stage="${esc(s.key || "")}" title="点击进入该阶段编辑">
                <div class="dash-stage-name">${s.title} ${s.filledN}/${s.total}</div>
                <div class="dash-chips">${s.chips}</div>
                <div class="dash-stage-bar">
                  <div class="bar"><div class="fill" style="width:${s.pct}%"></div></div>
                  <em>${s.pct}%</em>
                </div>
              </div>`).join("")}
          </div>

          <div class="dash-sec-title">关键指标 <small>预算 / 内容 / 达人 / 任务 / KPI</small></div>
          <div class="dash-metrics">${metricHTML}</div>

          <div class="dash-sec-title">预算分配 <small>共 ${alloc.length} 项 · 合计 ${fmt(allocTotal)} 元</small></div>
          <div class="dash-table-wrap">
            <table class="dash-table">
              <thead><tr><th>项目</th><th class="num">金额(元)</th><th class="num">占比%</th></tr></thead>
              <tbody>${allocBody}</tbody>
            </table>
          </div>
        </div>
      </div>`;
    document.body.appendChild(mask);
    dashOpen = true;

    document.getElementById("mktDashClose").onclick = closeDash;
    mask.addEventListener("click", (e) => { if (e.target === mask) closeDash(); });
    mask.querySelectorAll(".dash-stage[data-stage]").forEach(card => {
      card.addEventListener("click", () => {
        const key = card.dataset.stage;
        closeDash();
        if (key) { window.MKT.stage = key; if (typeof window.renderMktWorkspace === "function") window.renderMktWorkspace(); }
      });
    });
  }

  function closeDash() {
    const m = document.getElementById("mktDashMask");
    if (m) m.remove();
    dashOpen = false;
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && dashOpen) closeDash(); });

  /* ---------- 注册工具栏按钮 ---------- */
  window.MKT.registerToolbarButton("项目看板", () => {
    const list = (window.MKT.projects && window.MKT.projects.projects) || [];
    const cur = list.find((x) => String(x.id) === String(window.MKT.current));
    if (!cur) { alert("请先打开一个项目再查看看板"); return; }
    renderDash(cur);
  });
})();
