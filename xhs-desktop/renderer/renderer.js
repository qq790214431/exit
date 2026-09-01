const $ = (id) => document.getElementById(id);

const state = {
  running: false,
  logBuf: "",
  rows: [],
  filter: { search: "", region: "", fansMin: null, fansMax: null, status: "", tier: "", industry: "", interact: "" },
  sort: { key: "followers_num", dir: -1 }
};
let logMax = 4000;
let chartRegion = null, chartFans = null;
let regionSelectInited = false;

const TIER_BASE = { "素人": 20, "尾部": 40, "腰部": 60, "头部": 80 };
let rankMap = {}; // user_id -> delta_pct（来自涨粉榜，评分用）
const weights = { interact: 20, growth: 12 };
async function loadRankMap() {
  try { const r = await window.api.getGrowthRanking(); rankMap = {}; for (const x of r) rankMap[x.user_id] = x.delta_pct; } catch (e) {}
}
function computeScore(row, median) {
  let s = TIER_BASE[row.tier] || 0;
  const iw = (weights.interact || 20) / 20;
  const gw = (weights.growth || 12) / 12;
  const ratio = parseFloat(row.interaction_ratio);
  if (!isNaN(ratio) && median != null && median > 0) {
    if (ratio >= median * 1.5) s += 20 * iw;
    else if (ratio >= median) s += 12 * iw;
    else s += 4 * iw;
  } else if (!isNaN(ratio)) s += 6 * iw;
  const dp = rankMap[row.user_id];
  if (dp != null) {
    if (dp >= 20) s += 12 * gw;
    else if (dp >= 5) s += 8 * gw;
    else if (dp > 0) s += 4 * gw;
    else if (dp < -10) s -= 8 * gw;
  }
  return Math.max(0, Math.min(100, Math.round(s)));
}
function esc(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderState(s) {
  $("dataDir").textContent = s.dataDir;
  $("overallText").textContent = `${s.doneOk} / ${s.total}`;
  $("percent").textContent = s.total ? Math.round(s.doneOk / s.total * 100) + "%" : "-";
  $("overallBar").style.width = s.total ? (s.doneOk / s.total * 100) + "%" : "0%";
  $("roundText").textContent = s.round && s.round.total ? `本轮 ${s.round.done}/${s.round.total}` : "";
  $("stTotal").textContent = s.total;
  $("stOk").textContent = s.doneOk;
  $("stFansTotal").textContent = fmt(s.stats.fansTotal);
  $("stFansAvg").textContent = fmt(s.stats.fansAvg);
  $("stFans10k").textContent = s.stats.fans10k;
  $("stFail").textContent = s.stats.fail + (s.stats.abandoned ? ` (+放弃${s.stats.abandoned})` : "");
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

function fmt(n) {
  if (n == null || isNaN(n)) return "-";
  if (n >= 100000000) return (n / 100000000).toFixed(1) + "亿";
  if (n >= 10000) return (n / 10000).toFixed(1) + "万";
  return String(n);
}

function initRegionSelect(rows) {
  regionSelectInited = true;
  const regions = [...new Set(rows.map(r => r.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh"));
  const sel = $("regionFilter");
  for (const r of regions) {
    const opt = document.createElement("option");
    opt.value = r; opt.textContent = r;
    sel.appendChild(opt);
  }
}

function tierMedians() {
  const byTier = {};
  for (const r of state.rows) {
    if (r.status !== "ok" || !r.tier) continue;
    const v = parseFloat(r.interaction_ratio);
    if (isNaN(v)) continue;
    (byTier[r.tier] = byTier[r.tier] || []).push(v);
  }
  const med = {};
  for (const t of Object.keys(byTier)) {
    const a = byTier[t].sort((x, y) => x - y);
    const mid = Math.floor(a.length / 2);
    med[t] = a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  }
  return med;
}

function currentRows() {
  const f = state.filter;
  const med = tierMedians();
  let rows = state.rows;
  if (f.search) {
    const q = f.search.toLowerCase();
    rows = rows.filter(r => (r.nickname || "").toLowerCase().includes(q) || (r.red_id || "").toLowerCase().includes(q) || (r.region || "").toLowerCase().includes(q));
  }
  if (f.region) rows = rows.filter(r => r.region === f.region);
  if (f.status) rows = rows.filter(r => r.status === f.status);
  if (f.fansMin != null && f.fansMin !== "") rows = rows.filter(r => (r.followers_num ?? -1) >= f.fansMin);
  if (f.fansMax != null && f.fansMax !== "") rows = rows.filter(r => (r.followers_num ?? -1) <= f.fansMax);
  if (f.tier) rows = rows.filter(r => r.tier === f.tier);
  if (f.industry) rows = rows.filter(r => (r.industry || "").includes(f.industry));
  if (f.blacklist === "normal") rows = rows.filter(r => !r.blacklisted);
  else if (f.blacklist === "black") rows = rows.filter(r => r.blacklisted);
  if (f.interact) {
    rows = rows.filter(r => {
      const v = parseFloat(r.interaction_ratio);
      if (isNaN(v) || !r.tier || med[r.tier] == null) return false;
      return f.interact === "high" ? v >= med[r.tier] : v < med[r.tier];
    });
  }
  rows = rows.map(r => ({ ...r, _score: computeScore(r, med[r.tier]) }));
  const { key, dir } = state.sort;
  rows = rows.slice().sort((a, b) => {
    if (key === "followers_num") return ((a[key] ?? -1) - (b[key] ?? -1)) * dir;
    if (key === "score") return ((a._score ?? 0) - (b._score ?? 0)) * dir;
    return String(a[key] ?? "").localeCompare(String(b[key] ?? ""), "zh") * dir;
  });
  return rows;
}

function benchMark(r) {
  if (r.status !== "ok" || !r.tier) return "";
  const v = parseFloat(r.interaction_ratio);
  if (isNaN(v)) return "";
  const med = tierMedians()[r.tier];
  if (med == null) return "";
  return v >= med ? '<span class="bench high" title="高于同群基准">▲</span>' : '<span class="bench low" title="低于同群基准">▼</span>';
}

function applyFilters() {
  const rows = currentRows();
  $("filterCount").textContent = `显示 ${rows.length} / ${state.rows.length}`;
  $("tbody").innerHTML = rows.map(r => {
    const st = r.status || "-";
    return `<tr data-uid="${esc(r.user_id)}" title="点击查看详情/趋势/备注" style="${r.blacklisted ? "opacity:.55" : ""}">
      <td><b style="color:${r._score >= 80 ? "var(--green)" : r._score >= 60 ? "var(--cyan)" : "var(--dim)"}">${r._score || "-"}</b></td>
      <td>${r.blacklisted ? "🔒 " : ""}${esc(r.nickname)}</td>
      <td>${esc(r.red_id)}</td>
      <td>${esc(r.region)}</td>
      <td>${esc(r.followers)}</td>
      <td>${esc(r.followers_num)}</td>
      <td>${esc(r.likes_collects_num)}</td>
      <td>${esc(r.interaction_ratio)}${benchMark(r)}</td>
      <td>${esc(r.tier)}</td>
      <td>${esc(r.age)}</td>
      <td>${esc(r.constellation)}</td>
      <td>${esc(r.industry)}</td>
      <td>${(r.user_tags || []).map(t => `<span class="chip" style="color:var(--purple);border-color:rgba(167,139,250,.4);padding:1px 7px;font-size:11px">${esc(t)}</span>`).join(" ")} ${esc(r.note)}</td>
      <td><span class="status-pill ${st}">${st}</span></td>
    </tr>`;
  }).join("") || `<tr><td colspan="16" style="color:#6b84b0">无匹配数据</td></tr>`;
  document.querySelectorAll("#tbody tr[data-uid]").forEach(tr => {
    tr.onclick = () => showTrend(tr.dataset.uid, tr.children[0].textContent);
  });
  renderCharts(rows);
}

const AXIS = { axisLine: { lineStyle: { color: "rgba(0,229,255,.25)" } }, axisLabel: { color: "#7fb4d4" }, splitLine: { lineStyle: { color: "rgba(0,229,255,.06)" } } };

function renderCharts(rows) {
  if (!window.echarts) return;
  if (!chartRegion) chartRegion = echarts.init($("chartRegion"));
  if (!chartFans) chartFans = echarts.init($("chartFans"));
  const okRows = rows.filter(r => r.status === "ok");

  const regCount = {};
  for (const r of okRows) { if (r.region) regCount[r.region] = (regCount[r.region] || 0) + 1; }
  const regData = Object.entries(regCount).sort((a, b) => b[1] - a[1]).slice(0, 15).reverse();
  chartRegion.setOption({
    backgroundColor: "transparent",
    grid: { left: 8, right: 40, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: "value", minInterval: 1, ...AXIS },
    yAxis: { type: "category", data: regData.map(d => d[0]), axisLine: { lineStyle: { color: "rgba(0,229,255,.25)" } }, axisLabel: { color: "#7fb4d4" } },
    series: [{ type: "bar", data: regData.map(d => d[1]), barMaxWidth: 16,
      itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: "#00e5ff" }, { offset: 1, color: "#ff2d95" }]), borderRadius: [0, 4, 4, 0] } }],
    tooltip: { trigger: "axis", backgroundColor: "#0a1322", borderColor: "rgba(0,229,255,.4)", textStyle: { color: "#d6e4ff" } }
  }, true);

  const buckets = { "<100": 0, "100-999": 0, "1k-1万": 0, "1万+": 0 };
  for (const r of okRows) {
    const n = r.followers_num;
    if (n == null) continue;
    if (n < 100) buckets["<100"]++;
    else if (n < 1000) buckets["100-999"]++;
    else if (n < 10000) buckets["1k-1万"]++;
    else buckets["1万+"]++;
  }
  const fanKeys = ["<100", "100-999", "1k-1万", "1万+"];
  chartFans.setOption({
    backgroundColor: "transparent",
    grid: { left: 8, right: 40, top: 30, bottom: 8, containLabel: true },
    xAxis: { type: "category", data: fanKeys, ...AXIS },
    yAxis: { type: "value", minInterval: 1, ...AXIS },
    series: [{ type: "bar", data: fanKeys.map(k => buckets[k]), barMaxWidth: 42,
      itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: "#ff2d95" }, { offset: 1, color: "#7f5bff" }]), borderRadius: [4, 4, 0, 0] } }],
    tooltip: { trigger: "axis", backgroundColor: "#0a1322", borderColor: "rgba(255,45,149,.4)", textStyle: { color: "#d6e4ff" } }
  }, true);
}

function appendLog(text) {
  state.logBuf += text;
  if (state.logBuf.length > logMax) state.logBuf = state.logBuf.slice(-logMax);
  $("log").textContent = state.logBuf;
  $("log").scrollTop = $("log").scrollHeight;
}

function getOpts() {
  return {
    concurrency: Number($("concurrency").value) || 3,
    max: Number($("max").value) || 0,
    captchaBurst: Number($("captchaBurst").value) || 8,
    cooldown: Number($("cooldown").value) || 0
  };
}

function setRunning(running) {
  state.running = running;
  $("startBtn").disabled = running;
  $("stopBtn").disabled = !running;
  $("status").textContent = running ? "RUNNING…" : "STANDBY";
}

async function runMode(mode, confirmText) {
  if (confirmText && !confirm(confirmText)) return;
  const opts = getOpts();
  appendLog(`\n[启动模式: ${mode}]\n`);
  const s = await window.api.runMode(mode, opts);
  renderState(s);
  appendLog(`[模式完成: ${mode}]\n`);
}

window.api.onStatus((s) => { $("status").textContent = s.text; setRunning(s.running); });
window.api.onState(renderState);
window.api.onLog(appendLog);

$("startBtn").onclick = () => { window.api.saveConfig(getOpts()); window.api.start(getOpts()); };
$("stopBtn").onclick = () => window.api.stop();
$("refillBtn").onclick = () => runMode("refill", "补全缺失：只重采缺粉丝数/地区的账号？");
$("refreshBtn").onclick = () => runMode("refresh", "刷新粉丝：重采所有成功账号（用于涨粉分析）？");
$("retryBtn").onclick = () => runMode("retry", "重试失败：清除放弃标记并重试失败账号？");
$("compactBtn").onclick = () => runMode("compact", "压缩进度：progress.jsonl 保留每账号最新一条（自动备份）？");
$("exportBtn").onclick = async () => {
  $("exportBtn").disabled = true;
  appendLog("\n[导出 CSV]...\n");
  const s = await window.api.exportCsv();
  renderState(s);
  $("exportBtn").disabled = false;
};
$("exportXlsxBtn").onclick = async () => {
  $("exportXlsxBtn").disabled = true;
  appendLog("\n[导出 Excel]...\n");
  const s = await window.api.exportXlsx();
  renderState(s);
  $("exportXlsxBtn").disabled = false;
};
$("growthBtn").onclick = () => window.api.openDir();
$("exportFilteredBtn").onclick = async () => {
  const rows = currentRows();
  if (!rows.length) { appendLog("\n[导出筛选] 当前无匹配行\n"); return; }
  $("exportFilteredBtn").disabled = true;
  appendLog(`\n[导出筛选] 导出 ${rows.length} 行...\n`);
  const r = await window.api.exportRows(rows);
  appendLog(`已导出: ${r.csv} / ${r.xlsx}\n`);
  $("exportFilteredBtn").disabled = false;
};
$("pickDirBtn").onclick = async () => {
  const s = await window.api.pickDir();
  if (s) { renderState(s); refreshRecentDirs(); }
};
function refreshRecentDirs() {
  window.api.getConfig().then(cfg => {
    const sel = $("recentDirs");
    const cur = sel.value;
    sel.innerHTML = '<option value="">最近目录…</option>' + (cfg.recentDirs || []).map(d =>
      `<option value="${esc(d)}">${esc(d)}</option>`).join("");
    sel.value = "";
  });
}
$("recentDirs").addEventListener("change", async () => {
  const v = $("recentDirs").value;
  if (!v) return;
  const s = await window.api.switchDir(v);
  if (s) renderState(s);
  refreshRecentDirs();
});
$("openDirBtn").onclick = () => window.api.openDir();
window.api.getConfig().then(() => refreshRecentDirs());
$("openDirBtn").onclick = () => window.api.openDir();

// 标签页切换
function hideAllViews() { $("viewList").classList.add("hidden"); $("viewRank").classList.add("hidden"); $("viewDash").classList.add("hidden"); }
function setTab(active) { ["tabList", "tabRank", "tabDash"].forEach(t => $(t).classList.toggle("active", t === active)); }
$("tabList").onclick = () => { setTab("tabList"); hideAllViews(); $("viewList").classList.remove("hidden"); };
$("tabRank").onclick = () => { setTab("tabRank"); hideAllViews(); $("viewRank").classList.remove("hidden"); loadRanking(); };
$("tabDash").onclick = () => { setTab("tabDash"); hideAllViews(); $("viewDash").classList.remove("hidden"); loadDashboard(); };
let chartRank = null;
async function loadRanking() {
  const ranking = await window.api.getGrowthRanking();
  $("rankCount").textContent = `可计算 ${ranking.length} 个账号`;
  $("rankTbody").innerHTML = ranking.map((r, i) => `<tr>
    <td>${i + 1}</td>
    <td>${esc(r.nickname)}</td>
    <td>${esc(r.region)}</td>
    <td><span class="status-pill ok">${esc(r.tier)}</span></td>
    <td>${r.base}</td>
    <td>${r.now}</td>
    <td style="color:${r.delta >= 0 ? "var(--green)" : "var(--red)"}">${r.delta >= 0 ? "+" : ""}${r.delta}</td>
    <td>${r.delta_pct ?? "-"}</td>
    <td>${r.snapshots}</td>
  </tr>`).join("") || `<tr><td colspan="9" style="color:#6b84b0">暂无数据：需先 SEED/REFRESH 积累至少 2 个时间点的快照</td></tr>`;
  if (!chartRank) chartRank = echarts.init($("chartRank"));
  const top = ranking.slice(0, 10).reverse();
  chartRank.setOption({
    backgroundColor: "transparent",
    grid: { left: 8, right: 40, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: "value", ...AXIS },
    yAxis: { type: "category", data: top.map(r => r.nickname), axisLine: { lineStyle: { color: "rgba(0,229,255,.25)" } }, axisLabel: { color: "#7fb4d4" } },
    series: [{ type: "bar", data: top.map(r => r.delta), barMaxWidth: 18,
      itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: "#00e5ff" }, { offset: 1, color: "#00ff9d" }]), borderRadius: [0, 4, 4, 0] } }],
    tooltip: { trigger: "axis", backgroundColor: "#0a1322", borderColor: "rgba(0,229,255,.4)", textStyle: { color: "#d6e4ff" } }
  }, true);
}
$("rankRefresh").onclick = () => { loadRanking(); loadRankMap(); };

// 数据看板
let chartDashTrend = null, chartTierPie = null, chartDashRegion = null, chartRatioDist = null;
async function loadDashboard() {
  const okRows = state.rows.filter(r => r.status === "ok");
  const darkAxis = { axisLine: { lineStyle: { color: "rgba(0,229,255,.25)" } }, axisLabel: { color: "#7fb4d4" }, splitLine: { lineStyle: { color: "rgba(0,229,255,.06)" } } };

  const tierCount = {};
  for (const r of okRows) if (r.tier) tierCount[r.tier] = (tierCount[r.tier] || 0) + 1;
  if (!chartTierPie) chartTierPie = echarts.init($("chartTierPie"));
  chartTierPie.setOption({
    backgroundColor: "transparent",
    series: [{ type: "pie", radius: ["42%", "68%"], data: Object.entries(tierCount).map(([n, v]) => ({ name: n, value: v })), label: { color: "#d6e4ff" } }],
    legend: { bottom: 0, textStyle: { color: "#7fb4d4" } },
    tooltip: { trigger: "item", backgroundColor: "#0a1322", borderColor: "rgba(0,229,255,.4)", textStyle: { color: "#d6e4ff" } }
  }, true);

  const regCount = {};
  for (const r of okRows) if (r.region) regCount[r.region] = (regCount[r.region] || 0) + 1;
  const regTop = Object.entries(regCount).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (!chartDashRegion) chartDashRegion = echarts.init($("chartDashRegion"));
  chartDashRegion.setOption({
    backgroundColor: "transparent",
    grid: { left: 8, right: 30, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: "value", minInterval: 1, ...darkAxis },
    yAxis: { type: "category", data: regTop.map(d => d[0]).reverse(), axisLine: { lineStyle: { color: "rgba(0,229,255,.25)" } }, axisLabel: { color: "#7fb4d4" } },
    series: [{ type: "bar", data: regTop.map(d => d[1]).reverse(), barMaxWidth: 16, itemStyle: { color: "#00e5ff" } }],
    tooltip: { trigger: "axis", backgroundColor: "#0a1322", borderColor: "rgba(0,229,255,.4)", textStyle: { color: "#d6e4ff" } }
  }, true);

  const buckets = { "<1": 0, "1-3": 0, "3-5": 0, "5-10": 0, "10+": 0 };
  for (const r of okRows) { const v = parseFloat(r.interaction_ratio); if (isNaN(v)) continue; if (v < 1) buckets["<1"]++; else if (v < 3) buckets["1-3"]++; else if (v < 5) buckets["3-5"]++; else if (v < 10) buckets["5-10"]++; else buckets["10+"]++; }
  if (!chartRatioDist) chartRatioDist = echarts.init($("chartRatioDist"));
  chartRatioDist.setOption({
    backgroundColor: "transparent",
    grid: { left: 8, right: 30, top: 20, bottom: 8, containLabel: true },
    xAxis: { type: "category", data: Object.keys(buckets), ...darkAxis },
    yAxis: { type: "value", minInterval: 1, ...darkAxis },
    series: [{ type: "bar", data: Object.values(buckets), barMaxWidth: 40, itemStyle: { color: "#ff2d95" } }],
    tooltip: { trigger: "axis", backgroundColor: "#0a1322", borderColor: "rgba(255,45,149,.4)", textStyle: { color: "#d6e4ff" } }
  }, true);

  const dash = await window.api.getDashboard();
  if (!chartDashTrend) chartDashTrend = echarts.init($("chartDashTrend"));
  chartDashTrend.setOption({
    backgroundColor: "transparent",
    grid: { left: 8, right: 30, top: 20, bottom: 8, containLabel: true },
    xAxis: { type: "category", data: dash.trend.map(t => t.day), ...darkAxis },
    yAxis: { type: "value", ...darkAxis },
    series: [{ type: "line", smooth: true, data: dash.trend.map(t => t.total), symbolSize: 5, lineStyle: { color: "#00e5ff", width: 2 }, itemStyle: { color: "#00e5ff" }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: "rgba(0,229,255,.3)" }, { offset: 1, color: "rgba(0,229,255,0)" }]) } }],
    tooltip: { trigger: "axis", backgroundColor: "#0a1322", borderColor: "rgba(0,229,255,.4)", textStyle: { color: "#d6e4ff" } }
  }, true);
  $("dashSummary").textContent = `粉丝总量趋势：快照覆盖 ${dash.trend.length} 天 · 当前粉丝总量 ${fmt(dash.trend.length ? dash.trend[dash.trend.length - 1].total : 0)} · 最近更新 ${dash.lastUpdate || "-"}`;
}

// 导出运营档案
$("profileBtn").onclick = async () => {
  appendLog("\n[导出档案] 生成达人运营档案...\n");
  const s = await window.api.exportProfiles();
  renderState(s);
};

// 验证码记录弹窗
$("captchaListBtn").onclick = async () => {
  const data = await window.api.getCaptchaEvents();
  const rows = data.events.slice().reverse().map(e => {
    const shotName = e.shot ? e.shot.split("/").pop() : "";
    const btn = shotName ? `<button class="mini" data-shot="${esc(shotName)}">查看截图</button>` : "";
    return `<div class="cap-row"><span class="mono">${esc(e.user_id)}</span><span class="mono dim">${esc(e.ts)}</span>${btn}</div>`;
  }).join("") || `<div style="color:#6b84b0;padding:12px">暂无验证码记录</div>`;
  $("captchaList").innerHTML = rows;
  $("captchaImg").src = "";
  $("captchaMask").classList.remove("hidden");
  document.querySelectorAll(".cap-row button[data-shot]").forEach(b => {
    b.onclick = async () => {
      const dataUrl = await window.api.readImage(b.dataset.shot);
      $("captchaImg").src = dataUrl || "";
    };
  });
};
$("captchaClose").onclick = () => $("captchaMask").classList.add("hidden");
$("captchaMask").onclick = (e) => { if (e.target === $("captchaMask")) $("captchaMask").classList.add("hidden"); };

// 粉丝趋势弹窗
let chartTrend = null;
let detailUid = "";
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
  if (!chartTrend) chartTrend = echarts.init($("chartTrend"));
  chartTrend.setOption({
    backgroundColor: "transparent",
    grid: { left: 8, right: 20, top: 30, bottom: 30, containLabel: true },
    xAxis: { type: "category", data: points.map(p => p.ts.slice(5, 16).replace("T", " ")), ...AXIS },
    yAxis: { type: "value", ...AXIS },
    series: [{
      type: "line", smooth: true, data: points.map(p => p.followers_num), symbolSize: 6,
      lineStyle: { color: "#00e5ff", width: 2 }, itemStyle: { color: "#ff2d95" },
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: "rgba(0,229,255,.35)" }, { offset: 1, color: "rgba(0,229,255,0)" }]) }
    }],
    tooltip: { trigger: "axis", backgroundColor: "#0a1322", borderColor: "rgba(0,229,255,.4)", textStyle: { color: "#d6e4ff" } }
  }, true);
  if (points.length < 2) $("chartTrend").innerHTML = '<div style="color:#6b84b0;padding:40px;text-align:center">快照不足（需至少 2 个时间点），请先 REFRESH 刷新几轮</div>';
}
$("trendClose").onclick = () => $("trendMask").classList.add("hidden");
$("noteSave").onclick = async () => {
  if (!detailUid) return;
  await window.api.saveNote(detailUid, {
    note: $("noteInput").value.trim(),
    tags: $("noteTagsInput").value.split(",").map(t => t.trim()).filter(Boolean),
    blacklisted: $("blacklistChk").checked
  });
  appendLog("\n[备注] 已保存\n");
  const s = await window.api.getState();
  renderState(s);
};
$("trendMask").onclick = (e) => { if (e.target === $("trendMask")) $("trendMask").classList.add("hidden"); };

// 导入链接弹窗
const modalMask = $("modalMask");
$("importBtn").onclick = () => { $("importResult").textContent = ""; $("linksText").value = ""; modalMask.classList.remove("hidden"); };
$("modalCancel").onclick = () => modalMask.classList.add("hidden");
$("modalOk").onclick = async () => {
  const text = $("linksText").value.trim();
  if (!text) { $("importResult").textContent = "请先粘贴链接"; return; }
  $("modalOk").disabled = true;
  $("importResult").textContent = "导入中…\n";
  const r = await window.api.importLinks(text);
  $("importResult").textContent = r.result;
  renderState(r.state);
  $("modalOk").disabled = false;
};

// 配置持久化：恢复上次设置
window.api.getConfig().then(cfg => {
  if (cfg) {
    if (cfg.concurrency) $("concurrency").value = cfg.concurrency;
    if (cfg.max != null) $("max").value = cfg.max;
    if (cfg.captchaBurst) $("captchaBurst").value = cfg.captchaBurst;
    if (cfg.cooldown != null) $("cooldown").value = cfg.cooldown;
    if (cfg.scheduleEnabled != null) $("scheduleEnabled").checked = !!cfg.scheduleEnabled;
    if (cfg.scheduleTime) $("scheduleTime").value = cfg.scheduleTime;
    if (cfg.interactWeight) { weights.interact = Number(cfg.interactWeight); $("interactWeight").value = cfg.interactWeight; }
    if (cfg.growthWeight) { weights.growth = Number(cfg.growthWeight); $("growthWeight").value = cfg.growthWeight; }
    if (cfg.reportEnabled != null) $("reportEnabled").checked = !!cfg.reportEnabled;
    if (cfg.reportDay != null) $("reportDay").value = cfg.reportDay;
    if (cfg.reportTime) $("reportTime").value = cfg.reportTime;
  }
});
["reportEnabled", "reportDay", "reportTime"].forEach(id => {
  $(id).addEventListener("change", () => {
    window.api.saveConfig({ reportEnabled: $("reportEnabled").checked, reportDay: $("reportDay").value, reportTime: $("reportTime").value });
    appendLog(`\n[周报定时] ${$("reportEnabled").checked ? "已启用" : "已停用"}（${["周日","周一","周二","周三","周四","周五","周六"][Number($("reportDay").value)]} ${$("reportTime").value}）\n`);
  });
});
["interactWeight", "growthWeight"].forEach(id => {
  $(id).addEventListener("change", () => {
    weights.interact = Number($("interactWeight").value) || 20;
    weights.growth = Number($("growthWeight").value) || 12;
    window.api.saveConfig({ interactWeight: weights.interact, growthWeight: weights.growth });
    applyFilters();
  });
});
["scheduleEnabled", "scheduleTime"].forEach(id => {
  $(id).addEventListener("change", () => {
    window.api.saveConfig({ scheduleEnabled: $("scheduleEnabled").checked, scheduleTime: $("scheduleTime").value });
    appendLog(`\n[定时刷新] ${$("scheduleEnabled").checked ? "已启用" : "已停用"}（${$("scheduleTime").value}）\n`);
  });
});

// 筛选与排序
function onFilterChange() {
  state.filter.search = $("search").value.trim();
  state.filter.region = $("regionFilter").value;
  state.filter.status = $("statusFilter").value;
  state.filter.fansMin = $("fansMin").value === "" ? null : Number($("fansMin").value);
  state.filter.fansMax = $("fansMax").value === "" ? null : Number($("fansMax").value);
  state.filter.tier = $("tierFilter").value;
  state.filter.industry = $("industryFilter").value.trim();
  state.filter.interact = $("interactFilter").value;
  state.filter.blacklist = $("blacklistFilter").value;
  applyFilters();
}
["search", "regionFilter", "statusFilter", "fansMin", "fansMax", "tierFilter", "interactFilter", "blacklistFilter"].forEach(id => {
  $(id).addEventListener(id === "search" || id === "industryFilter" ? "input" : "change", onFilterChange);
});
$("industryFilter").addEventListener("input", onFilterChange);
$("clearFilter").onclick = () => {
  $("search").value = ""; $("regionFilter").value = ""; $("statusFilter").value = ""; $("fansMin").value = ""; $("fansMax").value = "";
  $("tierFilter").value = ""; $("industryFilter").value = ""; $("interactFilter").value = ""; $("blacklistFilter").value = "";
  onFilterChange();
};
$("captchaBtn").onclick = () => window.api.openScreenshots();
$("reportBtn").onclick = async () => { appendLog("\n[周报] 生成中...\n"); await window.api.runReport(); };
$("backupBtn").onclick = async () => {
  appendLog("\n[备份] 打包中...\n");
  const r = await window.api.backup();
  appendLog(r.ok ? `[备份] 成功（${r.count} 个文件）: ${r.path}\n` : `[备份] 失败: ${r.error}\n`);
};
document.querySelectorAll("th[data-key]").forEach(th => {
  th.onclick = () => {
    const key = th.dataset.key;
    if (state.sort.key === key) state.sort.dir *= -1; else state.sort = { key, dir: 1 };
    document.querySelectorAll("th[data-key]").forEach(t => t.style.color = "");
    th.style.color = "#00e5ff";
    applyFilters();
  };
});

window.addEventListener("resize", () => { [chartRegion, chartFans, chartRank, chartTrend, chartDashTrend, chartTierPie, chartDashRegion, chartRatioDist].forEach(c => c && c.resize()); });

window.api.getState().then(renderState);
loadRankMap();
appendLog("就绪。点击行可查看详情/趋势/备注；筛选后可导出。\n");
