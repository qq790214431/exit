# 小红书主页链接采集工具（桌面版）

基于 Electron 的图形界面，包装现有 CLI 采集器（`../xhs采集/scrape.js`），支持：
- 选择数据目录（包含 `urlmap.json` / `scrape.js` / `progress.jsonl`）
- 一键开始/停止采集，自动多轮 + 冷却续跑（熔断后冷却再继续）
- 实时进度（总体 done/total + 本轮进度）+ 运行日志
- 结果表格：昵称 / 小红书号 / 地区属地 / 粉丝数 / 粉丝数(数值) / 标签 / 状态
- 一键导出 CSV（UTF-8 BOM）

## 运行
```bash
npm install        # 首次（Electron 二进制较大，国内可设 ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/）
npm start
```

## 自检
```bash
npx electron . --screenshot=/tmp/xhs_app.png   # 截图后退出
npx electron . --dump=/tmp/xhs_dump.json       # 导出界面 DOM 信息后退出
```

## 说明
- 默认数据目录为 `../xhs采集`，可在界面中更换
- 采集由子进程运行，随时可停止；数据实时写入 `progress.jsonl`，不丢进度
- 打包为 .app 安装包：可用 `electron-builder`（后续步骤）
