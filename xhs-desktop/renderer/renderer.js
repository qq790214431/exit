const $ = (id) => document.getElementById(id);

const state = { running: false, logBuf: "" };
let logMax = 4000;

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

  const rowsHtml = s.rows.map(r => {
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
  $("tbody").innerHTML = rowsHtml || `<tr><td colspan="7" style="color:#999">暂无数据，请选择包含 urlmap.json 的目录</td></tr>`;
}

function esc(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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

window.api.onStatus((s) => {
  $("status").textContent = s.text;
  setRunning(s.running);
});
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
$("pickDirBtn").onclick = async () => {
  const s = await window.api.pickDir();
  if (s) renderState(s);
};
$("openDirBtn").onclick = () => window.api.openDir();

window.api.getState().then(renderState);
appendLog("就绪。选择数据目录（包含 urlmap.json / scrape.js / progress.jsonl）后点击开始采集。\n");
