// 营销模块注册测试（CI 用）：加载所有 mkt-*.js 并断言钩子注册正确
const fs = require("fs");
const path = require("path");
const assert = require("assert");

// 最小化 mock
global.window = {};
window.MKT = {
  stageButtons: {}, listActions: {}, toolbarButtons: [],
  registerStageButton(s, l, f) { (this.stageButtons[s] = this.stageButtons[s] || []).push({ label: l, fn: f }); },
  registerListAction(l, f) { this.listActions[l] = f; },
  registerToolbarButton(l, f) { this.toolbarButtons.push({ label: l, fn: f }); },
  setGate(f) { this.gate = f; }
};
window.alert = () => {};
window.confirm = () => true;
window.prompt = () => "";
global.document = { getElementById: () => null, querySelectorAll: () => [], addEventListener: () => {}, body: { appendChild() {}, removeChild() {} }, createElement: () => ({ style: {}, setAttribute() {} }) };
global.navigator = { clipboard: { writeText: async () => {} } };
global.location = { href: "" };
window.print = () => {};
global.$ = () => null;
global.esc = (v) => String(v ?? "");
global.fmt = (n) => String(n);

const DIR = path.join(__dirname, "..", "xhs-desktop", "renderer");
const mods = ["mkt-exec.js", "mkt-plan.js", "mkt-ux.js", "mkt-auto.js", "mkt-dash.js", "mkt-pdf.js", "mkt-kanban.js", "mkt-kpi.js", "mkt-template.js", "mkt-savetpl.js", "mkt-compare.js"];
let pass = 0, fail = 0;
function check(name, cond) { if (cond) pass++; else { fail++; console.log("FAIL:", name); } }

for (const m of mods) {
  const p = path.join(DIR, m);
  try {
    if (!fs.existsSync(p)) { console.log(`SKIP ${m}（不存在）`); continue; }
    require(p);
    console.log("loaded:", m);
    check(m + " 可加载", true);
  } catch (e) { fail++; console.log("FAIL:", m, e.message); }
}

const M = window.MKT;
check("S5 执行回填按钮", (M.stageButtons.execution || []).length >= 1);
check("S4 计划按钮>=2", (M.stageButtons.plan || []).length >= 2);
check("阶段门禁已注册", typeof M.gate === "function");
check("列表操作>=2（复制/归档）", Object.keys(M.listActions).length >= 2);
check("工具栏按钮>=2（看板/PDF/模板库等）", M.toolbarButtons.length >= 2);
check("S5 执行按钮>=3（回填/看板/KPI）", (M.stageButtons.execution || []).length >= 3);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
