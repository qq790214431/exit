// 达人库周报生成：node report.js [--days=7]（可用 DATA_DIR 指定数据目录）
const fs = require("fs");
const path = require("path");
const { computeTier } = require("./lib.js");

const OUT_DIR = process.env.DATA_DIR || __dirname;
const DAYS = Number((process.argv.find(a => a.startsWith("--days=")) || "--days=7").split("=")[1]);
const weekAgo = Date.now() - DAYS * 86400000;

const latest = {};
if (fs.existsSync(path.join(OUT_DIR, "progress.jsonl"))) {
  for (const l of fs.readFileSync(path.join(OUT_DIR, "progress.jsonl"), "utf8").split("\n")) {
    if (!l.trim()) continue;
    try { const j = JSON.parse(l); latest[j.user_id] = j; } catch (e) {}
  }
}
const all = Object.values(latest);
const ok = all.filter(j => j.status === "ok");

const snapshots = [];
if (fs.existsSync(path.join(OUT_DIR, "snapshots.jsonl"))) {
  for (const l of fs.readFileSync(path.join(OUT_DIR, "snapshots.jsonl"), "utf8").split("\n")) {
    if (!l.trim()) continue;
    try { snapshots.push(JSON.parse(l)); } catch (e) {}
  }
}

function growth(days) {
  const cutoff = Date.now() - days * 86400000;
  const byId = {};
  for (const s of snapshots) {
    if (new Date(s.ts).getTime() < cutoff) continue;
    (byId[s.user_id] = byId[s.user_id] || []).push(s);
  }
  const rows = [];
  for (const uid of Object.keys(byId)) {
    const arr = byId[uid].sort((a, b) => a.ts.localeCompare(b.ts));
    if (arr.length < 2) continue;
    const base = arr[0].followers_num, cur = arr[arr.length - 1].followers_num;
    const pl = latest[uid] || {};
    rows.push({ nickname: arr[arr.length - 1].nickname || pl.nickname || "", region: pl.region || "", base, cur, delta: cur - base, pct: base ? Math.round((cur - base) / base * 1000) / 10 : null });
  }
  return rows.sort((a, b) => b.delta - a.delta);
}

const tiers = {};
for (const j of ok) { const t = computeTier(j.followers_num) || "未知"; tiers[t] = (tiers[t] || 0) + 1; }
const regions = {};
for (const j of ok) if (j.region) regions[j.region] = (regions[j.region] || 0) + 1;
const regionTop = Object.entries(regions).sort((a, b) => b[1] - a[1]).slice(0, 10);
const interact = ok.filter(j => j.followers_num && j.likes_collects_num)
  .map(j => ({ nickname: j.nickname, region: j.region, tier: computeTier(j.followers_num), followers: j.followers_num, ratio: j.likes_collects_num / j.followers_num }))
  .sort((a, b) => b.ratio - a.ratio).slice(0, 10);
const firstSnap = {};
for (const s of snapshots) if (!firstSnap[s.user_id] || s.ts < firstSnap[s.user_id]) firstSnap[s.user_id] = s.ts;
const newThisWeek = ok.filter(j => firstSnap[j.user_id] && new Date(firstSnap[j.user_id]).getTime() >= weekAgo);
const g7 = growth(DAYS);

let md = `# 小红书达人库周报（${new Date().toISOString().slice(0, 10)}）\n\n`;
md += `## 一、数据概览\n\n`;
md += `- 总账号：${all.length}（成功 ${ok.length}，失败 ${all.length - ok.length}）\n`;
md += `- 分群分布：${Object.entries(tiers).map(([k, v]) => `${k} ${v}`).join(" / ")}\n`;
md += `- 近 ${DAYS} 天新增采集：${newThisWeek.length} 个\n`;
md += `- 近 ${DAYS} 天可计算涨粉：${g7.length} 个\n\n`;
md += `## 二、近 ${DAYS} 天涨粉 TOP10\n\n| 昵称 | 地区 | 基线粉丝 | 当前粉丝 | 涨粉 | 涨幅% |\n|---|---|---|---|---|---|\n`;
for (const r of g7.slice(0, 10)) md += `| ${r.nickname} | ${r.region} | ${r.base} | ${r.cur} | ${r.delta > 0 ? "+" : ""}${r.delta} | ${r.pct ?? "-"} |\n`;
md += `\n## 三、互动率 TOP10\n\n| 昵称 | 地区 | 分群 | 粉丝 | 互动率 |\n|---|---|---|---|---|\n`;
for (const r of interact) md += `| ${r.nickname} | ${r.region} | ${r.tier} | ${r.followers} | ${r.ratio.toFixed(2)} |\n`;
md += `\n## 四、地区分布 TOP10\n\n`;
for (const [k, v] of regionTop) md += `- ${k}: ${v}\n`;
md += `\n---\n生成时间：${new Date().toLocaleString("zh-CN")}\n`;

const out = path.join(OUT_DIR, "xhs_weekly_report.md");
fs.writeFileSync(out, md);
console.log(`周报已生成: ${out}`);
