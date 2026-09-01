const fs = require("fs");
let playwright;
try {
  playwright = require("playwright-core");
} catch (e) {
  playwright = require("/Users/Admin/.homebrew/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core");
}
const { chromium } = playwright;

const CHROME = process.env.CHROME || "/Users/Admin/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const OUT_DIR = __dirname;
const PROGRESS = OUT_DIR + "/progress.jsonl";
const CSV_PATH = OUT_DIR + "/xhs_profiles.csv";
const CSV_COLS = ["user_id", "nickname", "red_id", "region", "ip", "tags", "following", "followers", "likes_collects", "followers_num", "status", "url", "ts"];

const CONCURRENCY = Number(process.env.CONCURRENCY || 4);
const MAX = Number(process.env.MAX || 0);
const RESCRAPE = process.env.RESCRAPE === "1";
const EXPORT_ONLY = process.env.EXPORT_ONLY === "1";
const REFILL_MISSING = process.env.REFILL_MISSING === "1";
const COMPACT = process.env.COMPACT === "1";
const RETRY_ABANDONED = process.env.RETRY_ABANDONED === "1";
const MAX_FAIL = Number(process.env.MAX_FAIL || 3);
const ABANDONED_PATH = OUT_DIR + "/abandoned.json";

// 输入：默认 xhs采集/urlmap.json，缺失回退 /tmp/urlmap.json，可用 INPUT_JSON 覆盖
const INPUT_JSON = process.env.INPUT_JSON || (fs.existsSync(OUT_DIR + "/urlmap.json") ? OUT_DIR + "/urlmap.json" : "/tmp/urlmap.json");
const urlmap = JSON.parse(fs.readFileSync(INPUT_JSON, "utf8"));
const uids = Object.keys(urlmap).sort();

// 读取进度：latest=每账号最新记录；failCount=非 ok 累计次数
function readProgress() {
  const latest = {};
  const failCount = {};
  if (fs.existsSync(PROGRESS)) {
    for (const line of fs.readFileSync(PROGRESS, "utf8").trim().split("\n")) {
      if (!line) continue;
      try {
        const j = JSON.parse(line);
        latest[j.user_id] = j;
        if (j.status !== "ok") failCount[j.user_id] = (failCount[j.user_id] || 0) + 1;
      } catch (e) {}
    }
  }
  return { latest, failCount };
}

function loadAbandoned() { try { return JSON.parse(fs.readFileSync(ABANDONED_PATH, "utf8")); } catch (e) { return {}; } }
function saveAbandoned(map) { fs.writeFileSync(ABANDONED_PATH, JSON.stringify(map, null, 2)); }

let abandoned = loadAbandoned();
if (RETRY_ABANDONED) {
  const n = Object.keys(abandoned).length;
  abandoned = {};
  saveAbandoned(abandoned);
  console.log(`RETRY_ABANDONED: 已清除 ${n} 个放弃标记，本轮重试`);
}

const { latest, failCount } = readProgress();
// 失败治理：最新状态非 ok 且累计失败 >= MAX_FAIL 次 → 标记放弃并跳过（RETRY_ABANDONED 时本轮不再自动标记）
if (!RETRY_ABANDONED) {
  let newlyAbandoned = 0;
  for (const uid of uids) {
    const l = latest[uid];
    if (l && l.status !== "ok" && (failCount[uid] || 0) >= MAX_FAIL && !abandoned[uid]) {
      abandoned[uid] = { reason: l.status, attempts: failCount[uid], last_ts: l.ts || "", nickname: l.nickname || "" };
      newlyAbandoned++;
    }
  }
  if (newlyAbandoned > 0) { saveAbandoned(abandoned); console.log(`失败治理: 标记 ${newlyAbandoned} 个账号为已放弃（连续失败≥${MAX_FAIL} 次）`); }
}
const abandonedIds = new Set(Object.keys(abandoned));

// 补全模式：ok 但缺粉丝数/地区的记录
const okCount = Object.values(latest).filter(j => j.status === "ok").length;
const missing = uids.filter(u => {
  const l = latest[u];
  return l && l.status === "ok" && (!l.followers || !l.region);
});

// COMPACT：压缩 progress.jsonl 为每账号最新一条（备份原文件）
if (COMPACT) {
  const rawLines = fs.existsSync(PROGRESS) ? fs.readFileSync(PROGRESS, "utf8").trim().split("\n").filter(Boolean) : [];
  fs.copyFileSync(PROGRESS, PROGRESS + ".bak");
  const lines = Object.values(latest).sort((a, b) => (a.user_id < b.user_id ? -1 : 1)).map(j => JSON.stringify(j));
  fs.writeFileSync(PROGRESS, lines.join("\n") + "\n");
  console.log(`COMPACT: ${rawLines.length} 行 → ${lines.length} 条（每账号最新一条），原文件已备份 progress.jsonl.bak`);
  process.exit(0);
}

if (EXPORT_ONLY) { exportCsv(); process.exit(0); }

// 选择待采集
let pending;
if (RESCRAPE) pending = [...uids];
else if (REFILL_MISSING) pending = missing.filter(u => !abandonedIds.has(u));
else pending = uids.filter(u => !(latest[u] && latest[u].status === "ok") && !abandonedIds.has(u));
if (MAX > 0) pending = pending.slice(0, MAX);
console.log(`Input: ${INPUT_JSON}, Total: ${uids.length}, ok: ${okCount}, missing: ${missing.length}, abandoned: ${abandonedIds.size}, pending: ${pending.length}`);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);

function regionFromTags(tags, ip) {
  if (!tags) return ip || "";
  const re = /^[\u4e00-\u9fa5]{1,12}(省|市|自治区|自治州|地区|区|县|特别行政区)$|^海外$/;
  const hit = tags.find(t => re.test(t.trim()));
  return (hit && hit.trim()) || ip || "";
}

// 规范化数量文本："1.2万" -> 12000，"3亿" -> 300000000，纯数字/千分位 -> 整数；失败 -> null
function parseNum(text) {
  if (text == null) return null;
  const s = String(text).trim().replace(/,/g, "");
  if (!s) return null;
  let m;
  if ((m = s.match(/^([\d.]+)\s*万$/))) return Math.round(parseFloat(m[1]) * 10000);
  if ((m = s.match(/^([\d.]+)\s*亿$/))) return Math.round(parseFloat(m[1]) * 1e8);
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function csvEscape(v) {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// 从 progress.jsonl 中 status=ok 的记录生成 CSV（UTF-8 带 BOM；按 user_id 去重，保留最新一条）
function exportCsv() {
  const byId = new Map();
  if (fs.existsSync(PROGRESS)) {
    for (const line of fs.readFileSync(PROGRESS, "utf8").trim().split("\n")) {
      if (!line) continue;
      try {
        const j = JSON.parse(line);
        if (j.status !== "ok") continue;
        byId.set(j.user_id, CSV_COLS.map(c => csvEscape(j[c])));
      } catch (e) {}
    }
  }
  const rows = [...byId.values()];
  const content = "\ufeff" + CSV_COLS.join(",") + "\n" + rows.map(r => r.join(",")).join("\n") + "\n";
  fs.writeFileSync(CSV_PATH, content);
  console.log(`CSV exported: ${CSV_PATH} (${rows.length} rows)`);
}

if (EXPORT_ONLY) {
  exportCsv();
  process.exit(0);
}
exportCsv(); // 启动时先生成一次（增量运行时也会定期/结束时刷新）

async function scrapeOne(page, uid, url, attempt) {
  const result = { user_id: uid, url, attempt, ts: new Date().toISOString() };
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    // wait for either user card or captcha redirect
    const started = Date.now();
    while (Date.now() - started < 30000) {
      const u = page.url();
      if (u.includes("website-login") || u.includes("captcha")) {
        result.status = "captcha";
        result.body = (await page.evaluate(() => document.body.innerText.slice(0, 80)).catch(() => ""));
        return result;
      }
      const hasCard = await page.evaluate(() => !!document.querySelector(".user-name")).catch(() => false);
      if (hasCard) break;
      await sleep(1500);
    }
    await sleep(2500); // let info section render

    // 等待数据统计行渲染（≤5 秒）
    const statsStarted = Date.now();
    while (Date.now() - statsStarted < 5000) {
      const hasStats = await page.evaluate(() => !!document.querySelector(".user-stats-row")).catch(() => false);
      if (hasStats) break;
      await sleep(500);
    }

    const data = await page.evaluate(() => {
      const q = s => { const el = document.querySelector(s); return el ? el.textContent.trim() : null; };
      const tags = [...document.querySelectorAll(".tag-inline")].map(el => el.textContent.trim());
      // 关注 / 粉丝 / 获赞与收藏
      const stats = { following: null, followers: null, likesCollects: null };
      const row = document.querySelector(".user-stats-row");
      if (row) {
        for (const item of row.querySelectorAll(".stat-item")) {
          const labelEl = item.querySelector(".stat-label");
          const numEl = item.querySelector(".stat-num");
          if (!labelEl) continue;
          const label = labelEl.textContent.trim();
          const raw = numEl ? numEl.textContent.trim() : null;
          if (label.includes("粉丝")) stats.followers = raw;
          else if (label.includes("关注")) stats.following = raw;
          else if (label.includes("获赞")) stats.likesCollects = raw;
        }
      }
      return {
        userName: q(".user-name"),
        redId: q(".red-id"),
        ipText: q(".user-ip-text"),
        tags,
        stats
      };
    });

    if (!data.userName) {
      result.status = "no_data";
      result.body = (await page.evaluate(() => document.body.innerText.slice(0, 120)).catch(() => ""));
      return result;
    }

    const redIdRaw = (data.redId || "").replace(/^小红书号\s*/, "").trim();
    const ip = (data.ipText || "").replace(/^IP[:：]\s*/, "").trim();
    result.status = "ok";
    result.nickname = data.userName;
    result.red_id = redIdRaw;
    result.ip = ip;
    result.region = regionFromTags(data.tags, ip);
    result.tags = (data.tags || []).join("|");
    result.following = data.stats.following;
    result.followers = data.stats.followers;
    result.likes_collects = data.stats.likesCollects;
    result.followers_num = parseNum(data.stats.followers);
    return result;
  } catch (e) {
    result.status = "error";
    result.err = String(e.message).slice(0, 200);
    return result;
  }
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled", "--disable-dev-shm-usage"]
  });

  let consecutiveCaptcha = 0;
  const CAPTCHA_BURST_LIMIT = Number(process.env.CAPTCHA_BURST || 8);
  let stopRound = false;
  const workers = [];
  const queue = [...pending];
  let completed = 0;
  const total = queue.length;
  const startTime = Date.now();

  for (let w = 0; w < CONCURRENCY; w++) {
    workers.push((async () => {
      const ctx = await browser.newContext({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: "zh-CN"
      });
      await ctx.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      });
      const page = await ctx.newPage();

      while (queue.length) {
        const uid = queue.shift();
        const entry = urlmap[uid];
        let result = await scrapeOne(page, uid, entry.url, 1);
        // retry once on captcha/error
        if (result.status !== "ok") {
          await sleep(rnd(6000, 10000));
          result = await scrapeOne(page, uid, entry.url, 2);
        }
        fs.appendFileSync(PROGRESS, JSON.stringify(result) + "\n");
        if (result.status === "captcha" || result.status === "error") {
          consecutiveCaptcha++;
          if (consecutiveCaptcha >= CAPTCHA_BURST_LIMIT) {
            console.log("CAPTCHA_BURST reached, stopping round");
            stopRound = true;
            queue.length = 0;
            break;
          }
        } else {
          consecutiveCaptcha = 0;
        }
        completed++;
        const el = Math.round((Date.now() - startTime) / 1000);
        const pct = (completed / total * 100).toFixed(1);
        console.log(`[${completed}/${total} ${pct}% ${el}s] ${uid} -> ${result.status} ${result.nickname || ""} ${result.red_id || ""} ${result.region || ""} 粉丝:${result.followers || "-"}`);
        await sleep(rnd(2500, 6000));
      }
      await ctx.close();
    })());
  }
  await Promise.all(workers);
  await browser.close();
  exportCsv(); // 结束时刷新 CSV
  console.log("DONE");
})().catch(e => { console.error("FATAL:", e); process.exit(1); });
