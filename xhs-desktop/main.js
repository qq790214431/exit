const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

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
const DEFAULT_DATA_DIR = defaultDataDir();

let win = null;
let dataDir = DEFAULT_DATA_DIR;
let child = null;
let stopped = false;
let cooldownTimer = null;
let currentRound = 0;
let roundTotal = 0;
let roundDone = 0;

// ---------- 数据读取 ----------
function readState(dir) {
  const progressFile = path.join(dir, "progress.jsonl");
  const urlmapFile = path.join(dir, "urlmap.json");
  const csvFile = path.join(dir, "xhs_profiles.csv");
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
  for (const id of Object.keys(latest).sort()) {
    const j = latest[id];
    statusCounts[j.status] = (statusCounts[j.status] || 0) + 1;
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
  return {
    dataDir: dir,
    total,
    doneOk,
    attempts: rows.length,
    statusCounts,
    hasCsv: fs.existsSync(csvFile),
    csvRows: fs.existsSync(csvFile) ? fs.readFileSync(csvFile, "utf8").split("\n").filter(l => l.trim()).length - 1 : 0,
    rows
  };
}

// ---------- 采集子进程 ----------
function runRound(opts) {
  if (child || stopped) return;
  const script = path.join(dataDir, "scrape.js");
  if (!fs.existsSync(script)) {
    win.webContents.send("log", `找不到 ${script}\n`);
    return;
  }
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
  child.on("error", err => win.webContents.send("log", "启动失败: " + err.message + "\n"));
  child.on("exit", code => {
    child = null;
    win.webContents.send("log", `\n[轮次 ${currentRound}] 进程退出 code=${code}\n`);
    if (stopped) { sendStatus(false, "已停止"); return; }
    const st = readState(dataDir);
    if (st.total > 0 && st.doneOk >= st.total) {
      sendStatus(false, "✅ 全部完成");
      return;
    }
    const cool = opts.cooldown || 0;
    if (cool > 0) {
      sendStatus(false, `⏳ 冷却 ${cool} 秒后继续下一轮...`);
      cooldownTimer = setTimeout(() => {
        if (!stopped) runRound(opts);
      }, cool * 1000);
    } else {
      sendStatus(false, "本轮结束（未设置冷却，点击开始继续）");
    }
  });
  sendStatus(true, `运行中（第 ${currentRound} 轮）`);
}

function sendStatus(running, text) {
  win.webContents.send("status", { running, text });
}

// ---------- IPC ----------
ipcMain.handle("get-state", () => readState(dataDir));
ipcMain.handle("pick-dir", async () => {
  const r = await dialog.showOpenDialog(win, { properties: ["openDirectory"], defaultPath: dataDir });
  if (!r.canceled && r.filePaths[0]) { dataDir = r.filePaths[0]; return readState(dataDir); }
  return null;
});
ipcMain.handle("start", (e, opts) => {
  stopped = false;
  runRound(opts || {});
  return true;
});
ipcMain.handle("stop", () => {
  stopped = true;
  if (cooldownTimer) { clearTimeout(cooldownTimer); cooldownTimer = null; }
  if (child) { try { child.kill("SIGKILL"); } catch (e) {} }
  return true;
});
ipcMain.handle("export-csv", async () => {
  const script = path.join(dataDir, "scrape.js");
  await new Promise(resolve => {
    const c = spawn("node", [script], { cwd: dataDir, env: { ...process.env, EXPORT_ONLY: "1" } });
    c.stdout.on("data", d => win.webContents.send("log", d.toString()));
    c.stderr.on("data", d => win.webContents.send("log", d.toString()));
    c.on("exit", resolve);
  });
  return readState(dataDir);
});
ipcMain.handle("open-dir", () => shell.openPath(dataDir));

// ---------- 窗口 ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 860,
    title: "小红书主页链接采集工具",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  // 定期推送状态
  setInterval(() => {
    if (win && !win.isDestroyed()) {
      const st = readState(dataDir);
      st.round = { done: roundDone, total: roundTotal, current: currentRound };
      win.webContents.send("state", st);
    }
  }, 1500);

  // 截图自检：electron . --screenshot=/tmp/x.png
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
            const info = await win.webContents.executeJavaScript(`(() => {
              return JSON.stringify({
                title: document.title,
                dataDir: document.getElementById("dataDir").textContent,
                status: document.getElementById("status").textContent,
                overall: document.getElementById("overallText").textContent,
                tableRows: document.querySelectorAll("#tbody tr").length,
                logLen: document.getElementById("log").textContent.length,
                hasSearch: !!document.getElementById("search"),
                regionOptions: document.getElementById("regionFilter").options.length,
                chartCanvases: document.querySelectorAll(".chart canvas").length,
                filterCount: document.getElementById("filterCount").textContent
              });
            })()`);
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
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
