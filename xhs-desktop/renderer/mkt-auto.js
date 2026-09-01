// ============ 功能模块 A1：执行闭环自动化 ============
// 在营销工具栏注册两个按钮：
//   1. 生成执行任务 —— 从 plan 的内容日历 + 里程碑自动生成 execution.tasks（按任务名去重）并保存
//   2. 生成结案报告 —— 汇总当前项目生成完整结案文档（项目概览 → 执行结果 → 任务完成率 →
//      KPI 达成评估 → 复盘建议），合并 mkt-kpi.js 的 KPI 达成评估，写入 execution.closing_report
//      并保存，用 window.alert 展示（超长截断到 4000 字符，完整版在 execution.closing_report）
// 通过 window.MKT.current 定位当前项目；找不到时提示"请先打开一个项目"。
window.MKT = window.MKT || {};

(function () {
  "use strict";

  // 通过 window.MKT.current 定位当前项目对象
  function currentProject() {
    const list = (window.MKT.projects && window.MKT.projects.projects) || [];
    return list.find(x => x && x.id === window.MKT.current) || null;
  }

  // 取某个阶段的数组字段（可能未初始化）
  function rowsOf(project, phaseKey, key) {
    const ph = (project.phases && project.phases[phaseKey]) || {};
    const arr = ph[key];
    return Array.isArray(arr) ? arr : [];
  }

  // 取行内单元格并规整为字符串
  function cell(row, i) {
    if (!Array.isArray(row)) return "";
    const v = row[i];
    return v == null ? "" : String(v).trim();
  }

  // 追加任务（去重：已有相同任务名则不重复添加）
  function pushTask(tasks, name, owner, due, related, status) {
    const trimmed = String(name == null ? "" : name).trim();
    if (!trimmed) return false;
    const exists = tasks.some(t => Array.isArray(t) && String(t[0] == null ? "" : t[0]).trim() === trimmed);
    if (exists) return false;
    tasks.push([trimmed, owner || "", due || "", related || "", status || "待办"]);
    return true;
  }

  // 保存项目并同步 window.MKT.projects（saveProject 返回最新列表）
  async function saveAndSync(project) {
    const updated = await window.api.saveProject(project);
    if (updated && Array.isArray(updated.projects)) window.MKT.projects = updated;
  }

  // ---------- 按钮 1：生成执行任务 ----------
  window.MKT.registerToolbarButton("生成执行任务", async () => {
    const project = currentProject();
    if (!project) {
      window.alert("请先打开一个项目");
      return;
    }
    project.phases = project.phases || {};
    project.phases.plan = project.phases.plan || {};
    project.phases.execution = project.phases.execution || {};
    if (!Array.isArray(project.phases.execution.tasks)) project.phases.execution.tasks = [];

    const tasks = project.phases.execution.tasks;
    const before = tasks.length;
    let contentAdded = 0;
    let milestoneAdded = 0;

    // 内容日历每行 [周次,选题,格式,卖点,达人,发布日期,状态] → "发布内容：{选题}"
    for (const row of rowsOf(project, "plan", "content_calendar")) {
      const topic = cell(row, 1);
      if (!topic) continue;
      const due = cell(row, 5);          // 发布日期（可空）
      const influencer = cell(row, 4);   // 达人
      if (pushTask(tasks, "发布内容：" + topic, "", due, influencer, "待办")) contentAdded++;
    }

    // 里程碑每行 [里程碑,日期,验收标准] → "里程碑：{里程碑}"
    for (const row of rowsOf(project, "plan", "milestones")) {
      const name = cell(row, 0);
      if (!name) continue;
      const due = cell(row, 1);          // 日期
      if (pushTask(tasks, "里程碑：" + name, "", due, "", "待办")) milestoneAdded++;
    }

    try {
      await saveAndSync(project);
    } catch (e) {
      window.alert("保存失败：" + (e && e.message ? e.message : String(e)));
      return;
    }

    const added = tasks.length - before;
    window.alert(
      "执行任务已生成并保存。\n" +
      "内容日历 → 新增发布任务 " + contentAdded + " 条\n" +
      "里程碑 → 新增里程碑任务 " + milestoneAdded + " 条\n" +
      "本次新增 " + added + " 条（已有同名任务已去重跳过），任务清单共 " + tasks.length + " 条。"
    );
  });

  // ---------- 按钮 2：生成结案报告（完整结案文档，合并 KPI 达成评估） ----------
  window.MKT.registerToolbarButton("生成结案报告", async () => {
    const project = currentProject();
    if (!project) {
      window.alert("请先打开一个项目");
      return;
    }
    project.phases = project.phases || {};
    const ph = project.phases;
    const plan = ph.plan || (ph.plan = {});
    const exec = ph.execution || (ph.execution = {});

    // 阶段字段概览（长文本截断；跳过生成的报告字段，它们已有专属章节）
    const REPORT_KEYS = ["kpi_eval", "kpi_eval_at", "closing_report", "closing_report_at"];
    function phaseOverview(phaseKey) {
      const p = ph[phaseKey] || {};
      const keys = Object.keys(p).filter(k => !REPORT_KEYS.includes(k));
      if (!keys.length) return "无数据";
      return keys.map(k => {
        const v = p[k];
        let text;
        if (Array.isArray(v)) {
          text = v.length + " 条";
        } else if (v && typeof v === "object") {
          text = "有数据";
        } else {
          const s = (v == null || String(v).trim() === "") ? "空" : String(v).trim();
          text = s.length > 120 ? s.slice(0, 120) + "…" : s;
        }
        return "- " + k + "：" + text;
      }).join("\n");
    }

    // 任务完成数/总数：统计 tasks 中状态列（index 4）含"已完成"的数量
    const tasks = Array.isArray(exec.tasks) ? exec.tasks : [];
    const done = tasks.filter(t => Array.isArray(t) && String(t[4] == null ? "" : t[4]).includes("已完成")).length;
    const total = tasks.length;

    // KPI 达成评估：优先使用已生成的 execution.kpi_eval；缺失时现场调用 mkt-kpi.js 暴露的复用函数
    let kpiSection = (typeof exec.kpi_eval === "string" && exec.kpi_eval.trim()) ? exec.kpi_eval : "";
    if (!kpiSection && typeof window.MKT.genKpiEval === "function") {
      try {
        const kpiReport = await window.MKT.genKpiEval(project);
        if (kpiReport && String(kpiReport).trim()) {
          kpiSection = String(kpiReport).trim();
          exec.kpi_eval = kpiSection;
          exec.kpi_eval_at = new Date().toISOString();
        }
      } catch (e) {
        kpiSection = "";
      }
    }

    // 把评估 Markdown 并入结案文档：去掉自带一级标题，其余标题降一级，避免破坏文档层级
    function embedEval(md) {
      const out = [];
      let started = false;
      for (const line of String(md || "").split("\n")) {
        if (!started) {
          if (line.trim() === "") continue;
          started = true;
          if (/^#\s/.test(line.trim())) continue; // 跳过 "# KPI 达成评估报告"
        }
        out.push(/^#{1,6}\s/.test(line) ? "#" + line : line);
      }
      return out.join("\n").trim();
    }

    const lines = [];
    lines.push("# 结案报告：" + (project.name || project.title || "未命名项目"));
    lines.push("");
    lines.push("## 一、项目概览");
    lines.push("- 项目：" + (project.name || project.title || "未命名项目"));
    lines.push("- 生成时间：" + new Date().toLocaleString("zh-CN", { hour12: false }));
    lines.push("");
    lines.push("### S4 开发计划完成情况");
    lines.push(phaseOverview("plan"));
    lines.push("");
    lines.push("### S5 落地执行完成情况");
    lines.push(phaseOverview("execution"));
    lines.push("");
    lines.push("## 二、执行结果");
    lines.push(exec.results && String(exec.results).trim() ? String(exec.results).trim() : "暂无执行结果数据。");
    lines.push("");
    lines.push("## 三、任务完成率");
    lines.push("已完成 " + done + " / 共 " + total + " 条任务" + (total ? "（完成率 " + Math.round(done / total * 100) + "%）" : "（暂无任务）"));
    lines.push("");
    lines.push("## 四、KPI 达成评估");
    if (kpiSection) {
      lines.push(embedEval(kpiSection));
    } else {
      lines.push("暂无 KPI 达成评估数据（可先在 S5 执行页点击「KPI 达成评估」生成，或确认 plan.kpi 已填写）。");
      lines.push("");
      lines.push("KPI 原文：" + (plan.kpi && String(plan.kpi).trim() ? String(plan.kpi).trim() : "暂无 KPI 数据。"));
    }
    lines.push("");
    lines.push("## 五、复盘建议");
    lines.push(exec.notes && String(exec.notes).trim() ? String(exec.notes).trim() : "暂无复盘建议（可在 S5 执行页补充复盘建议，或写入 execution.notes）。");

    const report = lines.join("\n");

    // 写入 execution.closing_report（完整版）并保存项目
    exec.closing_report = report;
    exec.closing_report_at = new Date().toISOString();
    let saveNote = "";
    try {
      await saveAndSync(project);
    } catch (e) {
      saveNote = "\n（保存失败：" + (e && e.message ? e.message : String(e)) + "）";
    }

    // alert 展示摘要：截断 4000 字符，完整版已写入 execution.closing_report
    let show = report;
    if (show.length > 4000) show = show.slice(0, 4000) + "\n…（内容过长，已截断到 4000 字符，完整版已写入 execution.closing_report）";
    window.alert(show + saveNote);
  });
})();
