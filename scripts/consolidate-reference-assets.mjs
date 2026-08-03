/*
 * 参考图模板归集工具
 *
 * 默认只输出预览统计；传入 --apply 才会：
 * 1. 将图层结构完全一致的模板归并为一个模板，并合并所有分组；
 * 2. 备份模板配置和会被改写的历史提示词；
 * 3. 清理历史提示词中的参考图来源、构图参考文件名和外来产品名；
 * 4. 输出可追溯的归集报告。
 *
 * 不删除任何原始参考图或产品图。
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const BASE_URL = process.env.PROMPT_STUDIO_URL || "http://127.0.0.1:4178";
const DATA_ROOT = path.resolve(process.env.PROMPT_DATA_ROOT || path.join(import.meta.dirname, "..", ".."));
const REFERENCE_ROOT = path.join(DATA_ROOT, "参考图");
const PRODUCT_ROOT = path.join(DATA_ROOT, "产品图");
const META_ROOT = path.join(DATA_ROOT, ".prompt-ui");
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

function isAutoTemplate(template) {
  return String(template.layout || "").includes("自动空间分析")
    || String(template.special || "").includes("自动去重后的参考布局候选");
}

function templateSignature(template) {
  const elements = Object.values(template.visualLayout?.elements || {})
    .filter(Boolean)
    .map((box) => ({
      type: box.type || "",
      binding: box.binding || "",
      copyRegion: box.copyRegion || "",
      x: Number(box.x || 0), y: Number(box.y || 0), w: Number(box.w || 0), h: Number(box.h || 0),
      z: Number(box.z || 0), shape: box.shape || "none", visible: box.visible !== false,
      fontRatio: Number(box.fontRatio || 0.8), text: box.text || "",
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), "zh-CN"));
  return JSON.stringify({
    elements,
    points: Number(template.points || 0),
    subtitleSource: template.subtitleSource || "",
    bottomSource: template.bottomSource || "",
    bottomStyle: template.bottomStyle || "",
    netPosition: template.netPosition || "",
  });
}

function numericTemplateNumber(template) {
  const value = Number(template.number);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function chooseCanonical(templates) {
  return [...templates].sort((a, b) => {
    const rankA = (a.enabled ? 0 : 10) + (isAutoTemplate(a) ? 1 : 0);
    const rankB = (b.enabled ? 0 : 10) + (isAutoTemplate(b) ? 1 : 0);
    return rankA - rankB || numericTemplateNumber(a) - numericTemplateNumber(b);
  })[0];
}

function sourceHints(template) {
  const text = `${template.layout || ""}\n${template.special || ""}`;
  return [...text.matchAll(/(?:参考来源|来源图|参考图)\s*[：:]\s*([^。；\n]+)/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
}

function cleanTemplateText(value, knownProducts) {
  let text = String(value || "")
    .replace(/(?:参考来源|来源图|参考图)\s*[：:]\s*(?:参考图[\\/])?[^。；\n]*(?:[。；]|\n|$)/g, "")
    .replace(/(?:构图|布局)参考\s*[【\[][^】\]]+[】\]]\s*[；。]?\s*/g, "")
    .replace(/不得复制来源图中的/g, "不得复制模板原图中的")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s；，、]+|[\s；，、]+$/g, "")
    .trim();
  for (const name of knownProducts) {
    if (name.length >= 2) text = text.replaceAll(name, "当前所选产品");
  }
  return text || "仅继承模板的图层关系、构图比例、文字层级和安全边距。";
}

function ownProductName(fileName, productNames) {
  return productNames.find((name) => fileName.startsWith(`${name}-生图提示词`)) || "";
}

function cleanPrompt(text, ownName, knownProducts) {
  let result = String(text)
    .replace(/(?:构图|布局)参考\s*[【\[][^】\]]+[】\]]\s*[；。]?\s*/g, "")
    .replace(/(?:参考来源|来源图|参考图)\s*[：:]\s*(?:参考图[\\/])?[^。；\n]*(?:[。；]|\n|$)/g, "")
    .replace(/(主体必须替换为(?:本次)?上传的)【[^】]+】产品图/g, `$1【${ownName}】产品图`)
    .replace(/(主体必须使用上传的)【[^】]+】产品图/g, `$1【${ownName}】产品图`);
  for (const name of knownProducts) {
    if (name !== ownName && name.length >= 2) result = result.replaceAll(name, ownName);
  }
  return result;
}

async function auditReferenceImages() {
  const files = (await walk(REFERENCE_ROOT)).filter((file) => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const hashes = new Map();
  for (const file of files) {
    const digest = crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
    if (!hashes.has(digest)) hashes.set(digest, []);
    hashes.get(digest).push(relative(file));
  }
  const exactDuplicates = [...hashes.values()].filter((items) => items.length > 1);
  return {
    totalImages: files.length,
    uniqueBinaryImages: hashes.size,
    exactDuplicateFamilies: exactDuplicates.length,
    exactDuplicateFiles: exactDuplicates.reduce((total, filesInFamily) => total + filesInFamily.length, 0),
    examples: exactDuplicates.slice(0, 20),
  };
}

async function copyBackup(source, backupRoot) {
  if (!fsSync.existsSync(source)) return;
  const target = path.join(backupRoot, relative(source));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

const state = await api("/api/state");
const knownProducts = [...new Set(state.products.map((product) => String(product.name || "").trim()).filter(Boolean))]
  .sort((a, b) => b.length - a.length || a.localeCompare(b, "zh-CN"));

const families = new Map();
for (const template of state.templates) {
  const signature = templateSignature(template);
  if (!families.has(signature)) families.set(signature, []);
  families.get(signature).push(template);
}
const duplicateFamilies = [...families.values()].filter((items) => items.length > 1);
const canonicalByNumber = new Map();
const mergedTemplates = [];
const consolidation = [];
for (const items of families.values()) {
  const canonical = chooseCanonical(items);
  const groups = [...new Set(items.flatMap((item) => item.groups || [item.group]).map(String).filter(Boolean))];
  const sourceReferences = [...new Set(items.flatMap(sourceHints))];
  const normalized = {
    ...canonical,
    groups,
    group: groups[0] || "未分组",
    layout: cleanTemplateText(canonical.layout, knownProducts),
    special: cleanTemplateText(canonical.special, knownProducts),
  };
  mergedTemplates.push(normalized);
  for (const item of items) canonicalByNumber.set(item.number, canonical.number);
  if (items.length > 1) {
    consolidation.push({
      keep: canonical.number,
      removed: items.filter((item) => item.number !== canonical.number).map((item) => item.number),
      groups,
      sourceReferences,
    });
  }
}
mergedTemplates.sort((a, b) => numericTemplateNumber(a) - numericTemplateNumber(b));

const promptFiles = (await walk(PRODUCT_ROOT)).filter((file) => /生图提示词.*\.md$/i.test(path.basename(file)));
const promptChanges = [];
for (const file of promptFiles) {
  const ownName = ownProductName(path.basename(file), knownProducts);
  if (!ownName) continue;
  const before = await fs.readFile(file, "utf8");
  const after = cleanPrompt(before, ownName, knownProducts);
  if (after !== before) promptChanges.push({ file, product: ownName, before, after });
}

const referenceAudit = await auditReferenceImages();
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.join(META_ROOT, "backups", `reference-consolidation-${timestamp}`);
const report = {
  generatedAt: new Date().toISOString(),
  mode: APPLY ? "applied" : "preview",
  referenceAudit,
  templates: {
    before: state.templates.length,
    after: mergedTemplates.length,
    duplicateFamilies: duplicateFamilies.length,
    removed: state.templates.length - mergedTemplates.length,
    consolidation,
  },
  prompts: {
    scanned: promptFiles.length,
    cleaned: promptChanges.map(({ file, product }) => ({ file: relative(file), product })),
  },
};

if (APPLY) {
  await fs.mkdir(backupRoot, { recursive: true });
  await Promise.all([
    copyBackup(path.join(DATA_ROOT, "主图模板配置", "主图模板配置.md"), backupRoot),
    copyBackup(path.join(META_ROOT, "template-layouts.json"), backupRoot),
    copyBackup(path.join(META_ROOT, "template-groups.json"), backupRoot),
  ]);
  for (const item of promptChanges) await copyBackup(item.file, backupRoot);
  await api("/api/templates/save", {
    method: "POST",
    body: JSON.stringify({
      templates: mergedTemplates,
      groups: [...new Set(mergedTemplates.flatMap((template) => template.groups))],
    }),
  });
  for (const item of promptChanges) await fs.writeFile(item.file, item.after, "utf8");
  report.backup = relative(backupRoot);
  report.templateNumberMap = Object.fromEntries(canonicalByNumber);
  await fs.writeFile(path.join(META_ROOT, `reference-consolidation-${timestamp}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify({
  mode: report.mode,
  referenceAudit: report.referenceAudit,
  templates: { before: report.templates.before, after: report.templates.after, removed: report.templates.removed },
  prompts: { scanned: report.prompts.scanned, cleaned: report.prompts.cleaned.length },
  backup: report.backup || null,
}, null, 2));
