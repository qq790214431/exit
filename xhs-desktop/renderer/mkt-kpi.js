// ============ 功能模块 A2：KPI 达成自动评估（S5 执行页） ============
// 通过 window.MKT.registerStageButton("execution", "KPI 达成评估", fn) 在 S5 页面注册按钮。
// 流程：统计达人矩阵实际数据 + 任务完成率 → 生成 Markdown 评估报告 → 写入
//       project.phases.execution.kpi_eval 并保存 → window.alert 展示（截断 4000 字符）。
window.MKT = window.MKT || {};

(function () {
  "use strict";

  // 定位当前项目对象：优先 window.MKT.current，找不到时回退到按钮传入的 project
  function currentProject(fallback) {
    const list = (window.MKT.projects && window.MKT.projects.projects) || [];
    return list.find(x => x && x.id === window.MKT.current) || fallback || null;
  }

  // 取 S4 达人矩阵（每行 [达人,分群,粉丝,预算,任务,状态]）
  function matrixRows(project) {
    const plan = (project.phases && project.phases.plan) || {};
    return Array.isArray(plan.influencer_matrix) ? plan.influencer_matrix : [];
  }

  // 取 S5 任务列表（每行 [任务,负责人,截止日期,关联,状态]）
  function tasksOf(project) {
    const exec = (project.phases && project.phases.execution) || {};
    return Array.isArray(exec.tasks) ? exec.tasks : [];
  }

  // 获取最新达人库：优先全局 state.rows，失败回退 window.api.getState()
  async function getRows() {
    if (typeof state !== "undefined" && Array.isArray(state.rows)) return state.rows;
    try {
      const s = await window.api.getState();
      if (s && Array.isArray(s.rows)) return s.rows;
    } catch (e) { /* 忽略，返回空数组 */ }
    return [];
  }

  // 在达人库中匹配昵称：优先 status==="ok" 的行，其次任意同名行
  function findRow(rows, nickname) {
    const name = String(nickname || "").trim();
    if (!name) return null;
    const exact = rows.find(r => r && r.nickname === name);
    if (exact) return exact;
    return rows.find(r => r && r.nickname === name && r.status === "ok") || null;
  }

  // 解析互动率阈值：支持 "互动率>3%" "互动率≥3.5%" "互动率3%以上" 等写法
  function parseInteractTarget(kpiText) {
    const text = String(kpiText || "");
    let m = /互动率?\s*[≥>=]+\s*(\d+(?:\.\d+)?)\s*%?/.exec(text);
    if (!m) m = /互动率?\s*(\d+(?:\.\d+)?)\s*%/.exec(text);
    return m ? parseFloat(m[1]) : null;
  }

  // 格式化百分比：数字/可解析字符串 → "3.25%"，否则原样或 "-"
  function pct(v) {
    if (v == null || String(v).trim() === "") return "-";
    const n = parseFloat(v);
    return isNaN(n) ? String(v).trim() : n + "%";
  }

  // Markdown 表格行转义（避免 | 破坏表格）
  function mdCell(v) {
    return String(v == null ? "" : v).replace(/\|/g, "\\|").replace(/\n/g, " ");
  }

  // ---------- S5 页面按钮：KPI 达成评估 ----------
  window.MKT.registerStageButton("execution", "KPI 达成评估", async (project) => {
    const p = currentProject(project);
    if (!p) {
      window.alert("请先打开一个项目");
      return;
    }
    p.phases = p.phases || {};
    p.phases.plan = p.phases.plan || {};
    p.phases.execution = p.phases.execution || {};

    const kpiText = (p.phases.plan.kpi || "").toString().trim();
    const matrix = matrixRows(p);
    const tasks = tasksOf(p);
    const rows = await getRows();

    // ---- 1) 达人矩阵实际数据匹配 ----
    const matchedRows = [];
    let matchedCount = 0;
    for (const row of matrix) {
      const name = Array.isArray(row) ? String(row[0] || "").trim() : "";
      const budget = Array.isArray(row) ? (row[3] == null ? "" : String(row[3])) : "";
      const found = findRow(rows, name);
      const hit = !!found;
      if (hit) matchedCount++;
      matchedRows.push({
        name: name || "-",
        budget: budget || "-",
        followers: hit ? found.followers_num : "-",
        avgLikes: hit ? found.avg_likes : "-",
        ratio: hit ? found.interaction_ratio : "-",
        matched: hit ? "是" : "否"
      });
    }
    const matrixTotal = matrix.length;

    // ---- 2) 任务完成数/总数（状态列 index 4 含"已完成"） ----
    const done = tasks.filter(t => Array.isArray(t) && String(t[4] == null ? "" : t[4]).includes("已完成")).length;
    const taskTotal = tasks.length;
    const taskPct = taskTotal ? Math.round(done / taskTotal * 100) : 0;

    // ---- 3) 互动达标判断：KPI 含"互动率"且平均实际互动率可算 ----
    const hasInteractKpi = /互动率?/.test(kpiText);
    const target = parseInteractTarget(kpiText);
    const ratioVals = matchedRows
      .map(r => parseFloat(r.ratio))
      .filter(n => !isNaN(n));
    const avgRatio = ratioVals.length ? ratioVals.reduce((a, b) => a + b, 0) / ratioVals.length : null;

    let interactLine = "";
    if (!hasInteractKpi) {
      interactLine = "KPI 原文未包含互动率目标，跳过互动达标判断。";
    } else if (target == null) {
      interactLine = "KPI 含互动率目标，但未解析出明确的达标数值（如 互动率>3%），无法对比判断。";
    } else if (avgRatio == null) {
      interactLine = `KPI 目标：互动率 ${target}%，但未匹配到可计算的达人实际互动率，无法对比判断。`;
    } else {
      const ok = avgRatio >= target;
      interactLine = `KPI 目标：互动率 ${target}%（来自 KPI 原文）\n` +
        `达人平均实际互动率：${avgRatio.toFixed(2)}%（基于 ${ratioVals.length} 位匹配达人）\n` +
        `判断：${ok ? "✅ 达标" : "❌ 未达标"}（实际 ${avgRatio.toFixed(2)}% vs 目标 ${target}%）`;
    }

    // ---- 4) 生成 Markdown 评估报告 ----
    const lines = [];
    lines.push("# KPI 达成评估报告");
    lines.push("");
    lines.push(`> 项目：${mdCell(p.name || p.title || "未命名项目")} · 生成时间：${new Date().toLocaleString("zh-CN", { hour12: false })}`);
    lines.push("");
    lines.push("## 一、KPI 原文");
    lines.push(kpiText || "暂无 KPI 数据。");
    lines.push("");
    lines.push("## 二、达人实际数据（计划 vs 实际）");
    if (matrixTotal) {
      lines.push("| 计划达人 | 计划预算 | 实际粉丝 | 实际均赞 | 实际互动率 | 匹配? |");
      lines.push("|---|---|---|---|---|---|");
      for (const r of matchedRows) {
        lines.push(`| ${mdCell(r.name)} | ${mdCell(r.budget)} | ${fmt(r.followers)} | ${fmt(r.avgLikes)} | ${pct(r.ratio)} | ${r.matched} |`);
      }
      lines.push("");
      lines.push(`匹配统计：共 ${matrixTotal} 位计划达人，匹配到实际数据 ${matchedCount} 位，未匹配 ${matrixTotal - matchedCount} 位。`);
    } else {
      lines.push("S4 达人矩阵为空，暂无达人数据。");
    }
    lines.push("");
    lines.push("## 三、任务完成率");
    lines.push(`已完成 ${done} / 共 ${taskTotal} 条任务` + (taskTotal ? `（完成率 ${taskPct}%）` : "（暂无任务）"));
    lines.push("");
    lines.push("## 四、互动达标判断");
    lines.push(interactLine);

    const report = lines.join("\n");

    // ---- 5) 写入 execution.kpi_eval 并保存 ----
    p.phases.execution.kpi_eval = report;
    p.phases.execution.kpi_eval_at = new Date().toISOString();
    window.mktKpiEval = { matrixTotal, matchedCount, done, taskTotal, avgRatio, target, report };
    try {
      const updated = await window.api.saveProject(p);
      if (updated && Array.isArray(updated.projects)) window.MKT.projects = updated;
    } catch (e) {
      // 保存失败时评估结果仍可通过 window.mktKpiEval / kpi_eval 查看
    }

    // ---- 6) 弹窗展示摘要（截断 4000 字符） ----
    let show = report;
    if (show.length > 4000) show = show.slice(0, 4000) + "\n…（内容过长，已截断到 4000 字符）";
    window.alert(show);
  });
})();
