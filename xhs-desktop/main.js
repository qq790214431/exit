const { app, BrowserWindow, ipcMain, dialog, shell, Notification } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");
const { autoUpdater } = require("electron-updater");
// lib.js 加载：打包版在 resources/runtime/scripts（extraResources），开发版回退仓库
function loadLib() {
  const candidates = [
    path.join(__dirname, "lib.js"),
    path.join(process.resourcesPath || __dirname, "runtime", "scripts", "lib.js"),
    path.join(__dirname, "..", "xhs采集", "lib.js")
  ];
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return require(c); } catch (e) {}
  }
  return {};
}
const lib = loadLib();
const { parseTags, computeTier, interactionRatio, csvEscape } = lib;

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

// ---------- 数据目录自动初始化（内置采集脚本） ----------
function ensureDataDirFiles() {
  try {
    for (const f of ["scrape.js", "lib.js"]) {
      const dst = path.join(dataDir, f);
      if (fs.existsSync(dst)) continue;
      const src = engineScript(f);
      if (fs.existsSync(src)) { fs.copyFileSync(src, dst); win.webContents.send("log", `已初始化数据目录文件: ${f}\n`); }
    }
  } catch (e) { win.webContents.send("log", `初始化数据目录失败: ${e.message}\n`); }
}

// ---------- 内置运行时（Windows 打包用） ----------
function runtimeRoot() {
  return process.resourcesPath || __dirname;
}
// 采集引擎脚本：打包后位于 resources/runtime/scripts（真实文件，可被 node 子进程执行）；开发时回退到仓库
function engineScript(name) {
  const ext = path.join(runtimeRoot(), "runtime", "scripts", name);
  if (fs.existsSync(ext)) return ext;
  const devLocal = path.join(__dirname, "..", "xhs采集", name);
  if (fs.existsSync(devLocal)) return devLocal;
  return path.join(__dirname, name);
}
function nodeBin() {
  const exe = process.platform === "win32" ? "node.exe" : "node";
  const bundled = path.join(runtimeRoot(), "runtime", "node", exe);
  return fs.existsSync(bundled) ? bundled : "node";
}
function runtimeEnv(extra) {
  const env = { ...process.env, ...(extra || {}) };
  const core = path.join(runtimeRoot(), "runtime", "node_modules", "playwright-core");
  if (fs.existsSync(core)) env.PLAYWRIGHT_CORE_PATH = core;
  return env;
}

// ---------- 最近目录 ----------
function rememberDir(dir) {
  const recent = (config.recentDirs || []).filter(d => d !== dir);
  recent.unshift(dir);
  saveConfig({ recentDirs: recent.slice(0, 6) });
}

// ---------- 备注/黑名单 ----------
function notesPath() { return path.join(dataDir, "notes.json"); }
function loadNotes() {
  try { return JSON.parse(fs.readFileSync(notesPath(), "utf8")); } catch (e) { return {}; }
}
function saveNotes(notes) { fs.writeFileSync(notesPath(), JSON.stringify(notes, null, 2)); }

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
  const notes = loadNotes();
  const notesSummary = {};
  const notesCsv = path.join(dir, "notes_summary.csv");
  if (fs.existsSync(notesCsv)) {
    const lines = fs.readFileSync(notesCsv, "utf8").split("\n").filter(l => l.trim());
    const head = lines[0].split(",").map(h => h.trim());
    for (const line of lines.slice(1)) {
      const cells = line.split(",");
      const row = {};
      head.forEach((h, i) => row[h] = cells[i]);
      if (row.user_id) notesSummary[row.user_id] = row;
    }
  }
  const cookiesFile = path.join(dir, "cookies.json");
  let loginStatus = "未登录";
  try {
    const ck = JSON.parse(fs.readFileSync(cookiesFile, "utf8"));
    loginStatus = ck.some(c => c.name === "web_session" && c.value && c.value.length > 20) ? "已登录" : "未登录";
  } catch (e) {}
  for (const id of Object.keys(latest).sort()) {
    const j = latest[id];
    statusCounts[j.status] = (statusCounts[j.status] || 0) + 1;
    if (j.status === "ok") {
      const n = j.followers_num;
      if (n != null) { fansTotal += n; fansCount++; if (n >= 10000) fans10k++; }
    }
    const pt = parseTags(j.tags);
    rows.push({
      user_id: id,
      nickname: j.nickname || "",
      red_id: j.red_id || (j.status === "ok" ? "未公开" : ""),
      region: j.region || "",
      followers: j.followers || "",
      followers_num: j.followers_num ?? "",
      likes_collects: j.likes_collects || "",
      likes_collects_num: j.likes_collects_num ?? "",
      interaction_ratio: interactionRatio(j.likes_collects_num, j.followers_num),
      age: pt.age,
      constellation: pt.constellation,
      industry: pt.industry,
      tier: computeTier(j.followers_num),
      tags: j.tags || "",
      status: j.status || "",
      ts: j.ts || "",
      note: notes[id]?.note || "",
      user_tags: notes[id]?.tags || [],
      blacklisted: !!(notes[id]?.blacklisted),
      avg_likes: notesSummary[id]?.avg_likes || "",
      avg_comments: notesSummary[id]?.avg_comments || "",
      notes_count: notesSummary[id]?.notes || ""
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
    loginStatus,
    rows
  };
}

// ---------- 子进程 ----------
function spawnOnce(env, label) {
  return new Promise(resolve => {
    const script = path.join(dataDir, "scrape.js");
    const c = spawn(nodeBin(), [script], { cwd: dataDir, env: runtimeEnv(env) });
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
  child = spawn(nodeBin(), [script], { cwd: dataDir, env: runtimeEnv(env) });
  child.stdout.on("data", d => {
    const text = d.toString();
    win.webContents.send("log", text);
    const m = text.match(/\[(\d+)\/(\d+)/);
    if (m) { roundDone = Number(m[1]); roundTotal = Number(m[2]); }
    if (text.includes("CAPTCHA_BURST") && Notification.isSupported()) {
      new Notification({ title: "小红书采集", body: "触发验证码熔断，已停止本轮（冷却后自动继续）" }).show();
    }
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
    rememberDir(dataDir);
    ensureDataDirFiles();
    return readState(dataDir);
  }
  return null;
});
ipcMain.handle("start", (e, opts) => {
  stopped = false;
  ensureDataDirFiles();
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
  ensureDataDirFiles();
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
ipcMain.handle("pick-links-file", async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ["openFile"],
    filters: [{ name: "文本", extensions: ["txt", "md", "log"] }, { name: "所有文件", extensions: ["*"] }],
    defaultPath: dataDir
  });
  if (r.canceled || !r.filePaths[0]) return null;
  try { return fs.readFileSync(r.filePaths[0], "utf8"); } catch (e) { return null; }
});
ipcMain.handle("import-links", async (e, text) => {
  const linksFile = path.join(dataDir, "links.txt");
  fs.writeFileSync(linksFile, text || "");
  const script = engineScript("import_links.js");
  const c = spawn(nodeBin(), [script], {
    cwd: dataDir,
    env: runtimeEnv({ LINKS_FILE: linksFile, INPUT_JSON: path.join(dataDir, "urlmap.json"), URLMAP_OUT: path.join(dataDir, "urlmap.json") })
  });
  let out = "";
  c.stdout.on("data", d => { out += d.toString(); win.webContents.send("log", d.toString()); });
  c.stderr.on("data", d => out += d.toString());
  await new Promise(resolve => c.on("exit", resolve));
  return { result: out, state: readState(dataDir) };
});
ipcMain.handle("export-profiles", () => {
  const st = readState(dataDir);
  const notes = loadNotes();
  const profiles = st.rows.filter(r => r.status === "ok").map(r => {
    const n = notes[r.user_id] || {};
    return { ...r, note: n.note || "", user_tags: (n.tags || []).join(","), blacklisted: !!n.blacklisted };
  });
  let md = `# 达人运营档案（${new Date().toISOString().slice(0, 10)}）\n\n共 ${profiles.length} 个达人\n\n`;
  for (const p of profiles) {
    md += `## ${p.nickname}${p.blacklisted ? " 🔒" : ""}\n`;
    md += `- 小红书号：${p.red_id} | 地区：${p.region} | 分群：${p.tier}\n`;
    md += `- 粉丝：${p.followers}（${p.followers_num}）| 互动率：${p.interaction_ratio}\n`;
    md += `- 标签：${p.user_tags || "-"} | 备注：${p.note || "-"}\n\n`;
  }
  fs.writeFileSync(path.join(dataDir, "xhs_creator_profiles.md"), md);
  const rows = profiles.map(p => ({ 昵称: p.nickname, 小红书号: p.red_id, 地区: p.region, 分群: p.tier, 粉丝: p.followers, 粉丝数值: p.followers_num, 互动率: p.interaction_ratio, 标签: p.user_tags, 备注: p.note, 黑名单: p.blacklisted ? "是" : "否", user_id: p.user_id }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "达人档案");
  XLSX.writeFile(wb, path.join(dataDir, "xhs_creator_profiles.xlsx"));
  win.webContents.send("log", `已导出运营档案（${profiles.length} 个）→ xhs_creator_profiles.md/.xlsx\n`);
  return readState(dataDir);
});
ipcMain.handle("export-rows", (e, rows) => {
  const cols = ["nickname", "red_id", "region", "followers", "followers_num", "likes_collects_num", "interaction_ratio", "tier", "age", "constellation", "industry", "status"];
  const clean = (rows || []).map(r => {
    const o = {};
    for (const c of cols) o[c] = r[c] ?? "";
    o.user_id = r.user_id || "";
    o.ts = r.ts || "";
    return o;
  });
  const csvPath = path.join(dataDir, "xhs_profiles_filtered.csv");
  const csvContent = "\ufeff" + [...cols, "user_id", "ts"].join(",") + "\n" +
    clean.map(r => [...cols, "user_id", "ts"].map(c => csvEscape(r[c])).join(",")).join("\n") + "\n";
  fs.writeFileSync(csvPath, csvContent);
  const xlsxPath = path.join(dataDir, "xhs_profiles_filtered.xlsx");
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(clean.map(r => ({ 昵称: r.nickname, 小红书号: r.red_id, 地区属地: r.region, 粉丝数: r.followers, 粉丝数值: r.followers_num, 获赞收藏: r.likes_collects_num, 互动率: r.interaction_ratio, 分群: r.tier, 年龄: r.age, 星座: r.constellation, 行业: r.industry, 状态: r.status })));
  XLSX.utils.book_append_sheet(wb, ws, "筛选结果");
  XLSX.writeFile(wb, xlsxPath);
  win.webContents.send("log", `已导出筛选结果（${clean.length} 行）: ${csvPath} / ${xlsxPath}\n`);
  return { csv: csvPath, xlsx: xlsxPath, count: clean.length };
});
ipcMain.handle("switch-dir", (e, dir) => {
  if (!dir || !fs.existsSync(dir)) return null;
  dataDir = dir;
  saveConfig({ dataDir });
  rememberDir(dir);
  ensureDataDirFiles();
  return readState(dataDir);
});
ipcMain.handle("get-notes", () => loadNotes());
ipcMain.handle("save-note", (e, userId, patch) => {
  const notes = loadNotes();
  notes[userId] = { ...(notes[userId] || {}), ...patch, updated_at: new Date().toISOString() };
  saveNotes(notes);
  return readState(dataDir);
});
ipcMain.handle("backup", () => {
  const backupsDir = path.join(dataDir, "backups");
  fs.mkdirSync(backupsDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const out = path.join(backupsDir, `xhs_backup_${ts}.zip`);
  const files = ["urlmap.json", "progress.jsonl", "snapshots.jsonl", "abandoned.json", "notes.json", "xhs_profiles.csv", "xhs_profiles.xlsx", "xhs_growth.csv", "xhs_profiles_filtered.csv", "xhs_profiles_filtered.xlsx"]
    .map(f => path.join(dataDir, f)).filter(f => fs.existsSync(f));
  return new Promise(resolve => {
    const args = ["-j", out, ...files];
    const c = spawn("zip", args);
    c.on("error", () => resolve({ ok: false, error: "zip 不可用" }));
    c.on("exit", code => {
      if (code === 0) {
        win.webContents.send("log", `已备份 ${files.length} 个文件 → ${out}\n`);
        resolve({ ok: true, path: out, count: files.length });
      } else {
        resolve({ ok: false, error: `zip exit ${code}` });
      }
    });
  });
});
async function runReport() {
  const script = engineScript("report.js");
  win.webContents.send("log", "\n[周报] 生成中...\n");
  const c = spawn(nodeBin(), [script], { env: runtimeEnv({ DATA_DIR: dataDir }) });
  c.stdout.on("data", d => win.webContents.send("log", d.toString()));
  c.stderr.on("data", d => win.webContents.send("log", d.toString()));
  await new Promise(res => c.on("exit", res));
  return path.join(dataDir, "xhs_weekly_report.md");
}
ipcMain.handle("run-report", async () => {
  const p = await runReport();
  shell.openPath(p);
  return readState(dataDir);
});
ipcMain.handle("get-captcha-events", () => {
  const progressFile = path.join(dataDir, "progress.jsonl");
  const events = [];
  if (fs.existsSync(progressFile)) {
    for (const line of fs.readFileSync(progressFile, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const j = JSON.parse(line);
        if (j.status === "captcha") events.push({ user_id: j.user_id, ts: j.ts || "", shot: j.shot || "" });
      } catch (err) {}
    }
  }
  const shotDir = path.join(dataDir, "screenshots");
  let screenshots = [];
  if (fs.existsSync(shotDir)) screenshots = fs.readdirSync(shotDir).filter(f => f.endsWith(".png"));
  return { events: events.slice(-50), screenshots };
});
ipcMain.handle("read-image", (e, file) => {
  const p = path.join(dataDir, "screenshots", path.basename(file));
  if (!fs.existsSync(p)) return null;
  return "data:image/png;base64," + fs.readFileSync(p).toString("base64");
});
ipcMain.handle("open-screenshots", () => shell.openPath(path.join(dataDir, "screenshots")));
async function runEngineScript(name, extraEnv, label) {
  const script = engineScript(name);
  if (!fs.existsSync(script)) { win.webContents.send("log", `找不到 ${name}\n`); return; }
  win.webContents.send("log", `\n[${label}] 启动...\n`);
  const c = spawn(nodeBin(), [script], { env: runtimeEnv({ DATA_DIR: dataDir, ...(extraEnv || {}) }) });
  c.stdout.on("data", d => win.webContents.send("log", d.toString()));
  c.stderr.on("data", d => win.webContents.send("log", d.toString()));
  await new Promise(res => c.on("exit", res));
  return readState(dataDir);
}
ipcMain.handle("get-notes-trend", () => {
  const ndFile = path.join(dataDir, "notes_data.jsonl");
  const byMonth = {};
  if (fs.existsSync(ndFile)) {
    for (const line of fs.readFileSync(ndFile, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const j = JSON.parse(line);
        const m = (j.note_ts || "").slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(m)) continue;
        byMonth[m] = byMonth[m] || { likes: 0, comments: 0, notes: 0 };
        byMonth[m].likes += j.likes || 0;
        byMonth[m].comments += j.comments || 0;
        byMonth[m].notes++;
      } catch (e) {}
    }
  }
  return Object.keys(byMonth).sort().map(m => ({ month: m, ...byMonth[m], avg_likes: Math.round(byMonth[m].likes / byMonth[m].notes) }));
});
ipcMain.handle("run-check", () => runEngineScript("check.js", {}, "数据巡检"));
ipcMain.handle("run-login", () => runEngineScript("login.js", {}, "登录"));
ipcMain.handle("run-notes", (e, uids) => runEngineScript("notes.js", { UIDS: (uids || []).join(","), NOTES_MAX: "10" }, "笔记采集"));
ipcMain.handle("check-update", () => {
  try { autoUpdater.checkForUpdates(); return true; } catch (e) { win.webContents.send("log", `[更新] 无法检查: ${e.message}\n`); return false; }
});
ipcMain.handle("export-dashboard", async () => {
  const out = path.join(dataDir, "xhs_dashboard.png");
  const img = await win.webContents.capturePage();
  fs.writeFileSync(out, img.toPNG());
  win.webContents.send("log", `已导出看板截图: ${out}\n`);
  shell.openPath(out);
  return readState(dataDir);
});
ipcMain.handle("open-dir", () => shell.openPath(dataDir));
// ---------- 全案营销项目 ----------
function projectsFile() { return path.join(dataDir, "projects", "projects.json"); }
function loadProjects() {
  try { return JSON.parse(fs.readFileSync(projectsFile(), "utf8")); } catch (e) { return { version: 1, projects: [] }; }
}
function saveProjects(data) {
  const f = projectsFile();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  if (fs.existsSync(f)) fs.copyFileSync(f, f + ".bak");
  const tmp = f + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, f);
}
ipcMain.handle("get-projects", () => loadProjects());
ipcMain.handle("save-project", (e, project) => {
  const data = loadProjects();
  const idx = data.projects.findIndex(p => p.id === project.id);
  if (idx >= 0) data.projects[idx] = project; else data.projects.push(project);
  saveProjects(data);
  return loadProjects();
});
ipcMain.handle("export-project", (e, project) => {
  if (!project) return false;
  const STAGE_TITLES = { deconstruct: "S1 拆解业务", research: "S2 调研市场", strategy: "S3 理解业务", plan: "S4 开发计划", execution: "S5 落地执行" };
  const ROW_LABELS = { competitors: "竞品矩阵", content_calendar: "内容日历", influencer_matrix: "达人执行矩阵", budget_alloc: "预算分配", milestones: "里程碑", tasks: "任务清单" };
  const ROW_COLS = { competitors: ["竞品", "定位", "价格", "渠道", "营销策略", "优势/劣势"], content_calendar: ["周次", "选题", "格式", "卖点", "达人", "发布日期", "状态"], influencer_matrix: ["达人", "分群", "粉丝", "预算", "任务", "状态"], budget_alloc: ["项目", "金额", "占比"], milestones: ["里程碑", "日期", "验收"], tasks: ["任务", "负责人", "截止", "关联", "状态"] };
  let md = `# 全案营销方案：${project.name}\n\n`;
  md += `- 客户：${project.client || "-"} | 状态：${project.status || "-"} | 创建：${(project.created_at || "").slice(0, 10)}\n\n`;
  for (const [sk, title] of Object.entries(STAGE_TITLES)) {
    const ph = (project.phases || {})[sk] || {};
    md += `## ${title}\n\n`;
    for (const [k, v] of Object.entries(ph)) {
      if (Array.isArray(v)) {
        const cols = ROW_COLS[k];
        if (cols && v.length) {
          md += `### ${ROW_LABELS[k] || k}\n\n| ${cols.join(" | ")} |\n|${cols.map(() => "---").join("|")}|\n`;
          for (const row of v) md += `| ${row.map(c => (c || "").replace(/\|/g, "\\|")).join(" | ")} |\n`;
          md += "\n";
        }
      } else if (v && String(v).trim()) {
        md += `- **${k}**：${v}\n`;
      }
    }
    md += "\n";
  }
  const out = path.join(dataDir, "projects", project.name + ".md");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, md);
  win.webContents.send("log", `已导出方案 → ${out}\n`);
  shell.openPath(out);
  return true;
});
ipcMain.handle("delete-project", (e, id) => {
  const data = loadProjects();
  data.projects = data.projects.filter(p => p.id !== id);
  saveProjects(data);
  return loadProjects();
});
ipcMain.handle("get-dashboard", () => {
  const snapFile = path.join(dataDir, "snapshots.jsonl");
  const byDay = {};
  if (fs.existsSync(snapFile)) {
    for (const line of fs.readFileSync(snapFile, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const j = JSON.parse(line);
        if (j.followers_num == null) continue;
        const day = j.ts.slice(0, 10);
        byDay[day] = (byDay[day] || 0) + j.followers_num;
      } catch (e) {}
    }
  }
  const days = Object.keys(byDay).sort();
  return {
    trend: days.map(d => ({ day: d, total: byDay[d] })),
    lastUpdate: days.length ? days[days.length - 1] : null
  };
});
ipcMain.handle("get-growth-ranking", () => {
  const snapFile = path.join(dataDir, "snapshots.jsonl");
  const byId = {};
  if (fs.existsSync(snapFile)) {
    for (const line of fs.readFileSync(snapFile, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const j = JSON.parse(line);
        if (j.followers_num == null) continue;
        (byId[j.user_id] = byId[j.user_id] || []).push(j);
      } catch (err) {}
    }
  }
  const latest = {};
  const progressFile = path.join(dataDir, "progress.jsonl");
  if (fs.existsSync(progressFile)) {
    for (const line of fs.readFileSync(progressFile, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try { const j = JSON.parse(line); latest[j.user_id] = j; } catch (err) {}
    }
  }
  const ranking = [];
  for (const uid of Object.keys(byId)) {
    const snaps = byId[uid].slice().sort((a, b) => a.ts.localeCompare(b.ts));
    if (snaps.length < 2) continue;
    const base = snaps[0].followers_num, now = snaps[snaps.length - 1].followers_num;
    const delta = now - base;
    const p = latest[uid] || {};
    ranking.push({
      user_id: uid,
      nickname: snaps[snaps.length - 1].nickname || p.nickname || "",
      region: p.region || "",
      tier: computeTier(now),
      base, now, delta,
      delta_pct: base ? Math.round((delta / base) * 1000) / 10 : null,
      snapshots: snaps.length
    });
  }
  ranking.sort((a, b) => b.delta - a.delta);
  return ranking;
});
ipcMain.handle("get-trend", (e, userId) => {
  const snapFile = path.join(dataDir, "snapshots.jsonl");
  const points = [];
  if (fs.existsSync(snapFile)) {
    for (const line of fs.readFileSync(snapFile, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const j = JSON.parse(line);
        if (j.user_id !== userId) continue;
        points.push({ ts: j.ts, followers_num: j.followers_num, likes_collects_num: j.likes_collects_num });
      } catch (err) {}
    }
  }
  points.sort((a, b) => a.ts.localeCompare(b.ts));
  return points;
});

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
            const info = await win.webContents.executeJavaScript(`(async () => {
  const t = (id) => { const el = document.getElementById(id); return el ? el.textContent : ""; };
  const M = window.MKT;
  let mktFunc = "n/a";
  try {
    const g = M && M.gate;
    mktFunc = JSON.stringify({
      s1_ok: g ? g({ key: "deconstruct", title: "S1" }, { brand: "测试品牌" }).ok : null,
      s2_empty: g ? g({ key: "research", title: "S2" }, {}).ok : null,
      buttons: M ? Object.keys(M.stageButtons || {}).map(k => k + ":" + (M.stageButtons[k] || []).length) : []
    });
  } catch (e) { mktFunc = "ERR:" + e.message; }
  return JSON.stringify({
    title: document.title,
    dataDir: t("dataDir"),
    overall: t("overallText"),
    tableRows: document.querySelectorAll("#tbody tr").length,
    views: ${JSON.stringify(["pipeline","list","rank","dash","marketing","import","tools","export"])}.filter(v => !!document.getElementById("view" + v[0].toUpperCase() + v.slice(1))),
    sidebarNav: document.querySelectorAll(".nav").length,
    mktButtons: (M && Object.keys(M.stageButtons || {}).map(k => k + ":" + (M.stageButtons[k] || []).length)) || [],
    mktGate: !!(M && M.gate),
    mktActions: (M && Object.keys(M.listActions || {})) || [],
    mktToolbar: (M && M.toolbarButtons.map(b => b.label)) || [],
    mktFunc
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

let scheduleLastDate = "";
let reportLastWeek = "";
function checkReportSchedule() {
  if (!config.reportEnabled || !win || win.isDestroyed()) return;
  const now = new Date();
  const weekKey = now.getFullYear() + "-W" + Math.floor(now.getTime() / 604800000);
  const hhmm = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  if (now.getDay() !== Number(config.reportDay)) return;
  if (config.reportTime !== hhmm) return;
  if (reportLastWeek === weekKey) return;
  reportLastWeek = weekKey;
  win.webContents.send("log", `\n[定时周报] ${weekKey} 开始生成周报...\n`);
  runReport().then(() => {
    if (Notification.isSupported()) {
      new Notification({ title: "小红书采集", body: "达人周报已生成，已打开" }).show();
    }
  });
}
function checkSchedule() {
  if (!config.scheduleEnabled || !win || win.isDestroyed()) return;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const hhmm = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  if (config.scheduleTime !== hhmm) return;
  if (scheduleLastDate === today) return;
  scheduleLastDate = today;
  win.webContents.send("log", `\n[定时任务] ${today} ${hhmm} 开始自动刷新粉丝数...\n`);
  spawnOnce({ ...process.env, REFRESH: "1", CONCURRENCY: "3" }, "scheduled-refresh").then(() => {
    const st = readState(dataDir);
    win.webContents.send("state", st);
    if (Notification.isSupported()) {
      new Notification({ title: "小红书采集", body: `定时刷新完成：${st.doneOk}/${st.total} 个账号` }).show();
    }
  });
}

function setupAutoUpdater() {
  try {
    autoUpdater.autoDownload = false;
    autoUpdater.on("checking-for-update", () => win.webContents.send("log", "\n[更新] 正在检查新版本...\n"));
    autoUpdater.on("update-available", (info) => {
      win.webContents.send("log", `\n[更新] 发现新版本 ${info.version}，正在下载...\n`);
      autoUpdater.downloadUpdate();
    });
    autoUpdater.on("update-not-available", () => win.webContents.send("log", "\n[更新] 已是最新版本\n"));
    autoUpdater.on("update-downloaded", () => {
      win.webContents.send("log", "\n[更新] 下载完成，重启后安装\n");
      if (Notification.isSupported()) new Notification({ title: "小红书采集", body: "新版本已下载，重启应用即可安装" }).show();
      autoUpdater.quitAndInstall();
    });
    autoUpdater.on("error", (err) => win.webContents.send("log", `\n[更新] 检查失败: ${err.message}\n`));
  } catch (e) {
    win.webContents.send("log", `\n[更新] 初始化失败: ${e.message}\n`);
  }
}

app.whenReady().then(() => {
  loadConfig();
  createWindow();
  ensureDataDirFiles();
  setupAutoUpdater();
  setTimeout(() => { try { autoUpdater.checkForUpdates(); } catch (e) {} }, 30000);
  setInterval(() => { checkSchedule(); checkReportSchedule(); }, 30000);
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
