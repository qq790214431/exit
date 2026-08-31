# 小红书主页链接采集工具（独立版）

独立于 GEO 项目，通过小红书主页分享链接批量采集：**主页昵称、小红书号、地区属地、粉丝数量**（另含关注数、获赞与收藏）。

## 依赖
- Node.js（v14+，已用 v26 验证）
- Playwright-core + 本机 Chrome（可用环境变量 `CHROME` 指定 Chrome 路径）
  - 默认使用 `/Users/Admin/Library/Caches/ms-playwright/chromium-1234/...` 下的 Chrome for Testing
  - 也可 `npm i playwright-core` 后直接运行（自动优先加载本地安装）

## 文件
| 文件 | 说明 |
|---|---|
| `scrape.js` | 采集主程序（断点续采 / 并发 / 验证码熔断 / 随机延迟） |
| `urlmap.json` | 输入：user_id → 主页分享链接（含 xsec_token）映射 |
| `progress.jsonl` | 逐条采集进度（追加式日志，断点续采依据） |
| `xhs_profiles.csv` | 导出结果（UTF-8 BOM，Excel 可直接打开） |

## 用法
```bash
node scrape.js                      # 增量采集（跳过已完成）
MAX=10 node scrape.js               # 本次只采 10 条
CONCURRENCY=2 node scrape.js        # 并发数（默认 4）
EXPORT_ONLY=1 node scrape.js        # 不采集，仅从 progress.jsonl 重新生成 CSV
RESCRAPE=1 node scrape.js           # 忽略已完成，全部重采（可加 MAX 限量）
INPUT_JSON=/path/to/urlmap.json node scrape.js   # 指定输入映射
CHROME=/path/to/chrome node scrape.js            # 指定 Chrome 可执行文件
```

## 输出字段
`user_id, nickname, red_id, region, ip, tags, following, followers, likes_collects, followers_num, status, url, ts`

- `followers` 为页面显示文本（如 `1.2万`），`followers_num` 为规范化整数（如 `12000`）
- `region` 优先取资料标签中的省/市，其次取 IP 属地
- 遇到验证码/登录跳转时记录 `status=captcha` 并停止本轮（`CAPTCHA_BURST` 可调，默认 8）
