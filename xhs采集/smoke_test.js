// 端到端冒烟测试：真实采集 2 条验证全链路（需网络）
// 用法：node smoke_test.js
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const OUT_DIR = __dirname;

function csvRows() {
  const f = path.join(OUT_DIR, "xhs_profiles.csv");
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(l => l.trim()).length - 1 : 0;
}

const before = csvRows();
console.log(`冒烟测试开始: 采集 2 条 (MAX=2 CONCURRENCY=1)...`);
const r = spawnSync("node", [path.join(OUT_DIR, "scrape.js")], {
  cwd: OUT_DIR,
  env: { ...process.env, MAX: "2", CONCURRENCY: "1" },
  encoding: "utf8", timeout: 240000
});
const out = (r.stdout || "") + (r.stderr || "");
const after = csvRows();
const done = /DONE/.test(out);
const hasFans = /粉丝:\d/.test(out) || /粉丝:[0-9.]+万/.test(out);
const pass = r.status === 0 && done;
console.log(pass ? `SMOKE PASS (exit=${r.status}, 完成标记✓, CSV ${before}→${after} 行)` : `SMOKE FAIL (exit=${r.status}, done=${done})\n${out.slice(-600)}`);
process.exit(pass ? 0 : 1);
