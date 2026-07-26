import http from "node:http";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
  IMAGE_EXTENSIONS,
  generateCombinedPromptMarkdown,
  generatePromptMarkdown,
  latestPromptVersion,
  nextPromptPath,
  parseMarketing,
  parseProductFacts,
  parseTemplates,
  safeChildPath,
  serializeTemplates,
} from "./lib/core.mjs";

const APP_ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = path.resolve(process.env.PROMPT_DATA_ROOT || path.join(APP_ROOT, ".."));
const PRODUCT_ROOT = path.join(DATA_ROOT, "产品图");
const TEMPLATE_FILE = path.join(DATA_ROOT, "主图模板配置", "主图模板配置.md");
const MARKETING_FILE = path.join(DATA_ROOT, "营销文案", "主图模板营销词配置.md");
const SCRIPT_FILE = path.join(DATA_ROOT, "生成全部产品提示词.ps1");
const META_ROOT = path.join(DATA_ROOT, ".prompt-ui");
const META_FILE = path.join(META_ROOT, "products.json");
const LAYOUT_FILE = path.join(META_ROOT, "template-layouts.json");
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

async function loadState() {
  const [templateText, marketingText, scriptText, meta, layouts] = await Promise.all([
    fs.readFile(TEMPLATE_FILE, "utf8"),
    fs.readFile(MARKETING_FILE, "utf8"),
    fs.readFile(SCRIPT_FILE, "utf8"),
    readJson(META_FILE, { products: {} }),
    readJson(LAYOUT_FILE, {}),
  ]);
  const templates = parseTemplates(templateText).map((template) => ({
    ...template,
    visualLayout: layouts[template.number] || null,
  }));
  const marketing = parseMarketing(marketingText);
  const facts = parseProductFacts(scriptText);
  const categoryEntries = (await fs.readdir(PRODUCT_ROOT, { withFileTypes: true })).filter((entry) => entry.isDirectory());
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
    marketingCoverage: Object.fromEntries([...marketing].map(([group, rows]) => [group, rows.size])),
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
  await fs.writeFile(TEMPLATE_FILE, serializeTemplates(body.templates), "utf8");
  await fs.mkdir(META_ROOT, { recursive: true });
  const layouts = Object.fromEntries(body.templates
    .filter((template) => template.visualLayout)
    .map((template) => [template.number, template.visualLayout]));
  await fs.writeFile(LAYOUT_FILE, `${JSON.stringify(layouts, null, 2)}\n`, "utf8");
  return { ok: true };
}

async function apiGeneratePrompts(body) {
  const state = await loadState();
  const selectedProducts = new Set(body.products || []);
  const selectedTemplates = new Set(body.templates || []);
  const templates = state.templates.filter((item) => selectedTemplates.has(item.number));
  if (!templates.length) throw new Error("请至少选择一个模板");
  const marketing = parseMarketing(await fs.readFile(MARKETING_FILE, "utf8"));
  const generated = [];
  const chosenProducts = state.products.filter((item) => selectedProducts.has(item.name));
  if (body.mode === "combined") {
    if (chosenProducts.length < 2) throw new Error("多产品组合模式请至少选择两个产品");
    const markdown = generateCombinedPromptMarkdown({ products: chosenProducts, templates, marketingByCategory: marketing });
    const combinedRoot = path.join(DATA_ROOT, "生图提示词", "多产品组合");
    await fs.mkdir(combinedRoot, { recursive: true });
    const safeName = chosenProducts.map((item) => item.name).join("＋").slice(0, 80);
    const target = path.join(combinedRoot, `${safeName}-组合主图提示词-${Date.now()}.md`);
    await fs.writeFile(target, markdown, "utf8");
    return { ok: true, generated: [path.relative(DATA_ROOT, target).replaceAll("\\", "/")] };
  }
  for (const product of chosenProducts) {
    const rows = marketing.get(product.category);
    if (!rows) throw new Error(`分类【${product.category}】没有营销词配置`);
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
  const draft = {
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
              { type: "input_text", text: "分析这张中文电商主图的构图，只返回简洁中文：背景、产品位置、标题位置、卖点数量与形状、底栏样式、净含量位置。不要复制图片文案。" },
              { type: "input_image", image_url: body.dataUrl },
            ],
          }],
        }),
      });
      const result = await response.json();
      if (response.ok && result.output_text) draft.layout = result.output_text;
    } catch {
      // Keep the editable local draft when remote analysis is unavailable.
    }
  }
  return { ok: true, savedAs: path.relative(DATA_ROOT, target).replaceAll("\\", "/"), draft };
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
        "/api/prompts/generate": apiGeneratePrompts,
        "/api/references/import": apiImportReference,
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
