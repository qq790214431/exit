// 链接导入：粘贴小红书分享链接（完整主页链接 / xhslink 短链 / APP分享文本）→ 自动生成 urlmap.json
// 用法：
//   node import_links.js                    # 读取 ./links.txt，合并写入 ./urlmap.json
//   LINKS_FILE=/path/to/links.txt node import_links.js
//   URLMAP_OUT=/tmp/test.json node import_links.js   # 输出到指定文件（测试用）
const fs = require("fs");

const OUT_DIR = __dirname;
const LINKS_FILE = process.env.LINKS_FILE || OUT_DIR + "/links.txt";
const URLMAP_IN = process.env.INPUT_JSON || OUT_DIR + "/urlmap.json";
const URLMAP_OUT = process.env.URLMAP_OUT || OUT_DIR + "/urlmap.json";

function extractUrls(text) {
  const re = /https?:\/\/[^\s"'<>）)】、，,；;]+/g;
  return [...new Set(text.match(re) || [])].map(u => u.replace(/[。.]+$/, ""));
}

function parseProfileUrl(url) {
  const m = url.match(/\/user\/profile\/([0-9a-fA-F]{24})/);
  if (!m) return null;
  const uid = m[1];
  let u;
  try { u = new URL(url); } catch (e) { return null; }
  const params = {};
  for (const [k, v] of u.searchParams) params[k] = v;
  const q = new URLSearchParams();
  const keep = ["xsec_token", "xsec_source", "shareRedId", "apptime", "share_id", "share_channel", "appuid", "xhsshare"];
  for (const k of keep) if (params[k]) q.set(k, params[k]);
  return {
    uid,
    url: `https://www.xiaohongshu.com/user/profile/${uid}?${q.toString()}`,
    has_token: !!params.xsec_token
  };
}

async function resolveShort(url) {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15" }
    });
    return res.url || url;
  } catch (e) {
    return null;
  }
}

(async () => {
  if (!fs.existsSync(LINKS_FILE)) {
    console.error(`找不到链接文件: ${LINKS_FILE}`);
    console.error(`请把小红书分享链接粘贴到该文件（每行一个，支持完整链接/xhslink短链/APP分享文本）`);
    process.exit(1);
  }
  const text = fs.readFileSync(LINKS_FILE, "utf8");
  const urls = extractUrls(text);
  const map = fs.existsSync(URLMAP_IN) ? JSON.parse(fs.readFileSync(URLMAP_IN, "utf8")) : {};
  let added = 0, dup = 0, failed = 0, noToken = 0;
  const results = [];

  for (const u of urls) {
    let full = u;
    if (/xhslink\.com|s\.xiaohongshu\.com/i.test(u)) {
      const r = await resolveShort(u);
      if (!r) { failed++; results.push({ url: u, ok: false, reason: "短链解析失败" }); continue; }
      full = r;
    }
    const p = parseProfileUrl(full);
    if (!p) { failed++; results.push({ url: u, ok: false, reason: "非主页链接" }); continue; }
    const ex = map[p.uid];
    if (ex) {
      if (ex.has_token && p.has_token) {
        dup++; ex.n_sources = (ex.n_sources || 1) + 1;
        results.push({ url: u, ok: true, reason: "已存在（更新来源计数）" });
        continue;
      }
      if (ex.has_token && !p.has_token) {
        dup++; results.push({ url: u, ok: true, reason: "已存在（保留旧 token）" });
        continue;
      }
      map[p.uid] = { ...ex, url: p.url, has_token: p.has_token, n_sources: (ex.n_sources || 1) + 1 };
      added++; if (!p.has_token) noToken++;
      results.push({ url: u, ok: true, reason: p.has_token ? "已补 token" : "已更新来源" });
      continue;
    }
    map[p.uid] = { url: p.url, has_token: p.has_token, n_sources: 1 };
    added++; if (!p.has_token) noToken++;
    results.push({ url: u, ok: true, reason: "已导入" });
  }

  fs.writeFileSync(URLMAP_OUT, JSON.stringify(map, null, 2));
  console.log(`链接 ${urls.length} 个 → 新增 ${added}，重复 ${dup}，失败 ${failed}，无 token ${noToken}`);
  console.log(`urlmap.json 现有 ${Object.keys(map).length} 条: ${URLMAP_OUT}`);
  for (const r of results) console.log(`  ${r.ok ? "OK  " : "FAIL"} ${r.url.slice(0, 90)} ${r.reason}`);
})().catch(e => { console.error("FATAL:", e); process.exit(1); });
