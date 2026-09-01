const $ = (id) => document.getElementById(id);

const state = {
  running: false,
  logBuf: "",
  rows: [],
  filter: { search: "", region: "", fansMin: null, fansMax: null, status: "", tier: "", industry: "", interact: "", blacklist: "" },
  sort: { key: "followers_num", dir: -1 }
};
let logMax = 4000;
let regionSelectInited = false;

const TIER_BASE = { "素人": 20, "尾部": 40, "腰部": 60, "头部": 80 };
let rankMap = {};
const weights = { interact: 20, growth: 12 };
async function loadRankMap() {
  try { const r = await window.api.getGrowthRanking(); rankMap = {}; for (const x of r) rankMap[x.user_id] = x.delta_pct; } catch (e) {}
}
function computeScore(row, median) {
  let s = TIER_BASE[row.tier] || 0;
  const iw = (weights.interact || 20) / 20, gw = (weights.growth || 12) / 12;
  const ratio = parseFloat(row.interaction_ratio);
  if (!isNaN(ratio) && median != null && median > 0) {
    if (ratio >= median * 1.5) s += 20 * iw; else if (ratio >= median) s += 12 * iw; else s += 4 * iw;
  } else if (!isNaN(ratio)) s += 6 * iw;
  const dp = rankMap[row.user_id];
  if (dp != null) { if (dp >= 20) s += 12 * gw; else if (dp >= 5) s += 8 * gw; else if (dp > 0) s += 4 * gw; else if (dp < -10) s -= 8 * gw; }
  return Math.max(0, Math.min(100, Math.round(s)));
}

function esc(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function fmt(n) { if (n == null || isNaN(n)) return "-"; if (n >= 100000000) return (n / 100000000).toFixed(1) + "亿"; if (n >= 10000) return (n / 10000).toFixed(1) + "万"; return String(n); }

// ============ 视图导航 ============
const VIEWS = ["pipeline", "list", "rank", "dash", "marketing", "import", "tools", "export"];
function switchView(view) {
  VIEWS.forEach(v => {
    const el = $("view" + v[0].toUpperCase() + v.slice(1));
    if (el) el.classList.toggle("hidden", v !== view);
  });
  document.querySelectorAll(".nav").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  if (view === "rank") loadRanking();
  if (view === "dash") loadDashboard();
  if (view === "pipeline") renderPipeline();
  if (view === "marketing") renderMarketing();
}
document.querySelectorAll(".nav").forEach(btn => btn.onclick = () => switchView(btn.dataset.view));
switchView("list");

// ============ 流程引导 ============
const PIPELINE = [
  { no: "①", title: "导入链接", desc: "粘贴分享链接 / 选择 .txt 文件，自动生成采集清单", action: "前往导入", view: "import", act: () => switchView("import") },
  { no: "②", title: "采集", desc: "配置并发/冷却后开始采集主页数据（可定时/分群刷新）", action: "开始采集", view: "list", act: () => { switchView("list"); window.api.start(getOpts()); } },
  { no: "③", title: "分类", desc: "按 分群/行业/地区/互动率 筛选打标（支持备注与黑名单）", action: "前往分类", view: "list", act: () => switchView("list") },
  { no: "④", title: "分析", desc: "涨粉榜、评分、达人对比、笔记均赞", action: "前往分析", view: "rank", act: () => switchView("rank") },
  { no: "⑤", title: "数据可视化", desc: "粉丝总量/分群/地区/互动率/笔记趋势 驾驶舱", action: "前往看板", view: "dash", act: () => switchView("dash") },
  { no: "⑥", title: "导出", desc: "CSV / Excel / 运营档案 / 周报 / 看板图片", action: "前往导出", view: "export", act: () => switchView("export") }
];
function renderPipeline() {
  $("pipelineGrid").innerHTML = PIPELINE.map(p => `
    <div class="pipe-card">
      <div class="pipe-no">${p.no}</div>
      <div class="pipe-title">${p.title}</div>
      <div class="pipe-desc">${p.desc}</div>
      <button class="pipe-btn">${p.action}</button>
    </div>`).join("");
  document.querySelectorAll(".pipe-card").forEach((card, i) => {
    card.querySelector(".pipe-btn").onclick = () => PIPELINE[i].act();
  });
}

// ============ 状态渲染 ============
function renderState(s) {
    $("dataDir").textContent = s.dataDir;
    if (s.loginStatus) { $("loginChip").textContent = s.loginStatus; $("loginChip").classList.toggle("ok", s.loginStatus === "已登录"); }
    $("overallText").textContent = `${s.doneOk} / ${s.total}`;
  $("percent").textContent = s.total ? Math.round(s.doneOk / s.total * 100) + "%" : "-";
  $("overallBar").style.width = s.total ? (s.doneOk / s.total * 100) + "%" : "0%";
      $("roundText").textContent = s.round && s.round.total ? `本轮 ${s.round.done}/${s.round.total}` : "";
    $("stTotal") && ($("stTotal").textContent = s.total);
  const chips = [
    ["ok", `成功 ${s.statusCounts.ok || 0}`],
    ["captcha", `验证码 ${s.statusCounts.captcha || 0}`],
    ["error", `错误 ${s.statusCounts.error || 0}`],
    ["no_data", `无数据 ${s.statusCounts.no_data || 0}`],
    ["", `CSV ${s.csvRows} 行`]
  ];
  $("chips").innerHTML = chips.map(([cls, txt]) => `<span class="chip ${cls}">${txt}</span>`).join("");
  state.rows = s.rows || [];
  if (!regionSelectInited && s.rows.length) initRegionSelect(s.rows);
  applyFilters();
}

function initRegionSelect(rows) {
  regionSelectInited = true;
  const regions = [...new Set(rows.map(r => r.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh"));
  const sel = $("regionFilter");
  for (const r of regions) { const opt = document.createElement("option"); opt.value = r; opt.textContent = r; sel.appendChild(opt); }
}

function tierMedians() {
  const byTier = {};
  for (const r of state.rows) { if (r.status !== "ok" || !r.tier) continue; const v = parseFloat(r.interaction_ratio); if (isNaN(v)) continue; (byTier[r.tier] = byTier[r.tier] || []).push(v); }
  const med = {};
  for (const t of Object.keys(byTier)) { const a = byTier[t].sort((x, y) => x - y); const mid = Math.floor(a.length / 2); med[t] = a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2; }
  return med;
}

function currentRows() {
  const f = state.filter, med = tierMedians();
  let rows = state.rows;
  if (f.search) { const q = f.search.toLowerCase(); rows = rows.filter(r => (r.nickname || "").toLowerCase().includes(q) || (r.red_id || "").toLowerCase().includes(q) || (r.region || "").toLowerCase().includes(q)); }
  if (f.region) rows = rows.filter(r => r.region === f.region);
  if (f.status) rows = rows.filter(r => r.status === f.status);
  if (f.fansMin != null && f.fansMin !== "") rows = rows.filter(r => (r.followers_num ?? -1) >= f.fansMin);
  if (f.fansMax != null && f.fansMax !== "") rows = rows.filter(r => (r.followers_num ?? -1) <= f.fansMax);
  if (f.tier) rows = rows.filter(r => r.tier === f.tier);
  if (f.industry) rows = rows.filter(r => (r.industry || "").includes(f.industry));
  if (f.blacklist === "normal") rows = rows.filter(r => !r.blacklisted);
  else if (f.blacklist === "black") rows = rows.filter(r => r.blacklisted);
  if (f.interact) rows = rows.filter(r => { const v = parseFloat(r.interaction_ratio); if (isNaN(v) || !r.tier || med[r.tier] == null) return false; return f.interact === "high" ? v >= med[r.tier] : v < med[r.tier]; });
  rows = rows.map(r => ({ ...r, _score: computeScore(r, med[r.tier]) }));
  const { key, dir } = state.sort;
  rows = rows.slice().sort((a, b) => {
    if (key === "followers_num" || key === "avg_likes") return ((Number(a[key]) || -1) - (Number(b[key]) || -1)) * dir;
    if (key === "score") return ((a._score ?? 0) - (b._score ?? 0)) * dir;
    return String(a[key] ?? "").localeCompare(String(b[key] ?? ""), "zh") * dir;
  });
  return rows;
}

function benchMark(r) {
  if (r.status !== "ok" || !r.tier) return "";
  const v = parseFloat(r.interaction_ratio); if (isNaN(v)) return "";
  const med = tierMedians()[r.tier]; if (med == null) return "";
  return v >= med ? '<span class="bench high" title="高于同群基准">▲</span>' : '<span class="bench low" title="低于同群基准">▼</span>';
}

function applyFilters() {
  const rows = currentRows();
  $("filterCount").textContent = `显示 ${rows.length} / ${state.rows.length}`;
  $("tbody").innerHTML = rows.map(r => {
    const st = r.status || "-";
    return `<tr data-uid="${esc(r.user_id)}" title="点击查看详情/趋势/备注" style="${r.blacklisted ? "opacity:.55" : ""}">
      <td><input type="checkbox" class="row-check" data-uid="${esc(r.user_id)}" /></td>
      <td><b style="color:${r._score >= 80 ? "var(--green)" : r._score >= 60 ? "var(--cyan)" : "var(--dim)"}">${r._score || "-"}</b></td>
      <td>${r.blacklisted ? "🔒 " : ""}${esc(r.nickname)}</td>
      <td>${esc(r.red_id)}</td><td>${esc(r.region)}</td>
      <td>${esc(r.followers)}</td><td>${esc(r.followers_num)}</td>
      <td>${esc(r.likes_collects_num)}</td>
      <td>${esc(r.interaction_ratio)}${benchMark(r)}</td>
      <td>${esc(r.avg_likes)}</td>
      <td>${esc(r.tier)}</td><td>${esc(r.age)}</td><td>${esc(r.constellation)}</td><td>${esc(r.industry)}</td>
      <td>${(r.user_tags || []).map(t => `<span class="chip" style="color:var(--purple);border-color:rgba(167,139,250,.4);padding:1px 7px;font-size:11px">${esc(t)}</span>`).join(" ")} ${esc(r.note)}</td>
      <td><span class="status-pill ${st}">${st}</span></td>
    </tr>`;
  }).join("") || `<tr><td colspan="16" style="color:#6b84b0">无匹配数据</td></tr>`;
  document.querySelectorAll("#tbody tr[data-uid]").forEach(tr => tr.onclick = () => showTrend(tr.dataset.uid, tr.children[2].textContent));
}

const AXIS = { axisLine: { lineStyle: { color: "rgba(0,229,255,.25)" } }, axisLabel: { color: "#7fb4d4" }, splitLine: { lineStyle: { color: "rgba(0,229,255,.06)" } } };

// ============ 涨粉榜 ============
let chartRank = null;
async function loadRanking() {
  const ranking = await window.api.getGrowthRanking();
  $("rankCount").textContent = `可计算 ${ranking.length} 个账号`;
  $("rankTbody").innerHTML = ranking.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.nickname)}</td><td>${esc(r.region)}</td><td><span class="status-pill ok">${esc(r.tier)}</span></td><td>${r.base}</td><td>${r.now}</td><td style="color:${r.delta >= 0 ? "var(--green)" : "var(--red)"}">${r.delta >= 0 ? "+" : ""}${r.delta}</td><td>${r.delta_pct ?? "-"}</td><td>${r.snapshots}</td></tr>`).join("") || `<tr><td colspan="9" style="color:#6b84b0">暂无数据：需先 SEED/REFRESH 积累至少 2 个时间点</td></tr>`;
  if (!chartRank) chartRank = echarts.init($("chartRank"));
  const top = ranking.slice(0, 10).reverse();
  chartRank.setOption({ backgroundColor: "transparent", grid: { left: 8, right: 40, top: 8, bottom: 8, containLabel: true }, xAxis: { type: "value", ...AXIS }, yAxis: { type: "category", data: top.map(r => r.nickname), axisLine: { lineStyle: { color: "rgba(0,229,255,.25)" } }, axisLabel: { color: "#7fb4d4" } }, series: [{ type: "bar", data: top.map(r => r.delta), barMaxWidth: 18, itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: "#00e5ff" }, { offset: 1, color: "#00ff9d" }]), borderRadius: [0, 4, 4, 0] } }], tooltip: { trigger: "axis", backgroundColor: "#0a1322", borderColor: "rgba(0,229,255,.4)", textStyle: { color: "#d6e4ff" } } }, true);
}
$("rankRefresh").onclick = () => { loadRanking(); loadRankMap(); };

// ============ 数据看板 ============
let chartTrend = null, chartTierPie = null, chartDashRegion = null, chartRatioDist = null, chartNotesTrend = null;
async function loadDashboard() {
  const okRows = state.rows.filter(r => r.status === "ok");
  const tierCount = {};
  for (const r of okRows) if (r.tier) tierCount[r.tier] = (tierCount[r.tier] || 0) + 1;
  if (!chartTierPie) chartTierPie = echarts.init($("chartTierPie"));
  chartTierPie.setOption({ backgroundColor: "transparent", series: [{ type: "pie", radius: ["42%", "68%"], data: Object.entries(tierCount).map(([n, v]) => ({ name: n, value: v })), label: { color: "#d6e4ff" } }], legend: { bottom: 0, textStyle: { color: "#7fb4d4" } }, tooltip: { trigger: "item", backgroundColor: "#0a1322", borderColor: "rgba(0,229,255,.4)", textStyle: { color: "#d6e4ff" } } }, true);
  const regCount = {};
  for (const r of okRows) if (r.region) regCount[r.region] = (regCount[r.region] || 0) + 1;
  const regTop = Object.entries(regCount).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (!chartDashRegion) chartDashRegion = echarts.init($("chartDashRegion"));
  chartDashRegion.setOption({ backgroundColor: "transparent", grid: { left: 8, right: 30, top: 8, bottom: 8, containLabel: true }, xAxis: { type: "value", minInterval: 1, ...AXIS }, yAxis: { type: "category", data: regTop.map(d => d[0]).reverse(), axisLine: { lineStyle: { color: "rgba(0,229,255,.25)" } }, axisLabel: { color: "#7fb4d4" } }, series: [{ type: "bar", data: regTop.map(d => d[1]).reverse(), barMaxWidth: 16, itemStyle: { color: "#00e5ff" } }], tooltip: { trigger: "axis", backgroundColor: "#0a1322", borderColor: "rgba(0,229,255,.4)", textStyle: { color: "#d6e4ff" } } }, true);
  const buckets = { "<1": 0, "1-3": 0, "3-5": 0, "5-10": 0, "10+": 0 };
  for (const r of okRows) { const v = parseFloat(r.interaction_ratio); if (isNaN(v)) continue; if (v < 1) buckets["<1"]++; else if (v < 3) buckets["1-3"]++; else if (v < 5) buckets["3-5"]++; else if (v < 10) buckets["5-10"]++; else buckets["10+"]++; }
  if (!chartRatioDist) chartRatioDist = echarts.init($("chartRatioDist"));
  chartRatioDist.setOption({ backgroundColor: "transparent", grid: { left: 8, right: 30, top: 20, bottom: 8, containLabel: true }, xAxis: { type: "category", data: Object.keys(buckets), ...AXIS }, yAxis: { type: "value", minInterval: 1, ...AXIS }, series: [{ type: "bar", data: Object.values(buckets), barMaxWidth: 40, itemStyle: { color: "#ff2d95" } }], tooltip: { trigger: "axis", backgroundColor: "#0a1322", borderColor: "rgba(255,45,149,.4)", textStyle: { color: "#d6e4ff" } } }, true);
  const dash = await window.api.getDashboard();
  if (!chartTrend) chartTrend = echarts.init($("chartTrend"));
  chartTrend.setOption({ backgroundColor: "transparent", grid: { left: 8, right: 30, top: 20, bottom: 8, containLabel: true }, xAxis: { type: "category", data: dash.trend.map(t => t.day), ...AXIS }, yAxis: { type: "value", ...AXIS }, series: [{ type: "line", smooth: true, data: dash.trend.map(t => t.total), symbolSize: 5, lineStyle: { color: "#00e5ff", width: 2 }, itemStyle: { color: "#00e5ff" }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: "rgba(0,229,255,.3)" }, { offset: 1, color: "rgba(0,229,255,0)" }]) } }], tooltip: { trigger: "axis", backgroundColor: "#0a1322", borderColor: "rgba(0,229,255,.4)", textStyle: { color: "#d6e4ff" } } }, true);
  $("dashSummary").textContent = `粉丝总量趋势：快照覆盖 ${dash.trend.length} 天 · 当前粉丝总量 ${fmt(dash.trend.length ? dash.trend[dash.trend.length - 1].total : 0)} · 最近更新 ${dash.lastUpdate || "-"}`;
  const nt = await window.api.getNotesTrend();
  if (!chartNotesTrend) chartNotesTrend = echarts.init($("chartNotesTrend"));
  chartNotesTrend.setOption({ backgroundColor: "transparent", grid: { left: 8, right: 30, top: 20, bottom: 8, containLabel: true }, xAxis: { type: "category", data: nt.map(t => t.month), ...AXIS }, yAxis: { type: "value", ...AXIS }, series: [{ type: "bar", data: nt.map(t => t.avg_likes), barMaxWidth: 30, itemStyle: { color: "#00ff9d" } }], tooltip: { trigger: "axis", backgroundColor: "#0a1322", borderColor: "rgba(0,255,157,.4)", textStyle: { color: "#d6e4ff" } } }, true);
}

// ============ 全案营销 ============
const MKT_STAGES = [
  { key: "deconstruct", title: "S1 拆解业务", fields: [
    { k: "brand", label: "品牌名", type: "text" },
    { k: "industry", label: "行业/类目", type: "text" },
    { k: "products", label: "产品（逗号分隔：名称/卖点）", type: "text" },
    { k: "audience", label: "目标人群（年龄/性别/城市/兴趣）", type: "text" },
    { k: "goal", label: "营销目标", type: "text" },
    { k: "budget", label: "预算（元）", type: "text" },
    { k: "period", label: "周期（起止）", type: "text" },
    { k: "platforms", label: "平台（默认小红书）", type: "text" }
  ]},
  { key: "research", title: "S2 调研市场", fields: [
    { k: "keywords", label: "关键词（逗号分隔）", type: "text" },
    { k: "competitors", label: "竞品（逗号分隔）", type: "text" },
    { k: "insights", label: "市场洞察 / 机会威胁", type: "textarea" },
    { k: "pool_filters", label: "达人候选筛选条件（分群/行业/地区）", type: "text" }
  ]},
  { key: "strategy", title: "S3 理解业务", fields: [
    { k: "stp_segments", label: "STP 细分市场", type: "text" },
    { k: "stp_target", label: "目标客群", type: "text" },
    { k: "positioning", label: "定位陈述", type: "textarea" },
    { k: "swot", label: "SWOT 分析", type: "textarea" }
  ]},
  { key: "plan", title: "S4 开发计划", fields: [
    { k: "content_themes", label: "内容主题 / 选题（逗号分隔）", type: "text" },
    { k: "influencer_matrix", label: "达人矩阵（昵称/分群/预算）", type: "textarea" },
    { k: "schedule", label: "排期 / 里程碑", type: "textarea" },
    { k: "kpi", label: "KPI（提及/互动/涨粉目标）", type: "text" }
  ]},
  { key: "execution", title: "S5 落地执行", fields: [
    { k: "tasks", label: "任务清单（每行：任务/负责人/截止）", type: "textarea" },
    { k: "status", label: "执行状态", type: "text" },
    { k: "notes", label: "备注", type: "textarea" }
  ]}
];
let mktProjects = [], mktCurrent = null, mktStage = "deconstruct";

function mktProgress(p) {
  const done = MKT_STAGES.filter(s => {
    const ph = (p.phases || {})[s.key] || {};
    return Object.values(ph).some(v => v && String(v).trim());
  }).length;
  return Math.round(done / MKT_STAGES.length * 100);
}
function emptyPhases() { return { deconstruct: {}, research: {}, strategy: {}, plan: {}, execution: {} }; }

function renderMarketing() {
  $("marketingStage").innerHTML = `<div class="mkt-toolbar">
    <button id="mktNew">＋ 新建项目</button>
    <span class="filter-count" id="mktCount"></span>
  </div>
  <div class="mkt-list" id="mktList"></div>
  <div id="mktWorkspace"></div>`;
  $("mktNew").onclick = async () => {
    const name = prompt("项目名称：");
    if (!name) return;
    const p = { id: "p" + Date.now(), name, client: "", status: "进行中", created_at: new Date().toISOString(), phases: emptyPhases() };
    mktProjects = await window.api.saveProject(p);
    mktCurrent = p.id; mktStage = "deconstruct";
    renderMarketing();
  };
  renderMktList();
  if (mktCurrent) renderMktWorkspace();
}
function renderMktList() {
  $("mktCount").textContent = `${mktProjects.projects.length} 个项目`;
  $("mktList").innerHTML = mktProjects.projects.map(p => `
    <div class="mkt-card ${p.id === mktCurrent ? "active" : ""}" data-id="${esc(p.id)}">
      <div class="mkt-name">${esc(p.name)}</div>
      <div class="mkt-meta">${esc(p.client || "未填客户")} · ${esc(p.status || "进行中")} · 进度 ${mktProgress(p)}%</div>
      <div class="mkt-bar"><div class="mkt-fill" style="width:${mktProgress(p)}%"></div></div>
      <div class="mkt-actions"><button class="mini mkt-open">打开</button><button class="mini mkt-del">删除</button></div>
    </div>`).join("") || `<div class="marketing-note">还没有项目，点「＋ 新建项目」开始一个全案营销</div>`;
  document.querySelectorAll(".mkt-card").forEach(card => {
    card.querySelector(".mkt-open").onclick = () => { mktCurrent = card.dataset.id; mktStage = "deconstruct"; renderMktList(); renderMktWorkspace(); };
    card.querySelector(".mkt-del").onclick = async () => { if (!confirm("删除该项目？")) return; mktProjects = await window.api.deleteProject(card.dataset.id); if (mktCurrent === card.dataset.id) mktCurrent = null; renderMarketing(); };
  });
}
function renderMktWorkspace() {
  const p = mktProjects.projects.find(x => x.id === mktCurrent);
  if (!p) { $("mktWorkspace").innerHTML = ""; return; }
  const stageNav = MKT_STAGES.map(s => `<button class="mkt-stage ${s.key === mktStage ? "active" : ""}" data-key="${s.key}">${s.title}</button>`).join("");
  const st = MKT_STAGES.find(s => s.key === mktStage);
  const ph = (p.phases && p.phases[mktStage]) || {};
  const fields = st.fields.map(f => `
    <div class="mkt-field"><label>${f.label}</label>
    ${f.type === "textarea" ? `<textarea data-k="${f.k}">${esc(ph[f.k] || "")}</textarea>` : `<input type="text" data-k="${f.k}" value="${esc(ph[f.k] || "")}" />`}
    </div>`).join("");
  $("mktWorkspace").innerHTML = `
    <div class="mkt-head">
      <div class="mkt-title">${esc(p.name)} <span class="dim">· ${esc(p.client || "未填客户")}</span></div>
      <div class="mkt-stages">${stageNav}</div>
    </div>
    <div class="mkt-form">${fields}
      <div class="mkt-actions2"><button id="mktSave" class="primary">保存阶段</button></div>
    </div>`;
  document.querySelectorAll(".mkt-stage").forEach(b => b.onclick = () => { mktStage = b.dataset.key; renderMktWorkspace(); });
  $("mktSave").onclick = async () => {
    const out = {};
    document.querySelectorAll(".mkt-form [data-k]").forEach(el => out[el.dataset.k] = el.value);
    p.phases = p.phases || emptyPhases();
    p.phases[mktStage] = out;
    mktProjects = await window.api.saveProject(p);
    appendLog(`\n[全案营销] 已保存 ${st.title}\n`);
    renderMktList();
  };
}
async function mktInit() {
  try { mktProjects = await window.api.getProjects(); } catch (e) { mktProjects = { projects: [] }; }
}

// ============ 日志 ============
function appendLog(text) {
  state.logBuf += text;
  if (state.logBuf.length > logMax) state.logBuf = state.logBuf.slice(-logMax);
  $("log") ? ($("log").textContent = state.logBuf, $("log").scrollTop = $("log").scrollHeight) : null;
}

function getOpts() {
  return { concurrency: Number($("concurrency").value) || 3, max: Number($("max").value) || 0, captchaBurst: Number($("captchaBurst").value) || 8, cooldown: Number($("cooldown").value) || 0 };
}
function setRunning(running) {
  state.running = running;
  $("startBtn").disabled = running;
  $("stopBtn").disabled = !running;
  $("status").textContent = running ? "RUNNING…" : "STANDBY";
}

window.api.onStatus((s) => { $("status").textContent = s.text; setRunning(s.running); });
window.api.onState(renderState);
window.api.onLog(appendLog);

$("startBtn").onclick = () => { window.api.saveConfig(getOpts()); window.api.start(getOpts()); };
$("stopBtn").onclick = () => window.api.stop();
$("pickDirBtn").onclick = async () => { const s = await window.api.pickDir(); if (s) { renderState(s); refreshRecentDirs(); } };
$("openDirBtn").onclick = () => window.api.openDir();
function refreshRecentDirs() {
  window.api.getConfig().then(cfg => {
    const sel = $("recentDirs");
    sel.innerHTML = '<option value="">最近目录…</option>' + (cfg.recentDirs || []).map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join("");
  });
}
$("recentDirs").addEventListener("change", async () => {
  const v = $("recentDirs").value; if (!v) return;
  const s = await window.api.switchDir(v); if (s) renderState(s);
  refreshRecentDirs();
});

async function runMode(mode, confirmText) {
  if (confirmText && !confirm(confirmText)) return;
  appendLog(`\n[启动模式: ${mode}]\n`);
  const s = await window.api.runMode(mode, getOpts());
  renderState(s);
  appendLog(`[模式完成: ${mode}]\n`);
}
$("refillBtn").onclick = () => runMode("refill", "补全缺失：只重采缺粉丝数/地区的账号？");
$("refreshBtn").onclick = () => runMode("refresh", "刷新粉丝：重采所有成功账号（用于涨粉分析）？");
$("retryBtn").onclick = () => runMode("retry", "重试失败：清除放弃标记并重试失败账号？");
$("compactBtn").onclick = () => runMode("compact", "压缩进度：progress.jsonl 保留每账号最新一条（自动备份）？");
$("loginBtn").onclick = async () => { appendLog("\n[登录] 请在弹出的浏览器窗口扫码登录...\n"); await window.api.runLogin(); };
$("notesBtn").onclick = async () => {
  const okRows = currentRows().filter(r => r.status === "ok").slice(0, 10);
  if (!okRows.length) { appendLog("\n[笔记采集] 当前筛选无成功账号\n"); return; }
  appendLog(`\n[笔记采集] 对 ${okRows.length} 个账号采集笔记（每账号前 10 篇）...\n`);
  const s = await window.api.runNotes(okRows.map(r => r.user_id)); renderState(s);
};
$("checkBtn").onclick = async () => { appendLog("\n[巡检] 数据健康检查中...\n"); await window.api.runCheck(); };
$("updateBtn").onclick = () => window.api.checkUpdate();

$("exportBtn").onclick = async () => { $("exportBtn").disabled = true; appendLog("\n[导出 CSV]...\n"); const s = await window.api.exportCsv(); renderState(s); $("exportBtn").disabled = false; };
$("exportXlsxBtn").onclick = async () => { $("exportXlsxBtn").disabled = true; appendLog("\n[导出 Excel]...\n"); const s = await window.api.exportXlsx(); renderState(s); $("exportXlsxBtn").disabled = false; };
$("exportFilteredBtn").onclick = async () => {
  const rows = currentRows();
  if (!rows.length) { appendLog("\n[导出筛选] 当前无匹配行\n"); return; }
  $("exportFilteredBtn").disabled = true;
  appendLog(`\n[导出筛选] 导出 ${rows.length} 行...\n`);
  const r = await window.api.exportRows(rows);
  appendLog(`已导出: ${r.csv} / ${r.xlsx}\n`);
  $("exportFilteredBtn").disabled = false;
};
$("profileBtn").onclick = async () => { appendLog("\n[导出档案] 生成达人运营档案...\n"); const s = await window.api.exportProfiles(); renderState(s); };
$("reportBtn").onclick = async () => { appendLog("\n[周报] 生成中...\n"); await window.api.runReport(); };
$("dashExportBtn").onclick = async () => { appendLog("\n[看板导出] 截图导出中...\n"); const s = await window.api.exportDashboard(); renderState(s); };

// ============ 导入链接 ============
$("modalPickFile").onclick = async () => {
  const text = await window.api.pickLinksFile();
  if (text == null) return;
  $("linksText").value = text;
  $("importResult").textContent = `已读取文件（${text.length} 字符），点击"导入并生成清单"`;
};
$("modalOk").onclick = async () => {
  const text = $("linksText").value.trim();
  if (!text) { $("importResult").textContent = "请先粘贴链接或选择文件"; return; }
  $("modalOk").disabled = true;
  $("importResult").textContent = "导入中…\n";
  const r = await window.api.importLinks(text);
  $("importResult").textContent = r.result;
  renderState(r.state);
  $("modalOk").disabled = false;
};
$("gotoCollect").onclick = () => switchView("list");

// ============ 对比 ============
const selected = new Set();
$("tbody").addEventListener("change", (e) => {
  if (e.target.classList.contains("row-check")) { const uid = e.target.dataset.uid; e.target.checked ? selected.add(uid) : selected.delete(uid); }
});
$("checkAll").addEventListener("change", (e) => {
  document.querySelectorAll(".row-check").forEach(cb => cb.checked = e.target.checked);
  selected.clear();
  if (e.target.checked) document.querySelectorAll(".row-check").forEach(cb => selected.add(cb.dataset.uid));
});
let chartCompare = null;
$("compareBtn").onclick = async () => {
  const sel = [...selected];
  if (sel.length < 1 || sel.length > 4) { appendLog(`\n[对比] 请先在达人列表勾选 1-4 个账号（当前 ${sel.length} 个）\n`); switchView("list"); return; }
  const rows = sel.map(uid => state.rows.find(r => r.user_id === uid)).filter(Boolean);
  $("compareTable").innerHTML = `<tr><th>指标</th>${rows.map(r => `<th>${esc(r.nickname)}</th>`).join("")}</tr>` +
    ["score", "followers_num", "interaction_ratio", "avg_likes", "avg_comments", "tier", "region"].map(k => `<tr><td>${k}</td>${rows.map(r => `<td>${esc(r[k])}</td>`).join("")}</tr>`).join("");
  if (!chartCompare) chartCompare = echarts.init($("chartCompare"));
  chartCompare.setOption({ backgroundColor: "transparent", grid: { left: 8, right: 20, top: 30, bottom: 8, containLabel: true }, xAxis: { type: "category", data: ["评分", "粉丝(万)", "互动率", "均赞/篇"] }, yAxis: { type: "value", ...AXIS }, legend: { top: 0, textStyle: { color: "#7fb4d4" } }, series: rows.map((r, i) => ({ name: r.nickname, type: "bar", barMaxWidth: 24, data: [r._score || 0, ((r.followers_num || 0) / 10000), parseFloat(r.interaction_ratio) || 0, parseFloat(r.avg_likes) || 0], itemStyle: { color: ["#00e5ff", "#ff2d95", "#00ff9d", "#ffb020", "#a78bfa"][i % 5] } })), tooltip: { trigger: "axis", backgroundColor: "#0a1322", borderColor: "rgba(0,229,255,.4)", textStyle: { color: "#d6e4ff" } } }, true);
  $("compareMask").classList.remove("hidden");
};
$("compareClose").onclick = () => $("compareMask").classList.add("hidden");
$("compareMask").onclick = (e) => { if (e.target === $("compareMask")) $("compareMask").classList.add("hidden"); };

// ============ 达人详情/趋势 ============
let detailUid = "", chartTrend2 = null;
async function showTrend(uid, nickname) {
  $("trendTitle").textContent = `◇ 达人详情 · ${nickname || uid}`;
  $("trendMask").classList.remove("hidden");
  detailUid = uid;
  const notes = await window.api.getNotes();
  const n = notes[uid] || {};
  $("noteInput").value = n.note || "";
  $("noteTagsInput").value = (n.tags || []).join(",");
  $("blacklistChk").checked = !!n.blacklisted;
  const points = await window.api.getTrend(uid);
  if (!chartTrend2) chartTrend2 = echarts.init($("chartTrend2"));
  chartTrend2.setOption({ backgroundColor: "transparent", grid: { left: 8, right: 20, top: 30, bottom: 30, containLabel: true }, xAxis: { type: "category", data: points.map(p => p.ts.slice(5, 16).replace("T", " ")), ...AXIS }, yAxis: { type: "value", ...AXIS }, series: [{ type: "line", smooth: true, data: points.map(p => p.followers_num), symbolSize: 6, lineStyle: { color: "#00e5ff", width: 2 }, itemStyle: { color: "#ff2d95" }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: "rgba(0,229,255,.35)" }, { offset: 1, color: "rgba(0,229,255,0)" }]) } }], tooltip: { trigger: "axis", backgroundColor: "#0a1322", borderColor: "rgba(0,229,255,.4)", textStyle: { color: "#d6e4ff" } } }, true);
  if (points.length < 2) $("chartTrend2").innerHTML = '<div style="color:#6b84b0;padding:40px;text-align:center">快照不足（需至少 2 个时间点）</div>';
}
$("trendClose").onclick = () => $("trendMask").classList.add("hidden");
$("trendMask").onclick = (e) => { if (e.target === $("trendMask")) $("trendMask").classList.add("hidden"); };
$("noteSave").onclick = async () => {
  if (!detailUid) return;
  await window.api.saveNote(detailUid, { note: $("noteInput").value.trim(), tags: $("noteTagsInput").value.split(",").map(t => t.trim()).filter(Boolean), blacklisted: $("blacklistChk").checked });
  appendLog("\n[备注] 已保存\n");
  const s = await window.api.getState(); renderState(s);
};

// ============ 验证码记录 ============
$("captchaListBtn") && ($("captchaListBtn").onclick = async () => {
  const data = await window.api.getCaptchaEvents();
  $("captchaList").innerHTML = data.events.slice().reverse().map(e => {
    const shotName = e.shot ? e.shot.split("/").pop() : "";
    const btn = shotName ? `<button class="mini" data-shot="${esc(shotName)}">查看截图</button>` : "";
    return `<div class="cap-row"><span class="mono">${esc(e.user_id)}</span><span class="mono dim">${esc(e.ts)}</span>${btn}</div>`;
  }).join("") || `<div style="color:#6b84b0;padding:12px">暂无验证码记录</div>`;
  $("captchaImg").src = "";
  $("captchaMask").classList.remove("hidden");
  document.querySelectorAll(".cap-row button[data-shot]").forEach(b => b.onclick = async () => { $("captchaImg").src = (await window.api.readImage(b.dataset.shot)) || ""; });
});
$("captchaClose") && ($("captchaClose").onclick = () => $("captchaMask").classList.add("hidden"));

// ============ 筛选 ============
function onFilterChange() {
  state.filter.search = $("search").value.trim();
  state.filter.region = $("regionFilter").value;
  state.filter.status = $("statusFilter").value;
  state.filter.tier = $("tierFilter").value;
  state.filter.industry = $("industryFilter").value.trim();
  state.filter.interact = $("interactFilter").value;
  state.filter.blacklist = $("blacklistFilter").value;
  state.filter.fansMin = $("fansMin").value === "" ? null : Number($("fansMin").value);
  state.filter.fansMax = $("fansMax").value === "" ? null : Number($("fansMax").value);
  applyFilters();
}
["search", "regionFilter", "statusFilter", "fansMin", "fansMax", "tierFilter", "interactFilter", "blacklistFilter"].forEach(id => $(id).addEventListener(id === "search" || id === "industryFilter" ? "input" : "change", onFilterChange));
$("industryFilter").addEventListener("input", onFilterChange);
$("clearFilter").onclick = () => {
  ["search", "regionFilter", "statusFilter", "tierFilter", "interactFilter", "blacklistFilter", "industryFilter", "fansMin", "fansMax"].forEach(id => $(id).value = "");
  onFilterChange();
};
document.querySelectorAll("th[data-key]").forEach(th => th.onclick = () => {
  const key = th.dataset.key;
  if (state.sort.key === key) state.sort.dir *= -1; else state.sort = { key, dir: 1 };
  document.querySelectorAll("th[data-key]").forEach(t => t.style.color = "");
  th.style.color = "#00e5ff";
  applyFilters();
});

// ============ 配置 ============
window.api.getConfig().then(cfg => {
  if (!cfg) return;
  if (cfg.concurrency) $("concurrency").value = cfg.concurrency;
  if (cfg.max != null) $("max").value = cfg.max;
  if (cfg.captchaBurst) $("captchaBurst").value = cfg.captchaBurst;
  if (cfg.cooldown != null) $("cooldown").value = cfg.cooldown;
  if (cfg.scheduleEnabled != null) $("scheduleEnabled") && ($("scheduleEnabled").checked = !!cfg.scheduleEnabled);
  if (cfg.reportEnabled != null) $("reportEnabled") && ($("reportEnabled").checked = !!cfg.reportEnabled);
  if (cfg.interactWeight) { weights.interact = Number(cfg.interactWeight); }
  if (cfg.growthWeight) { weights.growth = Number(cfg.growthWeight); }
  refreshRecentDirs();
});

window.addEventListener("resize", () => { [chartRank, chartTrend, chartTierPie, chartDashRegion, chartRatioDist, chartNotesTrend, chartCompare, chartTrend2].forEach(c => c && c.resize()); });

window.api.getState().then(renderState);
loadRankMap();
mktInit();
appendLog("就绪。左侧栏导航：流程引导 / 数据 / 采集工具 / 导出中心；点击行可查看详情与备注。\n");
