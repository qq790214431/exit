// 功能模块 B3：方案 PDF 导出（由并行子任务实现）
// 通过 window.MKT.registerToolbarButton("导出 PDF", fn) 注册营销工具栏按钮：
//   - 读取 window.MKT.projects / window.MKT.current 定位当前项目
//   - 将项目 phases 全部数据渲染为排版干净的完整 HTML（标量→段落；数组→表格；results→pre 块）
//   - 用 window.open("", "_blank") 写入 HTML，触发 window.print()（用户可在打印对话框选择“另存为 PDF”）
//   - 同一时刻只保留一个打印窗口（先 close 旧的）
window.MKT = window.MKT || {};

(function () {
  "use strict";

  let printWin = null; // 当前打印窗口引用（同一时刻只开一个）

  // 阶段定义（与 marketing.js 的 MKT_STAGES 对齐，缺省时也有兜底标题）
  const PHASES = [
    { key: "deconstruct", title: "S1 拆解业务" },
    { key: "research", title: "S2 调研市场" },
    { key: "strategy", title: "S3 理解业务" },
    { key: "plan", title: "S4 开发计划" },
    { key: "execution", title: "S5 落地执行" }
  ];

  // 转义 HTML：优先用全局 esc()，缺失时本地兜底
  function safeEsc(v) {
    if (typeof window !== "undefined" && typeof window.esc === "function") return window.esc(v);
    return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  // 从 MKT_STAGES 提取各阶段的字段标签与行表列名（用于字段名/表头）
  function phaseMeta() {
    const map = {};
    const stages = (typeof MKT_STAGES !== "undefined" && Array.isArray(MKT_STAGES)) ? MKT_STAGES : [];
    stages.forEach((s) => {
      const entry = { title: (s && s.title) || "", labels: {}, cols: {} };
      (s.groups || []).forEach((g) => {
        if (g.rows && g.rows.key) entry.cols[g.rows.key] = g.rows.cols || [];
        else (g.fields || []).forEach((f) => { if (f.k) entry.labels[f.k] = f.label || f.k; });
      });
      if (s && s.key) map[s.key] = entry;
    });
    return map;
  }

  // results → <pre> 块
  function resultsPre(value) {
    let t = "";
    if (Array.isArray(value)) {
      t = value.map((v) => {
        if (Array.isArray(v)) return v.map((x) => String(x == null ? "" : x)).join("  |  ");
        if (v && typeof v === "object") return Object.entries(v).map(([k, x]) => k + "：" + String(x == null ? "" : x)).join("\n");
        return String(v == null ? "" : v);
      }).join("\n\n");
    } else if (value && typeof value === "object") {
      t = JSON.stringify(value, null, 2);
    } else {
      t = String(value == null ? "" : value);
    }
    return `<pre class="results">${safeEsc(t)}</pre>`;
  }

  // 数组 → 表格（行数组 / 对象数组 / 标量数组 三种形态）
  function arrayTable(arr, cols) {
    if (!arr.length) return `<p class="empty">暂无数据</p>`;
    if (Array.isArray(arr[0])) {
      const n = Math.max(1, ...arr.map((r) => (Array.isArray(r) ? r.length : 1)));
      const headers = cols && cols.length ? cols : Array.from({ length: n }, (_, i) => "列" + (i + 1));
      const thead = `<tr>${headers.map((h) => `<th>${safeEsc(h)}</th>`).join("")}</tr>`;
      const tbody = arr.map((r) => {
        const cells = [];
        for (let i = 0; i < n; i++) {
          const v = Array.isArray(r) ? r[i] : (i === 0 ? r : "");
          cells.push(`<td>${safeEsc(v != null ? v : "")}</td>`);
        }
        return `<tr>${cells.join("")}</tr>`;
      }).join("");
      return `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
    }
    if (typeof arr[0] === "object" && arr[0] !== null) {
      const keys = [];
      arr.forEach((o) => Object.keys(o).forEach((k) => { if (!keys.includes(k)) keys.push(k); }));
      const thead = `<tr>${keys.map((k) => `<th>${safeEsc(k)}</th>`).join("")}</tr>`;
      const tbody = arr.map((o) => `<tr>${keys.map((k) => `<td>${safeEsc(o[k] != null ? o[k] : "")}</td>`).join("")}</tr>`).join("");
      return `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
    }
    const tbody = arr.map((v, i) => `<tr><td class="idx">${i + 1}</td><td>${safeEsc(v != null ? v : "")}</td></tr>`).join("");
    return `<table><thead><tr><th class="idx">#</th><th>内容</th></tr></thead><tbody>${tbody}</tbody></table>`;
  }

  // 单个字段块：标量→段落；数组→表格；results→pre
  function fieldBlock(key, value, m) {
    const label = (m.labels && m.labels[key]) || key;
    const name = `<div class="field-name">${safeEsc(label)}</div>`;
    if (key === "results") {
      return `<div class="field-block">${name}${resultsPre(value)}</div>`;
    }
    if (Array.isArray(value)) {
      return `<div class="field-block">${name}${arrayTable(value, (m.cols && m.cols[key]) || [])}</div>`;
    }
    if (value && typeof value === "object") {
      return `<div class="field-block">${name}<pre class="results">${safeEsc(JSON.stringify(value, null, 2))}</pre></div>`;
    }
    return `<div class="field-block">${name}<p class="field-value">${safeEsc(String(value))}</p></div>`;
  }

  // 阶段小节
  function phaseSection(phase, phaseData, m) {
    const data = (phaseData && typeof phaseData === "object") ? phaseData : {};
    const keys = Object.keys(data).filter((k) => data[k] !== undefined && data[k] !== null && data[k] !== "");
    const body = keys.map((k) => fieldBlock(k, data[k], m)).join("");
    return `<section class="phase"><h2>${safeEsc(m.title || phase.title)}</h2>${body || '<p class="empty">暂无数据</p>'}</section>`;
  }

  // 完整 HTML 文档（含 <style> 干净排版）
  function buildHTML(project) {
    const meta = phaseMeta();
    const phases = (project.phases && typeof project.phases === "object") ? project.phases : {};
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const dateStr = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
    const sections = PHASES.map((p) => phaseSection(p, phases[p.key], meta[p.key] || { title: "", labels: {}, cols: {} })).join("");

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<title>营销方案：${safeEsc(project.name || "未命名项目")}</title>
<style>
  * { box-sizing: border-box; }
  @page { size: A4; margin: 16mm 14mm; }
  html, body { margin: 0; padding: 0; }
  body {
    color: #1c2737;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", sans-serif;
    font-size: 13px; line-height: 1.65;
    padding: 28px 30px 20px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .doc-head { border-bottom: 3px solid #1f3a6e; padding-bottom: 12px; margin-bottom: 22px; }
  h1 { font-size: 26px; margin: 0 0 10px; color: #1f3a6e; letter-spacing: 2px; }
  .doc-meta { display: flex; flex-wrap: wrap; gap: 6px 22px; color: #5c6d86; font-size: 12px; }
  .phase { margin-bottom: 24px; }
  .phase h2 {
    font-size: 16px; color: #1f3a6e; margin: 0 0 12px;
    padding: 2px 0 2px 10px; border-left: 5px solid #1f3a6e; letter-spacing: 1px;
  }
  .field-block { margin: 0 0 14px 14px; }
  .field-name { font-weight: 700; color: #33435c; margin: 10px 0 4px; }
  .field-value { margin: 0; color: #2a3648; white-space: pre-wrap; word-break: break-word; }
  .empty { color: #9aa7bb; font-size: 12px; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; font-size: 12px; }
  th, td { border: 1px solid #d5dce6; padding: 6px 9px; text-align: left; vertical-align: top; word-break: break-word; }
  th { background: #eef2f8; color: #1f3a6e; font-weight: 700; }
  tbody tr:nth-child(even) { background: #f7f9fc; }
  td.idx, th.idx { width: 34px; text-align: center; color: #8a97ab; }
  pre.results {
    margin: 4px 0 10px; padding: 10px 12px;
    background: #f4f6fa; border: 1px solid #dde3ec; border-radius: 6px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px; line-height: 1.6; color: #2a3648;
    white-space: pre-wrap; word-break: break-word;
  }
  .doc-foot { margin-top: 30px; padding-top: 10px; border-top: 1px solid #dde3ec; color: #9aa7bb; font-size: 11px; text-align: center; }
  @media print {
    .doc-foot { break-inside: avoid; }
    .phase { break-inside: auto; }
    h2 { break-after: avoid; }
  }
</style>
</head>
<body>
<header class="doc-head">
  <h1>营销方案</h1>
  <div class="doc-meta">
    <span>项目：${safeEsc(project.name || "-")}</span>
    <span>客户：${safeEsc(project.client || "-")}</span>
    <span>状态：${safeEsc(project.status || "-")}</span>
    <span>导出时间：${safeEsc(dateStr)}</span>
  </div>
</header>
${sections}
<footer class="doc-foot">本方案由小红书营销工作台生成 · ${safeEsc(dateStr)}</footer>
</body>
</html>`;
  }

  // 注册工具栏按钮
  window.MKT.registerToolbarButton("导出 PDF", () => {
    const list = (window.MKT.projects && window.MKT.projects.projects) || [];
    const cur = window.MKT.current;
    const project = list.find((x) => x && String(x.id) === String(cur));
    if (!project) {
      window.alert("未找到当前项目，请先在「全案营销」中打开一个项目。");
      return;
    }

    // 同一时刻只开一个打印窗口：先关闭旧的
    if (printWin && !printWin.closed) {
      try { printWin.close(); } catch (e) { /* 忽略关闭异常 */ }
      printWin = null;
    }

    const html = buildHTML(project);
    const w = window.open("", "_blank");
    if (!w) {
      window.alert("弹窗被拦截，无法打开打印窗口。请在浏览器/系统设置中允许本站弹出窗口后重试。");
      return;
    }
    printWin = w;

    // 触发系统打印（用户可在对话框中选择“另存为 PDF”）
    const triggerPrint = () => { try { w.focus(); w.print(); } catch (e) { /* 忽略打印异常 */ } };
    w.onload = triggerPrint; // 提前挂载，避免加载事件早于赋值
    w.document.write(html);
    w.document.close();
    w.onload = triggerPrint;
  });
})();
