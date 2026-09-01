const $ = (id) => document.getElementById(id);

const state = {
  running: false,
  logBuf: "",
  rows: [],
  filter: { search: "", region: "", fansMin: null, fansMax: null, status: "" },
  sort: { key: "followers_num", dir: -1 }
};
let logMax = 4000;
let chartRegion = null, chartFans = null;
let regionSelectInited = false;

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

function currentRows() {
  const f = state.filter;
  let rows = state.rows;
  if (f.search) {
    const q = f.search.toLowerCase();
    rows = rows.filter(r => (r.nickname || "").toLowerCase().includes(q) || (r.red_id || "").toLowerCase().includes(q) || (r.region || "").toLowerCase().includes(q));
  }
  if (f.region) rows = rows.filter(r => r.region === f.region);
  if (f.status) rows = rows.filter(r => r.status === f.status);
  if (f.fansMin != null && f.fansMin !== "") rows = rows.filter(r => (r.followers_num ?? -1) >= f.fansMin);
  if (f.fansMax != null && f.fansMax !== "") rows = rows.filter(r => (r.followers_num ?? -1) <= f.fansMax);
  const { key, dir } = state.sort;
  rows = rows.slice().sort((a, b) => {
    if (key === "followers_num") return ((a[key] ?? -1) - (b[key] ?? -1)) * dir;
    return String(a[key] ?? "").localeCompare(String(b[key] ?? ""), "zh") * dir;
  });
  return rows;
}

function applyFilters() {
  const rows = currentRows();
  $("filterCount").textContent = `显示 ${rows.length} / ${state.rows.length}`;
  $("tbody").innerHTML = rows.map(r => {
    const st = r.status || "-";
    return `<tr>
      <td>${esc(r.nickname)}</td>
      <td>${esc(r.red_id)}</td>
      <td>${esc(r.region)}</td>
      <td>${esc(r.followers)}</td>
      <td>${esc(r.followers_num)}</td>
      <td>${esc(r.tags)}</td>
      <td><span class="status-pill ${st}">${st}</span></td>
    </tr>`;
  }).join("") || `<tr><td colspan="7" style="color:#6b84b0">无匹配数据</td></tr>`;
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
$("pickDirBtn").onclick = async () => { const s = await window.api.pickDir(); if (s) renderState(s); };
$("openDirBtn").onclick = () => window.api.openDir();

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
  }
});

// 筛选与排序
function onFilterChange() {
  state.filter.search = $("search").value.trim();
  state.filter.region = $("regionFilter").value;
  state.filter.status = $("statusFilter").value;
  state.filter.fansMin = $("fansMin").value === "" ? null : Number($("fansMin").value);
  state.filter.fansMax = $("fansMax").value === "" ? null : Number($("fansMax").value);
  applyFilters();
}
["search", "regionFilter", "statusFilter", "fansMin", "fansMax"].forEach(id => {
  $(id).addEventListener(id === "search" ? "input" : "change", onFilterChange);
});
$("clearFilter").onclick = () => {
  $("search").value = ""; $("regionFilter").value = ""; $("statusFilter").value = ""; $("fansMin").value = ""; $("fansMax").value = "";
  onFilterChange();
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

window.addEventListener("resize", () => { if (chartRegion) chartRegion.resize(); if (chartFans) chartFans.resize(); });

window.api.getState().then(renderState);
appendLog("就绪。选择数据目录后点击「开始采集」；快捷操作可一键补全/刷新/重试/压缩/导入链接。\n");
