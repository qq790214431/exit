// 功能模块 A：S5 执行数据回填（由并行子任务实现）
// 通过 window.MKT.registerStageButton("execution", "回填执行数据", (project, phase) => { ... }) 注册
window.MKT = window.MKT || {};
window.MKT.registerStageButton("execution", "回填执行数据", (project) => {
  // TODO: 对 S4 达人矩阵中每个达人，从 state.rows 匹配实际 粉丝/均赞/互动率，写入 project.phases.execution.results
});
