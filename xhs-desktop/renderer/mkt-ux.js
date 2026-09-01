// 功能模块 C：阶段门禁 + 项目归档/复制（由并行子任务实现）
window.MKT = window.MKT || {};

// ============ 1. 阶段门禁 ============
// stageDef: { key: "deconstruct|research|strategy|plan|execution", title: "S1 拆解业务", ... }
// phaseObj: 该项目当前阶段的数据对象（可能缺字段）
window.MKT.setGate((stageDef, phaseObj) => {
  const ph = phaseObj || {};
  // 判断字段是否有实质内容：字符串去空白非空；数组（含嵌套行数组）至少有一个非空元素
  const has = (v) => {
    if (Array.isArray(v)) return v.some((item) => has(item));
    if (typeof v === "string") return v.trim() !== "";
    return v !== undefined && v !== null && v !== "";
  };
  const rules = {
    deconstruct: { fields: ["brand", "industry"], names: ["品牌名", "行业/类目"] },
    research: { fields: ["keywords", "competitors"], names: ["关键词", "竞品矩阵"] },
    strategy: { fields: ["positioning_statement", "swot"], names: ["定位陈述", "SWOT"] },
    plan: { fields: ["kpi", "content_calendar"], names: ["KPI", "内容日历"] },
    execution: { fields: ["tasks", "results"], names: ["任务清单", "执行结果"] }
  };
  const rule = rules[stageDef && stageDef.key];
  if (!rule) return { ok: true };
  // 每个阶段为「或」门禁：任一要求字段有内容即达标
  if (rule.fields.some((f) => has(ph[f]))) return { ok: true };
  const tag = (stageDef.title || "").split(/\s+/)[0] || stageDef.key;
  return { ok: false, hint: `${tag} 未完成：还需填写${rule.names.join("或")}` };
});

// ============ 2. 项目复制 ============
window.MKT.registerListAction("复制", async (p) => {
  const copy = {
    ...p,
    id: String(p.id) + Date.now(),                  // 新 id：原 id + 时间戳
    name: (p.name || "") + " 副本",                 // 名称追加「 副本」
    created_at: new Date().toISOString(),           // 更新创建时间
    phases: JSON.parse(JSON.stringify(p.phases || {})) // phases 深拷贝
  };
  await window.api.saveProject(copy);
  // 重新加载列表并更新全局项目列表
  window.MKT.projects = await window.api.getProjects();
  if (typeof window.renderMktList === "function") window.renderMktList();
});

// ============ 3. 项目归档/恢复 ============
window.MKT.registerListAction("归档/恢复", async (p) => {
  p.status = (p.status === "已归档") ? "进行中" : "已归档"; // 切换状态
  window.MKT.projects = await window.api.saveProject(p);    // 保存并更新列表
  if (typeof window.renderMktList === "function") window.renderMktList();
});
