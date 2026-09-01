// 小红书登录：打开可见浏览器让用户扫码，登录后保存 cookies 到数据目录
// 用法: node login.js（DATA_DIR 指定数据目录；CHROME 指定浏览器）
const fs = require("fs");
const path = require("path");

let playwright;
const corePath = process.env.PLAYWRIGHT_CORE_PATH;
try {
  playwright = corePath ? require(corePath) : require("playwright-core");
} catch (e) {
  try {
    playwright = require("/Users/Admin/.homebrew/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core");
  } catch (e2) {
    console.error("找不到 playwright-core，请设置 PLAYWRIGHT_CORE_PATH 或 npm i playwright-core");
    process.exit(1);
  }
}
const { chromium } = playwright;

const DATA_DIR = process.env.DATA_DIR || __dirname;
const COOKIE_FILE = path.join(DATA_DIR, "cookies.json");

function findChrome() {
  const candidates = [
    process.env.CHROME,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
  ].filter(Boolean);
  for (const c of candidates) { try { if (c && fs.existsSync(c)) return c; } catch (e) {} }
  return process.env.CHROME || "";
}

(async () => {
  const chrome = findChrome();
  const browser = await chromium.launch({ executablePath: chrome || undefined, headless: false, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    viewport: { width: 1280, height: 900 }, locale: "zh-CN"
  });
  const page = await ctx.newPage();
  console.log("请在打开的浏览器窗口扫码登录小红书（打开后停留，直到看到完整主页）");
  await page.goto("https://www.xiaohongshu.com", { waitUntil: "domcontentloaded", timeout: 60000 });
  // 等待登录态：轮询直到有 web_session cookie 或 URL 含用户信息，最多 3 分钟
  const started = Date.now();
  let loggedIn = false;
  while (Date.now() - started < 180000) {
    await page.waitForTimeout(3000);
    const cookies = await ctx.cookies();
    if (cookies.some(c => c.name === "web_session" && c.value && c.value.length > 20)) {
      loggedIn = true;
      break;
    }
  }
  if (!loggedIn) {
    console.log("未检测到登录态（web_session），仍保存现有 cookies");
  } else {
    console.log("登录成功！正在保存 cookies...");
  }
  const cookies = await ctx.cookies();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
  console.log(`已保存 ${cookies.length} 个 cookies → ${COOKIE_FILE}`);
  await browser.close();
  process.exit(loggedIn ? 0 : 1);
})().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
