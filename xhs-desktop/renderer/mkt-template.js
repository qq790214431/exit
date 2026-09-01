// ============ 营销模板库 ============
// 在营销工具栏注册「模板库」按钮：全屏弹层列出全部模板（内置 + 新增行业模板），
// 点「用此模板新建项目」→ 输入项目名 → 深拷贝模板 phases 创建项目并保存。
window.MKT = window.MKT || {};

(function () {
  "use strict";

  // ---------- 模板数据 ----------
  // 内置模板与 marketing.js templatePhases 保持一致的预填风格；
  // 新增：母婴 / 食品饮料 / 数码3C，均预填 deconstruct/research/strategy/plan 常用字段。
  function makePhases(pre) {
    const base = { deconstruct: {}, research: {}, strategy: {}, plan: {}, execution: {} };
    if (pre && typeof pre === "object") {
      Object.keys(pre).forEach(function (k) {
        if (Object.prototype.hasOwnProperty.call(base, k)) base[k] = pre[k];
      });
    }
    return base;
  }

  var TEMPLATES = [
    {
      name: "标准快消",
      desc: "通用快消打法：品牌认知 + 产品种草，适合高频消费品快速起量",
      phases: makePhases({
        deconstruct: { industry: "快消", platforms: "小红书", goal: "品牌认知 + 产品种草", positioning: "品质生活之选" },
        research: { keywords: "品类词,场景词,功效词", persona: "25-35岁 一二线 女性为主" },
        strategy: { positioning_statement: "为追求品质生活的用户提供高性价比产品" },
        plan: { kpi: "笔记30篇 互动率>3% 涨粉1000+" }
      })
    },
    {
      name: "美妆上新",
      desc: "新品上市冲声量：成分党种草 + 测评内容，适合美妆护肤新品首发",
      phases: makePhases({
        deconstruct: { industry: "美妆", platforms: "小红书", goal: "新品上市声量", positioning: "成分党信赖" },
        research: { keywords: "成分,测评,平价替代", persona: "18-30岁 学生/职场新人" },
        strategy: { positioning_statement: "成分透明、效果可见的平价美妆" },
        plan: { kpi: "上新笔记50篇 曝光50万 互动率>4%" }
      })
    },
    {
      name: "本地生活",
      desc: "到店引流：探店 + 必吃榜 + 同城种草，适合餐饮/服务类门店",
      phases: makePhases({
        deconstruct: { industry: "本地生活/餐饮", platforms: "小红书", goal: "到店引流", positioning: "本地人私藏好店" },
        research: { keywords: "探店,必吃榜,周边游", persona: "20-40岁 同城用户" },
        strategy: { positioning_statement: "本地真实口碑好店推荐" },
        plan: { kpi: "探店笔记20篇 收藏>500 到店核销>200" }
      })
    },
    {
      name: "母婴",
      desc: "科学育儿内容 + 达人种草：建立品牌信任，驱动母婴品类电商转化",
      phases: makePhases({
        deconstruct: { industry: "母婴", platforms: "小红书", goal: "品牌信任 + 产品种草 + 电商转化", positioning: "科学育儿 · 安全可靠" },
        research: { keywords: "育儿,辅食,宝宝用品,测评", persona: "25-35岁 一二线城市 新手妈妈" },
        strategy: { positioning_statement: "为新手父母提供科学、安全、放心的母婴好物" },
        plan: { kpi: "笔记40篇 互动率>3% 涨粉1500+ 加购转化>1%" }
      })
    },
    {
      name: "食品饮料",
      desc: "口味种草 + 场景化内容：打造爆款心智，配合促销完成转化闭环",
      phases: makePhases({
        deconstruct: { industry: "食品饮料", platforms: "小红书", goal: "口味种草 + 场景心智 + 促销转化", positioning: "好吃好喝 · 场景首选" },
        research: { keywords: "零食,饮品,低卡,网红美食", persona: "18-35岁 学生/白领 吃货人群" },
        strategy: { positioning_statement: "为年轻消费者提供高颜值、好口味、可晒可分享的食品饮料" },
        plan: { kpi: "笔记45篇 曝光60万 互动率>3.5% 券核销>500" }
      })
    },
    {
      name: "数码3C",
      desc: "新品测评 + 参数解读：用真实评测做理性种草，覆盖首发到长尾转化",
      phases: makePhases({
        deconstruct: { industry: "数码3C", platforms: "小红书", goal: "新品首发声量 + 深度测评种草", positioning: "参数透明 · 理性种草" },
        research: { keywords: "测评,开箱,性价比,数码", persona: "18-40岁 一二线城市 科技爱好者/数码党" },
        strategy: { positioning_statement: "用真实测评与参数解读，帮用户理性决策的数码产品" },
        plan: { kpi: "测评笔记30篇 曝光80万 互动率>2.5% 询单>300" }
      })
    }
  ];

  // ---------- 弹层 ----------
  function openLibrary() {
    // 渲染前移除旧弹层（含其内部样式）
    var old = document.getElementById("tplMask");
    if (old) old.remove();
    var oldStyle = document.getElementById("tplStyle");
    if (oldStyle) oldStyle.remove();

    var mask = document.createElement("div");
    mask.id = "tplMask";
    mask.innerHTML =
      '<style id="tplStyle">' +
      "#tplMask{position:fixed;top:0;left:0;width:100%;height:100%;z-index:9996;background:rgba(15,20,35,.62);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:60px 20px 40px;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;}" +
      "#tplMask .tpl-panel{background:#fff;border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,.35);width:min(980px,100%);padding:24px 26px;box-sizing:border-box;animation:tplIn .18s ease-out;}" +
      "@keyframes tplIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}" +
      "#tplMask .tpl-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}" +
      "#tplMask .tpl-title{font-size:20px;font-weight:700;color:#1f2329;}" +
      "#tplMask .tpl-close{width:34px;height:34px;border:none;border-radius:50%;background:#f2f3f5;color:#4b5563;font-size:16px;line-height:1;cursor:pointer;transition:background .15s;}" +
      "#tplMask .tpl-close:hover{background:#ff4d4f;color:#fff;}" +
      "#tplMask .tpl-sub{color:#8a919f;font-size:13px;margin-bottom:18px;}" +
      "#tplMask .tpl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;}" +
      "#tplMask .tpl-card{border:1px solid #eef0f3;border-radius:12px;padding:16px 16px 14px;background:#fafbfc;display:flex;flex-direction:column;gap:8px;transition:border-color .15s,box-shadow .15s;}" +
      "#tplMask .tpl-card:hover{border-color:#ff2442;box-shadow:0 6px 18px rgba(255,36,66,.12);}" +
      "#tplMask .tpl-name{font-size:16px;font-weight:700;color:#1f2329;}" +
      "#tplMask .tpl-desc{font-size:13px;line-height:1.55;color:#6b7280;min-height:40px;flex:1;}" +
      "#tplMask .tpl-btn{margin-top:4px;border:none;border-radius:8px;background:#ff2442;color:#fff;font-size:14px;font-weight:600;padding:9px 12px;cursor:pointer;transition:background .15s;}" +
      "#tplMask .tpl-btn:hover{background:#e01e38;}" +
      "</style>" +
      '<div class="tpl-panel">' +
      '<div class="tpl-head"><div class="tpl-title">📚 营销模板库</div><button class="tpl-close" title="关闭">✕</button></div>' +
      '<div class="tpl-sub">共 ' + TEMPLATES.length + ' 个模板：选择一个行业模板，一键生成带预填内容的项目</div>' +
      '<div class="tpl-grid">' +
      TEMPLATES.map(function (t, i) {
        return (
          '<div class="tpl-card">' +
          '<div class="tpl-name">' + esc(t.name) + "</div>" +
          '<div class="tpl-desc">' + esc(t.desc) + "</div>" +
          '<button class="tpl-btn" data-tpl="' + i + '">用此模板新建项目</button>' +
          "</div>"
        );
      }).join("") +
      "</div>" +
      "</div>";

    // 点遮罩空白处关闭（仅当点击的是遮罩本身，而非弹层面板）
    mask.addEventListener("click", function (e) {
      if (e.target === mask) closeLibrary();
    });
    // 关闭按钮
    mask.querySelector(".tpl-close").addEventListener("click", closeLibrary);
    // 模板按钮
    mask.querySelectorAll(".tpl-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var tpl = TEMPLATES[Number(btn.dataset.tpl)];
        if (tpl) createFromTemplate(tpl);
      });
    });

    document.body.appendChild(mask);
  }

  function closeLibrary() {
    var mask = document.getElementById("tplMask");
    if (mask) mask.remove();
    var style = document.getElementById("tplStyle");
    if (style) style.remove();
  }

  // ---------- 用模板新建项目 ----------
  async function createFromTemplate(tpl) {
    var name = window.prompt("输入项目名称：", tpl.name + " 项目");
    if (!name || !String(name).trim()) return; // 取消或空名则不创建，弹层保持打开

    var project = {
      id: "p" + Date.now(),
      name: String(name).trim(),
      client: "",
      status: "进行中",
      created_at: new Date().toISOString(),
      phases: JSON.parse(JSON.stringify(tpl.phases || {})) // 深拷贝模板 phases
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

  // ---------- 注册工具栏按钮 ----------
  window.MKT.registerToolbarButton("模板库", openLibrary);
})();
