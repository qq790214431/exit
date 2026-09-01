const { app, BrowserWindow, ipcMain, dialog, shell, Notification } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");

// 打包后应用位于 .app 内部，默认数据目录改为探测常见位置
function defaultDataDir() {
  const home = process.env.HOME || "";
  const candidates = [
    path.join(__dirname, "..", "xhs采集"),
    path.join(home, "Desktop", "xhs采集"),
    path.join(home, "Documents", "xhs采集"),
    path.join(home, "Downloads", "xhs采集")
  ];
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch (e) {}
  }
  return candidates[0];
}

let win = null;
let dataDir = defaultDataDir();
let child = null;
let stopped = false;
let cooldownTimer = null;
let currentRound = 0;
let roundTotal = 0;
let roundDone = 0;
let config = {};
let configPath = "";

// ---------- 配置持久化 ----------
function loadConfig() {
  configPath = path.join(app.getPath("userData"), "config.json");
  try { config = JSON.parse(fs.readFileSync(configPath, "utf8")); } catch (e) { config = {}; }
  if (config.dataDir && fs.existsSync(config.dataDir)) dataDir = config.dataDir;
}
function saveConfig(patch) {
  config = { ...config, ...(patch || {}) };
  try { fs.writeFileSync(configPath, JSON.stringify(config, null, 2)); } catch (e) {}
}

// ---------- 数据读取 ----------
function readState(dir) {
  const progressFile = path.join(dir, "progress.jsonl");
  const urlmapFile = path.join(dir, "urlmap.json");
  const csvFile = path.join(dir, "xhs_profiles.csv");
  const abandonedFile = path.join(dir, "abandoned.json");
  const growthFile = path.join(dir, "xhs_growth.csv");
  let total = 0;
  if (fs.existsSync(urlmapFile)) {
    try { total = Object.keys(JSON.parse(fs.readFileSync(urlmapFile, "utf8"))).length; } catch (e) {}
  }
  const latest = {};
  if (fs.existsSync(progressFile)) {
    for (const line of fs.readFileSync(progressFile, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try { const j = JSON.parse(line); latest[j.user_id] = j; } catch (e) {}
    }
  }
  const statusCounts = {};
  const rows = [];
  let fansTotal = 0, fansCount = 0, fans10k = 0;
  for (const id of Object.keys(latest).sort()) {
    const j = latest[id];
    statusCounts[j.status] = (statusCounts[j.status] || 0) + 1;
    if (j.status === "ok") {
      const n = j.followers_num;
      if (n != null) { fansTotal += n; fansCount++; if (n >= 10000) fans10k++; }
    }
    rows.push({
      user_id: id,
      nickname: j.nickname || "",
      red_id: j.red_id || "",
      region: j.region || "",
      followers: j.followers || "",
      followers_num: j.followers_num ?? "",
      tags: j.tags || "",
      status: j.status || "",
      ts: j.ts || ""
    });
  }
  const doneOk = statusCounts.ok || 0;
  let abandoned = {};
  try { abandoned = JSON.parse(fs.readFileSync(abandonedFile, "utf8")); } catch (e) {}
  return {
    dataDir: dir,
    total,
    doneOk,
    attempts: rows.length,
    statusCounts,
    stats: {
      fansTotal,
      fansAvg: fansCount ? Math.round(fansTotal / fansCount) : 0,
      fans10k,
      fail: (statusCounts.captcha || 0) + (statusCounts.error || 0) + (statusCounts.no_data || 0),
      abandoned: Object.keys(abandoned).length
    },
    hasCsv: fs.existsSync(csvFile),
    csvRows: fs.existsSync(csvFile) ? fs.readFileSync(csvFile, "utf8").split("\n").filter(l => l.trim()).length - 1 : 0,
    hasGrowth: fs.existsSync(growthFile),
    rows
  };
}

// ---------- 子进程 ----------
function spawnOnce(env, label) {
  return new Promise(resolve => {
    const script = path.join(dataDir, "scrape.js");
    const c = spawn("node", [script], { cwd: dataDir, env });
    c.stdout.on("data", d => win.webContents.send("log", d.toString()));
    c.stderr.on("data", d => win.webContents.send("log", d.toString()));
    c.on("error", err => win.webContents.send("log", `启动失败: ${err.message}\n`));
    c.on("exit", code => { win.webContents.send("log", `\n[${label || "模式运行"}] 退出 code=${code}\n`); resolve(); });
  });
}

function runRound(opts) {
  if (child || stopped) return;
  const script = path.join(dataDir, "scrape.js");
  if (!fs.existsSync(script)) { win.webContents.send("log", `找不到 ${script}\n`); return; }
  currentRound++;
  roundDone = 0; roundTotal = 0;
  const env = { ...process.env };
  if (opts.max) env.MAX = String(opts.max);
  if (opts.concurrency) env.CONCURRENCY = String(opts.concurrency);
  if (opts.captchaBurst) env.CAPTCHA_BURST = String(opts.captchaBurst);
  child = spawn("node", [script], { cwd: dataDir, env });
  child.stdout.on("data", d => {
    const text = d.toString();
    win.webContents.send("log", text);
    const m = text.match(/\[(\d+)\/(\d+)/);
    if (m) { roundDone = Number(m[1]); roundTotal = Number(m[2]); }
  });
  child.stderr.on("data", d => win.webContents.send("log", d.toString()));
  child.on("error", err => win.webContents.send("log", `启动失败: ${err.message}\n`));
  child.on("exit", code => {
    child = null;
    win.webContents.send("log", `\n[轮次 ${currentRound}] 进程退出 code=${code}\n`);
    if (stopped) { sendStatus(false, "已停止"); return; }
    const st = readState(dataDir);
    if (st.total > 0 && st.doneOk >= st.total) {
      sendStatus(false, "✅ 全部完成");
      if (Notification.isSupported()) {
        new Notification({ title: "小红书采集", body: `采集完成：${st.doneOk}/${st.total} 个账号` }).show();
      }
      return;
    }
    const cool = opts.cooldown || 0;
    if (cool > 0) {
      sendStatus(false, `⏳ 冷却 ${cool} 秒后继续下一轮...`);
      cooldownTimer = setTimeout(() => { if (!stopped) runRound(opts); }, cool * 1000);
    } else {
      sendStatus(false, "本轮结束（未设置冷却，点击开始继续）");
    }
  });
  sendStatus(true, `运行中（第 ${currentRound} 轮）`);
}

function sendStatus(running, text) { win.webContents.send("status", { running, text }); }

// ---------- IPC ----------
ipcMain.handle("get-state", () => readState(dataDir));
ipcMain.handle("get-config", () => config);
ipcMain.handle("save-config", (e, patch) => { saveConfig(patch); return config; });
ipcMain.handle("pick-dir", async () => {
  const r = await dialog.showOpenDialog(win, { properties: ["openDirectory"], defaultPath: dataDir });
  if (!r.canceled && r.filePaths[0]) {
    dataDir = r.filePaths[0];
    saveConfig({ dataDir });
    return readState(dataDir);
  }
  return null;
});
ipcMain.handle("start", (e, opts) => {
  stopped = false;
  saveConfig({ dataDir, concurrency: opts.concurrency, max: opts.max, captchaBurst: opts.captchaBurst, cooldown: opts.cooldown });
  runRound(opts || {});
  return true;
});
ipcMain.handle("stop", () => {
  stopped = true;
  if (cooldownTimer) { clearTimeout(cooldownTimer); cooldownTimer = null; }
  if (child) { try { child.kill("SIGKILL"); } catch (e) {} }
  return true;
});
// 模式运行：refill 补全缺失 / refresh 刷新粉丝 / compact 压缩进度 / retry 重试失败 / resrcape 全量重采
ipcMain.handle("run-mode", async (e, mode, opts) => {
  const env = { ...process.env };
  if (opts && opts.concurrency) env.CONCURRENCY = String(opts.concurrency);
  if (opts && opts.max) env.MAX = String(opts.max);
  if (mode === "refill") env.REFILL_MISSING = "1";
  else if (mode === "refresh") env.REFRESH = "1";
  else if (mode === "compact") env.COMPACT = "1";
  else if (mode === "retry") env.RETRY_ABANDONED = "1";
  else if (mode === "resrcape") env.RESCRAPE = "1";
  await spawnOnce(env, mode);
  return readState(dataDir);
});
ipcMain.handle("export-csv", async () => {
  await spawnOnce({ ...process.env, EXPORT_ONLY: "1" }, "export-csv");
  return readState(dataDir);
});
ipcMain.handle("export-xlsx", () => {
  const st = readState(dataDir);
  const rows = st.rows.map(r => ({
    "昵称": r.nickname, "小红书号": r.red_id, "地区属地": r.region, "IP属地": r.ip || "",
    "粉丝数": r.followers, "粉丝数(数值)": r.followers_num, "标签": r.tags, "状态": r.status, "user_id": r.user_id, "采集时间": r.ts
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "达人主页");
  const out = path.join(dataDir, "xhs_profiles.xlsx");
  XLSX.writeFile(wb, out);
  win.webContents.send("log", `已导出 Excel: ${out}（${rows.length} 行）\n`);
  return readState(dataDir);
});
ipcMain.handle("import-links", async (e, text) => {
  const linksFile = path.join(dataDir, "links.txt");
  fs.writeFileSync(linksFile, text || "");
  const script = path.join(__dirname, "..", "xhs采集", "import_links.js");
  const c = spawn("node", [script], {
    cwd: dataDir,
    env: { ...process.env, LINKS_FILE: linksFile, INPUT_JSON: path.join(dataDir, "urlmap.json"), URLMAP_OUT: path.join(dataDir, "urlmap.json") }
  });
  let out = "";
  c.stdout.on("data", d => { out += d.toString(); win.webContents.send("log", d.toString()); });
  c.stderr.on("data", d => out += d.toString());
  await new Promise(resolve => c.on("exit", resolve));
  return { result: out, state: readState(dataDir) };
});
ipcMain.handle("open-dir", () => shell.openPath(dataDir));

// ---------- 窗口 ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1380, height: 920,
    title: "小红书主页链接采集系统",
    backgroundColor: "#070b14",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  setInterval(() => {
    if (win && !win.isDestroyed()) {
      const st = readState(dataDir);
      st.round = { done: roundDone, total: roundTotal, current: currentRound };
      win.webContents.send("state", st);
    }
  }, 1500);

  const shotArg = process.argv.find(a => a.startsWith("--screenshot="));
  const dumpArg = process.argv.find(a => a.startsWith("--dump="));
  const selfTestArg = shotArg || dumpArg;
  if (selfTestArg) {
    win.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        try {
          if (shotArg) {
            const img = await win.webContents.capturePage();
            fs.writeFileSync(shotArg.split("=")[1], img.toPNG());
            console.log("screenshot saved");
          }
          if (dumpArg) {
            const info = await win.webContents.executeJavaScript(`(() => JSON.stringify({
              title: document.title,
              dataDir: document.getElementById("dataDir").textContent,
              status: document.getElementById("status").textContent,
              overall: document.getElementById("overallText").textContent,
              tableRows: document.querySelectorAll("#tbody tr").length,
              logLen: document.getElementById("log").textContent.length,
              hasSearch: !!document.getElementById("search"),
              regionOptions: document.getElementById("regionFilter").options.length,
              chartCanvases: document.querySelectorAll(".chart canvas").length,
              filterCount: document.getElementById("filterCount").textContent,
              statCards: document.querySelectorAll(".stat-card").length
            }))()`);
            fs.writeFileSync(dumpArg.split("=")[1], info);
            console.log("dump saved");
          }
        } catch (e) { console.error(e); }
        app.quit();
      }, 3500);
    });
  }
}

app.whenReady().then(() => {
  loadConfig();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
