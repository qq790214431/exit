// 自动化单元测试：lib.js（分群/标签/互动率）+ import_links.js（链接解析）
const assert = require("assert");
const fs = require("fs");
const { parseTags, computeTier, interactionRatio } = require("./lib.js");

let pass = 0, fail = 0;
function eq(name, got, expected) {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (ok) pass++;
  else { fail++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`); }
}

// --- parseTags ---
eq("parseTags 完整", parseTags("27岁|天蝎座|河南许昌|母婴博主"), { age: "27", constellation: "天蝎座", industry: "母婴博主" });
eq("parseTags 空", parseTags(""), { age: "", constellation: "", industry: "" });
eq("parseTags 多行业", parseTags("30岁|广东深圳|旅行|美食"), { age: "30", constellation: "", industry: "旅行/美食" });
eq("parseTags 仅星座", parseTags("处女座"), { age: "", constellation: "处女座", industry: "" });
eq("parseTags 仅地区", parseTags("北京朝阳"), { age: "", constellation: "", industry: "" });

// --- computeTier ---
eq("tier 素人", computeTier(500), "素人");
eq("tier 尾部", computeTier(5000), "尾部");
eq("tier 腰部", computeTier(50000), "腰部");
eq("tier 头部", computeTier(500000), "头部");
eq("tier 临界999", computeTier(999), "素人");
eq("tier 临界1000", computeTier(1000), "尾部");
eq("tier null", computeTier(null), "");

// --- interactionRatio ---
eq("ratio 3.00", interactionRatio(36000, 12000), "3.00");
eq("ratio 0.12", interactionRatio(96, 800), "0.12");
eq("ratio 粉丝为0", interactionRatio(100, 0), "");
eq("ratio 获赞为空", interactionRatio(null, 12000), "");

// --- import_links.js 解析函数 ---
const src = fs.readFileSync(__dirname + "/import_links.js", "utf8");
function extract(name) {
  const start = src.indexOf("function " + name);
  if (start < 0) throw new Error("not found: " + name);
  const open = src.indexOf("{", start);
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1);
}
eval(extract("extractUrls"));
eval(extract("parseProfileUrl"));
eq("extractUrls 多链接", extractUrls("看这个 https://www.xiaohongshu.com/user/profile/abc?x=1 和 https://xhslink.com/xyz，还有别的"),
  ["https://www.xiaohongshu.com/user/profile/abc?x=1", "https://xhslink.com/xyz"]);
eq("extractUrls 无链接", extractUrls("纯文本没有链接"), []);
const p = parseProfileUrl("https://www.xiaohongshu.com/user/profile/5d0e13e1000000001203a6a2?xsec_token=ABC123&xsec_source=app_share");
eq("parseProfileUrl uid", p.uid, "5d0e13e1000000001203a6a2");
eq("parseProfileUrl token", p.has_token, true);
eq("parseProfileUrl 重组URL", p.url, "https://www.xiaohongshu.com/user/profile/5d0e13e1000000001203a6a2?xsec_token=ABC123&xsec_source=app_share");
eq("parseProfileUrl 非主页", parseProfileUrl("https://www.xiaohongshu.com/explore/123"), null);
eq("parseProfileUrl 无token", parseProfileUrl("https://www.xiaohongshu.com/user/profile/5d0e13e1000000001203a6a2").has_token, false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
