// ============ 功能模块 A3：自定义模板保存 ============
// 在营销工具栏注册两个按钮：
//   1. 「存为模板」—— 把当前项目（window.MKT.current 定位）的 phases 存为自定义模板
//      localStorage 键 xhs_mkt_templates（JSON 数组，每项 { id, name, phases, saved_at }），
//      name 默认 = 项目名 + "模板"，按 name 去重覆盖。
//   2. 「我的模板」—— 全屏弹层（div id="mytplMask"，z-index 9995，含关闭按钮 + 样式
//      <style id="mytplStyle">），列出全部自定义模板卡片（名称 + 保存时间 + "用此模板新建" + "删除"）。
//      用此模板新建 → prompt 项目名 → 创建项目（id="p"+Date.now()，phases 深拷贝）→ saveProject
//      保存并更新 window.MKT.projects → 关闭弹层；删除 → 从 localStorage 移除并重渲染。
window.MKT = window.MKT || {};

(function () {
  "use strict";

  var LS_KEY = "xhs_mkt_templates";

  // ---------- localStorage 读写 ----------
  function readTemplates() {
    try {
      var raw = window.localStorage.getItem(LS_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function writeTemplates(list) {
    window.localStorage.setItem(LS_KEY, JSON.stringify(list));
  }

  // 通过 window.MKT.current 定位当前项目对象
  function currentProject() {
    var list = (window.MKT.projects && window.MKT.projects.projects) || [];
    return list.find(function (x) { return x && x.id === window.MKT.current; }) || null;
  }

  // 深拷贝（JSON 序列化往返）
  function deepClone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  // 保存时间显示为本地可读格式
  function fmtTime(iso) {
    if (!iso) return "-";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString("zh-CN", { hour12: false });
  }

  // ---------- 按钮 1：存为模板 ----------
  window.MKT.registerToolbarButton("存为模板", function () {
    var project = currentProject();
    if (!project) {
      window.alert("请先打开一个项目");
      return;
    }
    var name = (project.name || "未命名项目") + "模板";
    var templates = readTemplates();
    // 按 name 去重覆盖：剔除同名旧模板后追加新模板
    var rest = templates.filter(function (t) { return t && t.name !== name; });
    rest.push({
      id: "tpl" + Date.now(),
      name: name,
      phases: deepClone(project.phases || {}),
      saved_at: new Date().toISOString()
    });
    try {
      writeTemplates(rest);
    } catch (e) {
      window.alert("保存模板失败：" + (e && e.message ? e.message : String(e)));
      return;
    }
    window.alert("已将当前项目存为自定义模板：「" + name + "」\n当前共有 " + rest.length + " 个自定义模板。");
  });

  // ---------- 弹层：我的模板 ----------
  function closeLibrary() {
    var mask = document.getElementById("mytplMask");
    if (mask) mask.remove();
    var style = document.getElementById("mytplStyle");
    if (style) style.remove();
  }

  // 渲染模板卡片列表并绑定事件（删除后重渲染时复用）
  function renderGrid(mask) {
    var templates = readTemplates();
    var grid = mask.querySelector(".mytpl-grid");
    grid.innerHTML = templates.length
      ? templates.map(function (t, i) {
          return (
            '<div class="mytpl-card">' +
            '<div class="mytpl-name">' + esc(t.name || "未命名模板") + "</div>" +
            '<div class="mytpl-time">保存时间：' + esc(fmtTime(t.saved_at)) + "</div>" +
            '<div class="mytpl-actions">' +
            '<button class="mytpl-use" data-idx="' + i + '">用此模板新建</button>' +
            '<button class="mytpl-del" data-idx="' + i + '">删除</button>' +
            "</div>" +
            "</div>"
          );
        }).join("")
      : '<div class="mytpl-empty">还没有自定义模板。先打开一个项目，点工具栏「存为模板」即可保存。</div>';

    // 用此模板新建
    mask.querySelectorAll(".mytpl-use").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var tpl = templates[Number(btn.dataset.idx)];
        if (tpl) createFromTemplate(tpl);
      });
    });
    // 删除：从 localStorage 移除并重渲染
    mask.querySelectorAll(".mytpl-del").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var tpl = templates[Number(btn.dataset.idx)];
        if (!tpl) return;
        var rest = readTemplates().filter(function (t) { return t && t.id !== tpl.id; });
        try {
          writeTemplates(rest);
        } catch (e) {
          window.alert("删除模板失败：" + (e && e.message ? e.message : String(e)));
          return;
        }
        renderGrid(mask); // 重渲染
      });
    });
  }

  function openLibrary() {
    // 渲染前移除旧弹层（含其内部样式）
    var old = document.getElementById("mytplMask");
    if (old) old.remove();
    var oldStyle = document.getElementById("mytplStyle");
    if (oldStyle) oldStyle.remove();

    var mask = document.createElement("div");
    mask.id = "mytplMask";
    mask.innerHTML =
      '<style id="mytplStyle">' +
      "#mytplMask{position:fixed;top:0;left:0;width:100%;height:100%;z-index:9995;background:rgba(15,20,35,.62);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:60px 20px 40px;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;}" +
      "#mytplMask .mytpl-panel{background:#fff;border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,.35);width:min(880px,100%);padding:24px 26px;box-sizing:border-box;animation:mytplIn .18s ease-out;}" +
      "@keyframes mytplIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}" +
      "#mytplMask .mytpl-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}" +
      "#mytplMask .mytpl-title{font-size:20px;font-weight:700;color:#1f2329;}" +
      "#mytplMask .mytpl-close{width:34px;height:34px;border:none;border-radius:50%;background:#f2f3f5;color:#4b5563;font-size:16px;line-height:1;cursor:pointer;transition:background .15s;}" +
      "#mytplMask .mytpl-close:hover{background:#ff4d4f;color:#fff;}" +
      "#mytplMask .mytpl-sub{color:#8a919f;font-size:13px;margin-bottom:18px;}" +
      "#mytplMask .mytpl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;}" +
      "#mytplMask .mytpl-card{border:1px solid #eef0f3;border-radius:12px;padding:16px 16px 14px;background:#fafbfc;display:flex;flex-direction:column;gap:8px;transition:border-color .15s,box-shadow .15s;}" +
      "#mytplMask .mytpl-card:hover{border-color:#ff2442;box-shadow:0 6px 18px rgba(255,36,66,.12);}" +
      "#mytplMask .mytpl-name{font-size:16px;font-weight:700;color:#1f2329;}" +
      "#mytplMask .mytpl-time{font-size:12px;color:#8a919f;}" +
      "#mytplMask .mytpl-actions{margin-top:4px;display:flex;gap:8px;}" +
      "#mytplMask .mytpl-use{flex:1;border:none;border-radius:8px;background:#ff2442;color:#fff;font-size:14px;font-weight:600;padding:9px 12px;cursor:pointer;transition:background .15s;}" +
      "#mytplMask .mytpl-use:hover{background:#e01e38;}" +
      "#mytplMask .mytpl-del{flex:1;border:1px solid #e5e7eb;border-radius:8px;background:#fff;color:#6b7280;font-size:14px;padding:8px 12px;cursor:pointer;transition:all .15s;}" +
      "#mytplMask .mytpl-del:hover{border-color:#ff4d4f;color:#ff4d4f;background:#fff5f5;}" +
      "#mytplMask .mytpl-empty{color:#8a919f;font-size:14px;text-align:center;padding:40px 0;}" +
      "</style>" +
      '<div class="mytpl-panel">' +
      '<div class="mytpl-head"><div class="mytpl-title">📁 我的模板</div><button class="mytpl-close" title="关闭">✕</button></div>' +
      '<div class="mytpl-sub">自定义模板保存在本机（localStorage），可用任意模板一键新建项目</div>' +
      '<div class="mytpl-grid"></div>' +
      "</div>";

    // 点遮罩空白处关闭（仅当点击的是遮罩本身，而非弹层面板）
    mask.addEventListener("click", function (e) {
      if (e.target === mask) closeLibrary();
    });
    // 关闭按钮
    mask.querySelector(".mytpl-close").addEventListener("click", closeLibrary);

    document.body.appendChild(mask);
    renderGrid(mask);
  }

  // ---------- 用模板新建项目 ----------
  async function createFromTemplate(tpl) {
    var name = window.prompt("输入项目名称：", (tpl.name || "模板") + " 项目");
    if (!name || !String(name).trim()) return; // 取消或空名则不创建，弹层保持打开

    var project = {
      id: "p" + Date.now(),
      name: String(name).trim(),
      client: "",
      status: "进行中",
      created_at: new Date().toISOString(),
      phases: deepClone(tpl.phases || {}) // phases 深拷贝
    };

    try {
      var list = await window.api.saveProject(project);
      if (list && Array.isArray(list.projects)) {
        window.MKT.projects = list; // 更新全局项目列表
        // 同步 marketing.js 内部顶层 let（全局词法环境），保证列表刷新一致
        try { if (typeof mktProjects !== "undefined") mktProjects = list; } catch (e) {}
        try { if (typeof mktSync === "function") mktSync(); } catch (e) {}
      }
      closeLibrary();
      if (typeof window.renderMktList === "function") window.renderMktList();
    } catch (err) {
      window.alert("创建项目失败：" + (err && err.message ? err.message : err));
    }
  }

  // ---------- 按钮 2：我的模板 ----------
  window.MKT.registerToolbarButton("我的模板", openLibrary);
  // ---------- 按钮 3：模板同步到云端 ----------
  // 读取 localStorage 本地模板数组（xhs_mkt_templates），整体上传到云端覆盖云端模板
  window.MKT.registerToolbarButton("模板同步到云端", async function () {
    var templates = readTemplates();
    try {
      await window.api.saveTemplates(templates);
    } catch (e) {
      window.alert("同步到云端失败：" + (e && e.message ? e.message : String(e)));
      return;
    }
    window.alert("已同步 " + templates.length + " 个模板到云端");
  });

  // ---------- 按钮 4：模板从云端下载 ----------
  // 拉取云端模板（window.api.getTemplates() → { version, templates }），按 name 去重合并进
  // localStorage，云端优先（同名以云端覆盖本地），合并后若「我的模板」弹层已打开则重渲染
  window.MKT.registerToolbarButton("模板从云端下载", async function () {
    var cloud;
    try {
      cloud = await window.api.getTemplates();
    } catch (e) {
      window.alert("从云端获取模板失败：" + (e && e.message ? e.message : String(e)));
      return;
    }
    var cloudList = cloud && Array.isArray(cloud.templates) ? cloud.templates : [];
    var localList = readTemplates();
    // 按 name 去重合并：云端优先（同名以云端覆盖本地，其余本地模板保留）
    var merged = localList.filter(function (t) { return t && t.name; });
    var cloudNames = {};
    var mergedCount = 0;
    cloudList.forEach(function (t) {
      if (!t || !t.name || cloudNames[t.name]) return; // 跳过无 name 或云端内部重复项
      cloudNames[t.name] = true;
      var idx = -1;
      for (var i = 0; i < merged.length; i++) {
        if (merged[i].name === t.name) { idx = i; break; }
      }
      if (idx >= 0) {
        merged[idx] = t; // 云端优先：覆盖本地同名模板
      } else {
        merged.push(t); // 本地没有同名 → 追加到末尾
      }
      mergedCount++;
    });
    try {
      writeTemplates(merged);
    } catch (e) {
      window.alert("保存到本地失败：" + (e && e.message ? e.message : String(e)));
      return;
    }
    window.alert("已从云端合并 " + mergedCount + " 个模板");
    // 若「我的模板」弹层已打开则重渲染
    var mask = document.getElementById("mytplMask");
    if (mask) renderGrid(mask);
  });
})();
