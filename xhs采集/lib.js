// 共享纯函数：达人分群 / 标签结构化 / 互动率（CLI 与桌面版共用）
const CONSTELLATIONS = ["白羊座", "金牛座", "双子座", "巨蟹座", "狮子座", "处女座", "天秤座", "天蝎座", "射手座", "摩羯座", "水瓶座", "双鱼座"];
const PROVINCES = ["北京", "上海", "天津", "重庆", "河北", "山西", "辽宁", "吉林", "黑龙江", "江苏", "浙江", "安徽", "福建", "江西", "山东", "河南", "湖北", "湖南", "广东", "海南", "四川", "贵州", "云南", "陕西", "甘肃", "青海", "台湾", "内蒙古", "广西", "西藏", "宁夏", "新疆", "香港", "澳门"];
// 地区识别：带后缀（省/市/区/县…）或 省份前缀+城市区县（河南许昌/广东深圳/北京朝阳）或 中国/海外
const REGION_RE = new RegExp(
  "^[\u4e00-\u9fa5]{1,12}(省|市|自治区|自治州|地区|区|县|特别行政区)$|^海外$|^中国$|^(" + PROVINCES.join("|") + ")[\u4e00-\u9fa5]{2,5}$"
);

// 标签（如 "27岁|天蝎座|河南许昌|母婴博主"）拆成 年龄/星座/行业
function parseTags(tagsStr) {
  const tags = String(tagsStr || "").split("|").map(t => t.trim()).filter(Boolean);
  let age = "", constellation = "", industry = "";
  const others = [];
  for (const t of tags) {
    const m = t.match(/^(\d{1,2})岁$/);
    if (m) { age = m[1]; continue; }
    if (CONSTELLATIONS.includes(t)) { constellation = t; continue; }
    others.push(t);
  }
  industry = others.filter(t => !REGION_RE.test(t)).join("/");
  return { age, constellation, industry };
}

// 粉丝量级分群：素人<1k / 尾部1k-1万 / 腰部1万-10万 / 头部10万+
function computeTier(followersNum) {
  if (followersNum == null) return "";
  if (followersNum < 1000) return "素人";
  if (followersNum < 10000) return "尾部";
  if (followersNum < 100000) return "腰部";
  return "头部";
}

// 互动率 = 获赞收藏数值 / 粉丝数值（两位小数）
function interactionRatio(likesNum, followersNum) {
  if (likesNum != null && followersNum) return (likesNum / followersNum).toFixed(2);
  return "";
}

module.exports = { parseTags, computeTier, interactionRatio };
