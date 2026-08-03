/* Expand every non-poultry category to 65 product-specific copy entries. */
const API = process.env.PROMPT_STUDIO_API || "http://127.0.0.1:4178";
const TARGET = 65;
const POULTRY = "鸡鸭鹅禽类";
const clean = (value) => String(value || "").replace(/[\s　]+/g, "").toLocaleLowerCase("zh-CN");
const unique = (items) => [...new Set(items.map((item) => item.trim()).filter(Boolean))];

const contexts = {
  "鸽子鸟类": { label: "鸽鸟", focus: "鸽子鸟类日常养护", subjects: ["信鸽赛鸽日常关注", "鸽舍日常管理", "幼鸽成鸽可关注", "训放前后日常护理", "换羽期养护", "配对期日常管理", "归巢后状态关注", "鸽群日常巡查", "饮水饲料管理", "养鸽人日常关注"] },
  "观赏鱼": { label: "观赏鱼", focus: "观赏鱼日常养护", subjects: ["淡水观赏鱼可关注", "鱼缸日常管理", "水质状态关注", "新鱼入缸阶段", "换水期日常护理", "混养状态观察", "过滤系统配合", "鱼体状态关注", "水族日常管理", "按标签说明使用"] },
  "猫狗": { label: "犬猫", focus: "犬猫日常养护", subjects: ["犬猫家庭可关注", "幼宠成宠可关注", "日常饮食管理", "换季日常护理", "外出归家后关注", "宠物状态观察", "多宠家庭可关注", "日常卫生管理", "按标签说明使用", "宠物主人日常关注"] },
  "牛羊": { label: "牛羊", focus: "牛羊反刍日常养护", subjects: ["肉牛肉羊可关注", "奶牛奶羊可关注", "犊牛羔羊可关注", "反刍阶段管理", "育肥阶段关注", "繁殖阶段日常护理", "牧场巡栏管理", "日粮管理配合", "换料阶段关注", "按标签说明使用"] },
  "猪": { label: "生猪", focus: "生猪日常养护", subjects: ["仔猪阶段可关注", "育肥猪可关注", "母猪日常管理", "猪场巡栏管理", "换料期日常护理", "转群后状态关注", "饮水饲料管理", "规模猪场关注", "日常卫生管理", "按标签说明使用"] },
  "消毒": { label: "养殖环境", focus: "养殖环境卫生管理", subjects: ["圈舍环境可关注", "器具表面管理", "进出场管理配合", "空栏期环境管理", "日常清洁管理", "养殖场卫生关注", "按标签稀释使用", "现配现用需关注", "不同区域分开管理", "使用说明为准"] },
  "蜂类": { label: "蜂群", focus: "蜂群日常营养管理", subjects: ["蜂群日常关注", "蜂箱管理配合", "花源不足期关注", "繁殖期日常护理", "越冬前后管理", "蜂场巡查管理", "蜂群营养关注", "按标签说明使用", "卫生饲喂管理", "养蜂人日常关注"] },
  "鸡鸭鹅猪牛羊": { label: "禽畜", focus: "禽畜日常养护", subjects: ["鸡鸭鹅猪牛羊可关注", "规模养殖可关注", "不同阶段日常管理", "饮水饲料管理", "换季养护期", "转群期日常护理", "养殖场巡栏管理", "按标签说明使用", "日常卫生管理", "养殖户日常关注"] },
};

function contextFor(category) { return contexts[category] || { label: "养殖", focus: "日常养护", subjects: ["日常管理可关注", "按标签说明使用", "不同阶段日常关注", "养护场景可关注", "规范储存使用", "规模管理可关注", "状态观察关注", "环境管理配合", "使用说明为准", "日常养护选择"] }; }

function makeEntries(name, category) {
  const ctx = contextFor(category);
  const add = (group, region, text, priority) => ({ scope: "product", category: "*", product: name, group, regions: [region], region, text, priority, enabled: true });
  const entries = [];
  [
    `${name}·${ctx.focus}`, `${name}·${ctx.label}日常关注`, `${name}·日常管理选择`, `${name}·科学养护搭配`, `${name}·养护阶段可关注`,
    `${name}·规范使用更安心`, `${name}·日常使用方便`, `${name}·标签信息可查`, `${name}·管理思路更清晰`, `${name}·日常常备选择`,
  ].forEach((text) => entries.push(add("产品定位", "副标题", text, 220)));
  ctx.subjects.forEach((text) => entries.push(add("适用对象", "副标题", `${name}·${text}`, 210)));
  ["换季管理期", "环境变化期", "日常巡查期", "高密度管理期", "新群体适应期", "应激后恢复关注", "状态观察期", "日常养护期", "规范操作期", "储存取用期"].forEach((text) => entries.push(add("使用场景", "顶部卖点", `${name}·${text}`, 202)));
  ["科学配比思路", "使用信息清晰", "管理场景适配", "日常护理搭配", "规范使用关注", "状态记录方便", "养护节奏可控", "日常管理配合", "不同阶段可关注", "按需备货方便"].forEach((text) => entries.push(add("产品特点", "侧栏卖点", `${name}·${text}`, 196)));
  ["使用前阅读标签", "按建议比例操作", "取用后及时密封", "阴凉干燥处保存", "避免与不明产品混用", "注意饮水饲料卫生", "保持器具清洁", "按养护阶段安排", "规范记录使用情况", "以包装说明为准"].forEach((text) => entries.push(add("使用方式", "辅助文案", `${name}·${text}`, 186)));
  ["日常管理可参考", "养护安排更从容", "规范使用更省心", "关注日常细节", "管理流程更清晰", "养护场景可选择", "按标签规范操作", "日常关注更安心", "科学管理好帮手", "养护工作有条理"].forEach((text) => entries.push(add("底栏口号", "底栏文案", `${name}·${text}`, 175)));
  ["产品信息清晰", "包装规格可查", "使用说明可查", "按需选择", "规范存放", "日常管理搭配", "养护记录可留存", "包装完整性关注", "按说明取用", "信息确认后使用"].forEach((text) => entries.push(add("品质与渠道", "辅助文案", `${name}·${text}`, 180)));
  return entries;
}

async function request(path, body) {
  const response = await fetch(`${API}${path}`, { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "请求失败");
  return payload;
}

const state = await (await fetch(`${API}/api/state`)).json();
const targetProducts = new Map();
for (const product of state.products) {
  const category = product.categories?.find((item) => item !== POULTRY) || (product.category !== POULTRY ? product.category : null);
  if (category && category !== POULTRY && !targetProducts.has(product.name)) targetProducts.set(product.name, category);
}
const additions = [];
const report = [];
for (const [name, category] of targetProducts) {
  const existing = state.productMarketingEntries.filter((entry) => entry.scope === "product" && entry.product === name);
  if (existing.length >= TARGET) { report.push({ name, category, before: existing.length, added: 0, after: existing.length }); continue; }
  const known = new Set(existing.map((entry) => clean(entry.text)));
  const selected = makeEntries(name, category).filter((entry) => !known.has(clean(entry.text))).slice(0, TARGET - existing.length);
  additions.push(...selected);
  report.push({ name, category, before: existing.length, added: selected.length, after: existing.length + selected.length });
}
const insufficient = report.filter((row) => row.after < TARGET);
if (insufficient.length) throw new Error(`候选文案不足：${insufficient.map((row) => `${row.name}(${row.after})`).join("、")}`);
const deduped = [];
const entryByKey = new Map();
for (const entry of [...state.productMarketingEntries, ...additions]) {
  const key = [entry.scope, entry.category || "", entry.product || "", clean(entry.text)].join("\u001f");
  const prior = entryByKey.get(key);
  if (!prior) { entryByKey.set(key, entry); deduped.push(entry); continue; }
  const regions = unique([...(prior.regions || []), ...(entry.regions || [])]);
  prior.regions = regions;
  prior.region = regions[0] || prior.region;
  prior.priority = Math.max(Number(prior.priority || 0), Number(entry.priority || 0));
}
await request("/api/product-marketing/save", { entries: deduped, deletedEntries: [] });
console.log(JSON.stringify({ target: TARGET, products: report.length, added: additions.length, report }, null, 2));
