// 笔记采集：对指定 user_id 采集公开笔记（赞/评/藏）→ 真实互动数据
// 前置：已登录（DATA_DIR/cookies.json，用 login.js 扫码登录一次）
// 用法:
//   node notes.js <uid> [uid...]          # 指定账号
//   UIDS=uid1,uid2 node notes.js          # 环境变量指定
//   NOTES_MAX=20 node notes.js <uid>      # 每账号笔记数上限（默认20）
const fs = require("fs");
const path = require("path");

let playwright;
const corePath = process.env.PLAYWRIGHT_CORE_PATH;
try {
  playwright = corePath ? require(corePath) : require("playwright-core");
} catch (e) {
  try {
    playwright = require("/Users/Admin/.homebrew/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core");
  } catch (e2) {
    console.error("找不到 playwright-core，请设置 PLAYWRIGHT_CORE_PATH 或 npm i playwright-core");
    process.exit(1);
  }
}
const { chromium } = playwright;

const DATA_DIR = process.env.DATA_DIR || __dirname;
const URLMAP = path.join(DATA_DIR, "urlmap.json");
const COOKIES = process.env.COOKIES || path.join(DATA_DIR, "cookies.json");
const NOTES_MAX = Number(process.env.NOTES_MAX || 20);
const OUT = path.join(DATA_DIR, "notes_data.jsonl");
const SUMMARY = path.join(DATA_DIR, "notes_summary.csv");

function findChrome() {
  const candidates = [
    process.env.CHROME,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
  ].filter(Boolean);
  for (const c of candidates) { try { if (c && fs.existsSync(c)) return c; } catch (e) {} }
  return process.env.CHROME || "";
}

async function fetchNotes(page, uid, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(4000);
  const all = [];
  let cursor = "";
  for (let i = 0; i < 10; i++) {
    const res = await page.evaluate(async ({ uid, cursor }) => {
      const q = `num=30&cursor=${encodeURIComponent(cursor)}&user_id=${uid}&image_formats=jpg,avif,webp`;
      const p = "/api/sns/web/v1/user_posted?" + q;
      const headers = { "accept": "application/json", "referer": location.href };
      const s = window._webmsxyw ? window._webmsxyw(p) : null;
      if (s && s["X-s"]) { headers["X-s"] = s["X-s"]; headers["X-t"] = s["X-t"]; }
      try {
        const r = await fetch("https://edith.xiaohongshu.com" + p, { headers });
        const j = await r.json();
        return { status: r.status, code: j.code, data: j.data };
      } catch (e) { return { error: e.message }; }
    }, { uid, cursor });
    if (res.status !== 200 || !res.data || !res.data.items) break;
    for (const it of res.data.items) {
      all.push({
        user_id: uid,
        note_id: it.id || it.note_id || "",
        title: (it.display_title || it.title || "").slice(0, 120),
        likes: it.interact_info?.liked_count ?? null,
        collects: it.interact_info?.collected_count ?? null,
        comments: it.interact_info?.comment_count ?? null,
        note_ts: it.time || "",
        ts: new Date().toISOString()
      });
    }
    cursor = res.data.cursor || "";
    if (all.length >= NOTES_MAX || !cursor || !res.data.has_more) break;
  }
  return all;
}

(async () => {
  if (!fs.existsSync(COOKIES)) {
    console.error(`未登录：找不到 ${COOKIES}。请先运行 login.js 扫码登录一次`);
    process.exit(1);
  }
  if (!fs.existsSync(URLMAP)) { console.error(`找不到 ${URLMAP}`); process.exit(1); }
  const urlmap = JSON.parse(fs.readFileSync(URLMAP, "utf8"));
  const cookies = JSON.parse(fs.readFileSync(COOKIES, "utf8"));
  const uids = process.argv.slice(2).length ? process.argv.slice(2) : (process.env.UIDS ? process.env.UIDS.split(",") : []);
  if (!uids.length) { console.error("用法: node notes.js <uid> ... 或 UIDS=uid1,uid2 node notes.js"); process.exit(1); }

  const chrome = findChrome();
  const browser = await chromium.launch({ executablePath: chrome || undefined, headless: true, args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"] });
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: "zh-CN"
  });
  await ctx.addCookies(cookies.map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path || "/" })));
  const page = await ctx.newPage();

  const out = fs.createWriteStream(OUT, { flags: "a" });
  const summary = [];
  for (const uid of uids) {
    const entry = urlmap[uid];
    if (!entry) { console.log(`跳过（不在清单）: ${uid}`); continue; }
    try {
      const notes = await fetchNotes(page, uid, entry.url);
      for (const n of notes) out.write(JSON.stringify(n) + "\n");
      const likes = notes.reduce((s, n) => s + (n.likes || 0), 0);
      const comments = notes.reduce((s, n) => s + (n.comments || 0), 0);
      const collects = notes.reduce((s, n) => s + (n.collects || 0), 0);
      const row = { user_id: uid, notes: notes.length, total_likes: likes, total_comments: comments, total_collects: collects, avg_likes: notes.length ? Math.round(likes / notes.length) : 0, avg_comments: notes.length ? Math.round(comments / notes.length) : 0, avg_collects: notes.length ? Math.round(collects / notes.length) : 0 };
      summary.push(row);
      console.log(`${uid}: ${notes.length} 篇 | 总赞 ${likes} | 均赞/篇 ${row.avg_likes} | 均评/篇 ${row.avg_comments}`);
      await page.waitForTimeout(1500);
    } catch (e) {
      console.log(`${uid}: 采集失败 ${e.message.slice(0, 80)}`);
    }
  }
  out.end();
  if (summary.length) {
    const cols = ["user_id", "notes", "total_likes", "total_comments", "total_collects", "avg_likes", "avg_comments", "avg_collects"];
    const csv = "\ufeff" + cols.join(",") + "\n" + summary.map(r => cols.map(c => r[c]).join(",")).join("\n") + "\n";
    fs.writeFileSync(SUMMARY, csv);
    console.log(`\n笔记数据 → ${OUT}\n汇总 → ${SUMMARY}`);
  }
  await browser.close();
})().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
