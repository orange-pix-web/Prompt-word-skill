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
      const selectedPoints = copy.points.slice(0, template.points).map((point) => `【${point}】`).join("");
      lines.push(`卖点依次写${selectedPoints}，文字视觉高度约为副标题的80%，使用清晰醒目的粗体字。动物可以作为背景，卖点文字和底板放在动物图层上方；不得遮挡动物脸部、眼睛或产品包装。`);
    }
    if (template.visualLayout?.elements) {
      const names = {
        product: "产品", title: "主标题", subtitle: "副标题", point1: "卖点1",
        point2: "卖点2", point3: "卖点3", net: "净含量", footer: "底栏",
      };
      const positions = Object.entries(template.visualLayout.elements)
        .filter(([, box]) => box && box.visible !== false)
        .map(([key, box]) => `${names[key] || key}位于画面左侧${Math.round(box.x)}%、顶部${Math.round(box.y)}%，宽约${Math.round(box.w)}%、高约${Math.round(box.h)}%，图层${Number(box.z || 1)}`)
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

export function safeChildPath(root, relativePath) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("路径超出项目目录");
  }
  return resolved;
}
