import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const BASE_URL = process.env.PROMPT_STUDIO_URL || "http://127.0.0.1:4178";
const DATA_ROOT = path.resolve(process.env.PROMPT_DATA_ROOT || path.join(import.meta.dirname, "..", ".."));
const REFERENCE_ROOT = path.join(DATA_ROOT, "参考图");
const MARKETING_ROOT = path.join(DATA_ROOT, "营销文案");
const MAX_LAYOUTS_PER_PRODUCT = 3;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

async function api(route, options = {}) {
  const response = await fetch(`${BASE_URL}${route}`, {
    headers: options.body ? { "content-type": "application/json; charset=utf-8" } : undefined,
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `请求失败：${response.status}`);
  return payload;
}

const box = (x, y, w, h, shape = "none") => ({ x, y, w, h, shape });
const layer = (type, label, binding, source, z, extra = {}) => ({
  ...source, z, type, label, binding, visible: true, text: "",
  ...(type === "product" ? {} : { fontRatio: 0.8 }), ...extra,
});

const FAMILIES = [
  {
    key: "right3", description: "标题置顶，产品固定右侧，左侧纵向三条卖点，底部通栏。",
    title: box(4, 3, 92, 13), product: box(53, 19, 43, 65),
    points: [box(4, 32, 42, 10, "rounded"), box(4, 47, 42, 10, "rounded"), box(4, 62, 42, 10, "rounded")],
    net: box(61, 82, 34, 7, "pill"), footer: box(0, 89, 100, 11, "rectangle"),
  },
  {
    key: "photoRight", description: "养殖或使用场景满版，产品在右侧，卖点在左侧背景上方，底部通栏。",
    background: box(0, 0, 100, 100, "rectangle"), title: box(3, 3, 94, 15), product: box(55, 22, 42, 67),
    points: [box(4, 34, 44, 10, "pill"), box(4, 49, 44, 10, "pill"), box(4, 64, 44, 10, "pill")],
    footer: box(0, 89, 100, 11, "rectangle"),
  },
  {
    key: "cleanRight", description: "浅色信息板，左侧标题、副标题与三条卖点，产品干净陈列在右侧。",
    title: box(5, 14, 43, 14), subtitle: box(6, 30, 40, 8), product: box(53, 14, 43, 68),
    points: [box(6, 43, 39, 9, "rounded"), box(6, 55, 39, 9, "rounded"), box(6, 67, 39, 9, "rounded")],
    net: box(58, 82, 36, 7, "pill"), footer: box(2, 90, 96, 8, "rectangle"),
  },
  {
    key: "symptomBoard", description: "左侧高对比信息板，产品固定右侧，顶部标题、四条信息与底栏收束。",
    title: box(3, 3, 94, 13), product: box(55, 18, 42, 67),
    points: [box(3, 27, 45, 10, "rectangle"), box(3, 40, 45, 10, "rectangle"), box(3, 53, 45, 10, "rectangle"), box(3, 66, 45, 10, "rectangle")],
    net: box(60, 82, 35, 7, "pill"), footer: box(0, 89, 100, 11, "rectangle"),
  },
  {
    key: "collage", description: "顶部标题，产品固定右侧，左侧为图文拼贴或适用对象区域，底部通栏。",
    title: box(3, 3, 94, 13), product: box(56, 20, 40, 64), animal: box(3, 35, 46, 43, "rounded"),
    points: [box(4, 20, 44, 9, "rounded"), box(4, 80, 44, 7, "pill")],
    net: box(61, 82, 34, 7, "pill"), footer: box(0, 89, 100, 11, "rectangle"),
  },
  {
    key: "stage", description: "摄影棚或展台背景，产品置于右侧，左侧大标题与斜切卖点上下排列。",
    background: box(0, 0, 100, 89, "rectangle"), title: box(4, 23, 46, 15), product: box(53, 12, 43, 70),
    points: [box(6, 43, 40, 9, "parallelogram"), box(6, 55, 40, 9, "parallelogram"), box(6, 67, 40, 9, "parallelogram")],
    net: box(56, 82, 38, 7, "pill"), footer: box(0, 89, 100, 11, "rectangle"),
  },
];

function visualLayout(family) {
  const elements = {};
  if (family.background) elements.backgroundRegion1 = layer("backgroundRegion", "背景区域", "custom", family.background, 1);
  if (family.animal) elements.animalRegion1 = layer("animalRegion", "动物/图文区域", "custom", family.animal, 2);
  elements.product = layer("product", "产品", "product1", family.product, 5);
  elements.title = layer("title", "主标题", "productName", family.title, 8);
  if (family.subtitle) elements.subtitle = layer("title", "副标题", "subtitle", family.subtitle, 8);
  family.points.forEach((point, index) => {
    elements[`point${index + 1}`] = layer("sellingPoint", `卖点${index + 1}`, `point${index + 1}`, point, 8, {
      copyRegion: point.y < 25 ? "顶部卖点" : point.y > 72 ? "底部卖点" : "侧栏卖点",
    });
  });
  if (family.net) elements.net = layer("net", "净含量", "net", family.net, 9);
  elements.footer = layer("footer", "底栏", "footer", family.footer, 9);
  return { canvas: 1024, elements };
}

function normalize(value = "") {
  return String(value).toLowerCase()
    .replace(/[\s_\-（）()【】\[\]·.]/g, "")
    .replace(/拷贝|透明图|瓶装/g, "")
    .replace(/[①②③④⑤⑥⑦⑧⑨]/g, "");
}

const ALIASES = new Map([
  ["口黄毛滴净瓶装", ["口黄毛滴净"]],
  ["母猪保健包200g", ["母猪保健包"]],
  ["气囊清1", ["气囊清"]],
  ["浓速温肠清1", ["浓速温肠清"]],
  ["犬立康透明图", ["犬立康"]],
  ["犬肥肽2", ["犬肥肽"]],
  ["黄色化毛片", ["化毛片", "黄瓶化毛片"]],
  ["乎立停", ["呼立停"]],
  ["鸽6联", ["鸽六联"]],
  ["球蟲净", ["球虫净"]],
  ["新呼灞", ["新乎灞"]],
  ["禽康101拷贝", ["禽康101"]],
  ["禽①片", ["禽1片", "禽一片"]],
  ["浓缩鱼肝油", ["鱼肝油500g"]],
]);

async function walk(folder) {
  const collected = [];
  async function visit(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile()) collected.push(target);
    }
  }
  await visit(folder);
  return collected;
}

async function sha256(file) {
  const buffer = await fs.readFile(file);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function selectEvenly(items, count) {
  if (items.length <= count) return items;
  const indexes = new Set();
  for (let index = 0; index < count; index += 1) indexes.add(Math.round(index * (items.length - 1) / (count - 1)));
  return [...indexes].map((index) => items[index]);
}

function chooseFamily(reference, index) {
  const text = reference.toLowerCase();
  if (/症状|病|对照|部位|炎|痘|瘟/.test(text)) return FAMILIES[3];
  if (/场|养殖|鸡场|牧场|鸽|犬|猫|牛|羊|猪/.test(text)) return FAMILIES[index % 2 ? 1 : 4];
  if (/棚|台|木|展示/.test(text)) return FAMILIES[5];
  return FAMILIES[index % 2 ? 2 : 0];
}

function markdownExtract(product, folders, textFiles) {
  const lines = [
    `# ${product}参考图文字提取（待审核）`,
    "",
    "说明：以下为参考图目录内的原始文本文件摘录，仅供核对。价格、旧包装名、绝对化功效和不适用内容不会自动写入生图文案。",
    "",
    `关联参考图文件夹：${folders.join("、") || "未匹配"}`,
    "",
  ];
  if (!textFiles.length) {
    lines.push("未发现可直接读取的 TXT/MD 文字文件；图片中文字需在模板预览时人工核对。");
  } else {
    for (const file of textFiles) {
      const content = fsSync.readFileSync(file, "utf8").trim();
      lines.push(`## ${path.basename(file)}`);
      lines.push("");
      lines.push(content || "（空文件）");
      lines.push("");
    }
  }
  return `${lines.join("\n")}\n`;
}

const state = await api("/api/state");
const referenceFolders = (await fs.readdir(REFERENCE_ROOT, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name !== "待分析")
  .map((entry) => entry.name);
const folderByNormalizedName = new Map();
for (const folder of referenceFolders) {
  const key = normalize(folder);
  if (!folderByNormalizedName.has(key)) folderByNormalizedName.set(key, []);
  folderByNormalizedName.get(key).push(folder);
}

const names = [...new Set(state.products.map((product) => product.name))].sort((a, b) => a.localeCompare(b, "zh-CN"));
const dedicated = new Set(state.templates
  .filter((template) => Number(template.number) > 9)
  .flatMap((template) => template.groups || [template.group]));
const sourceMap = new Map();
for (const product of names) {
  const candidates = [product, ...(ALIASES.get(product) || [])];
  const folders = [...new Set(candidates.flatMap((candidate) => folderByNormalizedName.get(normalize(candidate)) || []))];
  if (folders.length) sourceMap.set(product, folders);
}

const existingNumbers = new Set(state.templates.map((template) => Number(template.number)).filter(Number.isFinite));
let nextNumber = Math.max(0, ...existingNumbers) + 1;
const drafts = [];
const summary = [];
for (const [product, folders] of sourceMap) {
  const textFiles = (await Promise.all(folders.map((folder) => walk(path.join(REFERENCE_ROOT, folder))))).flat()
    .filter((file) => [".txt", ".md"].includes(path.extname(file).toLowerCase()));
  const marketingFolder = path.join(MARKETING_ROOT, product);
  await fs.mkdir(marketingFolder, { recursive: true });
  const extractFile = path.join(marketingFolder, `${product}-参考图文字提取-待审核.md`);
  if (!fsSync.existsSync(extractFile)) await fs.writeFile(extractFile, markdownExtract(product, folders, textFiles), "utf8");

  if (dedicated.has(product)) {
    summary.push({ product, folders: folders.join("、"), references: 0, templates: 0, status: "已有专属模板" });
    continue;
  }
  const files = (await Promise.all(folders.map((folder) => walk(path.join(REFERENCE_ROOT, folder))))).flat()
    .filter((file) => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const hashes = new Set();
  const unique = [];
  for (const file of files.sort((a, b) => a.localeCompare(b, "zh-CN"))) {
    const hash = await sha256(file);
    if (hashes.has(hash)) continue;
    hashes.add(hash);
    unique.push(file);
  }
  const chosen = selectEvenly(unique, Math.min(MAX_LAYOUTS_PER_PRODUCT, unique.length));
  for (const [index, file] of chosen.entries()) {
    const family = chooseFamily(path.relative(REFERENCE_ROOT, file), index);
    while (existingNumbers.has(nextNumber)) nextNumber += 1;
    const number = String(nextNumber).padStart(2, "0");
    existingNumbers.add(nextNumber);
    nextNumber += 1;
    const source = path.relative(REFERENCE_ROOT, file).replaceAll("\\", "/");
    drafts.push({
      enabled: false,
      number,
      name: `参考布局${String(index + 1).padStart(2, "0")}·${family.key}`,
      group: product,
      groups: [product],
      layout: `${family.description} 参考来源：参考图/${source}。`,
      subtitleSource: family.subtitle ? "副标题" : "无",
      points: family.points.length,
      bottomSource: "底栏文案",
      bottomStyle: family.footer.h >= 12 ? "加高单行" : "标准单行",
      special: "自动去重后的参考布局候选。仅参考来源图的构图、配色、文字层级和区域比例；必须使用当前所选产品图，不得复制旧包装、旧产品名、商标、价格或未经审核的功效文案。背景动物和场景必须匹配当前产品分类。",
      netPosition: "产品附近",
      visualLayout: visualLayout(family),
    });
  }
  summary.push({ product, folders: folders.join("、"), references: unique.length, templates: chosen.length, status: chosen.length ? "已建候选模板" : "无可用图片" });
}

if (drafts.length) {
  await api("/api/templates/save", {
    method: "POST",
    body: JSON.stringify({
      templates: [...state.templates, ...drafts],
      groups: [...new Set([...state.templates.flatMap((template) => template.groups || [template.group]), ...drafts.map((draft) => draft.group)])],
    }),
  });
}

const reportFolder = path.join(DATA_ROOT, ".prompt-ui");
await fs.mkdir(reportFolder, { recursive: true });
await fs.writeFile(path.join(reportFolder, "auto-reference-layout-import.json"), `${JSON.stringify({
  generatedAt: new Date().toISOString(), maxLayoutsPerProduct: MAX_LAYOUTS_PER_PRODUCT,
  templatesAdded: drafts.length, groupsProcessed: summary.length, summary,
}, null, 2)}\n`, "utf8");

console.log(JSON.stringify({ templatesAdded: drafts.length, groupsProcessed: summary.length, summary }, null, 2));
