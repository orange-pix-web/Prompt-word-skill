/* Write a review document for the currently imported reference-layout candidates.
 * It is intentionally read-only for templates and prompts. */
import fs from "node:fs/promises";
import path from "node:path";

const DATA_ROOT = path.resolve(path.join(import.meta.dirname, "..", ".."));
const META_ROOT = path.join(DATA_ROOT, ".prompt-ui");
const analysis = JSON.parse(await fs.readFile(path.join(META_ROOT, "reference-layout-local-analysis.json"), "utf8"));
const response = await fetch("http://127.0.0.1:4178/api/state");
if (!response.ok) throw new Error(`无法读取工作台状态：${response.status}`);
const state = await response.json();
const byName = new Map(analysis.candidates.map((candidate, index) => [`参考图布局${String(index + 1).padStart(3, "0")}`, candidate]));

function summary(template) {
  const boxes = Object.values(template.visualLayout?.elements || {}).filter((box) => box?.visible !== false);
  const find = (type, binding = "") => boxes.find((box) => box.type === type && (!binding || box.binding === binding));
  const product = find("product");
  const title = find("title", "productName");
  const points = boxes.filter((box) => box.type === "sellingPoint").length;
  const footer = boxes.some((box) => box.type === "footer");
  const format = (box) => box ? `${box.x},${box.y},${box.w},${box.h}` : "无";
  return `产品(${format(product)})；标题(${format(title)})；${points}个卖点；${footer ? "含底栏" : "无底栏"}`;
}

const templates = [...state.templates].sort((a, b) => Number(a.number) - Number(b.number));
const lines = [
  "# 参考图模板布局文档", "",
  "生成时间：" + new Date().toLocaleString("zh-CN"), "",
  "本次以全部参考图为来源进行本地结构检测。候选模板默认停用；请在工作台预览后再启用。",
  "坐标为 1024×1024 逻辑画布中的百分比（X、Y、宽、高）。", "",
  "| 编号 | 模板 | 分组 | 图层布局摘要 | 代表参考图 |",
  "|---|---|---|---|---|",
];
for (const template of templates) {
  const candidate = byName.get(template.name);
  const source = candidate?.representative?.source || "已有模板";
  lines.push(`| ${template.number} | ${String(template.name).replaceAll("|", "／")} | ${(template.groups || []).join("、").replaceAll("|", "／")} | ${summary(template)} | ${source.replaceAll("|", "／")} |`);
}
lines.push("", "## 说明", "", "- 原参考图未删除；完全相同的二进制图片仅在检测统计中归为同一来源族。", "- 已清除旧的“自动空间分析”占位模板，保留手工模板和结构候选模板。", "- 后续从工作台“参考图分析”导入图片后，会显示：已存在、相近需确认、新布局候选或需视觉分析。", "");

const doc = path.join(META_ROOT, "参考图模板布局文档.md");
const report = path.join(META_ROOT, `参考图归集报告-${new Date().toISOString().slice(0, 10)}.json`);
const candidateTemplates = templates.filter((template) => byName.has(template.name));
const payload = {
  generatedAt: new Date().toISOString(),
  referenceScan: analysis.images,
  detectedCandidateFamilies: analysis.candidates.length,
  currentTemplates: templates.length,
  currentReferenceCandidateTemplates: candidateTemplates.length,
  enabledTemplates: templates.filter((template) => template.enabled).length,
  document: path.relative(DATA_ROOT, doc).replaceAll("\\", "/"),
  notes: ["候选模板均可在工作台编辑。", "新增参考图检测结果以视觉模型分析为高可信度；无视觉模型时会明确提示需人工确认。"],
};
await fs.writeFile(doc, `${lines.join("\n")}\n`, "utf8");
await fs.writeFile(report, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(JSON.stringify(payload, null, 2));
