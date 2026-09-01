// 涨粉分析：读取 snapshots.jsonl 历史快照，计算每个账号粉丝数变化
// 用法：
//   node growth.js                     # 计算并输出 xhs_growth.csv + 涨跌榜
//   GROWTH_DAYS=7 node growth.js       # 只看最近 7 天变化
//   SEED=1 node growth.js              # 用 progress.jsonl 当前值初始化基线快照
// 建议流程：SEED 建基线 → 隔几天 REFRESH=1 刷新 → growth.js 看涨跌
const fs = require("fs");

const OUT_DIR = __dirname;
const SNAPSHOT_PATH = OUT_DIR + "/snapshots.jsonl";
const PROGRESS_PATH = OUT_DIR + "/progress.jsonl";
const GROWTH_CSV = OUT_DIR + "/xhs_growth.csv";
const GROWTH_DAYS = Number(process.env.GROWTH_DAYS || 0);

function readSnapshots() {
  const byId = {};
  if (fs.existsSync(SNAPSHOT_PATH)) {
    for (const line of fs.readFileSync(SNAPSHOT_PATH, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const j = JSON.parse(line);
        if (!j.user_id || j.followers_num == null) continue;
        (byId[j.user_id] = byId[j.user_id] || []).push(j);
      } catch (e) {}
    }
  }
  return byId;
}

function readProgressLatest() {
  const latest = {};
  if (fs.existsSync(PROGRESS_PATH)) {
    for (const line of fs.readFileSync(PROGRESS_PATH, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try { const j = JSON.parse(line); latest[j.user_id] = j; } catch (e) {}
    }
  }
  return latest;
}

function csvEscape(v) {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

(async () => {
  const snapshots = readSnapshots();
  const progress = readProgressLatest();

  if (process.env.SEED === "1") {
    let seeded = 0;
    const lines = [];
    for (const uid of Object.keys(progress).sort()) {
      const l = progress[uid];
      if (l.status !== "ok" || (snapshots[uid] && snapshots[uid].length)) continue;
      if (l.followers_num == null) continue;
      lines.push(JSON.stringify({ user_id: uid, nickname: l.nickname || "", followers: l.followers || "", followers_num: l.followers_num, ts: new Date().toISOString() }));
      seeded++;
    }
    if (lines.length) fs.appendFileSync(SNAPSHOT_PATH, lines.join("\n") + "\n");
    console.log(`SEED: 已为 ${seeded} 个账号建立基线快照 → ${SNAPSHOT_PATH}`);
    process.exit(0);
  }

  const cutoff = GROWTH_DAYS > 0 ? Date.now() - GROWTH_DAYS * 86400000 : null;
  const rows = [];
  let computable = 0;
  for (const uid of Object.keys(snapshots).sort()) {
    const snaps = snapshots[uid].slice().sort((a, b) => a.ts.localeCompare(b.ts));
    let pool = snaps;
    if (cutoff) {
      pool = snaps.filter(s => new Date(s.ts).getTime() >= cutoff);
      if (pool.length < 2) pool = snaps; // 窗口内不足则回退到全部
    }
    if (pool.length < 2) continue;
    const base = pool[0];
    const cur = pool[pool.length - 1];
    const baseNum = base.followers_num, curNum = cur.followers_num;
    const delta = curNum - baseNum;
    const pct = baseNum ? Math.round((delta / baseNum) * 1000) / 10 : null;
    const pl = progress[uid] || {};
    rows.push({
      user_id: uid,
      nickname: cur.nickname || pl.nickname || "",
      region: pl.region || "",
      followers_base: baseNum,
      followers_now: curNum,
      delta,
      delta_pct: pct,
      base_ts: base.ts,
      now_ts: cur.ts,
      snapshots: pool.length
    });
    computable++;
  }

  rows.sort((a, b) => b.delta - a.delta);
  const cols = ["user_id", "nickname", "region", "followers_base", "followers_now", "delta", "delta_pct", "base_ts", "now_ts", "snapshots"];
  const content = "\ufeff" + cols.join(",") + "\n" + rows.map(r => cols.map(c => csvEscape(r[c])).join(",")).join("\n") + "\n";
  fs.writeFileSync(GROWTH_CSV, content);

  console.log(`快照账号: ${Object.keys(snapshots).length}，可计算涨跌: ${computable}`);
  console.log(`CSV: ${GROWTH_CSV}`);
  if (computable) {
    console.log(`\n涨幅 TOP10:`);
    for (const r of rows.slice(0, 10)) console.log(`  +${r.delta} (${r.delta_pct ?? "-"}%) ${r.nickname} ${r.region} ${r.followers_base}→${r.followers_now}`);
    console.log(`\n跌幅 TOP5:`);
    for (const r of [...rows].reverse().slice(0, 5)) console.log(`  ${r.delta} (${r.delta_pct ?? "-"}%) ${r.nickname} ${r.region} ${r.followers_base}→${r.followers_now}`);
  } else {
    console.log(`\n提示：快照不足。建立流程：① node growth.js SEED=1（用当前进度建基线）→ ② 隔几天 REFRESH=1 node scrape.js 刷新 → ③ node growth.js 查看涨跌`);
  }
})().catch(e => { console.error("FATAL:", e); process.exit(1); });
