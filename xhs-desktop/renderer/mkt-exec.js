// 功能模块 A：S5 执行数据回填（由并行子任务实现）
// 通过 window.MKT.registerStageButton("execution", "回填执行数据", (project, phase) => { ... }) 注册
window.MKT = window.MKT || {};
window.MKT.registerStageButton("execution", "回填执行数据", async (project) => {
  // 1) 取最新达人数据：优先 api.getState()，失败回退到全局 state.rows
  let rows = (typeof state !== "undefined" && Array.isArray(state.rows)) ? state.rows : [];
  try {
    const s = await window.api.getState();
    if (s && Array.isArray(s.rows)) rows = s.rows;
  } catch (e) { /* 回退到全局 state.rows */ }

  // 2) 通过 window.MKT.current 定位当前项目对象（不假设传入的 project 是可变的）
  const list = (window.MKT.projects && window.MKT.projects.projects) || [];
  const cur = list.find(x => x.id === window.MKT.current) || project;
  cur.phases = cur.phases || {};
  cur.phases.plan = cur.phases.plan || {};
  cur.phases.execution = cur.phases.execution || {};
  const matrix = Array.isArray(cur.phases.plan.influencer_matrix) ? cur.phases.plan.influencer_matrix : [];

  // 3) 对每行达人昵称在达人库中精确匹配（status === "ok"），生成执行对比结果
  const results = [];
  let matched = 0;
  for (const row of matrix) {
    const name = String(row[0] || "").trim();
    const found = name ? rows.find(r => r && r.nickname === name && r.status === "ok") : null;
    const hit = !!found;
    if (hit) matched++;
    results.push({
      "计划达人": name || "-",
      "实际粉丝": hit ? found.followers_num : "-",
      "实际均赞": hit ? found.avg_likes : "-",
      "实际互动率": hit ? found.interaction_ratio : "-",
      "是否匹配": hit ? "是" : "否"
    });
  }

  // 4) 生成对比表格文本 + 匹配统计，写回 project.phases.execution.results 并保存
  const total = matrix.length;
  const pct = total ? Math.round(matched / total * 100) : 0;
  const line = (cells) => cells.map(v => String(v ?? "")).join("  |  ");
  const text = [
    "【S5 执行数据回填 · 计划 vs 实际】",
    line(["计划达人", "实际粉丝", "实际均赞/篇", "实际互动率", "是否匹配"]),
    ...results.map(r => line([r["计划达人"], fmt(r["实际粉丝"]), fmt(r["实际均赞"]), r["实际互动率"], r["是否匹配"]])),
    "",
    `匹配统计：共 ${total} 位计划达人，匹配到实际数据 ${matched} 位（${pct}%），未匹配 ${total - matched} 位`
  ].join("\n");

  cur.phases.execution = { ...cur.phases.execution, results: text, compared_at: new Date().toISOString() };
  try {
    await window.api.saveProject(cur);
  } catch (e) { /* 保存失败时结果仍在 mktExecResult 中可查 */ }

  // 5) 调试用全局变量 + 简洁提示
  window.mktExecResult = { results, matched, total, text };
  alert(`执行数据回填完成：匹配 ${matched}/${total} 位达人，结果已写入 S5 执行数据并保存。`);
});
