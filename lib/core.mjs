import fs from "node:fs/promises";
import path from "node:path";

export const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

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
    special: cells[8],
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
    if (box.type !== "product" && box.fontRatio == null) box.fontRatio = 0.8;
  }
  return result;
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
  return `${label}位于画面左侧${Math.round(box.x)}%、顶部${Math.round(box.y)}%，宽约${Math.round(box.w)}%、高约${Math.round(box.h)}%，图层${Number(box.z || 1)}${shape}${ratio}${content}`;
}

export function generatePromptMarkdown({ product, templates, marketingRows }) {
  const { name, imageName, category, net, form } = product;
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
    "只能使用各提示词中明确列出的文字。不得出现无关品牌、水印、二维码、价格、销量、赠品、认证、疗效保证、疾病治疗词、错别字、乱码、重复字或残缺字。",
    "",
  ];

  for (const entry of entries) {
    const { template, copy, subtitle, bottom } = entry;
    lines.push("---", "", `# 提示词${template.number}｜${template.name}布局`, "");
    lines.push(`真实商业摄影风格，高清中文电商主图，正方形1:1比例。${template.layout}`);
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
    if (template.special && template.special !== "无") lines.push(template.special);
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
  return lines.join("\n");
}

export function generateCombinedPromptMarkdown({ products, templates, marketingByCategory }) {
  if (!products.length) throw new Error("请至少选择一个产品");
  const productNames = products.map((product) => `【${product.name}】`).join("、");
  const imageNames = products.map((product) => `【${product.imageName}】`).join("、");
  const lines = [
    `# 多产品组合主图｜${products.map((product) => product.name).join("＋")}`,
    "",
    "```text",
    `请使用我同时上传的产品图${imageNames}，生成${templates.length}张1:1、1024×1024中文电商组合主图。`,
    `同一张图中必须同时出现${productNames}，每个产品都严格保持原包装、品牌、颜色、名称和净含量，不得互相替换、融合或重复。`,
    "多个产品分别作为独立前景图层，按照模板中的产品占位框从产品1开始依次放置；占位框不足时，在相邻安全区域等比例补充排列。",
    "",
  ];
  for (const template of templates) {
    const rows = marketingByCategory.get(products[0].category);
    const copy = rows?.get(template.number);
    lines.push("---", "", `# 模板${template.number}｜${template.name}`, "", template.layout);
    if (copy) {
      const marketingPoints = copy.points.slice(0, Math.max(0, template.points || 0)).filter(Boolean).map((item) => `【${item}】`);
      if (marketingPoints.length) lines.push(`默认营销卖点依次写${marketingPoints.join("")}。`);
      const targetRules = copy.points.slice(0, Math.max(0, template.points || 0)).map((point, index) => {
        if (!point) return null;
        const targets = copy.pointTargets?.[index] || ["all"];
        if (targets.includes("all")) return `【${point}】用于全部产品`;
        const names = targets.map((target) => {
          const slot = Number(String(target).replace("product", "")) - 1;
          return products[slot]?.name ? `产品${slot + 1}【${products[slot].name}】` : target;
        });
        return `【${point}】绑定${names.join("、")}`;
      }).filter(Boolean);
      if (targetRules.length) lines.push(`卖点与产品对应关系：${targetRules.join("；")}。`);
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
  return lines.join("\n");
}

export function safeChildPath(root, relativePath) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("路径超出项目目录");
  }
  return resolved;
}
