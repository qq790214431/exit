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
let mktProjects = { projects: [] }, mktCurrent = null, mktStage = "deconstruct";

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

function rowEditorHTML(rk, cols, rows) {
  let html = `<table class="row-editor"><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join("")}<th style="width:36px"></th></tr></thead><tbody>`;
  (rows || []).forEach((r, i) => {
    html += `<tr>${cols.map((c, j) => `<td><input data-row="${rk}" data-i="${i}" data-j="${j}" value="${esc(r[j] || "")}" /></td>`).join("")}<td><button class="mini row-del" data-key="${rk}" data-i="${i}">✕</button></td></tr>`;
  });
  html += `</tbody></table><button class="mini row-add" data-key="${rk}" data-cols="${cols.length}">＋ 添加一行</button>`;
  return html;
}

function renderMarketing() {
  $("marketingStage").innerHTML = `<div class="mkt-toolbar">
    <button id="mktNew">＋ 新建项目</button>
    <button id="mktExport">导出方案(Markdown)</button>
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
  $("mktExport").onclick = async () => {
    if (!mktCurrent) { appendLog("\n[全案营销] 请先打开一个项目\n"); return; }
    const p = mktProjects.projects.find(x => x.id === mktCurrent);
    if (!p) return;
    appendLog("\n[全案营销] 导出方案...\n");
    await window.api.exportProject(p);
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
      <div class="mkt-actions2"><button id="mktSave" class="primary">保存阶段</button><span class="filter-count" id="mktSaveTip"></span></div>
    </div>`;
  document.querySelectorAll(".mkt-stage").forEach(b => b.onclick = () => { mktStage = b.dataset.key; renderMktWorkspace(); });
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
    mktProjects = await window.api.saveProject(p);
    appendLog(`\n[全案营销] 已保存 ${st.title}\n`);
    renderMktList();
  };
}
async function mktInit() {
  try { mktProjects = await window.api.getProjects(); } catch (e) { mktProjects = { projects: [] }; }
}

window.api.getState().then(renderState);
loadRankMap();
mktInit();
appendLog("就绪。左侧栏导航：流程引导 / 数据 / 采集工具 / 导出中心；点击行可查看详情与备注。\n");
