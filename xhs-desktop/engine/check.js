// 数据巡检：核对 urlmap / progress / 笔记数据健康度
// 用法: node check.js（DATA_DIR 指定数据目录）
const fs = require("fs");
const path = require("path");
const DATA_DIR = process.env.DATA_DIR || __dirname;
const { computeTier } = require("./lib.js");

function readJson(f) { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return null; } }
function readLines(f) { try { return fs.readFileSync(f, "utf8").split("\n").filter(l => l.trim()); } catch (e) { return []; } }

const urlmap = readJson(path.join(DATA_DIR, "urlmap.json")) || {};
const latest = {};
for (const l of readLines(path.join(DATA_DIR, "progress.jsonl"))) {
  try { const j = JSON.parse(l); latest[j.user_id] = j; } catch (e) {}
}
const notesData = readLines(path.join(DATA_DIR, "notes_data.jsonl"));
const notesByUser = {};
for (const l of notesData) { try { const j = JSON.parse(l); notesByUser[j.user_id] = (notesByUser[j.user_id] || 0) + 1; } catch (e) {} }
const cookies = readJson(path.join(DATA_DIR, "cookies.json"));
const loggedIn = !!(cookies && cookies.some(c => c.name === "web_session" && c.value && c.value.length > 20));

const total = Object.keys(urlmap).length;
const status = {};
const noToken = [];
const noRecord = [];
for (const uid of Object.keys(urlmap)) {
  const l = latest[uid];
  if (!l) { noRecord.push(uid); continue; }
  status[l.status] = (status[l.status] || 0) + 1;
  if (!urlmap[uid].has_token) noToken.push(uid);
}
const okCount = status.ok || 0;
console.log("========== 数据巡检报告 ==========");
console.log(`清单账号: ${total}`);
console.log(`已采集(ok): ${okCount} | 失败/异常: ${status.captcha || 0 + (status.error || 0) + (status.no_data || 0)}`);
console.log(`未采集: ${noRecord.length} | 无 token 条目: ${noToken.length} | 登录态: ${loggedIn ? "已登录" : "未登录"}`);
console.log(`笔记数据: ${notesData.length} 篇 / 覆盖 ${Object.keys(notesByUser).length} 个账号`);
if (noToken.length) console.log(`无 token 账号示例: ${noToken.slice(0, 5).join(", ")}`);
console.log("=================================");

// 健康 CSV：每账号状态
const rows = Object.keys(urlmap).map(uid => ({
  user_id: uid, status: (latest[uid] && latest[uid].status) || "未采集",
  has_token: urlmap[uid].has_token ? "是" : "否",
  notes: notesByUser[uid] || 0
}));
const cols = ["user_id", "status", "has_token", "notes"];
const csv = "\ufeff" + cols.join(",") + "\n" + rows.map(r => cols.map(c => r[c]).join(",")).join("\n") + "\n";
const out = path.join(DATA_DIR, "xhs_health.csv");
fs.writeFileSync(out, csv);
console.log(`健康清单 → ${out}`);
