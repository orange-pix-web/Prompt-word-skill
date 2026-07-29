import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.PROMPT_STUDIO_URL || "http://127.0.0.1:4178";
const DATA_ROOT = path.resolve(import.meta.dirname, "..", "..");
const REFERENCE_ROOT = path.join(DATA_ROOT, "参考图");

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
  ...source,
  z,
  type,
  label,
  binding,
  visible: true,
  text: "",
  ...(type === "product" ? {} : { fontRatio: 0.8 }),
  ...extra,
});

const families = {
  right3: {
    label: "右产品三卖点",
    description: "标题位于顶部，产品固定在右侧，左侧纵向排列三条卖点，底部为通栏文案。",
    title: box(3, 3, 94, 14), product: box(54, 18, 42, 67),
    points: [box(4, 31, 43, 10, "rounded"), box(4, 45, 43, 10, "rounded"), box(4, 59, 43, 10, "rounded")],
    net: box(60, 81, 35, 7, "pill"), footer: box(0, 89, 100, 11, "rectangle"),
  },
  right4: {
    label: "右产品四卖点",
    description: "产品位于右侧，左侧排列四条紧凑卖点，顶部大标题，底部为高对比通栏。",
    title: box(3, 2, 94, 14), product: box(55, 18, 41, 67),
    points: [box(3, 27, 45, 9, "pill"), box(3, 39, 45, 9, "pill"), box(3, 51, 45, 9, "pill"), box(3, 63, 45, 9, "pill")],
    net: box(59, 81, 36, 7, "pill"), footer: box(0, 89, 100, 11, "rectangle"),
  },
  left3: {
    label: "左产品右卖点",
    description: "产品占据左侧主视觉，右侧排列三条卖点，标题置顶，底部横向信息栏收束。",
    title: box(3, 3, 94, 14), product: box(3, 20, 46, 65),
    points: [box(54, 31, 42, 10, "rounded"), box(54, 46, 42, 10, "rounded"), box(54, 61, 42, 10, "rounded")],
    net: box(4, 81, 35, 7, "pill"), footer: box(0, 89, 100, 11, "rectangle"),
  },
  cleanRight: {
    label: "浅底信息板",
    description: "浅色信息板布局，左侧为标题、副标题和三条卖点，产品干净陈列在右侧。",
    title: box(5, 13, 43, 14), subtitle: box(6, 29, 40, 8),
    product: box(53, 14, 43, 69),
    points: [box(6, 42, 39, 9, "rounded"), box(6, 54, 39, 9, "rounded"), box(6, 66, 39, 9, "rounded")],
    net: box(59, 81, 36, 7, "pill"), footer: box(2, 90, 96, 8, "rectangle"),
  },
  photoRight: {
    label: "场景右产品",
    description: "真实适用场景满版作为背景，标题位于顶部，产品在右侧，卖点覆盖在左侧背景上方。",
    background: box(0, 0, 100, 100, "rectangle"), title: box(3, 3, 94, 15),
    product: box(55, 22, 42, 67),
    points: [box(4, 34, 44, 10, "pill"), box(4, 49, 44, 10, "pill"), box(4, 64, 44, 10, "pill")],
    footer: box(0, 89, 100, 11, "rectangle"),
  },
  photoLeft: {
    label: "场景左产品",
    description: "真实适用场景满版作为背景，产品固定在左侧，右侧排列三条醒目卖点。",
    background: box(0, 0, 100, 100, "rectangle"), title: box(3, 3, 94, 15),
    product: box(3, 22, 44, 67),
    points: [box(53, 34, 43, 10, "pill"), box(53, 49, 43, 10, "pill"), box(53, 64, 43, 10, "pill")],
    footer: box(0, 89, 100, 11, "rectangle"),
  },
  splitCenter: {
    label: "中产品双信息区",
    description: "标题置顶，产品位于画面中部，左右两侧分别承载卖点和适用对象场景，底部为通栏。",
    title: box(3, 2, 94, 13), product: box(36, 18, 38, 66),
    points: [box(3, 28, 30, 10, "rounded"), box(3, 43, 30, 10, "rounded"), box(3, 58, 30, 10, "rounded")],
    animal: box(73, 25, 25, 55, "rounded"), net: box(38, 82, 34, 7, "pill"), footer: box(0, 89, 100, 11, "rectangle"),
  },
  topBand: {
    label: "高对比页眉",
    description: "高对比页眉承载超大标题，主体左右分栏，产品在右侧，左侧排列四条卖点。",
    title: box(0, 0, 100, 18, "rectangle"), product: box(55, 21, 42, 64),
    points: [box(4, 30, 45, 9), box(4, 42, 45, 9), box(4, 54, 45, 9), box(4, 66, 45, 9)],
    net: box(59, 82, 36, 7, "pill"), footer: box(0, 89, 100, 11, "rectangle"),
  },
  symptomBoard: {
    label: "病症信息板",
    description: "左侧为深色或高对比病症信息板和四条列表，产品固定在右侧，标题置顶并用底栏收束。",
    title: box(3, 3, 94, 13), product: box(55, 18, 42, 67),
    points: [box(3, 27, 45, 10, "rectangle"), box(3, 40, 45, 10, "rectangle"), box(3, 53, 45, 10, "rectangle"), box(3, 66, 45, 10, "rectangle")],
    net: box(60, 82, 35, 7, "pill"), footer: box(0, 89, 100, 11, "rectangle"),
  },
  collage: {
    label: "图文拼贴",
    description: "标题置顶，产品固定右侧，左侧设置适用对象或问题图文拼贴区与两条核心卖点。",
    title: box(3, 3, 94, 13), product: box(56, 20, 40, 64),
    animal: box(3, 35, 46, 43, "rounded"),
    points: [box(4, 20, 44, 9, "rounded"), box(4, 80, 44, 7, "pill")],
    net: box(61, 82, 34, 7, "pill"), footer: box(0, 89, 100, 11, "rectangle"),
  },
  minimal: {
    label: "极简留白",
    description: "留白充足的极简商业版式，主标题和副标题在左，产品在右，仅保留两条重点卖点。",
    title: box(4, 19, 44, 16), subtitle: box(5, 37, 41, 8),
    product: box(52, 13, 44, 70),
    points: [box(5, 51, 40, 10, "pill"), box(5, 65, 40, 10, "pill")],
    net: box(57, 82, 38, 7, "pill"), footer: box(0, 89, 100, 11, "rectangle"),
  },
  bigTitle: {
    label: "超大标题主视觉",
    description: "顶部使用超大标题，产品占据右下主视觉，左侧保留单一大卖点和适用对象氛围图。",
    title: box(3, 2, 94, 21), product: box(54, 28, 43, 61),
    points: [box(4, 33, 44, 16, "rounded")], animal: box(4, 56, 43, 27),
    net: box(57, 82, 38, 7, "pill"), footer: box(0, 89, 100, 11, "rectangle"),
  },
  dualPanel: {
    label: "双区标签",
    description: "产品位于中央偏右，左侧主卖点列表与右上适用对象区域形成双信息板，底部设置宽通栏。",
    title: box(3, 3, 94, 12), product: box(43, 20, 39, 65),
    points: [box(3, 26, 35, 10, "rounded"), box(3, 40, 35, 10, "rounded"), box(3, 54, 35, 10, "rounded")],
    animal: box(80, 23, 19, 48, "rounded"), net: box(57, 82, 38, 7, "pill"), footer: box(0, 89, 100, 11, "rectangle"),
  },
  bottomGrid: {
    label: "底部对象分格",
    description: "顶部标题与右侧产品构成主体，下方设置横向适用对象或问题分格区，最底部为通栏。",
    title: box(3, 3, 94, 13), product: box(55, 18, 41, 57),
    points: [box(3, 25, 45, 10, "rounded"), box(3, 39, 45, 10, "rounded"), box(3, 53, 45, 10, "rounded")],
    animal: box(3, 68, 92, 17, "rounded"), net: box(60, 77, 35, 8, "pill"), footer: box(0, 89, 100, 11, "rectangle"),
  },
  stage: {
    label: "摄影棚展台",
    description: "暖色摄影棚或展台背景，产品置于右侧展台，左侧大标题与三条斜切卖点上下排列。",
    background: box(0, 0, 100, 89, "rectangle"), title: box(4, 23, 46, 15),
    product: box(53, 12, 43, 70),
    points: [box(6, 43, 40, 9, "parallelogram"), box(6, 55, 40, 9, "parallelogram"), box(6, 67, 40, 9, "parallelogram")],
    net: box(56, 82, 38, 7, "pill"), footer: box(0, 89, 100, 11, "rectangle"),
  },
};

const groupSpecs = {
  "百虫铩": [
    ["2403-1.png", "right3"], ["主图 (1) 拷贝.jpg", "symptomBoard"], ["2403-4.png", "right4"], ["3238-5.png", "splitCenter"], ["5786-4.png", "photoRight"],
  ],
  "百鸟康": [
    ["3785-1.png", "photoLeft"], ["3785-2.png", "cleanRight"], ["3785-5.png", "right3"], ["3785-4.png", "topBand"], ["3785-3.png", "symptomBoard"],
  ],
  "百温康": [
    ["0521 (1) 拷贝.jpg", "right3"], ["8768 拷贝6.png", "photoRight"], ["0521 (9) 拷贝.jpg", "right4"], ["5369-5.png", "bigTitle"], ["8768 拷贝3.png", "cleanRight"],
  ],
  "布并统治": [
    ["1.jpg", "right3"], ["9872-3.png", "symptomBoard"], ["4.jpg", "cleanRight"], ["9872-2.png", "right4"], ["9872-5.png", "minimal"],
  ],
  "肠安康": [
    ["001肠安康.png", "right3"], ["0519 (11) 拷贝.jpg", "photoLeft"], ["0519 (9) 拷贝.jpg", "symptomBoard"], ["5242-3.png", "right4"], ["3407-1.png", "minimal"],
  ],
  "喘立康": [
    ["4211-1.png", "photoRight"], ["4211-6.png", "right4"], ["4211-3.png", "symptomBoard"], ["4211-7.png", "collage"], ["4211-2.png", "cleanRight"],
  ],
  "杆舒": [
    ["01杆舒.png", "right3"], ["0606-4.png", "cleanRight"], ["金牧阳光 (2) 拷贝.jpg", "bottomGrid"], ["0606-9.png", "symptomBoard"], ["2134-4.png", "topBand"],
  ],
  "滑支康": [
    ["01滑支康.png", "right4"], ["22滑支康.png", "photoRight"], ["16滑支康.png", "cleanRight"], ["主图-02.png", "symptomBoard"], ["3_结果.png", "bigTitle"],
  ],
  "口蹄结节康": [
    ["01口蹄结节康.png", "right3"], ["05口蹄结节康.png", "cleanRight"], ["08口蹄结节康.png", "photoRight"], ["07口蹄结节康.png", "right4"], ["02口蹄结节康.png", "symptomBoard"],
  ],
  "瘤胃康肽": [
    ["5628-1.png", "right3"], ["主图03.png", "symptomBoard"], ["5628-4.png", "cleanRight"], ["主图05.png", "photoRight"], ["5628-8.png", "minimal"],
  ],
  "瘤胃康肽500g": [
    ["1.png", "right4"], ["22.png", "right3"], ["3.png", "photoRight"], ["58.jpg", "collage"], ["25.png", "bigTitle"],
  ],
  "卵炎康": [
    ["01卵炎康.png", "right3"], ["1839-6.png", "photoRight"], ["0510 (7) 拷贝.jpg", "cleanRight"], ["1839-8.png", "symptomBoard"], ["3330-5.png", "collage"],
  ],
  "猫狗全蟲净": [
    ["1.png", "right3"], ["7196-2 拷贝.png", "cleanRight"], ["4324 (6).png", "photoRight"], ["9016-3.jpg", "symptomBoard"], ["9016-4.jpg", "collage"],
  ],
  "全虫清": [
    ["01全虫清.png", "photoRight"], ["04全虫清.png", "photoLeft"], ["3807-5 拷贝.png", "bigTitle"], ["改鸽蟲清 (2).png", "symptomBoard"], ["3807-2.png", "cleanRight"],
  ],
  "全崇净": [
    ["2501全蟲净.png", "right3"], ["2546全蟲净.png", "symptomBoard"], ["2504全蟲净.png", "photoRight"], ["2542全蟲净.png", "cleanRight"], ["2509全蟲净.png", "right4"],
  ],
  "虱螨灵": [
    ["2601虱螨灵.png", "right3"], ["2605虱螨灵.png", "collage"], ["9326-2.png", "cleanRight"], ["虱螨灵-02.png", "photoRight"], ["虱螨灵-03.png", "minimal"],
  ],
  "速康99": [
    ["26052801速康99.png", "symptomBoard"], ["26052808速康99.png", "right4"], ["26052809速康99.png", "photoRight"], ["26052806速康99.png", "collage"], ["26052803速康99.png", "cleanRight"],
  ],
  "温役清": [
    ["0390-1.png", "symptomBoard"], ["3496-3.png", "cleanRight"], ["6239-4.png", "right3"], ["0522 (3) 拷贝.png", "photoRight"], ["0522 (4) 拷贝.jpg", "collage"],
  ],
  "腺胃好": [
    ["1120-1.png", "right3"], ["1120-2.png", "right4"], ["1120-6.png", "cleanRight"], ["1120-3.png", "symptomBoard"], ["1120-4.png", "minimal"],
  ],
  "诱食断奶宝": [
    ["1101-1.png", "right3"], ["6473-1.png", "photoRight"], ["1101-3.png", "cleanRight"], ["主图02.jpg", "symptomBoard"], ["6473-3.png", "collage"],
  ],
  "鱼蟲清": [
    ["01鱼蟲清.png", "right3"], ["主图07.jpg", "cleanRight"], ["主图06.jpg", "symptomBoard"], ["鱼蟲清.png", "photoRight"], ["主图04.jpg", "bigTitle"],
  ],
  "鱼菌清": [
    ["1_结果.png", "minimal"], ["5_结果.png", "right3"], ["4_结果.png", "cleanRight"], ["2_结果.png", "collage"], ["8133-3.png", "symptomBoard"],
  ],
  "藿香正气液": [
    ["0615-2.png", "right3"], ["0615-6.png", "cleanRight"], ["2480-3.png", "stage"], ["2480-1.png", "right4"], ["0683-5.png", "symptomBoard"],
  ],
};

function visualLayout(family) {
  const elements = {};
  if (family.background) elements.backgroundRegion1 = layer("backgroundRegion", "背景区域", "custom", family.background, 1);
  if (family.animal) elements.animalRegion1 = layer("animalRegion", "适用对象区域", "custom", family.animal, 2);
  elements.product = layer("product", "产品", "product1", family.product, 5);
  elements.title = layer("title", "主标题", "productName", family.title, 8);
  if (family.subtitle) elements.subtitle = layer("title", "副标题", "subtitle", family.subtitle, 8);
  family.points.forEach((point, index) => {
    elements[`point${index + 1}`] = layer(
      "sellingPoint",
      `卖点${index + 1}`,
      `point${index + 1}`,
      point,
      8,
      { copyRegion: point.y < 25 ? "顶部卖点" : point.y > 72 ? "底部卖点" : "侧栏卖点" },
    );
  });
  if (family.net) elements.net = layer("net", "净含量", "net", family.net, 9);
  elements.footer = layer("footer", "底栏", "footer", family.footer, 9);
  return { canvas: 1024, elements };
}

function special(group, reference) {
  return `来源图【参考图/${group}/${reference}】仅用于构图、配色、文字层级和区域比例核对；不得复制来源图中的旧包装、旧产品名、品牌、商标或未经提供的用量。背景动物与使用场景必须匹配当前产品的多分类标签。主体必须严格使用当前所选产品图。`;
}

for (const [group, specs] of Object.entries(groupSpecs)) {
  const folder = path.join(REFERENCE_ROOT, group);
  if (!fs.existsSync(folder)) throw new Error(`参考目录不存在：${folder}`);
  for (const [reference] of specs) {
    if (!fs.existsSync(path.join(folder, reference))) throw new Error(`参考图不存在：${group}/${reference}`);
  }
}

const state = await api("/api/state");
const existingNames = new Set(state.templates.map((template) => `${templateGroups(template).join("、")}\u001f${template.name}`));
const existingNumbers = new Set(state.templates.map((template) => Number(template.number)).filter(Number.isFinite));
let nextNumber = Math.max(0, ...existingNumbers) + 1;

function templateGroups(template) {
  return Array.isArray(template.groups) && template.groups.length ? template.groups : [template.group || "未分组"];
}

const newTemplates = [];
for (const [group, specs] of Object.entries(groupSpecs)) {
  specs.forEach(([reference, familyName], index) => {
    const family = families[familyName];
    const name = `${group}·${family.label}·${index + 1}`;
    if (existingNames.has(`${group}\u001f${name}`)) return;
    while (existingNumbers.has(nextNumber)) nextNumber += 1;
    const number = String(nextNumber).padStart(2, "0");
    existingNumbers.add(nextNumber);
    nextNumber += 1;
    newTemplates.push({
      enabled: false,
      number,
      name,
      group,
      groups: [group],
      layout: `${family.description} 来源图：${reference}`,
      subtitleSource: family.subtitle ? "副标题" : "无",
      points: family.points.length,
      bottomSource: "底栏文案",
      bottomStyle: family.footer.h >= 12 ? "加高单行" : "标准单行",
      special: special(group, reference),
      netPosition: family.net ? "产品附近" : "不显示",
      visualLayout: visualLayout(family),
    });
  });
}

if (newTemplates.length) {
  await api("/api/templates/save", {
    method: "POST",
    body: JSON.stringify({
      templates: [...state.templates, ...newTemplates],
      groups: [...new Set([...(state.templateGroups || []), ...Object.keys(groupSpecs)])],
    }),
  });
}

console.log(JSON.stringify({
  groupsAdded: Object.keys(groupSpecs),
  templatesAdded: newTemplates.length,
  templatesPerGroup: Object.fromEntries(Object.keys(groupSpecs).map((group) => [group, groupSpecs[group].length])),
  templateRange: newTemplates.length ? `${newTemplates[0].number}-${newTemplates.at(-1).number}` : null,
  referencesRepresented: Object.values(groupSpecs).reduce((sum, specs) => sum + specs.length, 0),
  sourceReferenceCount: Object.fromEntries(Object.keys(groupSpecs).map((group) => [
    group,
    fs.readdirSync(path.join(REFERENCE_ROOT, group)).filter((name) => /\.(?:png|jpe?g|webp)$/i.test(name)).length,
  ])),
}, null, 2));
