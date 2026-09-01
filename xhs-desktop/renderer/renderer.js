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
    let av = a[key], bv = b[key];
    if (key === "followers_num") { av = av ?? -1; bv = bv ?? -1; return (av - bv) * dir; }
    return String(av ?? "").localeCompare(String(bv ?? ""), "zh") * dir;
  });
  return rows;
}

function applyFilters() {
  const rows = currentRows();
  $("filterCount").textContent = `显示 ${rows.length} / ${state.rows.length}`;
  const rowsHtml = rows.map(r => {
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
  }).join("");
  $("tbody").innerHTML = rowsHtml || `<tr><td colspan="7" style="color:#999">无匹配数据</td></tr>`;
  renderCharts(rows);
}

function renderCharts(rows) {
  if (!window.echarts) return;
  if (!chartRegion) chartRegion = echarts.init($("chartRegion"));
  if (!chartFans) chartFans = echarts.init($("chartFans"));

  const regCount = {};
  const okRows = rows.filter(r => r.status === "ok");
  for (const r of okRows) { if (r.region) regCount[r.region] = (regCount[r.region] || 0) + 1; }
  const regData = Object.entries(regCount).sort((a, b) => b[1] - a[1]).slice(0, 15).reverse();

  chartRegion.setOption({
    grid: { left: 8, right: 40, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: "value", minInterval: 1 },
    yAxis: { type: "category", data: regData.map(d => d[0]) },
    series: [{ type: "bar", data: regData.map(d => d[1]), itemStyle: { color: "#ff2442" }, barMaxWidth: 16 }],
    tooltip: { trigger: "axis" }
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
    grid: { left: 8, right: 40, top: 30, bottom: 8, containLabel: true },
    xAxis: { type: "category", data: fanKeys },
    yAxis: { type: "value", minInterval: 1 },
    series: [{ type: "bar", data: fanKeys.map(k => buckets[k]), itemStyle: { color: "#ff7a45" }, barMaxWidth: 40 }],
    tooltip: { trigger: "axis" }
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
  $("status").textContent = running ? "运行中…" : "已停止";
}

window.api.onStatus((s) => { $("status").textContent = s.text; setRunning(s.running); });
window.api.onState(renderState);
window.api.onLog(appendLog);

$("startBtn").onclick = () => window.api.start(getOpts());
$("stopBtn").onclick = () => window.api.stop();
$("exportBtn").onclick = async () => {
  $("exportBtn").disabled = true;
  appendLog("\n[导出 CSV]...\n");
  const s = await window.api.exportCsv();
  renderState(s);
  $("exportBtn").disabled = false;
};
$("pickDirBtn").onclick = async () => { const s = await window.api.pickDir(); if (s) renderState(s); };
$("openDirBtn").onclick = () => window.api.openDir();

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
    th.style.color = "#ff2442";
    applyFilters();
  };
});

window.addEventListener("resize", () => { if (chartRegion) chartRegion.resize(); if (chartFans) chartFans.resize(); });

window.api.getState().then(renderState);
appendLog("就绪。选择数据目录（包含 urlmap.json / scrape.js / progress.jsonl）后点击开始采集。\n");
