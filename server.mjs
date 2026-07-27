import http from "node:http";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  IMAGE_EXTENSIONS,
  generateCombinedPromptMarkdown,
  generatePromptMarkdown,
  latestPromptVersion,
  nextPromptPath,
  normalizeTemplateVisualLayout,
  parseMarketing,
  parseMarketingExtras,
  mergeMarketingExtras,
  parseProductFacts,
  parseTemplates,
  parseProductMarketing,
  referenceJsonToTemplate,
  resolveProductMarketing,
  safeChildPath,
  serializeTemplates,
  serializeMarketing,
  serializeMarketingExtras,
  serializeProductMarketing,
} from "./lib/core.mjs";

const APP_ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = path.resolve(process.env.PROMPT_DATA_ROOT || path.join(APP_ROOT, ".."));
const PRODUCT_ROOT = path.join(DATA_ROOT, "产品图");
const PRODUCT_STYLE_ROOT = path.join(PRODUCT_ROOT, "产品模板");
const TEMPLATE_FILE = path.join(DATA_ROOT, "主图模板配置", "主图模板配置.md");
const MARKETING_FILE = path.join(DATA_ROOT, "营销文案", "主图模板营销词配置.md");
const MARKETING_EXTRAS_FILE = path.join(DATA_ROOT, "营销文案", "扩展营销卖点配置.md");
const PRODUCT_MARKETING_FILE = path.join(DATA_ROOT, "营销文案", "产品营销词配置.md");
const SCRIPT_FILE = path.join(DATA_ROOT, "生成全部产品提示词.ps1");
const META_ROOT = path.join(DATA_ROOT, ".prompt-ui");
const META_FILE = path.join(META_ROOT, "products.json");
const LAYOUT_FILE = path.join(META_ROOT, "template-layouts.json");
const RECYCLE_FILE = path.join(META_ROOT, "recycle-bin.json");
const BACKUP_ROOT = path.join(META_ROOT, "backups");
const REFERENCE_ROOT = path.join(DATA_ROOT, "参考图", "待分析");
const PUBLIC_ROOT = path.join(APP_ROOT, "public");
const PORT = Number(process.env.PORT || 4178);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".md": "text/markdown; charset=utf-8",
};

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function saveMeta(meta) {
  await fs.mkdir(META_ROOT, { recursive: true });
  await fs.writeFile(META_FILE, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
}

async function backupFile(file, label) {
  if (!fsSync.existsSync(file)) return;
  await fs.mkdir(BACKUP_ROOT, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  await fs.copyFile(file, path.join(BACKUP_ROOT, `${stamp}-${label}.bak`));
}

async function readRecycleBin() {
  const entries = await readJson(RECYCLE_FILE, []);
  const now = Date.now();
  const active = Array.isArray(entries) ? entries.filter((item) => Date.parse(item.expiresAt) > now) : [];
  if (active.length !== entries.length) {
    await fs.mkdir(META_ROOT, { recursive: true });
    await fs.writeFile(RECYCLE_FILE, `${JSON.stringify(active, null, 2)}\n`, "utf8");
  }
  return active;
}

async function addRecycleItems(items) {
  if (!items.length) return;
  const entries = await readRecycleBin();
  const deletedAt = new Date();
  const expiresAt = new Date(deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  entries.unshift(...items.map((item) => ({
    id: randomUUID(),
    deletedAt: deletedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ...item,
  })));
  await fs.mkdir(META_ROOT, { recursive: true });
  await fs.writeFile(RECYCLE_FILE, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

async function loadState() {
  const [templateText, marketingText, marketingExtrasText, productMarketingText, scriptText, meta, layouts, recycleBin] = await Promise.all([
    fs.readFile(TEMPLATE_FILE, "utf8"),
    fs.readFile(MARKETING_FILE, "utf8"),
    fs.readFile(MARKETING_EXTRAS_FILE, "utf8").catch(() => ""),
    fs.readFile(PRODUCT_MARKETING_FILE, "utf8").catch(() => ""),
    fs.readFile(SCRIPT_FILE, "utf8"),
    readJson(META_FILE, { products: {} }),
    readJson(LAYOUT_FILE, {}),
    readRecycleBin(),
  ]);
  const templates = parseTemplates(templateText).map((template) => ({
    ...template,
    visualLayout: normalizeTemplateVisualLayout(layouts[template.number], template.number, template.points),
  }));
  const marketing = mergeMarketingExtras(parseMarketing(marketingText), parseMarketingExtras(marketingExtrasText));
  const productMarketingEntries = parseProductMarketing(productMarketingText);
  const facts = parseProductFacts(scriptText);
  const categoryEntries = (await fs.readdir(PRODUCT_ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name !== "产品模板");
  const styleEntries = await fs.readdir(PRODUCT_STYLE_ROOT, { withFileTypes: true }).catch(() => []);
  const productStyles = await Promise.all(styleEntries
    .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map(async (entry) => {
      const stats = await fs.stat(path.join(PRODUCT_STYLE_ROOT, entry.name));
      return {
        name: path.basename(entry.name, path.extname(entry.name)),
        fileName: entry.name,
        imagePath: path.relative(DATA_ROOT, path.join(PRODUCT_STYLE_ROOT, entry.name)).replaceAll("\\", "/"),
        kind: /牧德旺|logo|商标/i.test(entry.name) ? "logo" : "package",
        size: stats.size,
      };
    }));
  const products = [];
  for (const categoryEntry of categoryEntries) {
    const categoryPath = path.join(PRODUCT_ROOT, categoryEntry.name);
    const files = await fs.readdir(categoryPath);
    for (const imageName of files.filter((name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()))) {
      const name = path.basename(imageName, path.extname(imageName)).trim();
      const stats = await fs.stat(path.join(categoryPath, imageName));
      const latest = latestPromptVersion(files, name);
      const fact = meta.products[name] || facts.get(name) || { net: "待填写", form: "other", tags: [] };
      products.push({
        name,
        category: categoryEntry.name,
        imageName,
        imagePath: path.relative(DATA_ROOT, path.join(categoryPath, imageName)).replaceAll("\\", "/"),
        size: stats.size,
        net: fact.net || "待填写",
        form: fact.form || "other",
        tags: fact.tags || [],
        latestPrompt: latest?.name || null,
        promptVersion: latest?.version || 0,
      });
    }
  }
  products.sort((a, b) => a.category.localeCompare(b.category, "zh-CN") || a.name.localeCompare(b.name, "zh-CN"));
  return {
    dataRoot: DATA_ROOT,
    categories: categoryEntries.map((entry) => entry.name).sort((a, b) => a.localeCompare(b, "zh-CN")),
    products,
    templates,
    productStyles,
    productMarketingEntries,
    recycleBin,
    marketingCoverage: Object.fromEntries([...marketing].map(([group, rows]) => [group, rows.size])),
    marketingRows: [...marketing].flatMap(([category, rows]) => [...rows].map(([number, copy]) => ({
      category, number, subtitle: copy.subtitle, support: copy.support, points: copy.points, footer: copy.footer,
    }))),
    aiAnalysisAvailable: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_VISION_MODEL),
  };
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": MIME[".json"], "cache-control": "no-store" });
  response.end(JSON.stringify(payload));
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 30 * 1024 * 1024) throw new Error("请求内容超过30MB");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function decodeDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || "");
  if (!match) throw new Error("图片数据格式无效");
  return { mime: match[1], buffer: Buffer.from(match[2], "base64") };
}

async function apiCreateCategory(body) {
  const name = String(body.name || "").trim();
  if (!name || /[\\/:*?"<>|]/.test(name)) throw new Error("分类名称无效");
  const target = safeChildPath(PRODUCT_ROOT, name);
  await fs.mkdir(target, { recursive: false });
  return { ok: true };
}

async function apiAddProduct(body) {
  const name = String(body.name || "").trim();
  const category = String(body.category || "").trim();
  if (!name || !category || /[\\/:*?"<>|]/.test(name)) throw new Error("产品名称或分类无效");
  const extension = path.extname(body.fileName || "").toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) throw new Error("只支持PNG、JPG、JPEG或WEBP");
  const { buffer } = decodeDataUrl(body.dataUrl);
  if (buffer.length > 20 * 1024 * 1024) throw new Error("图片不能超过20MB");
  const categoryPath = safeChildPath(PRODUCT_ROOT, category);
  await fs.mkdir(categoryPath, { recursive: true });
  const target = path.join(categoryPath, `${name}${extension}`);
  if (fsSync.existsSync(target)) throw new Error("同名产品图片已经存在");
  await fs.writeFile(target, buffer);
  const meta = await readJson(META_FILE, { products: {} });
  meta.products[name] = { net: body.net || "待填写", form: body.form || "other", tags: body.tags || [] };
  await saveMeta(meta);
  return { ok: true };
}

async function apiMoveProduct(body) {
  const name = String(body.name || "");
  const targetCategory = String(body.category || "");
  const state = await loadState();
  const product = state.products.find((item) => item.name === name);
  if (!product) throw new Error("找不到产品");
  if (!state.categories.includes(targetCategory)) throw new Error("目标分类不存在");
  if (product.category === targetCategory) return { ok: true };
  const sourceFolder = path.join(PRODUCT_ROOT, product.category);
  const targetFolder = path.join(PRODUCT_ROOT, targetCategory);
  const files = await fs.readdir(sourceFolder);
  const related = files.filter((file) => file === product.imageName || file.startsWith(`${name}-生图提示词`));
  for (const file of related) {
    const target = path.join(targetFolder, file);
    if (fsSync.existsSync(target)) throw new Error(`目标分类已有同名文件：${file}`);
  }
  for (const file of related) {
    await fs.rename(path.join(sourceFolder, file), path.join(targetFolder, file));
  }
  return { ok: true, moved: related.length };
}

async function apiSaveTags(body) {
  const meta = await readJson(META_FILE, { products: {} });
  const current = meta.products[body.name] || {};
  meta.products[body.name] = {
    ...current,
    net: body.net || current.net || "待填写",
    form: body.form || current.form || "other",
    tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
  };
  await saveMeta(meta);
  return { ok: true };
}

async function apiSaveTemplates(body) {
  if (!Array.isArray(body.templates)) throw new Error("模板数据无效");
  const numbers = new Set();
  for (const template of body.templates) {
    if (!/^\d{2}$/.test(template.number)) throw new Error("模板编号必须是两位数字");
    if (numbers.has(template.number)) throw new Error(`模板编号重复：${template.number}`);
    numbers.add(template.number);
    if (String(template.layout).includes("|")) throw new Error("模板内容不能使用英文竖线");
  }
  await backupFile(TEMPLATE_FILE, "主图模板配置.md");
  await backupFile(LAYOUT_FILE, "template-layouts.json");
  await fs.writeFile(TEMPLATE_FILE, serializeTemplates(body.templates), "utf8");
  await fs.mkdir(META_ROOT, { recursive: true });
  const layouts = Object.fromEntries(body.templates
    .filter((template) => template.visualLayout)
    .map((template) => [template.number, template.visualLayout]));
  await fs.writeFile(LAYOUT_FILE, `${JSON.stringify(layouts, null, 2)}\n`, "utf8");
  const deletedElements = Array.isArray(body.deletedElements) ? body.deletedElements : [];
  await addRecycleItems(deletedElements.map((item) => ({
    type: "template-element",
    label: `模板${item.templateNumber}｜${item.box?.label || item.key}`,
    data: item,
  })));
  return { ok: true };
}

async function apiSaveMarketing(body) {
  if (!Array.isArray(body.rows)) throw new Error("营销文案数据无效");
  const knownCategories = new Set((await fs.readdir(PRODUCT_ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name !== "产品模板").map((entry) => entry.name));
  const knownTemplates = new Set(parseTemplates(await fs.readFile(TEMPLATE_FILE, "utf8")).map((item) => item.number));
  const seen = new Set();
  for (const row of body.rows) {
    if (!knownCategories.has(row.category)) throw new Error(`未知分类：${row.category}`);
    if (!knownTemplates.has(row.number)) throw new Error(`未知模板：${row.number}`);
    const key = `${row.category}\0${row.number}`;
    if (seen.has(key)) throw new Error(`营销文案重复：${row.category} / ${row.number}`);
    seen.add(key);
    if (!Array.isArray(row.points)) throw new Error("卖点列表无效");
    if ([row.subtitle, row.support, row.footer, ...row.points].some((item) => String(item ?? "").includes("|"))) {
      throw new Error("营销文案不能使用英文半角竖线");
    }
  }
  await fs.writeFile(MARKETING_FILE, serializeMarketing(body.rows), "utf8");
  await fs.writeFile(MARKETING_EXTRAS_FILE, serializeMarketingExtras(body.rows), "utf8");
  return { ok: true };
}

async function apiSaveProductMarketing(body) {
  if (!Array.isArray(body.entries)) throw new Error("产品营销词数据无效");
  const state = await loadState();
  const productNames = new Set(state.products.map((item) => item.name));
  const categories = new Set(state.categories);
  const validScopes = new Set(["global", "category", "product"]);
  const validRegions = new Set(["顶部卖点", "侧栏卖点", "底部卖点", "副标题", "辅助文案", "底栏文案", "不限位置"]);
  for (const entry of body.entries) {
    if (!validScopes.has(entry.scope)) throw new Error("营销词作用范围无效");
    if (!validRegions.has(entry.region)) throw new Error(`未知位置类型：${entry.region}`);
    if (!String(entry.text || "").trim()) throw new Error("营销文案不能为空");
    if (String(entry.text).includes("|")) throw new Error("营销文案不能使用英文半角竖线");
    if (entry.scope === "category" && !categories.has(entry.category)) throw new Error(`未知分类：${entry.category}`);
    if (entry.scope === "product" && !productNames.has(entry.product)) throw new Error(`未知产品：${entry.product}`);
  }
  await backupFile(PRODUCT_MARKETING_FILE, "产品营销词配置.md");
  await fs.writeFile(PRODUCT_MARKETING_FILE, serializeProductMarketing(body.entries), "utf8");
  const deletedEntries = Array.isArray(body.deletedEntries) ? body.deletedEntries : [];
  await addRecycleItems(deletedEntries.map((entry) => ({
    type: "marketing-copy",
    label: `营销词｜${entry.text}`,
    data: { entry },
  })));
  return { ok: true };
}

async function apiRestoreRecycle(body) {
  const entries = await readRecycleBin();
  const item = entries.find((entry) => entry.id === body.id);
  if (!item) throw new Error("回收站项目不存在或已过期");
  if (item.type === "marketing-copy") {
    const current = parseProductMarketing(await fs.readFile(PRODUCT_MARKETING_FILE, "utf8").catch(() => ""));
    const restored = item.data?.entry;
    if (!restored) throw new Error("回收站营销词数据损坏");
    const duplicate = current.some((entry) =>
      entry.scope === restored.scope && entry.category === restored.category && entry.product === restored.product
      && entry.region === restored.region && entry.text === restored.text);
    if (!duplicate) {
      await backupFile(PRODUCT_MARKETING_FILE, "产品营销词配置.md");
      current.push(restored);
      await fs.writeFile(PRODUCT_MARKETING_FILE, serializeProductMarketing(current), "utf8");
    }
  } else if (item.type === "template-element") {
    const { templateNumber, key, box } = item.data || {};
    if (!templateNumber || !key || !box) throw new Error("回收站模板元素数据损坏");
    const layouts = await readJson(LAYOUT_FILE, {});
    if (!layouts[templateNumber]) throw new Error(`模板【${templateNumber}】不存在`);
    await backupFile(LAYOUT_FILE, "template-layouts.json");
    layouts[templateNumber].elements ||= {};
    layouts[templateNumber].elements[key] = { ...box, visible: true, manualHidden: false };
    await fs.writeFile(LAYOUT_FILE, `${JSON.stringify(layouts, null, 2)}\n`, "utf8");
  } else {
    throw new Error("不支持恢复此类型项目");
  }
  await fs.writeFile(RECYCLE_FILE, `${JSON.stringify(entries.filter((entry) => entry.id !== item.id), null, 2)}\n`, "utf8");
  return { ok: true };
}

async function apiPurgeRecycle(body) {
  const entries = await readRecycleBin();
  const remaining = body.all ? [] : entries.filter((entry) => entry.id !== body.id);
  if (!body.all && remaining.length === entries.length) throw new Error("回收站项目不存在");
  await fs.writeFile(RECYCLE_FILE, `${JSON.stringify(remaining, null, 2)}\n`, "utf8");
  return { ok: true };
}

function resolveCheckedMarketing(entries, product, template) {
  const copy = resolveProductMarketing(entries, product, template);
  if (template.points > 0 && copy.points.length < template.points) {
    throw new Error(`产品【${product.name}】可用卖点不足：模板【${template.number}】需要${template.points}条，请补充产品专属、分类通用或全局通用营销词`);
  }
  if (template.subtitleSource === "副标题" && !copy.subtitle) {
    throw new Error(`产品【${product.name}】缺少可用副标题`);
  }
  if (template.subtitleSource === "辅助文案" && !copy.support) {
    throw new Error(`产品【${product.name}】缺少可用辅助文案`);
  }
  if (template.bottomSource !== "自动用量" && !copy.footer) {
    throw new Error(`产品【${product.name}】缺少可用底栏文案`);
  }
  return copy;
}

async function apiGeneratePrompts(body) {
  const state = await loadState();
  const selectedProducts = new Set(body.products || []);
  const selectedTemplates = new Set(body.templates || []);
  const templates = state.templates.filter((item) => selectedTemplates.has(item.number));
  if (!templates.length) throw new Error("请至少选择一个模板");
  const productMarketing = parseProductMarketing(await fs.readFile(PRODUCT_MARKETING_FILE, "utf8"));
  const generated = [];
  const chosenProducts = state.products.filter((item) => selectedProducts.has(item.name));
  if (body.mode === "combined") {
    if (chosenProducts.length < 2) throw new Error("多产品组合模式请至少选择两个产品");
    const combinedRows = new Map(templates.map((template) => [
      template.number, resolveCheckedMarketing(productMarketing, chosenProducts[0], template),
    ]));
    const markdown = generateCombinedPromptMarkdown({
      products: chosenProducts, templates,
      marketingByCategory: new Map([[chosenProducts[0].category, combinedRows]]),
    });
    const combinedRoot = path.join(DATA_ROOT, "生图提示词", "多产品组合");
    await fs.mkdir(combinedRoot, { recursive: true });
    const safeName = chosenProducts.map((item) => item.name).join("＋").slice(0, 80);
    const target = path.join(combinedRoot, `${safeName}-组合主图提示词-${Date.now()}.md`);
    await fs.writeFile(target, markdown, "utf8");
    return { ok: true, generated: [path.relative(DATA_ROOT, target).replaceAll("\\", "/")] };
  }
  for (const product of chosenProducts) {
    const rows = new Map(templates.map((template) => [
      template.number, resolveCheckedMarketing(productMarketing, product, template),
    ]));
    const markdown = generatePromptMarkdown({ product, templates, marketingRows: rows });
    const target = await nextPromptPath(path.join(PRODUCT_ROOT, product.category), product.name);
    await fs.writeFile(target, markdown, "utf8");
    generated.push(path.relative(DATA_ROOT, target).replaceAll("\\", "/"));
  }
  if (!generated.length) throw new Error("请至少选择一个产品");
  return { ok: true, generated };
}

async function apiImportReference(body) {
  const extension = path.extname(body.fileName || "").toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) throw new Error("参考图格式不支持");
  const { buffer } = decodeDataUrl(body.dataUrl);
  await fs.mkdir(REFERENCE_ROOT, { recursive: true });
  const safeName = `${Date.now()}-${path.basename(body.fileName).replace(/[\\/:*?"<>|]/g, "-")}`;
  const target = path.join(REFERENCE_ROOT, safeName);
  await fs.writeFile(target, buffer);
  let draft = {
    number: body.number || "10",
    name: body.name || "新参考模板",
    layout: `参考图尺寸${body.width || "未知"}×${body.height || "未知"}；请确认产品位置、标题区域、卖点数量和底栏布局。`,
    subtitleSource: "副标题",
    points: 3,
    bottomSource: "底栏文案",
    bottomStyle: "标准单行",
    special: "无",
    netPosition: "产品附近",
    enabled: false,
  };
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_VISION_MODEL) {
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: process.env.OPENAI_VISION_MODEL,
          input: [{
            role: "user",
            content: [
              { type: "input_text", text: `分析这张中文电商主图的构图，不要复制图片中的营销文案。只返回一个JSON对象，不要Markdown代码块或解释。
画布统一为1024×1024，所有X、Y、W、H必须换算为0到100的百分比，并保证X+W、Y+H不超过100。
JSON格式：
{"name":"模板名称","description":"简短构图描述","elements":[{"type":"product|title|sellingPoint|net|footer|animalRegion|backgroundRegion|shape|customText","label":"图层名称","binding":"product1|productName|subtitle|point1|net|footer|custom","x":0,"y":0,"w":10,"h":10,"z":1,"shape":"none|rectangle|rounded|circle|ellipse|pill|parallelogram","copyRegion":"顶部卖点|侧栏卖点|底部卖点","text":"仅动物或背景要求"}]}
必须包含主要产品、主标题；图片中存在的副标题、卖点、净含量、底栏、动物和背景区域分别建立图层。卖点binding按point1、point2递增，产品按product1、product2递增。` },
              { type: "input_image", image_url: body.dataUrl },
            ],
          }],
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "视觉模型请求失败");
      const outputText = result.output_text || result.output?.flatMap((item) => item.content || [])
        .find((item) => item.type === "output_text")?.text;
      if (outputText) {
        draft = referenceJsonToTemplate(outputText, { number: body.number, name: body.name });
        draft.analysisMode = "ai";
      } else throw new Error("视觉模型没有返回可解析的JSON");
    } catch (error) {
      draft.analysisMode = "local";
      draft.analysisError = error.message;
    }
  }
  return { ok: true, savedAs: path.relative(DATA_ROOT, target).replaceAll("\\", "/"), draft };
}

async function apiImportTemplateJson(body) {
  const draft = referenceJsonToTemplate(body.json, { number: body.number, name: body.name });
  return { ok: true, draft };
}

async function serveStatic(requestPath, response) {
  const relative = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const file = safeChildPath(PUBLIC_ROOT, relative);
  try {
    const content = await fs.readFile(file);
    response.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    response.end(content);
  } catch {
    sendJson(response, 404, { error: "页面不存在" });
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
    if (request.method === "GET" && url.pathname === "/api/state") return sendJson(response, 200, await loadState());
    if (request.method === "GET" && url.pathname === "/media") {
      const file = safeChildPath(DATA_ROOT, url.searchParams.get("path") || "");
      const content = await fs.readFile(file);
      response.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-cache" });
      return response.end(content);
    }
    if (request.method === "POST" && url.pathname.startsWith("/api/")) {
      const body = await readBody(request);
      const handlers = {
        "/api/categories": apiCreateCategory,
        "/api/products/add": apiAddProduct,
        "/api/products/move": apiMoveProduct,
        "/api/products/tags": apiSaveTags,
        "/api/templates/save": apiSaveTemplates,
        "/api/marketing/save": apiSaveMarketing,
        "/api/product-marketing/save": apiSaveProductMarketing,
        "/api/recycle/restore": apiRestoreRecycle,
        "/api/recycle/purge": apiPurgeRecycle,
        "/api/prompts/generate": apiGeneratePrompts,
        "/api/references/import": apiImportReference,
        "/api/templates/import-json": apiImportTemplateJson,
      };
      const handler = handlers[url.pathname];
      if (!handler) return sendJson(response, 404, { error: "接口不存在" });
      return sendJson(response, 200, await handler(body));
    }
    return serveStatic(url.pathname, response);
  } catch (error) {
    return sendJson(response, 400, { error: error.message || "操作失败" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Prompt Word Skill running at http://127.0.0.1:${PORT}`);
  console.log(`Data root: ${DATA_ROOT}`);
});
