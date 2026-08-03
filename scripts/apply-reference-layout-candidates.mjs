/* Import local reference-layout candidates, retire the old six-family placeholders,
 * exact-deduplicate final template geometry, clean historical prompt sources, and
 * write a human-readable template layout document. */
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const BASE_URL = process.env.PROMPT_STUDIO_URL || "http://127.0.0.1:4178";
const DATA_ROOT = path.resolve(process.env.PROMPT_DATA_ROOT || path.join(import.meta.dirname, "..", ".."));
const META_ROOT = path.join(DATA_ROOT, ".prompt-ui");
const PRODUCT_ROOT = path.join(DATA_ROOT, "产品图");
const ANALYSIS_FILE = path.join(META_ROOT, "reference-layout-local-analysis.json");
// Keep generated evidence with the workbench metadata.  Some Windows setups hold
// `主图模板配置` open in Explorer/Markdown preview, which prevents Node from
// atomically replacing a document there.
const TEMPLATE_DOC = path.join(META_ROOT, "参考图模板布局文档.md");

async function api(route, options = {}) {
  const response = await fetch(`${BASE_URL}${route}`, {
    headers: options.body ? { "content-type": "application/json; charset=utf-8" } : undefined,
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `请求失败：${response.status}`);
  return payload;
}

async function walk(folder) {
  const result = [];
  async function visit(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile()) result.push(target);
    }
  }
  if (fsSync.existsSync(folder)) await visit(folder);
  return result;
}

function relative(file) {
  return path.relative(DATA_ROOT, file).replaceAll("\\", "/");
}

function isLegacyPlaceholder(template) {
  return String(template.layout || "").includes("自动空间分析")
    || String(template.special || "").includes("自动去重后的参考布局候选");
}

function structuralSignature(template) {
  const elements = Object.values(template.visualLayout?.elements || {})
    .filter(Boolean)
    .map((box) => ({
      type: box.type || "", binding: box.binding || "", copyRegion: box.copyRegion || "",
      x: Number(box.x || 0), y: Number(box.y || 0), w: Number(box.w || 0), h: Number(box.h || 0),
      z: Number(box.z || 0), shape: box.shape || "none", visible: box.visible !== false,
      fontRatio: Number(box.fontRatio || 0.8), text: box.text || "",
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), "zh-CN"));
  return JSON.stringify({
    elements, points: Number(template.points || 0), subtitleSource: template.subtitleSource || "",
    bottomSource: template.bottomSource || "", bottomStyle: template.bottomStyle || "", netPosition: template.netPosition || "",
  });
}

function numberValue(template) {
  const value = Number(template.number);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function chooseCanonical(items) {
  return [...items].sort((a, b) => {
    const rankA = (a.enabled ? 0 : 10) + (a.fromReferenceDetection ? 1 : 0);
    const rankB = (b.enabled ? 0 : 10) + (b.fromReferenceDetection ? 1 : 0);
    return rankA - rankB || numberValue(a) - numberValue(b);
  })[0];
}

function ownProductName(fileName, productNames) {
  return productNames.find((name) => fileName.startsWith(`${name}-生图提示词`)) || "";
}

function cleanPrompt(text, ownName, names) {
  let result = String(text)
    .replace(/(?:构图|布局)参考\s*[【\[][^】\]]+[】\]]\s*[；。]?\s*/g, "")
    .replace(/(?:参考来源|来源图|参考图)\s*[：:]\s*(?:参考图[\\/])?[^。；\n]*(?:[。；]|\n|$)/g, "")
    .replace(/(主体必须替换为(?:本次)?上传的)【[^】]+】产品图/g, `$1【${ownName}】产品图`)
    .replace(/(主体必须使用上传的)【[^】]+】产品图/g, `$1【${ownName}】产品图`);
  for (const name of names) if (name !== ownName && name.length >= 2) result = result.replaceAll(name, ownName);
  return result;
}

function visualSummary(template) {
  const elements = Object.values(template.visualLayout?.elements || {}).filter((box) => box?.visible !== false);
  const counts = Object.groupBy(elements, (box) => box.type || "其他");
  const product = elements.find((box) => box.type === "product");
  const title = elements.find((box) => box.type === "title" && box.binding === "productName");
  const pointCount = (counts.sellingPoint || []).length;
  const brief = [];
  if (product) brief.push(`产品 ${product.x},${product.y},${product.w},${product.h}`);
  if (title) brief.push(`标题 ${title.x},${title.y},${title.w},${title.h}`);
  brief.push(`${pointCount} 个卖点`);
  if (counts.footer?.length) brief.push("含底栏");
  return brief.join("；");
}

function layoutDocument(templates, candidatesByNumber, candidatesByName) {
  const lines = [
    "# 参考图模板布局文档",
    "",
    "本文件由工作台的参考图结构检测生成。模板均为 1024×1024 逻辑画布；坐标依次为 X、Y、宽、高百分比。",
    "新增模板默认停用，启用前请在工作台预览并按需要调整图层。",
    "",
    "| 编号 | 模板 | 分组 | 图层布局摘要 | 参考图代表来源 |",
    "|---|---|---|---|---|",
  ];
  for (const template of templates) {
    const candidate = candidatesByNumber.get(template.number) || candidatesByName.get(template.name);
    const source = candidate?.representative?.source || "已有模板";
    lines.push(`| ${template.number} | ${template.name.replaceAll("|", "／")} | ${(template.groups || []).join("、").replaceAll("|", "／")} | ${visualSummary(template)} | ${source.replaceAll("|", "／")} |`);
  }
  lines.push("", "## 说明", "", "- 参考图原文件没有删除；二进制完全重复图只在分析中归为同一来源族。", "- 结构完全一致的模板只保留一套，所有相关产品/分类分组会一并挂到保留模板。", "- 后续新增参考图请使用工作台“参考图分析”，系统会比较图层指纹并提示：已存在、相近需确认或新布局候选。", "");
  return lines.join("\n");
}

async function copyBackup(source, backupRoot) {
  if (!fsSync.existsSync(source)) return;
  const target = path.join(backupRoot, relative(source));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

const [analysis, state] = await Promise.all([
  JSON.parse(await fs.readFile(ANALYSIS_FILE, "utf8")),
  api("/api/state"),
]);
const productNames = [...new Set(state.products.map((product) => String(product.name || "").trim()).filter(Boolean))]
  .sort((a, b) => b.length - a.length || a.localeCompare(b, "zh-CN"));
const legacy = state.templates.filter(isLegacyPlaceholder);
const retained = state.templates.filter((template) => !isLegacyPlaceholder(template));
let nextNumber = Math.max(0, ...state.templates.map(numberValue).filter(Number.isFinite)) + 1;
const candidateMeta = new Map();
const imported = analysis.candidates.map((candidate, index) => {
  const number = String(nextNumber++);
  const template = {
    ...candidate.template,
    number,
    name: `参考图布局${String(index + 1).padStart(3, "0")}`,
    groups: candidate.groups.length ? candidate.groups : ["未分组"],
    group: candidate.groups[0] || "未分组",
    fromReferenceDetection: true,
  };
  candidateMeta.set(number, candidate);
  return template;
});

const families = new Map();
for (const template of [...retained, ...imported]) {
  const signature = structuralSignature(template);
  if (!families.has(signature)) families.set(signature, []);
  families.get(signature).push(template);
}
const finalTemplates = [];
const deduplicated = [];
for (const items of families.values()) {
  const keep = chooseCanonical(items);
  const groups = [...new Set(items.flatMap((item) => item.groups || [item.group]).map(String).filter(Boolean))];
  finalTemplates.push({ ...keep, groups, group: groups[0] || "未分组" });
  if (items.length > 1) deduplicated.push({ keep: keep.number, removed: items.filter((item) => item.number !== keep.number).map((item) => item.number), groups });
}
finalTemplates.sort((a, b) => numberValue(a) - numberValue(b));
const finalCandidateMeta = new Map([...candidateMeta].filter(([number]) => finalTemplates.some((template) => template.number === number)));
const candidateMetaByName = new Map(analysis.candidates.map((candidate, index) => [
  `参考图布局${String(index + 1).padStart(3, "0")}`,
  candidate,
]));

const promptFiles = (await walk(PRODUCT_ROOT)).filter((file) => /生图提示词.*\.md$/i.test(path.basename(file)));
const promptChanges = [];
for (const file of promptFiles) {
  const own = ownProductName(path.basename(file), productNames);
  if (!own) continue;
  const before = await fs.readFile(file, "utf8");
  const after = cleanPrompt(before, own, productNames);
  if (before !== after) promptChanges.push({ file, product: own, before, after });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.join(META_ROOT, "backups", `reference-layout-rebuild-${timestamp}`);
const report = {
  generatedAt: new Date().toISOString(), mode: APPLY ? "applied" : "preview",
  analysis: { images: analysis.images, candidateLayouts: analysis.candidates.length },
  templates: {
    before: state.templates.length, removedLegacyPlaceholders: legacy.length, importedCandidates: imported.length,
    afterExactDeduplication: finalTemplates.length, exactDuplicateFamilies: deduplicated.length, deduplicated,
  },
  prompts: { scanned: promptFiles.length, cleaned: promptChanges.map(({ file, product }) => ({ file: relative(file), product })) },
};

if (APPLY) {
  await fs.mkdir(backupRoot, { recursive: true });
  await Promise.all([
    copyBackup(path.join(DATA_ROOT, "主图模板配置", "主图模板配置.md"), backupRoot),
    copyBackup(path.join(META_ROOT, "template-layouts.json"), backupRoot),
    copyBackup(path.join(META_ROOT, "template-groups.json"), backupRoot),
    copyBackup(TEMPLATE_DOC, backupRoot),
  ]);
  for (const item of promptChanges) await copyBackup(item.file, backupRoot);
  await api("/api/templates/save", {
    method: "POST",
    body: JSON.stringify({ templates: finalTemplates, groups: [...new Set(finalTemplates.flatMap((template) => template.groups))] }),
  });
  for (const item of promptChanges) await fs.writeFile(item.file, item.after, "utf8");
  await fs.writeFile(TEMPLATE_DOC, layoutDocument(finalTemplates, finalCandidateMeta, candidateMetaByName), "utf8");
  report.backup = relative(backupRoot);
  report.layoutDocument = relative(TEMPLATE_DOC);
  report.candidateSources = Object.fromEntries([...finalCandidateMeta].map(([number, candidate]) => [number, {
    signature: candidate.signature, representative: candidate.representative, sources: candidate.sources,
  }]));
  await fs.writeFile(path.join(META_ROOT, `reference-layout-rebuild-${timestamp}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify({
  mode: report.mode, images: report.analysis.images, candidateLayouts: report.analysis.candidateLayouts,
  templates: { before: report.templates.before, legacyRemoved: report.templates.removedLegacyPlaceholders, imported: report.templates.importedCandidates, after: report.templates.afterExactDeduplication },
  prompts: { scanned: report.prompts.scanned, cleaned: report.prompts.cleaned.length }, backup: report.backup || null,
}, null, 2));
