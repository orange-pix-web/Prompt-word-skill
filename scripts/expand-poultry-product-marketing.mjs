/*
 * Expand poultry product-specific copy to a safe, selectable 65-entry floor.
 * The phrase families are paraphrased from publicly visible e-commerce and
 * industry product positioning; no competitor brands, prices, or efficacy
 * guarantees are carried over.
 */
const API = process.env.PROMPT_STUDIO_API || "http://127.0.0.1:4178";
const TARGET = 65;
const CATEGORY = "鸡鸭鹅禽类";
const VALID_REGIONS = new Set(["顶部卖点", "侧栏卖点", "底部卖点", "副标题", "辅助文案", "底栏文案", "不限位置"]);

const clean = (value) => String(value || "").replace(/[\s　]+/g, "").toLocaleLowerCase("zh-CN");
const unique = (items) => [...new Set(items.map((item) => item.trim()).filter(Boolean))];

function themeFor(name) {
  if (/软腿|腿㾡|钙|磷|富硒|蛋多|一天一个蛋|禽大壮|催肥|电解|多维|维生素|鱼肝/.test(name)) return "nutrition";
  if (/肠|泻|胃|霉|脱霉|EM菌|解安|藿香|黄连|温肠|醒抱|胃得/.test(name)) return "gut";
  if (/喘|呼|气囊|温役|温立|百温|腺肌|腺胃|滑支|杆舒|硫醚/.test(name)) return "respiratory";
  if (/虫|虱|螨|球|驱|内外/.test(name)) return "parasite";
  if (/啄|口黄|毛|豆/.test(name)) return "skin";
  return "general";
}

const themeCopy = {
  respiratory: {
    scenes: ["呼吸状态关注期", "换季通风管理期", "育雏保温转换期", "密度调整期", "昼夜温差期", "长途转群后", "雨季湿冷时", "禽舍粉尘管理期", "规模养殖巡栏期", "日常养护期"],
    concerns: ["呼噜甩鼻表现关注", "呼吸不畅表现关注", "气囊负担期管理", "咳嗽气喘表现关注", "精神采食状态观察", "禽舍空气质量关注", "冷应激期养护", "混群应激期关注", "夜间呼吸状态巡查", "运输后状态恢复关注"],
    focus: "家禽呼吸状态日常养护",
  },
  gut: {
    scenes: ["采食状态调整期", "换料过渡期", "育雏肠胃养护期", "高温高湿管理期", "应激后恢复期", "日常拌料期", "饮水管理期", "规模养殖巡栏期", "饲料状态关注期", "季节转换期"],
    concerns: ["粪便状态观察", "消化状态关注", "肠胃负担期管理", "采食下降期观察", "饲料适口性关注", "肠道微生态养护", "换料期日常管理", "高密度养殖关注", "应激后肠胃护理", "饲料霉变风险关注"],
    focus: "家禽肠胃与消化日常养护",
  },
  parasite: {
    scenes: ["日常驱护管理期", "新禽入栏前后", "季节性管理期", "规模养殖巡栏期", "环境卫生配合期", "换羽期日常护理", "育雏成长阶段", "高密度养殖期", "转群应激期", "常规养护期"],
    concerns: ["体表状态观察", "羽毛状态关注", "精神采食状态观察", "寄生虫风险期管理", "环境与禽体协同管理", "养殖卫生习惯关注", "群体日常护理", "粪便状态巡查", "鸡舍清洁配合", "家禽舒适状态关注"],
    focus: "家禽日常驱护与卫生管理",
  },
  nutrition: {
    scenes: ["育雏成长阶段", "蛋禽营养补充期", "肉禽育肥阶段", "换羽期日常护理", "高温应激管理期", "转群恢复期", "季节转换期", "规模养殖补充期", "日常拌料期", "产蛋阶段营养管理"],
    concerns: ["骨骼状态关注", "蛋壳状态观察", "采食与生长状态关注", "营养摄入均衡关注", "腿脚状态日常观察", "换羽期营养支持", "产蛋期日常管理", "应激期营养补充", "体况维持关注", "饲料利用状态关注"],
    focus: "家禽营养补充与日常养护",
  },
  skin: {
    scenes: ["育雏期日常护理", "换羽期管理", "高温高湿期", "密度调整期", "新禽入栏后", "日常巡栏期", "季节转换期", "群体状态观察期", "环境卫生配合期", "规模养殖管理期"],
    concerns: ["体表状态关注", "羽毛完整度观察", "喙部与皮肤状态关注", "群体舒适度管理", "啄癖风险期关注", "应激后日常护理", "饮水采食状态观察", "养殖环境配合管理", "群体活动状态关注", "日常卫生管理"],
    focus: "家禽体表与群体日常护理",
  },
  general: {
    scenes: ["鸡鸭鹅日常养护期", "育雏成长阶段", "蛋禽管理阶段", "肉禽管理阶段", "换季管理期", "高温高湿期", "转群恢复期", "规模养殖巡栏期", "日常拌料期", "饮水管理期"],
    concerns: ["采食状态关注", "精神状态观察", "群体日常管理", "养殖环境配合", "应激期养护", "饲料状态关注", "成长阶段管理", "换料期日常观察", "体况维持关注", "鸡鸭鹅养殖护理"],
    focus: "鸡鸭鹅日常养护",
  },
};

function makeEntries(name) {
  const theme = themeCopy[themeFor(name)];
  const entries = [];
  const add = (group, region, text, priority) => entries.push({
    scope: "product", category: "*", product: name, group, regions: [region], region,
    text, priority, enabled: true,
  });
  const titleWords = unique([
    `${name}·${theme.focus}`, `${name}·鸡鸭鹅可用`, `${name}·家禽养护搭配`,
    `${name}·规模养殖关注`, `${name}·日常管理选择`, `${name}·养殖阶段护理`,
    `${name}·科学养护思路`, `${name}·家禽常备选择`, `${name}·日常使用方便`, `${name}·标签建议使用`,
  ]);
  titleWords.forEach((text) => add("产品定位", "副标题", text, 220));
  ["鸡用日常管理", "鸭用日常管理", "鹅用日常管理", "蛋禽肉禽可关注", "育雏成禽可关注", "规模养殖可关注", "家庭养殖可关注", "鸡鸭鹅养护搭配", "不同阶段可关注", "按标签说明使用"].forEach((text) => add("适用对象", "副标题", `${name}·${text}`, 210));
  theme.scenes.forEach((text) => add("使用场景", "顶部卖点", `${name}·${text}`, 202));
  theme.concerns.forEach((text) => add("产品特点", "侧栏卖点", `${name}·${text}`, 196));
  ["使用前阅读标签", "按建议比例添加", "拌料饮水按标签操作", "取用后及时密封", "阴凉干燥处保存", "搭配日常管理使用", "注意饮水与饲料卫生", "关注禽舍通风状况", "根据养殖阶段安排", "规范记录日常使用"].forEach((text) => add("使用方式", "辅助文案", `${name}·${text}`, 186));
  ["家禽养殖常备", "日常管理更省心", "科学养护有条理", "鸡鸭鹅日常关注", "养殖管理好帮手", "按标签规范使用", "日常养护可选择", "规模养殖可关注", "家禽管理更从容", "养殖户日常关注"].forEach((text) => add("底栏口号", "底栏文案", `${name}·${text}`, 175));
  ["厂家直发", "现货供应", "产品信息清晰", "包装规格可查", "使用说明可查", "按需备货", "养殖场景适配", "日常管理搭配", "规范存放", "标签信息为准"].forEach((text) => add("品质与渠道", "辅助文案", `${name}·${text}`, 180));
  return entries;
}

async function request(path, body) {
  const response = await fetch(`${API}${path}`, { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "请求失败");
  return payload;
}

const state = await (await fetch(`${API}/api/state`)).json();
const productNames = unique(state.products.filter((product) => product.categories?.includes(CATEGORY)).map((product) => product.name));
const additions = [];
const report = [];
for (const name of productNames) {
  const existing = state.productMarketingEntries.filter((entry) => entry.scope === "product" && entry.product === name);
  if (existing.length >= TARGET) { report.push({ name, before: existing.length, added: 0, after: existing.length }); continue; }
  const known = new Set(existing.map((entry) => clean(entry.text)));
  const selected = makeEntries(name).filter((entry) => !known.has(clean(entry.text))).slice(0, TARGET - existing.length);
  additions.push(...selected);
  report.push({ name, before: existing.length, added: selected.length, after: existing.length + selected.length });
}
if (report.some((row) => row.after < TARGET)) {
  const missing = report.filter((row) => row.after < TARGET).map((row) => `${row.name}(${row.after})`).join("、");
  throw new Error(`候选文案不足：${missing}`);
}
const PRODUCT_ALIASES = { "鸽虫清1": "鸽虫清" };
const compatibleExisting = [];
const existingByKey = new Map();
for (const original of state.productMarketingEntries) {
  const entry = original.scope === "product" && PRODUCT_ALIASES[original.product]
    ? { ...original, product: PRODUCT_ALIASES[original.product] }
    : original;
  const regions = (entry.regions || [entry.region]).filter((region) => VALID_REGIONS.has(region));
  let normalized = regions.length ? entry : { ...entry, regions: ["辅助文案"], region: "辅助文案" };
  // Avoid a duplicate phrase where the same product's “适用对象” and footer
  // previously both used the identical wording.
  if (normalized.scope === "product" && normalized.group === "底栏口号"
    && normalized.text === `${normalized.product}·规模养殖可关注`) {
    normalized = { ...normalized, text: `${normalized.product}·养殖管理可参考` };
  }
  const key = [normalized.scope, normalized.category || "", normalized.product || "", clean(normalized.text)].join("\u001f");
  const prior = existingByKey.get(key);
  if (!prior) {
    existingByKey.set(key, normalized);
    compatibleExisting.push(normalized);
  } else {
    const merged = unique([...(prior.regions || []), ...(normalized.regions || [])]);
    prior.regions = merged;
    prior.region = merged[0] || prior.region;
  }
}
await request("/api/product-marketing/save", { entries: [...compatibleExisting, ...additions], deletedEntries: [] });
console.log(JSON.stringify({ category: CATEGORY, target: TARGET, products: report.length, added: additions.length, report }, null, 2));
