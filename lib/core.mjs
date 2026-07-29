import fs from "node:fs/promises";
import path from "node:path";

export const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export function productSelectionKey(product) {
  return `${encodeURIComponent(product.category)}::${encodeURIComponent(product.name)}`;
}

export function productCategories(product = {}) {
  return [...new Set([
    product.category,
    ...(Array.isArray(product.categories) ? product.categories : []),
  ].map((value) => String(value || "").trim()).filter(Boolean))];
}

export function selectProductsByKeys(products, keys = []) {
  const selected = new Set(keys);
  return products.filter((product) =>
    selected.has(productSelectionKey(product)) || selected.has(product.name));
}

export function parseMarkdownTable(text, expectedColumns) {
  const rows = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
    if (cells[0] === "启用" || cells[0] === "分类" || /^-+$/.test(cells[0])) continue;
    if (cells.length !== expectedColumns) {
      throw new Error(`Markdown表格第${index + 1}行应为${expectedColumns}列，实际为${cells.length}列`);
    }
    rows.push(cells);
  }
  return rows;
}

export function normalizeTemplateProductReference(text = "") {
  return String(text).replace(
    /(主体必须替换为(?:本次)?上传的)【[^】]+】(产品图)/g,
    "$1【当前所选产品】$2",
  );
}

export function parseTemplates(text) {
  return parseMarkdownTable(text, 10).map((cells) => ({
    enabled: cells[0] === "是",
    number: cells[1],
    name: cells[2],
    layout: cells[3],
    subtitleSource: cells[4],
    points: Number(cells[5]),
    bottomSource: cells[6],
    bottomStyle: cells[7],
    special: normalizeTemplateProductReference(cells[8]),
    netPosition: cells[9],
  })).sort((a, b) => a.number.localeCompare(b.number, "zh-CN"));
}

export function parseMarketing(text) {
  const result = new Map();
  for (const cells of parseMarkdownTable(text, 8)) {
    const group = cells[0];
    if (!result.has(group)) result.set(group, new Map());
    result.get(group).set(cells[1], {
      subtitle: cells[2],
      support: cells[3],
      points: [cells[4], cells[5], cells[6]],
      footer: cells[7],
    });
  }
  return result;
}

const VISUAL_LABELS = {
  product: "产品", title: "主标题", subtitle: "副标题",
  point1: "卖点1", point2: "卖点2", point3: "卖点3", net: "净含量", footer: "底栏",
};

function visualType(key) {
  if (key.startsWith("product")) return "product";
  if (key.startsWith("point")) return "sellingPoint";
  if (key === "title" || key === "subtitle") return "title";
  if (key === "net") return "net";
  if (key === "footer") return "footer";
  return "customText";
}

function visualBinding(key) {
  if (key.startsWith("product")) return `product${Math.max(1, Number(key.match(/\d+$/)?.[0] || 1))}`;
  if (key === "title") return "productName";
  if (key === "subtitle") return "subtitle";
  if (key.startsWith("point")) return key;
  if (key === "net" || key === "footer") return key;
  return "custom";
}

function defaultShape(key, number) {
  if (key.startsWith("product") || key === "title" || key === "subtitle") return "none";
  if (key.startsWith("point")) {
    if (number === "04") return "parallelogram";
    if (number === "05" || number === "07") return "pill";
    if (number === "09") return "none";
    return "rounded";
  }
  if (key === "net") return "pill";
  if (key === "footer") return "rectangle";
  return "rounded";
}

export function defaultTemplateVisualLayout(number = "00", points = 3) {
  const elements = {
    title: { x: 6, y: 8, w: 42, h: 12, z: 5 },
    subtitle: { x: 7, y: 23, w: 29, h: 6, z: 5 },
    point1: { x: 7, y: 35, w: 35, h: 8, z: 5 },
    point2: { x: 7, y: 46, w: 35, h: 8, z: 5 },
    point3: { x: 7, y: 57, w: 35, h: 8, z: 5 },
    product: { x: 53, y: 17, w: 41, h: 62, z: 4 },
    net: { x: 67, y: 81, w: 25, h: 6, z: 6 },
    footer: { x: 3, y: 87, w: 94, h: 10, z: 7 },
  };
  const presets = {
    "04": { product: [52,16,42,61], footer: [0,83,100,17] },
    "06": { title: [0,0,100,17], subtitle: [61,22,31,8], product: [7,30,41,48], net: [70,75,24,6], footer: [0,84,100,16] },
    "08": { title: [6,6,43,12], subtitle: [7,21,29,6], product: [7,34,39,45], footer: [3,87,94,10] },
    "09": { title: [6,8,44,12], subtitle: [7,25,34,7], product: [53,17,41,62], footer: [0,89,100,11] },
  };
  for (const [key, values] of Object.entries(presets[number] || {})) {
    [elements[key].x, elements[key].y, elements[key].w, elements[key].h] = values;
  }
  for (const [key, box] of Object.entries(elements)) {
    box.type = visualType(key);
    box.label = VISUAL_LABELS[key] || key;
    box.binding = visualBinding(key);
    box.shape = defaultShape(key, number);
    box.fontRatio = box.type === "product" ? null : 0.8;
    if (key.startsWith("point")) box.visible = Number(key.slice(5)) <= points;
  }
  return { canvas: 1024, elements };
}

export function normalizeTemplateVisualLayout(layout, number = "00", points = 3) {
  const defaults = defaultTemplateVisualLayout(number, points);
  const result = structuredClone(layout || defaults);
  result.canvas = 1024;
  result.elements ||= {};
  for (const [key, defaultBox] of Object.entries(defaults.elements)) {
    result.elements[key] = { ...defaultBox, ...(result.elements[key] || {}) };
  }
  for (const [key, box] of Object.entries(result.elements)) {
    box.type ||= visualType(key);
    box.label ||= VISUAL_LABELS[key] || key;
    box.binding ||= visualBinding(key);
    if (box.type === "product" && box.binding === "custom") box.binding = visualBinding(key);
    box.shape ||= defaultShape(key, number);
    if (box.type === "sellingPoint" && !box.copyRegion) box.copyRegion = box.y < 25 ? "顶部卖点" : box.y > 72 ? "底部卖点" : "侧栏卖点";
    if (box.type !== "product" && box.fontRatio == null) box.fontRatio = 0.8;
  }
  return result;
}

const REFERENCE_TYPES = new Set(["product", "sellingPoint", "title", "customText", "net", "footer", "animalRegion", "backgroundRegion", "shape"]);
const REFERENCE_SHAPES = new Set(["none", "rectangle", "rounded", "circle", "ellipse", "pill", "parallelogram"]);
const REFERENCE_TYPE_ALIASES = {
  产品: "product", 卖点: "sellingPoint", 标题: "title", 主标题: "title", 副标题: "title",
  自定义文字: "customText", 净含量: "net", 底栏: "footer", 动物区域: "animalRegion",
  背景区域: "backgroundRegion", 装饰形状: "shape",
  background: "backgroundRegion", animal: "animalRegion", text: "customText",
  subtitle: "title", point: "sellingPoint", badge: "sellingPoint",
  decoration: "shape", decor: "shape",
};
const REFERENCE_TYPE_LABELS = {
  product: "产品", sellingPoint: "卖点", title: "标题", customText: "自定义文字",
  net: "净含量", footer: "底栏", animalRegion: "动物区域", backgroundRegion: "背景区域", shape: "装饰形状",
};

function parseReferenceJson(input) {
  if (typeof input === "object" && input) return structuredClone(input);
  const text = String(input || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (!text) throw new Error("JSON内容不能为空");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`JSON格式错误：${error.message}`);
  }
}

function referenceKey(type, binding, counters) {
  if (type === "product") return counters.product++ === 1 ? "product" : `product${counters.product - 1}`;
  if (type === "sellingPoint") return `point${counters.sellingPoint++}`;
  if (type === "title" && binding === "subtitle") return "subtitle";
  if (type === "title" && counters.title++ === 1) return "title";
  if (type === "net" && counters.net++ === 1) return "net";
  if (type === "footer" && counters.footer++ === 1) return "footer";
  return `${type}${counters[type]++}`;
}

export function referenceJsonToTemplate(input, defaults = {}) {
  const source = parseReferenceJson(input);
  const number = String(defaults.number || source.number || "10").trim().padStart(2, "0");
  const rawElements = source.visualLayout?.elements ?? source.elements;
  if (!rawElements || (typeof rawElements !== "object")) throw new Error("JSON必须包含 elements 数组或 visualLayout.elements 对象");
  const entries = Array.isArray(rawElements) ? rawElements.map((box, index) => [null, box, index])
    : Object.entries(rawElements).map(([key, box], index) => [key, box, index]);
  if (!entries.length) throw new Error("JSON中至少需要一个图层元素");
  const counters = { product: 1, sellingPoint: 1, title: 1, customText: 1, net: 1, footer: 1, animalRegion: 1, backgroundRegion: 1, shape: 1 };
  const elements = {};
  for (const [providedKey, rawBox, index] of entries) {
    if (!rawBox || typeof rawBox !== "object") throw new Error(`第${index + 1}个图层不是有效对象`);
    const aliasType = REFERENCE_TYPE_ALIASES[rawBox.type] || rawBox.type;
    const inferredType = providedKey ? visualType(providedKey) : null;
    const type = aliasType || inferredType;
    if (!REFERENCE_TYPES.has(type)) throw new Error(`第${index + 1}个图层类型“${rawBox.type || ""}”不支持`);
    const rawBinding = rawBox.binding || (rawBox.type === "副标题" || rawBox.type === "subtitle" ? "subtitle" : null);
    const binding = ["animalRegion", "backgroundRegion", "shape", "customText"].includes(type) ? "custom" : rawBinding;
    const key = providedKey || referenceKey(type, binding, counters);
    const values = Object.fromEntries(["x", "y", "w", "h"].map((field) => [field, Number(rawBox[field])]));
    if (Object.values(values).some((value) => !Number.isFinite(value))) throw new Error(`图层“${rawBox.label || key}”缺少有效的X、Y、W、H`);
    if (values.x < 0 || values.y < 0 || values.w <= 0 || values.h <= 0 || values.x + values.w > 100 || values.y + values.h > 100) {
      throw new Error(`图层“${rawBox.label || key}”坐标越界：X、Y、W、H必须使用0–100百分比且不能超出画布`);
    }
    const shape = rawBox.shape || (type === "product" || type === "title" ? "none" : type === "footer" ? "rectangle" : "rounded");
    if (!REFERENCE_SHAPES.has(shape)) throw new Error(`图层“${rawBox.label || key}”形状“${shape}”不支持`);
    elements[key] = {
      type,
      label: String(rawBox.label || VISUAL_LABELS[key] || REFERENCE_TYPE_LABELS[type] || key),
      binding: binding || visualBinding(key),
      x: values.x, y: values.y, w: values.w, h: values.h,
      z: Math.max(1, Math.min(20, Number(rawBox.z) || 1)),
      shape,
      visible: rawBox.visible !== false,
      text: String(rawBox.text || ""),
      ...(type === "product" ? {} : { fontRatio: Math.max(0.1, Math.min(1, Number(rawBox.fontRatio) || 0.8)) }),
      ...(type === "sellingPoint" ? { copyRegion: rawBox.copyRegion || (values.y < 25 ? "顶部卖点" : values.y > 72 ? "底部卖点" : "侧栏卖点") } : {}),
    };
  }
  const pointCount = Object.values(elements).filter((box) => box.type === "sellingPoint" && box.visible !== false).length;
  const base = defaultTemplateVisualLayout(number, pointCount);
  for (const box of Object.values(base.elements)) box.visible = false;
  const visualLayout = normalizeTemplateVisualLayout({ canvas: 1024, elements: { ...base.elements, ...elements } }, number, pointCount);
  const name = String(defaults.name || source.name || "JSON导入模板").trim();
  const layout = String(source.layout || source.description || `根据结构化JSON导入，共${entries.length}个图层；请在可视化画布中核对位置。`).trim();
  return {
    enabled: false,
    number,
    name,
    layout,
    subtitleSource: source.subtitleSource || "副标题",
    points: pointCount,
    bottomSource: source.bottomSource || "底栏文案",
    bottomStyle: source.bottomStyle || "标准单行",
    special: source.special || "无",
    netPosition: source.netPosition || "产品附近",
    visualLayout,
  };
}

export function parseMarketingExtras(text = "") {
  const result = new Map();
  for (const cells of parseMarkdownTable(text, 4)) {
    const [group, number, order, copy] = cells;
    if (!result.has(group)) result.set(group, new Map());
    if (!result.get(group).has(number)) result.get(group).set(number, []);
    result.get(group).get(number).push({ order: Number(order), copy });
  }
  for (const rows of result.values()) {
    for (const [number, points] of rows) {
      rows.set(number, points.sort((a, b) => a.order - b.order).map((item) => item.copy));
    }
  }
  return result;
}

export function mergeMarketingExtras(marketing, extras) {
  for (const [group, rows] of extras) {
    const targetRows = marketing.get(group);
    if (!targetRows) continue;
    for (const [number, points] of rows) {
      const target = targetRows.get(number);
      if (target) target.points.push(...points);
    }
  }
  return marketing;
}

function assertMarketingCell(value) {
  const text = String(value ?? "").trim();
  if (text.includes("|")) throw new Error("营销文案不能使用英文半角竖线");
  return text;
}

export function serializeMarketing(rows) {
  const body = rows
    .slice()
    .sort((a, b) => a.category.localeCompare(b.category, "zh-CN") || a.number.localeCompare(b.number, "zh-CN"))
    .map((row) => {
      const points = [...(row.points || [])];
      while (points.length < 3) points.push("");
      return `| ${assertMarketingCell(row.category)} | ${assertMarketingCell(row.number)} | ${assertMarketingCell(row.subtitle)} | ${assertMarketingCell(row.support)} | ${assertMarketingCell(points[0])} | ${assertMarketingCell(points[1])} | ${assertMarketingCell(points[2])} | ${assertMarketingCell(row.footer)} |`;
    })
    .join("\n");
  return `# 主图模板营销词配置

在生图工作台的“营销文案”窗口中可以直观编辑本文件。前三条卖点保存在这里，更多卖点保存在同目录的\`扩展营销卖点配置.md\`。

| 分类 | 图片编号 | 副标题 | 辅助文案 | 卖点1 | 卖点2 | 卖点3 | 底栏文案 |
|---|---:|---|---|---|---|---|---|
${body}
`;
}

export function serializeMarketingExtras(rows) {
  const body = rows
    .flatMap((row) => (row.points || []).slice(3).map((copy, index) => ({
      category: row.category, number: row.number, order: index + 4, copy,
    })))
    .filter((item) => String(item.copy).trim())
    .sort((a, b) => a.category.localeCompare(b.category, "zh-CN") || a.number.localeCompare(b.number, "zh-CN") || a.order - b.order)
    .map((item) => `| ${assertMarketingCell(item.category)} | ${assertMarketingCell(item.number)} | ${item.order} | ${assertMarketingCell(item.copy)} |`)
    .join("\n");
  return `# 扩展营销卖点配置

本文件由生图工作台维护，保存每组文案的第4条及后续卖点。

| 分类 | 图片编号 | 卖点序号 | 文案 |
|---|---:|---:|---|
${body}
`;
}

const MARKETING_SCOPE_LABELS = { global: "全局通用", category: "分类通用", product: "产品专属" };
export const MARKETING_COPY_GROUPS = [
  "产品定位",
  "病症营销词",
  "使用方式",
  "适用对象",
  "使用场景",
  "产品特点",
  "规格与储存",
  "品质与渠道",
  "底栏口号",
  "其他",
];
export const MARKETING_REGIONS = ["顶部卖点", "侧栏卖点", "底部卖点", "副标题", "辅助文案", "底栏文案", "不限位置"];

export function classifyMarketingGroup(entry = {}) {
  const text = String(entry.text || "").trim();
  const regions = marketingRegions(entry);
  if (regions.includes("副标题")) return "产品定位";
  if (/净含量|含量|保质期|储存|贮存|保存|防潮|规格|克重|配置方法|用量|比例|\d+\s*(?:g|kg|ml|毫升|克|斤)/i.test(text)) return "规格与储存";
  if (/兑水|拌料|饮水|喷雾|浸泡|擦拭|添加|搅拌|即用|按量|使用方法|日常使用|冲洗/.test(text)) return "使用方式";
  if (/鸡瘟|鸭瘟|鹅瘟|流感|新城疫|腺肌胃|肠炎|胃炎|腹泻|拉稀|球虫|霉菌|病原|病毒|细菌|抗菌|抑菌|防病|口蹄|结节|驱虫|寄生虫|螨|虱|疾病|瘟疫/.test(text)) return "病症营销词";
  if (/厂家|官方|正品|直发|直供|直销|源头|工厂|物流|现货|品质|保障|性价比|加量|实惠|全国通发|量大从优|到家/.test(text)) return "品质与渠道";
  if (/不用慌|家业旺|首选|之王|万千.*选择|养殖必备|养殖常备|日常常备/.test(text)) return "底栏口号";
  if (/不伤|安全|无毒|低毒|不刺激|快速|广谱|稳定|持久|溶解|科学|天然|植物|绿色|营养|配方|成分|高效|洁净|专家|专业|健康|可靠|无氯|放心|无需清棚|适配/.test(text)) return "产品特点";
  if (/鸡|鸭|鹅|鸽|猪|牛|羊|猫|狗|犬|宠物|家禽|禽畜|蛋禽|肉禽|养殖户|孕畜|幼畜|马|驴|骡|兔|鸟/.test(text)) return "适用对象";
  if (/环境|圈舍|鸡舍|鸭舍|鹅舍|猪舍|羊圈|犬舍|猫舍|养殖场|设备|器具|居家|窝|场区/.test(text)) return "使用场景";
  if (/杀菌|消毒|消杀|清洁|除臭|净化|常备/.test(text)) return "产品特点";
  if (regions.includes("底栏文案")) return "底栏口号";
  return "其他";
}

export function marketingRegions(entry = {}) {
  const values = Array.isArray(entry.regions) && entry.regions.length
    ? entry.regions
    : String(entry.region || "不限位置").split(/[、,，]/);
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

export function marketingEntryKey(entry = {}) {
  return [
    entry.scope || "",
    entry.category || "*",
    entry.product || "*",
    String(entry.text || "").trim(),
  ].join("\u001f");
}

export function selectMarketingEntries(entries, {
  sources = ["product", "category", "global"],
  mode = "auto",
  copyKeys = [],
} = {}) {
  const sourceSet = new Set(sources);
  const keySet = new Set(copyKeys);
  return entries.filter((entry) =>
    sourceSet.has(entry.scope) && (mode !== "selected" || keySet.has(marketingEntryKey(entry))));
}

export function parseProductMarketing(text = "") {
  const rows = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
    if (cells[0] === "作用范围" || /^-+$/.test(cells[0])) continue;
    if (![7, 8].includes(cells.length)) {
      throw new Error(`产品营销词表格第${index + 1}行应为7列或8列，实际为${cells.length}列`);
    }
    rows.push(cells);
  }
  return rows.map((cells) => {
    const hasGroup = cells.length === 8;
    const regions = marketingRegions({ region: cells[3] });
    const entry = {
      scope: ({ 全局通用: "global", 分类通用: "category", 产品专属: "product" })[cells[0]] || cells[0],
      category: cells[1] === "全部" ? "*" : cells[1],
      product: cells[2] === "全部" ? "*" : cells[2],
      regions,
      region: regions[0] || "不限位置",
      group: hasGroup ? cells[4] : "",
      text: cells[hasGroup ? 5 : 4],
      priority: Number(cells[hasGroup ? 6 : 5]) || 0,
      enabled: cells[hasGroup ? 7 : 6] === "是",
    };
    if (!MARKETING_COPY_GROUPS.includes(entry.group)) entry.group = classifyMarketingGroup(entry);
    return entry;
  });
}

export function serializeProductMarketing(entries) {
  const rows = entries
    .slice()
    .sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.text.localeCompare(b.text, "zh-CN"))
    .map((entry) => `| ${MARKETING_SCOPE_LABELS[entry.scope] || entry.scope} | ${entry.category === "*" ? "全部" : assertMarketingCell(entry.category)} | ${entry.product === "*" ? "全部" : assertMarketingCell(entry.product)} | ${assertMarketingCell(marketingRegions(entry).join("、"))} | ${assertMarketingCell(MARKETING_COPY_GROUPS.includes(entry.group) ? entry.group : classifyMarketingGroup(entry))} | ${assertMarketingCell(entry.text)} | ${Number(entry.priority) || 0} | ${entry.enabled === false ? "否" : "是"} |`)
    .join("\n");
  return `# 产品营销词配置

营销词按产品归属管理。生成时优先使用产品专属词，不足时依次使用分类通用词和全局通用词。

| 作用范围 | 分类 | 产品名称 | 位置属性（可多个） | 文案分组 | 营销文案 | 优先级 | 启用 |
|---|---|---|---|---|---|---:|---|
${rows}
`;
}

function parseMarketingJson(input) {
  if (typeof input === "object" && input) return structuredClone(input);
  const text = String(input || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (!text) throw new Error("JSON内容不能为空");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`JSON格式错误：${error.message}`);
  }
}

function normalizeMarketingScope(value, fallback = "product") {
  return ({ 全局通用: "global", 分类通用: "category", 产品专属: "product" })[value] || value || fallback;
}

function defaultRegionsForGroup(group) {
  if (group === "产品定位") return ["副标题"];
  if (group === "规格与储存") return ["辅助文案"];
  if (group === "底栏口号") return ["底栏文案"];
  return ["侧栏卖点"];
}

export function marketingJsonToEntries(input, defaults = {}) {
  const source = parseMarketingJson(input);
  const rawItems = Array.isArray(source) ? source : source.items || source.entries;
  if (!Array.isArray(rawItems) || !rawItems.length) throw new Error("JSON必须包含非空的items数组");
  const sourceDefaults = Array.isArray(source) ? {} : source;
  const entries = rawItems.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw new Error(`第${index + 1}条营销词不是有效对象`);
    const text = String(raw.text ?? raw.copy ?? raw.content ?? "").trim();
    if (!text) throw new Error(`第${index + 1}条营销词缺少text`);
    const scope = normalizeMarketingScope(raw.scope ?? sourceDefaults.scope, defaults.scope || "product");
    const category = String(raw.category ?? sourceDefaults.category ?? defaults.category ?? "*").trim() || "*";
    const product = String(raw.product ?? sourceDefaults.product ?? defaults.product ?? "*").trim() || "*";
    const probe = { text, regions: raw.regions || raw.positions || raw.position };
    const group = String(raw.group ?? raw.copyGroup ?? raw.semanticGroup ?? classifyMarketingGroup(probe)).trim();
    if (!MARKETING_COPY_GROUPS.includes(group)) {
      throw new Error(`第${index + 1}条营销词分组“${group}”不支持`);
    }
    let regions = marketingRegions({
      regions: Array.isArray(raw.regions) ? raw.regions
        : Array.isArray(raw.positions) ? raw.positions
          : undefined,
      region: raw.position || raw.region || "",
    });
    if (!regions.length || (regions.length === 1 && regions[0] === "不限位置" && !raw.position && !raw.region && !raw.regions && !raw.positions)) {
      regions = defaultRegionsForGroup(group);
    }
    if (regions.some((region) => !MARKETING_REGIONS.includes(region))) {
      throw new Error(`第${index + 1}条营销词包含未知位置：${regions.filter((region) => !MARKETING_REGIONS.includes(region)).join("、")}`);
    }
    if (!["global", "category", "product"].includes(scope)) throw new Error(`第${index + 1}条营销词作用范围无效`);
    const priority = Number(raw.priority);
    const confidence = raw.confidence == null ? undefined : Number(raw.confidence);
    return {
      scope,
      category: scope === "global" ? "*" : category,
      product: scope === "product" ? product : "*",
      group,
      regions,
      region: regions[0],
      text,
      priority: Number.isFinite(priority) ? priority : Math.max(1, 100 - index),
      enabled: raw.enabled !== false,
      ...(Number.isFinite(confidence) ? { confidence: Math.max(0, Math.min(1, confidence)) } : {}),
    };
  });
  const seen = new Map();
  for (const [index, entry] of entries.entries()) {
    const key = marketingEntryKey(entry);
    if (seen.has(key)) throw new Error(`JSON内第${index + 1}条营销词“${entry.text}”与第${seen.get(key) + 1}条重复`);
    seen.set(key, index);
  }
  return entries;
}

function marketingScopeRank(entry, product) {
  const categories = productCategories(product);
  if (entry.scope === "product" && entry.product === product.name
    && (entry.category === "*" || categories.includes(entry.category))) return 3;
  if (entry.scope === "category" && categories.includes(entry.category)) return 2;
  if (entry.scope === "global") return 1;
  return 0;
}

function pickMarketing(entries, product, region, count, used, offset = 0) {
  if (count <= 0) return [];
  const matching = entries
    .filter((entry) => entry.enabled !== false && marketingScopeRank(entry, product) > 0)
    .filter((entry) => {
      const regions = marketingRegions(entry);
      return regions.includes(region) || regions.includes("不限位置");
    })
    .sort((a, b) => marketingScopeRank(b, product) - marketingScopeRank(a, product) || (b.priority || 0) - (a.priority || 0));
  const selected = [];
  const start = matching.length ? Math.abs(offset) % matching.length : 0;
  const rotated = [...matching.slice(start), ...matching.slice(0, start)];
  for (const entry of rotated) {
    if (!entry.text || used.has(entry.text)) continue;
    used.add(entry.text);
    selected.push(entry.text);
    if (selected.length >= count) break;
  }
  return selected;
}

export function resolveProductMarketing(entries, product, template) {
  const used = new Set();
  const templateOffset = Math.max(0, (Number(template.number) || 1) - 1);
  const elements = Object.values(template.visualLayout?.elements || {});
  const pointElements = elements
    .filter((box) => box?.visible !== false && box.type === "sellingPoint")
    .sort((a, b) => (a.y || 0) - (b.y || 0));
  const requestedCount = Math.max(0, Number(template.points) || 0);
  const regions = pointElements.slice(0, requestedCount).map((box) => box.copyRegion || "侧栏卖点");
  while (regions.length < requestedCount) regions.push("侧栏卖点");
  const points = [];
  for (const [index, region] of regions.entries()) {
    points.push(...pickMarketing(entries, product, region, 1, used, templateOffset + index));
  }
  while (points.length < requestedCount) {
    const fallbackEntries = entries
      .filter((entry) => entry.enabled !== false && marketingScopeRank(entry, product) > 0)
      .filter((entry) => marketingRegions(entry).some((region) =>
        ["顶部卖点", "侧栏卖点", "底部卖点", "不限位置"].includes(region)))
      .sort((a, b) => marketingScopeRank(b, product) - marketingScopeRank(a, product) || (b.priority || 0) - (a.priority || 0));
    const fallbackStart = fallbackEntries.length
      ? (templateOffset + points.length) % fallbackEntries.length : 0;
    const fallback = [...fallbackEntries.slice(fallbackStart), ...fallbackEntries.slice(0, fallbackStart)]
      .find((entry) => entry.text && !used.has(entry.text));
    if (!fallback) break;
    used.add(fallback.text);
    points.push(fallback.text);
  }
  const subtitle = pickMarketing(entries, product, "副标题", 1, used, templateOffset)[0] || "";
  const support = pickMarketing(entries, product, "辅助文案", 1, used, templateOffset)[0] || subtitle;
  const footer = pickMarketing(entries, product, "底栏文案", 1, used, templateOffset)[0]
    || pickMarketing(entries, product, "底部卖点", 1, used, templateOffset)[0] || "";
  return { subtitle, support, points, pointRegions: regions, footer };
}

export function parseProductFacts(scriptText) {
  const facts = new Map();
  const pattern = /'([^']+)'\s*=\s*@\{\s*Net\s*=\s*'([^']+)';\s*Form\s*=\s*'([^']+)'\s*\}/g;
  for (const match of scriptText.matchAll(pattern)) {
    facts.set(match[1], { net: match[2], form: match[3] });
  }
  return facts;
}

export function serializeTemplates(templates) {
  const rows = templates
    .slice()
    .sort((a, b) => a.number.localeCompare(b.number, "zh-CN"))
    .map((item) => `| ${item.enabled ? "是" : "否"} | ${item.number} | ${item.name} | ${item.layout} | ${item.subtitleSource} | ${item.points} | ${item.bottomSource} | ${item.bottomStyle} | ${item.special || "无"} | ${item.netPosition} |`)
    .join("\n");
  return `# 主图模板配置

这里管理主图的构图、启用状态和文字槽位。营销词仍在\`营销文案/主图模板营销词配置.md\`中管理。

## 使用规则

- \`启用\`填写\`是\`或\`否\`。未指定模板时，只生成启用为\`是\`的模板。
- \`编号\`使用两位数字，例如\`01\`、\`10\`，不能重复。
- 新增模板后，还要在营销词配置中为每个产品分类增加相同编号的一行文案。
- 文本中请使用中文全角分隔符\`｜\`，不要使用英文半角竖线\`|\`。

| 启用 | 编号 | 模板名称 | 构图描述 | 副标题来源 | 卖点数量 | 底栏来源 | 底栏样式 | 特殊要求 | 净含量位置 |
|---|---:|---|---|---|---:|---|---|---|---|
${rows}
`;
}

export function latestPromptVersion(files, productName) {
  const escaped = productName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}-生图提示词(?:-v(\\d+))?\\.md$`);
  return files
    .map((name) => ({ name, match: name.match(pattern) }))
    .filter((item) => item.match)
    .map((item) => ({ name: item.name, version: item.match[1] ? Number(item.match[1]) : 1 }))
    .sort((a, b) => b.version - a.version)[0] ?? null;
}

export async function nextPromptPath(folder, productName) {
  const files = await fs.readdir(folder);
  const latest = latestPromptVersion(files, productName);
  const version = latest ? latest.version + 1 : 1;
  const suffix = version === 1 ? "" : `-v${version}`;
  return path.join(folder, `${productName}-生图提示词${suffix}.md`);
}

export function doseText(form) {
  if (form === "bag") return "100g拌料200斤或兑水400斤";
  if (form === "liquid") return "250ml拌料200斤或兑水400斤";
  return "具体用法请以产品标签说明为准";
}

function resolveSubtitle(template, copy, fact) {
  if (template.subtitleSource === "副标题") return copy.subtitle;
  if (template.subtitleSource === "辅助文案") return copy.support;
  if (template.subtitleSource === "自动用量") return fact.form === "bag" || fact.form === "liquid" ? doseText(fact.form) : "按说明使用更安心";
  return null;
}

function resolveBottom(template, copy, fact) {
  if (template.bottomSource === "自动用量") return [doseText(fact.form)];
  if (template.bottomSource === "辅助文案+底栏文案") return [copy.support, copy.footer];
  return [copy.footer];
}

function shapeName(shape) {
  return ({
    rectangle: "直角矩形", rounded: "圆角矩形", circle: "圆形", ellipse: "椭圆",
    pill: "胶囊形", parallelogram: "平行四边形",
  })[shape] || shape;
}

function visualBoxDescription(key, box, fallbackLabel) {
  const label = box.label || fallbackLabel || key;
  const hasBoard = box.shape && box.shape !== "none";
  const shape = hasBoard
    ? `，必须在文字下方绘制${shapeName(box.shape)}底板，底板尺寸与本区域一致`
    : "，不绘制文字底板";
  const ratio = box.type !== "product" && box.fontRatio != null
    ? `，文字实际高度约为该矩形框高度的${Math.round(box.fontRatio * 100)}%，优先保持单行；仅在文字放不下时等比缩小`
    : "";
  const content = box.text ? `，内容要求“${box.text}”` : "";
  const copyRegion = box.type === "sellingPoint" && box.copyRegion ? `，营销词位置类型为${box.copyRegion}` : "";
  return `${label}位于画面左侧${Math.round(box.x)}%、顶部${Math.round(box.y)}%，宽约${Math.round(box.w)}%、高约${Math.round(box.h)}%，图层${Number(box.z || 1)}${shape}${ratio}${copyRegion}${content}`;
}

const SCENE_DETAIL_PATTERN = /背景|场景|鸡舍|鸭舍|鹅舍|猪场|牛场|羊场|圈舍|草地|蓝天|室内|户外|展台|动物群像|宠物|作业人员|防护服|喷雾|喷洒|消毒作业/;
const LAYOUT_DETAIL_PATTERN = /产品|标题|卖点|文字|底部|底栏|页眉|信息栏|净含量|通栏|边框|按钮|角标|卡片/;

export function stripTemplateSceneDetails(text = "") {
  const groups = String(text).split(/[；。]/).map((group) => group.trim()).filter(Boolean);
  const cleaned = groups.map((group) => group
    .split("，")
    .map((part) => part.trim())
    .filter((part) => part && (!SCENE_DETAIL_PATTERN.test(part) || LAYOUT_DETAIL_PATTERN.test(part)))
    .join("，"))
    .filter(Boolean);
  return cleaned.join("；") || "沿用模板中的产品、标题、卖点、净含量和底栏位置关系";
}

export function stripTemplateSceneName(text = "") {
  const cleaned = String(text)
    .replace(/鸡舍|鸭舍|鹅舍|猪场|牛场|羊场|圈舍|草地|蓝天|室内|户外|夜景|动物|宠物|带鸡|消毒|喷雾|病毒|场景/g, "")
    .replace(/\s+/g, "")
    .trim();
  return cleaned || "通用构图";
}

function contextualizeTemplateText(text, activeProductNames, knownProductNames) {
  const active = [...new Set(activeProductNames.map(String).filter(Boolean))];
  const activeSet = new Set(active);
  const replacement = active.length === 1 ? active[0] : active.join("、");
  let result = normalizeTemplateProductReference(text)
    .replaceAll("【当前所选产品】", `【${replacement}】`)
    .replaceAll("当前所选产品", replacement);
  const foreignNames = [...new Set((knownProductNames || []).map(String).filter(Boolean))]
    .filter((name) => !activeSet.has(name))
    .sort((a, b) => b.length - a.length);
  for (const foreignName of foreignNames) result = result.replaceAll(foreignName, replacement);
  return result;
}

function backgroundRule({ backgroundMode, backgroundNote, productNames, categories }) {
  const names = productNames.map((name) => `【${name}】`).join("、");
  const categoryText = [...new Set(categories.filter(Boolean))].map((category) => `【${category}】`).join("、");
  if (backgroundMode === "template") {
    return "本次保留模板原背景，但背景只作为环境层，不得改变当前产品包装、名称、用途或营销文案。";
  }
  if (backgroundMode === "custom") {
    const note = String(backgroundNote).replace(/[。；;，,\s]+$/g, "");
    return `本次临时背景要求（最高优先级）：${note}。如果该要求与模板原背景、人物动作、工具或原产品用途冲突，必须以本备注为准；只继承模板的布局、配色和文字层级。`;
  }
  return `本次背景按当前产品${names}及${categoryText || "对应分类"}属性自动适配。模板中的原产品使用方式、专用场景、人物动作和工具只作构图占位，不得照搬；只继承布局、配色和文字层级。`;
}

function assertNoForeignProductNames(markdown, activeProductNames, knownProductNames) {
  const active = new Set(activeProductNames);
  const foreignNames = [...new Set((knownProductNames || []).map(String).filter(Boolean))]
    .filter((name) => !active.has(name) && markdown.includes(name));
  if (foreignNames.length) {
    throw new Error(`提示词中检测到其他产品名称：${foreignNames.join("、")}，已停止保存`);
  }
}

export function generatePromptMarkdown({
  product,
  templates,
  marketingRows,
  backgroundMode = "product",
  backgroundNote = "",
  knownProductNames = [],
}) {
  const { name, imageName, category, net, form } = product;
  const activeProductNames = [name];
  const background = backgroundRule({
    backgroundMode,
    backgroundNote,
    productNames: activeProductNames,
    categories: [category],
  });
  const entries = templates.map((template) => {
    const copy = marketingRows.get(template.number);
    if (!copy) throw new Error(`分类【${category}】缺少模板【${template.number}】营销词`);
    return {
      template,
      copy,
      subtitle: resolveSubtitle(template, copy, { net, form }),
      bottom: resolveBottom(template, copy, { net, form }),
    };
  });
  const numbers = entries.map((entry) => entry.template.number).join("、");
  const lines = [
    `# ${name}｜网页版一次批量生图提示词`,
    "",
    `> 使用方法：网页版只上传【${imageName}】，复制下面代码块的全部内容，一次发送。`,
    "",
    "```text",
    `分别参照以下${entries.length}套提示词，使用我上传的产品【${name}】生成${entries.length}张比例1:1、尺寸1024×1024的中文电商主图，${entries.length}张图片分别单独发给我。不要九宫格，不要拼成一张，不要遗漏，各张构图必须明显不同。本次模板编号为【${numbers}】。`,
    "",
    "---",
    "",
    `# ${name} 电商主图统一约束`,
    "",
    `严格以上传的【${imageName}】为唯一产品参考。必须保持原包装容器或袋型、长宽比例、瓶盖、品牌logo【牧德旺】、包装颜色、产品名称【${name}】和净含量【${net}】不变。不得替换包装、修改品牌、拉伸产品或增加第二个产品，只允许等比例放大、缩小和轻微透视展示。`,
    `所有图片均为1:1正方形电商主图，高清商业摄影风格。产品完整清晰，通常占画面约40%至45%。主标题统一写产品名称【${name}】，必须是画面中最大、最醒目的粗体文字；副标题约为主标题一半大小；卖点文字的视觉高度约为副标题的80%，使用醒目粗体，不能生成成难以阅读的小字。`,
    `每张图底部都设置横向铺满的底栏，左右只保留少量整齐页边距。背景按【${category}】产品属性选择真实、干净的使用或养殖场景。动物和环境属于背景层，卖点文字及卖点底板位于动物背景上方，可以覆盖动物身体的非关键区域，但不得遮挡动物脸部、眼睛、主要识别特征或产品包装。`,
    background,
    "只能使用各提示词中明确列出的文字。不得出现无关品牌、水印、二维码、价格、销量、赠品、认证、疗效保证、疾病治疗词、错别字、乱码、重复字或残缺字。",
    "",
  ];

  for (const entry of entries) {
    const { template, copy, subtitle, bottom } = entry;
    const rawLayout = backgroundMode === "template" ? template.layout : stripTemplateSceneDetails(template.layout);
    const layout = contextualizeTemplateText(rawLayout, activeProductNames, knownProductNames);
    const templateName = backgroundMode === "template" ? template.name : stripTemplateSceneName(template.name);
    lines.push("---", "", `# 提示词${template.number}｜${templateName}布局`, "");
    lines.push(`真实商业摄影风格，高清中文电商主图，正方形1:1比例。${layout}`);
    lines.push(background);
    lines.push(`画面中的【${name}】必须严格还原上传产品图，完整清晰、比例不变，作为画面主体。主标题使用画面最大粗体字写【${name}】。`);
    if (subtitle) lines.push(`副标题写【${subtitle}】，字号约为主标题一半。`);
    if (template.points > 0) {
      const selectedPoints = copy.points.slice(0, Math.max(0, template.points)).filter(Boolean).map((point) => `【${point}】`).join("");
      lines.push(`卖点依次写${selectedPoints}，使用清晰醒目的粗体字；具体字号按照各卖点矩形框的字号比例执行。动物可以作为背景，卖点文字和底板放在动物图层上方；不得遮挡动物脸部、眼睛或产品包装。`);
    }
    if (template.visualLayout?.elements) {
      const names = {
        product: "产品", title: "主标题", subtitle: "副标题", point1: "卖点1",
        point2: "卖点2", point3: "卖点3", net: "净含量", footer: "底栏",
      };
      const positions = Object.entries(template.visualLayout.elements)
        .filter(([, box]) => box && box.visible !== false)
        .map(([key, box]) => {
          return visualBoxDescription(key, box, names[key]);
        })
        .join("；");
      if (positions) lines.push(`严格参考以下1024×1024逻辑画布布局：${positions}。各区域保持安全间距，按图层数字由小到大叠放。`);
    }
    if (template.special && template.special !== "无") {
      lines.push(contextualizeTemplateText(template.special, activeProductNames, knownProductNames));
    }
    if (bottom.length === 2 || template.bottomStyle === "双行") {
      lines.push(`底部设置横向铺满的通栏，左右保留少量页边距，分两行写【${bottom[0]}】【${bottom[1] ?? ""}】。`);
    } else if (template.bottomStyle === "醒目单行") {
      lines.push(`底部设置高度充足、横向铺满的通栏，只用一行醒目大字写【${bottom[0]}】，不要拆成两行或使用小字。`);
    } else if (template.bottomStyle === "加高单行") {
      lines.push(`底部设置高度充足、横向铺满的通栏，使用醒目大字居中写【${bottom[0]}】。`);
    } else {
      lines.push(`底部设置横向铺满的通栏，左右保留少量页边距，居中写【${bottom[0]}】。`);
    }
    if (template.netPosition === "右侧空白区") {
      lines.push(`把【净含量：${net}】单独放在画面右侧空白区域，清楚醒目，不要挤在产品底部或底栏内。`);
    } else if (template.netPosition === "产品附近") {
      lines.push(`在产品附近清楚标注【净含量：${net}】。`);
    } else {
      lines.push(`按照【${template.netPosition}】的要求清楚标注【净含量：${net}】。`);
    }
    lines.push("整体画面简洁醒目，文字不能压住产品，产品、标题和底栏层级清楚。", "");
  }
  lines.push("---", "", `请按模板编号【${numbers}】依次生成${entries.length}张独立图片。每完成一张都重新读取对应提示词，不得沿用上一张的产品位置、文字位置或背景构图；输出前逐张核对产品名称、包装和全部指定中文。`, "```", "", "如果某一张失败，可复制“统一约束”与对应编号提示词，单独发送补生。", "");
  const markdown = lines.join("\n");
  assertNoForeignProductNames(markdown, activeProductNames, knownProductNames);
  return markdown;
}

export function generateCombinedPromptMarkdown({
  products,
  templates,
  marketingByCategory,
  backgroundMode = "product",
  backgroundNote = "",
  knownProductNames = [],
}) {
  if (!products.length) throw new Error("请至少选择一个产品");
  const activeProductNames = products.map((product) => product.name);
  const background = backgroundRule({
    backgroundMode,
    backgroundNote,
    productNames: activeProductNames,
    categories: products.map((product) => product.category),
  });
  const productNames = products.map((product) => `【${product.name}】`).join("、");
  const imageNames = products.map((product) => `【${product.imageName}】`).join("、");
  const lines = [
    `# 多产品组合主图｜${products.map((product) => product.name).join("＋")}`,
    "",
    "```text",
    `请使用我同时上传的产品图${imageNames}，生成${templates.length}张1:1、1024×1024中文电商组合主图。`,
    `同一张图中必须同时出现${productNames}，每个产品都严格保持原包装、品牌、颜色、名称和净含量，不得互相替换、融合或重复。`,
    "多个产品分别作为独立前景图层，按照模板中的产品占位框从产品1开始依次放置；占位框不足时，在相邻安全区域等比例补充排列。",
    background,
    "",
  ];
  for (const template of templates) {
    const rows = marketingByCategory.get(products[0].category);
    const copy = rows?.get(template.number);
    const rawLayout = backgroundMode === "template" ? template.layout : stripTemplateSceneDetails(template.layout);
    const layout = contextualizeTemplateText(rawLayout, activeProductNames, knownProductNames);
    const templateName = backgroundMode === "template" ? template.name : stripTemplateSceneName(template.name);
    lines.push("---", "", `# 模板${template.number}｜${templateName}`, "", layout, background);
    if (copy) {
      const marketingPoints = copy.points.slice(0, Math.max(0, template.points || 0)).filter(Boolean).map((item) => `【${item}】`);
      if (marketingPoints.length) lines.push(`默认营销卖点依次写${marketingPoints.join("")}。`);
      lines.push(`底栏文案写【${copy.footer}】。`);
    }
    if (template.visualLayout?.elements) {
      const boxes = Object.entries(template.visualLayout.elements)
        .filter(([, box]) => box?.visible !== false)
        .map(([key, box]) => {
          return visualBoxDescription(key, box, key);
        });
      if (boxes.length) lines.push(`1024×1024逻辑画布：${boxes.join("；")}。`);
    }
    lines.push("产品必须完整清晰，文字和产品不得互相遮挡；动物、环境和背景区域位于产品及文字下方。", "");
  }
  lines.push("```", "");
  const markdown = lines.join("\n");
  assertNoForeignProductNames(markdown, activeProductNames, knownProductNames);
  return markdown;
}

export function safeChildPath(root, relativePath) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("路径超出项目目录");
  }
  return resolved;
}
