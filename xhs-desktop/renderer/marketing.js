// ============ 全案营销（业务体系版） ============
const MKT_STAGES = [
  { key: "deconstruct", title: "S1 拆解业务", desc: "拆解业务体系：商业模式画布 + 品牌定位 + 目标与预算", groups: [
    { title: "商业模式画布", fields: [
      { k: "customer_segments", label: "客户细分", type: "textarea" },
      { k: "value_proposition", label: "价值主张", type: "textarea" },
      { k: "channels", label: "渠道", type: "textarea" },
      { k: "customer_relations", label: "客户关系", type: "textarea" },
      { k: "revenue_streams", label: "收入来源", type: "textarea" },
      { k: "key_resources", label: "关键资源", type: "textarea" },
      { k: "key_activities", label: "关键活动", type: "textarea" },
      { k: "key_partners", label: "关键伙伴", type: "textarea" },
      { k: "cost_structure", label: "成本结构", type: "textarea" }
    ]},
    { title: "品牌与产品", fields: [
      { k: "brand", label: "品牌名", type: "text" },
      { k: "industry", label: "行业/类目", type: "text" },
      { k: "products", label: "产品（名称/价格/卖点）", type: "textarea" },
      { k: "positioning", label: "品牌定位", type: "textarea" }
    ]},
    { title: "目标与预算", fields: [
      { k: "goal", label: "营销目标（SMART）", type: "textarea" },
      { k: "budget_total", label: "总预算（元）", type: "text" },
      { k: "period", label: "周期", type: "text" },
      { k: "platforms", label: "平台", type: "text" }
    ]}
  ]},
  { key: "research", title: "S2 调研市场", desc: "调研市场与经营模式：竞品矩阵 + 人群画像 + 关键词 + 达人生态", groups: [
    { title: "市场与人群", fields: [
      { k: "market", label: "市场规模/趋势/机会", type: "textarea" },
      { k: "persona", label: "目标人群画像（年龄/性别/城市/消费/兴趣/场景）", type: "textarea" },
      { k: "keywords", label: "关键词（逗号分隔，含搜索意图）", type: "textarea" }
    ]},
    { title: "竞品矩阵", rows: { key: "competitors", cols: ["竞品", "定位", "价格", "渠道", "营销策略", "优势/劣势"] } },
    { title: "达人生态", fields: [
      { k: "influencer_eco", label: "达人生态观察（量级/内容/报价水平）", type: "textarea" },
      { k: "pool_filters", label: "达人候选筛选条件（分群/行业/地区/互动）", type: "text" }
    ]}
  ]},
  { key: "strategy", title: "S3 理解业务", desc: "STP + SWOT + 差异化，明确打法", groups: [
    { title: "STP", fields: [
      { k: "stp_segments", label: "市场细分", type: "textarea" },
      { k: "stp_target", label: "目标客群", type: "textarea" },
      { k: "positioning_statement", label: "定位陈述", type: "textarea" }
    ]},
    { title: "SWOT 与差异化", fields: [
      { k: "swot", label: "SWOT（优势/劣势/机会/威胁）", type: "textarea" },
      { k: "differentiation", label: "核心差异化卖点", type: "textarea" }
    ]}
  ]},
  { key: "plan", title: "S4 开发计划", desc: "内容日历 + 达人矩阵 + 预算 + 里程碑——可直接落地执行", groups: [
    { title: "内容日历", rows: { key: "content_calendar", cols: ["周次", "选题/主题", "格式", "关联卖点", "达人", "发布日期", "状态"] } },
    { title: "达人执行矩阵", rows: { key: "influencer_matrix", cols: ["达人昵称", "分群", "粉丝数", "预算", "任务/内容", "状态"] } },
    { title: "预算分配", rows: { key: "budget_alloc", cols: ["项目", "金额(元)", "占比%"] } },
    { title: "里程碑", rows: { key: "milestones", cols: ["里程碑", "日期", "验收标准"] } },
    { title: "KPI", fields: [{ k: "kpi", label: "KPI（提及/互动/涨粉/转化目标）", type: "textarea" }] }
  ]},
  { key: "execution", title: "S5 落地执行", desc: "任务看板 + 执行数据 + 复盘", groups: [
    { title: "任务清单（可勾选状态）", rows: { key: "tasks", cols: ["任务", "负责人", "截止日期", "关联（达人/内容）", "状态(待办/进行中/已完成)"] } },
    { title: "执行与复盘", fields: [
      { k: "results", label: "执行数据/结果（实际互动/涨粉/转化）", type: "textarea" },
      { k: "notes", label: "复盘与下一步", type: "textarea" }
    ]}
  ]}
];
window.MKT = window.MKT || {};
window.MKT.stageButtons = {};
window.MKT.registerStageButton = (stage, label, fn) => { window.MKT.stageButtons[stage] = window.MKT.stageButtons[stage] || []; window.MKT.stageButtons[stage].push({ label, fn }); };
window.MKT.listActions = {};
window.MKT.registerListAction = (label, fn) => { window.MKT.listActions[label] = fn; };
window.MKT.gate = null;
window.MKT.setGate = (fn) => { window.MKT.gate = fn; };
window.MKT.toolbarButtons = [];
window.MKT.registerToolbarButton = (label, fn) => { window.MKT.toolbarButtons.push({ label, fn }); };
window.MKT.projects = { projects: [] };
window.MKT.current = null;
window.MKT.stage = "deconstruct";
let mktProjects = window.MKT.projects, mktCurrent = window.MKT.current, mktStage = window.MKT.stage;
function mktSync() { window.MKT.projects = mktProjects; window.MKT.current = mktCurrent; window.MKT.stage = mktStage; }

function mktProgress(p) {
  let filled = 0, total = 0;
  for (const s of MKT_STAGES) {
    const ph = (p.phases || {})[s.key] || {};
    for (const g of s.groups) {
      if (g.rows) { total++; if ((ph[g.rows.key] || []).length) filled++; }
      else for (const f of g.fields) { total++; if (ph[f.k] && String(ph[f.k]).trim()) filled++; }
    }
  }
  return total ? Math.round(filled / total * 100) : 0;
}
function emptyPhases() { return { deconstruct: {}, research: {}, strategy: {}, plan: {}, execution: {} }; }
function templatePhases(name) {
  const base = emptyPhases();
  if (name === "标准快消") {
    base.deconstruct = { industry: "快消", platforms: "小红书", goal: "品牌认知 + 产品种草", positioning: "品质生活之选" };
    base.research = { keywords: "品类词,场景词,功效词", persona: "25-35岁 一二线 女性为主" };
    base.strategy = { positioning_statement: "为追求品质生活的用户提供高性价比产品" };
    base.plan = { kpi: "笔记30篇 互动率>3% 涨粉1000+" };
  } else if (name === "美妆上新") {
    base.deconstruct = { industry: "美妆", platforms: "小红书", goal: "新品上市声量", positioning: "成分党信赖" };
    base.research = { keywords: "成分,测评,平价替代", persona: "18-30岁 学生/职场新人" };
    base.strategy = { positioning_statement: "成分透明、效果可见的平价美妆" };
    base.plan = { kpi: "上新笔记50篇 曝光50万 互动率>4%" };
  } else if (name === "本地生活") {
    base.deconstruct = { industry: "本地生活/餐饮", platforms: "小红书", goal: "到店引流", positioning: "本地人私藏好店" };
    base.research = { keywords: "探店,必吃榜,周边游", persona: "20-40岁 同城用户" };
    base.strategy = { positioning_statement: "本地真实口碑好店推荐" };
    base.plan = { kpi: "探店笔记20篇 收藏>500 到店核销>200" };
  }
  return base;
}

function rowEditorHTML(rk, cols, rows) {
  let html = `<table class="row-editor"><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join("")}<th style="width:36px"></th></tr></thead><tbody>`;
  (rows || []).forEach((r, i) => {
    html += `<tr>${cols.map((c, j) => `<td><input data-row="${rk}" data-i="${i}" data-j="${j}" value="${esc(r[j] || "")}" /></td>`).join("")}<td><button class="mini row-del" data-key="${rk}" data-i="${i}">✕</button></td></tr>`;
  });
  html += `</tbody></table><button class="mini row-add" data-key="${rk}" data-cols="${cols.length}">＋ 添加一行</button>`;
  return html;
}

window.renderMarketing = function renderMarketing() {
  $("marketingStage").innerHTML = `<div class="mkt-toolbar">
    <button id="mktNew">＋ 新建项目</button>
    <button id="mktExport">导出方案(Markdown)</button>
    ${window.MKT.toolbarButtons.map((b, i) => `<button class="mkt-tb" data-tb="${i}">${esc(b.label)}</button>`).join("")}
    <span class="filter-count" id="mktCount"></span>
  </div>
  <div class="mkt-list" id="mktList"></div>
  <div id="mktWorkspace"></div>`;
  $("mktNew").onclick = async () => {
    const name = prompt("项目名称：");
    if (!name) return;
    const tpl = prompt("选择模板：空模板 / 标准快消 / 美妆上新 / 本地生活（回车默认空模板）") || "空模板";
    const p = { id: "p" + Date.now(), name, client: "", status: "进行中", created_at: new Date().toISOString(), phases: templatePhases(tpl) };
    mktProjects = await window.api.saveProject(p); mktSync();
    mktCurrent = p.id; mktStage = "deconstruct"; mktSync();
    renderMarketing();
  };
  document.querySelectorAll(".mkt-tb").forEach(btn => btn.onclick = () => window.MKT.toolbarButtons[Number(btn.dataset.tb)].fn());
  $("mktExport").onclick = async () => {
    if (!mktCurrent) { appendLog("\n[全案营销] 请先打开一个项目\n"); return; }
    const p = mktProjects.projects.find(x => x.id === mktCurrent);
    if (!p) return;
    appendLog("\n[全案营销] 导出方案...\n");
    await window.api.exportProject(p);
  };
  renderMktList();
  if (mktCurrent) renderMktWorkspace();
  mktSync();
}
window.renderMktList = function renderMktList() {
  $("mktCount").textContent = `${mktProjects.projects.length} 个项目`;
  $("mktList").innerHTML = mktProjects.projects.map(p => `
    <div class="mkt-card ${p.id === mktCurrent ? "active" : ""}" data-id="${esc(p.id)}">
      <div class="mkt-name">${esc(p.name)}</div>
      <div class="mkt-meta">${esc(p.client || "未填客户")} · ${esc(p.status || "进行中")} · 进度 ${mktProgress(p)}%</div>
      <div class="mkt-bar"><div class="mkt-fill" style="width:${mktProgress(p)}%"></div></div>
      <div class="mkt-actions"><button class="mini mkt-open">打开</button><button class="mini mkt-del">删除</button>${Object.entries(window.MKT.listActions).map(([k, v]) => `<button class="mini mkt-act" data-act="${esc(k)}">${esc(k)}</button>`).join("")}</div>
    </div>`).join("") || `<div class="marketing-note">还没有项目，点「＋ 新建项目」开始一个全案营销</div>`;
  document.querySelectorAll(".mkt-card").forEach(card => {
    card.querySelector(".mkt-open").onclick = () => { mktCurrent = card.dataset.id; mktStage = "deconstruct"; renderMktList(); renderMktWorkspace(); };
    Object.entries(window.MKT.listActions).forEach(([k, v]) => {
      card.querySelector(`.mkt-act[data-act="${CSS.escape(k)}"]`).onclick = async () => { const p = mktProjects.projects.find(x => x.id === card.dataset.id); if (p) await v(p); };
    });
    card.querySelector(".mkt-del").onclick = async () => { if (!confirm("删除该项目？")) return; mktProjects = await window.api.deleteProject(card.dataset.id); if (mktCurrent === card.dataset.id) mktCurrent = null; renderMarketing(); };
  });
}
window.renderMktWorkspace = function renderMktWorkspace() {
  const p = mktProjects.projects.find(x => x.id === mktCurrent);
  if (!p) { $("mktWorkspace").innerHTML = ""; return; }
  const stageNav = MKT_STAGES.map(s => {
    const ph = (p.phases && p.phases[s.key]) || {};
    const gate = window.MKT.gate ? window.MKT.gate(s, ph) : { ok: true };
    return `<button class="mkt-stage ${s.key === mktStage ? "active" : ""}" data-key="${s.key}" title="${gate.hint || ""}">${s.title} ${gate.ok ? '<span class="gate-ok">✓</span>' : '<span class="gate-nd">·</span>'}</button>`;
  }).join("");
  const st = MKT_STAGES.find(s => s.key === mktStage);
  const ph = (p.phases && p.phases[mktStage]) || {};
  const groups = st.groups.map(g => {
    let inner = "";
    if (g.rows) {
      inner = rowEditorHTML(g.rows.key, g.rows.cols, ph[g.rows.key] || []);
    } else {
      inner = g.fields.map(f => `
        <div class="mkt-field"><label>${f.label}</label>
        ${f.type === "textarea" ? `<textarea data-k="${f.k}">${esc(ph[f.k] || "")}</textarea>` : `<input type="text" data-k="${f.k}" value="${esc(ph[f.k] || "")}" />`}
        </div>`).join("");
    }
    return `<div class="mkt-group"><div class="mkt-group-title">${g.title}</div>${inner}</div>`;
  }).join("");
  $("mktWorkspace").innerHTML = `
    <div class="mkt-head">
      <div class="mkt-title">${esc(p.name)} <span class="dim">· ${esc(p.client || "未填客户")}</span></div>
      <div class="mkt-stage-desc">${st.desc}</div>
      <div class="mkt-stages">${stageNav}</div>
    </div>
    <div class="mkt-form">${groups}
      <div class="mkt-actions2">
        <button id="mktSave" class="primary">保存阶段</button>
        ${mktStage === "research" ? '<button id="mktGenCandidates">从达人库生成候选</button>' : ""}
        ${mktStage === "execution" ? '<button id="mktCompareActual">对比实际数据</button>' : ""}
        ${(window.MKT.stageButtons[mktStage] || []).map((b, i) => `<button class="mkt-plug" data-plug="${i}">${b.label}</button>`).join("")}
        <span class="filter-count" id="mktSaveTip"></span>
      </div>
    </div>`;
  document.querySelectorAll(".mkt-stage").forEach(b => b.onclick = () => { mktStage = b.dataset.key; mktSync(); renderMktWorkspace(); });
  document.querySelectorAll(".row-add").forEach(btn => btn.onclick = () => {
    const rk = btn.dataset.key, n = Number(btn.dataset.cols);
    ph[rk] = ph[rk] || [];
    ph[rk].push(new Array(n).fill(""));
    renderMktWorkspace();
  });
  document.querySelectorAll(".row-del").forEach(btn => btn.onclick = () => {
    ph[btn.dataset.key].splice(Number(btn.dataset.i), 1);
    renderMktWorkspace();
  });
  document.querySelectorAll(".mkt-plug").forEach(btn => {
    btn.onclick = () => { const fn = (window.MKT.stageButtons[mktStage] || [])[Number(btn.dataset.plug)].fn; fn(p, ph); };
  });
  if (mktStage === "research" && $("mktGenCandidates")) {
    $("mktGenCandidates").onclick = () => genCandidates(p, ph);
  }
  if (mktStage === "execution" && $("mktCompareActual")) {
    $("mktCompareActual").onclick = () => compareActual(p);
  }
  $("mktSave").onclick = async () => {
    const out = {};
    document.querySelectorAll(".mkt-form [data-k]").forEach(el => out[el.dataset.k] = el.value);
    MKT_STAGES.filter(s => s.key === mktStage).forEach(s => s.groups.forEach(g => {
      if (g.rows) {
        const ncols = g.rows.cols.length;
        const grid = {};
        document.querySelectorAll(`[data-row="${g.rows.key}"]`).forEach(inp => {
          const i = Number(inp.dataset.i), j = Number(inp.dataset.j);
          grid[i] = grid[i] || new Array(ncols).fill("");
          grid[i][j] = inp.value;
        });
        out[g.rows.key] = Object.keys(grid).sort((a, b) => a - b).map(k => grid[k]);
      }
    }));
    p.phases = p.phases || emptyPhases();
    p.phases[mktStage] = out;
    mktProjects = await window.api.saveProject(p); mktSync();
    appendLog(`\n[全案营销] 已保存 ${st.title}\n`);
    renderMktList();
  };
}
function parsePoolFilters(text) {
  const parts = (text || "").split(/[,，;；\s]+/).filter(Boolean);
  const f = { tiers: [], industries: [], regions: [] };
  for (const p of parts) {
    if (["素人", "尾部", "腰部", "头部"].includes(p)) f.tiers.push(p);
    else if (/省|市|区|县/.test(p)) f.regions.push(p);
    else f.industries.push(p);
  }
  return f;
}
function findCandidates(filterText) {
  const f = parsePoolFilters(filterText);
  let rows = state.rows.filter(r => r.status === "ok");
  if (f.tiers.length) rows = rows.filter(r => f.tiers.includes(r.tier));
  if (f.industries.length) rows = rows.filter(r => f.industries.some(i => (r.industry || "").includes(i)));
  if (f.regions.length) rows = rows.filter(r => f.regions.some(reg => (r.region || "").includes(reg)));
  const med = tierMedians();
  return rows.map(r => ({ ...r, _score: computeScore(r, med[r.tier]) })).sort((a, b) => b._score - a._score).slice(0, 40);
}
function genCandidates(project, ph) {
  const filterText = (document.querySelector('[data-k="pool_filters"]') || {}).value || "";
  const cands = findCandidates(filterText);
  $("mktModalTitle").textContent = `◇ 达人候选（${cands.length} 个匹配，条件：${filterText || "全部 ok 达人"}）`;
  $("mktModalBody").innerHTML = cands.map((r, i) => `
    <label class="cand-row"><input type="checkbox" class="cand-chk" value="${esc(r.user_id)}" />
      <span>${esc(r.nickname)}</span><span class="dim">${esc(r.tier)} · ${esc(r.region)} · 粉丝${esc(r.followers_num)} · 互动${esc(r.interaction_ratio)} · 评分${r._score}</span>
    </label>`).join("") || `<div style="color:#6b84b0;padding:12px">无匹配（可在 S2 填写筛选条件，如：腰部,母婴,广东）</div>`;
  $("mktModalActions").innerHTML = `<button id="mktCandPick">加入 S4 达人矩阵</button><button id="mktCandClose">关闭</button>`;
  $("mktMask").classList.remove("hidden");
  $("mktCandClose").onclick = () => $("mktMask").classList.add("hidden");
  $("mktCandPick").onclick = async () => {
    const picked = [...document.querySelectorAll(".cand-chk:checked")].map(c => state.rows.find(r => r.user_id === c.value)).filter(Boolean);
    if (!picked.length) { alert("请勾选至少一个"); return; }
    project.phases = project.phases || emptyPhases();
    project.phases.plan = project.phases.plan || {};
    project.phases.plan.influencer_matrix = project.phases.plan.influencer_matrix || [];
    for (const r of picked) project.phases.plan.influencer_matrix.push([r.nickname, r.tier || "", r.followers_num ?? "", "", "", "待定"]);
    mktProjects = await window.api.saveProject(project); mktSync();
    $("mktMask").classList.add("hidden");
    appendLog(`\n[全案营销] 已加入 ${picked.length} 个达人到 S4 达人矩阵（保存后可见）\n`);
  };
}
function compareActual(project) {
  const matrix = (project.phases && project.phases.plan && project.phases.plan.influencer_matrix) || [];
  const kpi = (project.phases && project.phases.plan && project.phases.plan.kpi) || "";
  const rows = matrix.map(row => {
    const name = row[0] || "";
    const found = state.rows.find(r => r.nickname === name && r.status === "ok");
    return `<tr><td>${esc(name)}</td><td>${esc(row[1] || "")}</td><td>${esc(row[3] || "")}</td><td>${found ? esc(found.followers_num) : "-"}</td><td>${found ? esc(found.avg_likes) : "-"}</td><td>${found ? esc(found.interaction_ratio) : "-"}</td></tr>`;
  }).join("");
  $("mktModalTitle").textContent = "◇ 执行数据对比（计划 vs 实际）";
  $("mktModalBody").innerHTML = `<div class="compare-wrap"><table><thead><tr><th>达人</th><th>分群</th><th>计划预算</th><th>实际粉丝</th><th>实际均赞/篇</th><th>实际互动率</th></tr></thead><tbody>${rows || '<tr><td colspan="6" style="color:#6b84b0">S4 达人矩阵为空</td></tr>'}</tbody></table></div>
    <div class="dim" style="margin-top:8px;font-size:12px">计划 KPI：${esc(kpi || "-")}</div>`;
  $("mktModalActions").innerHTML = `<button id="mktCandClose">关闭</button>`;
  $("mktMask").classList.remove("hidden");
  $("mktCandClose").onclick = () => $("mktMask").classList.add("hidden");
}

window.mktInit = async function mktInit() {
  try { mktProjects = await window.api.getProjects(); } catch (e) { mktProjects = { projects: [] }; }
  mktSync();
}

