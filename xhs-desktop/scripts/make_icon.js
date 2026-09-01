// 生成应用图标：npx electron scripts/make_icon.js
// 输出 build/icon.png (1024) 与 build/icon.icns
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1024, height: 1024, show: false,
    webPreferences: { offscreen: true }
  });
  const html = `<!DOCTYPE html><html><head><style>body{margin:0;background:transparent}</style></head>
<body><canvas id="c" width="1024" height="1024"></canvas>
<script>
const cv = document.getElementById("c");
const ctx = cv.getContext("2d");
function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
// 背景
rr(0, 0, 1024, 1024, 190);
const bg = ctx.createLinearGradient(0, 0, 1024, 1024);
bg.addColorStop(0, "#0a1322"); bg.addColorStop(1, "#0d0a1e");
ctx.fillStyle = bg; ctx.fill();
// 霓虹描边
rr(8, 8, 1008, 1008, 185);
const border = ctx.createLinearGradient(0, 0, 1024, 1024);
border.addColorStop(0, "#00e5ff"); border.addColorStop(1, "#ff2d95");
ctx.lineWidth = 22; ctx.strokeStyle = border; ctx.stroke();
// 发光内圈
ctx.save();
ctx.shadowColor = "#00e5ff"; ctx.shadowBlur = 60;
rr(120, 120, 784, 784, 140);
ctx.lineWidth = 6; ctx.strokeStyle = "rgba(0,229,255,.5)"; ctx.stroke();
ctx.restore();
// 中心菱形 ◈
ctx.save();
ctx.translate(512, 470);
ctx.rotate(Math.PI / 4);
const g = ctx.createLinearGradient(-200, -200, 200, 200);
g.addColorStop(0, "#00e5ff"); g.addColorStop(1, "#ff2d95");
ctx.shadowColor = "#00e5ff"; ctx.shadowBlur = 80;
ctx.fillStyle = g;
rr(-190, -190, 380, 380, 60);
ctx.fill();
ctx.restore();
// 菱形内的白色笔记三线
ctx.save();
ctx.strokeStyle = "#0a1322"; ctx.lineWidth = 30; ctx.lineCap = "round";
ctx.beginPath();
ctx.moveTo(512, 350); ctx.lineTo(512, 590);
ctx.moveTo(410, 430); ctx.lineTo(614, 430);
ctx.moveTo(410, 510); ctx.lineTo(614, 510);
ctx.stroke();
ctx.restore();
// 底部文字描点
ctx.fillStyle = "#00e5ff";
ctx.font = "bold 56px -apple-system, PingFang SC, sans-serif";
ctx.textAlign = "center";
ctx.shadowColor = "#00e5ff"; ctx.shadowBlur = 30;
ctx.fillText("小红书采集", 512, 800);
ctx.shadowBlur = 0;
ctx.fillStyle = "rgba(214,228,255,.6)";
ctx.font = "34px -apple-system, sans-serif";
ctx.fillText("XHS TOOL", 512, 870);
</script></body></html>`;
  win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  win.webContents.once("did-finish-load", async () => {
    await new Promise(r => setTimeout(r, 500));
    const img = await win.webContents.capturePage();
    const outDir = path.join(__dirname, "..", "build");
    fs.mkdirSync(outDir, { recursive: true });
    const png = path.join(outDir, "icon.png");
    fs.writeFileSync(png, img.toPNG());
    console.log("icon.png ->", png);
    try {
      execSync(`sips -s format icns "${png}" --out "${path.join(outDir, "icon.icns")}"`);
      console.log("icon.icns ->", path.join(outDir, "icon.icns"));
    } catch (e) { console.error("icns failed:", e.message); }
    app.quit();
  });
});
