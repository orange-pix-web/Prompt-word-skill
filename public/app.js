const state = {
  data: null,
  view: "products",
  category: "全部",
  search: "",
  selectedProducts: new Set(),
  selectedTemplates: new Set(),
  selectedTemplateCards: new Set(),
  selectedMarketingCopyKeys: new Set(),
  templateGroup: "全部",
  generateTemplateGroup: "全部",
  promptCategory: "全部",
  promptSearch: "",
  lastGeneratedPaths: [],
  marketingScope: "product",
  marketingCategory: "全部",
  marketingProduct: null,
  marketingSearch: "",
  marketingCopyGroup: "全部",
  marketingImportEntries: [],
  editingTemplateNumber: null,
  editingVisualLayout: null,
  selectedLayoutElement: null,
  drawingLayoutElement: null,
  previewCategory: null,
  previewProducts: [],
  selectedPackageStyle: null,
  selectedLogoStyle: null,
  editingMarketingKey: null,
  marketingDraft: null,
  referenceFile: null,
  referenceDimensions: null,
  detailProduct: null,
  pendingDeletedMarketing: [],
  pendingDeletedElements: [],
  originalVisualLayout: null,
};

const JSON_TEMPLATE_EXAMPLE = {
  name: "蓝色信息板布局",
  canvas: { width: 1024, height: 1024 },
  elements: [
    { type: "product", binding: "product1", x: 52, y: 18, w: 40, h: 62, z: 4 },
    { type: "title", binding: "productName", x: 6, y: 15, w: 40, h: 12, z: 5, shape: "none" },
    { type: "sellingPoint", binding: "point1", copyRegion: "侧栏卖点", x: 8, y: 38, w: 30, h: 8, z: 5, shape: "rounded" },
    { type: "footer", binding: "footer", x: 3, y: 88, w: 94, h: 9, z: 5, shape: "rectangle" },
  ],
};

const JSON_ANALYSIS_PROMPT = `请分析我上传的中文电商主图参考图，并转换成可以导入“生图工作台”的模板JSON。

要求：
1. 只输出一个完整JSON对象，不要添加Markdown代码块、解释或其它文字。
2. 不要复制参考图中的具体营销文案，只分析构图和图层。
3. 画布固定为1024×1024。
4. 所有x、y、w、h都使用0到100的百分比，左上角为原点，并保证x+w≤100、y+h≤100。
5. 必须识别主要产品和主标题；参考图中存在的副标题、卖点、净含量、底栏、动物区域和背景区域也分别建立图层。
6. 产品type使用product，binding依次使用product1、product2。
7. 主标题type使用title、binding使用productName；副标题type使用title、binding使用subtitle。
8. 卖点type使用sellingPoint，binding依次使用point1、point2；copyRegion只能写顶部卖点、侧栏卖点或底部卖点。
9. 净含量type使用net、binding使用net；底栏type使用footer、binding使用footer。
10. shape只能使用none、rectangle、rounded、circle、ellipse、pill、parallelogram。
11. z表示图层顺序，背景通常为1，动物为2，产品为4，文字和卖点通常为5以上。

请严格按照页面下方的标准JSON示例格式输出。`;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);
const VIEW_STORAGE_KEY = "prompt-studio:active-view";
const VALID_VIEWS = new Set(["products", "marketing", "templates", "generate", "prompts", "references", "recycle"]);

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: options.body ? { "content-type": "application/json; charset=utf-8" } : undefined,
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "操作失败");
  return payload;
}

function toast(message, error = false, action = null) {
  const element = $("#toast");
  element.innerHTML = "";
  element.append(document.createTextNode(message));
  if (action) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = action.label;
    button.onclick = () => {
      action.run();
      element.className = "toast";
    };
    element.append(button);
  }
  element.className = `toast show${error ? " error" : ""}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.className = "toast", action ? 6000 : 3000);
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.append(helper);
    helper.select();
    const copied = document.execCommand("copy");
    helper.remove();
    if (!copied) throw new Error("浏览器未允许复制，请手动选择文字复制");
  }
  toast(successMessage);
}

function media(path) {
  return `/media?path=${encodeURIComponent(path)}`;
}

function productKey(product) {
  return `${encodeURIComponent(product.category)}::${encodeURIComponent(product.name)}`;
}

function findProductByKey(key) {
  return state.data.products.find((product) => productKey(product) === key)
    || state.data.products.find((product) => product.name === key);
}

function formatSize(bytes) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间未知" : new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

const MARKETING_REGIONS = ["顶部卖点", "侧栏卖点", "底部卖点", "副标题", "辅助文案", "底栏文案", "不限位置"];
const MARKETING_COPY_GROUPS = ["产品定位", "病症营销词", "使用方式", "适用对象", "使用场景", "产品特点", "规格与储存", "品质与渠道", "底栏口号", "其他"];

function marketingJsonExample() {
  const filter = currentMarketingFilter();
  return {
    scope: filter.scope,
    category: filter.category || "*",
    product: filter.product || "*",
    items: [
      { text: "鸡瘟鸭瘟", group: "病症营销词", regions: ["顶部卖点", "侧栏卖点"], priority: 112, enabled: true, confidence: 0.98 },
      { text: "兑水喷雾", group: "使用方式", regions: ["侧栏卖点"], priority: 100, enabled: true, confidence: 0.96 },
      { text: "厂家直发", group: "品质与渠道", regions: ["底栏文案"], priority: 90, enabled: true, confidence: 0.99 },
    ],
  };
}

function marketingJsonPrompt() {
  const filter = currentMarketingFilter();
  return `请分析我提供的中文电商参考图或营销文案，提取可用于产品主图的营销词，并输出可导入“生图工作台”的JSON。

当前导入目标：
- scope: ${filter.scope}
- category: ${filter.category || "*"}
- product: ${filter.product || "*"}

要求：
1. 只输出一个完整JSON对象，不要Markdown代码块、解释或其它文字。
2. JSON顶层必须包含scope、category、product和items数组。
3. 每条items必须包含text、group、regions、priority、enabled，可选confidence。
4. text必须忠实保留参考图原文，不改写、不合并；重复文案只保留一次。
5. group只能选择：${MARKETING_COPY_GROUPS.join("、")}。
6. regions可多选，但只能选择：${MARKETING_REGIONS.join("、")}。
7. 产品名称/定位用“产品定位”；疾病症状用“病症营销词”；兑水拌料等用“使用方式”；动物对象用“适用对象”；圈舍环境用“使用场景”；配方、安全、效果特点用“产品特点”；净含量、用量、储存用“规格与储存”；厂家、正品、现货、物流用“品质与渠道”；完整口号用“底栏口号”；无法判断时用“其他”。
8. priority建议1到200，越重要数值越高；enabled固定为true；confidence使用0到1。
9. 同一文案可以有多个regions，但只能有一个group。

请严格按页面中的标准JSON示例结构输出。`;
}

function entryRegions(entry = {}) {
  const values = Array.isArray(entry.regions) && entry.regions.length
    ? entry.regions : String(entry.region || "不限位置").split(/[、,，]/);
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

function marketingCopyKey(entry = {}) {
  return [entry.scope || "", entry.category || "*", entry.product || "*", String(entry.text || "").trim()].join("\u001f");
}

async function load() {
  state.data = await api("/api/state");
  $("#data-root").textContent = state.data.dataRoot;
  $("#marketing-bulk-group").innerHTML = MARKETING_COPY_GROUPS.map((group) => `<option>${group}</option>`).join("");
  $("#marketing-bulk-group").value = "其他";
  for (const template of state.data.templates.filter((item) => item.enabled)) state.selectedTemplates.add(template.number);
  renderAll();
  let savedView = state.view;
  try {
    const storedView = localStorage.getItem(VIEW_STORAGE_KEY);
    if (VALID_VIEWS.has(storedView)) savedView = storedView;
  } catch {}
  switchView(savedView);
}

function renderAll() {
  renderMetrics();
  renderCategoryFilters();
  renderProducts();
  renderTemplates();
  renderGenerator();
  renderPromptManager();
  fillCategorySelects();
  renderMarketingNavigation();
  renderRecycleBin();
  $("#ai-state").textContent = state.data.aiAnalysisAvailable ? "AI视觉分析已启用" : "本地草稿模式";
}

function renderMarketingNavigation() {
  const scope = state.marketingScope;
  $("#marketing-scope").value = scope;
  const availableCategories = state.data.categories;
  if (scope === "category" && !availableCategories.includes(state.marketingCategory)) {
    state.marketingCategory = availableCategories[0] || null;
  }
  const visibleProducts = marketingVisibleProducts();
  if (scope === "product" && !visibleProducts.some((item) => productKey(item) === state.marketingProduct)) {
    state.marketingProduct = visibleProducts[0] ? productKey(visibleProducts[0]) : null;
  }
  renderMarketingCategoryFilters();
  renderMarketingProductGrid();
  renderProductCopies();
}

function marketingVisibleProducts() {
  const keyword = state.marketingSearch.trim().toLowerCase();
  return state.data.products.filter((product) =>
    (state.marketingCategory === "全部" || product.category === state.marketingCategory) &&
    (!keyword || product.name.toLowerCase().includes(keyword) || product.tags.some((tag) => tag.toLowerCase().includes(keyword)))
  );
}

function renderMarketingCategoryFilters() {
  const scope = state.marketingScope;
  const container = $("#marketing-category-filters");
  const categories = scope === "product" ? ["全部", ...state.data.categories]
    : scope === "category" ? state.data.categories : [];
  container.innerHTML = categories.map((category) =>
    `<button class="chip ${category === state.marketingCategory ? "active" : ""}" data-marketing-category="${category}">${category}</button>`
  ).join("");
  container.classList.toggle("hidden", scope === "global");
  $("#marketing-search-wrap").classList.toggle("hidden", scope !== "product");
  $$("[data-marketing-category]").forEach((button) => button.onclick = () => {
    state.marketingCategory = button.dataset.marketingCategory;
    state.marketingCopyGroup = "全部";
    const products = marketingVisibleProducts();
    if (!products.some((item) => productKey(item) === state.marketingProduct)) {
      state.marketingProduct = products[0] ? productKey(products[0]) : null;
    }
    renderMarketingNavigation();
  });
}

function productMarketingCount(product) {
  return state.data.productMarketingEntries.filter((entry) =>
    entry.scope === "product" && entry.product === product.name && entry.category === product.category
  ).length;
}

function renderMarketingProductGrid() {
  const grid = $("#marketing-product-grid");
  const products = state.marketingScope === "product" ? marketingVisibleProducts() : [];
  grid.classList.toggle("hidden", state.marketingScope !== "product");
  grid.innerHTML = products.map((product) => {
    const count = productMarketingCount(product);
    const key = productKey(product);
    return `<button type="button" class="marketing-name-card ${state.marketingProduct === key ? "selected" : ""}" data-marketing-product="${key}">
      <strong>${product.name}</strong>
      <span>${product.category} · ${count} 条专属词</span>
    </button>`;
  }).join("") || `<div class="summary-note">没有符合条件的产品。</div>`;
  $$("[data-marketing-product]").forEach((card) => card.onclick = () => {
    state.marketingProduct = card.dataset.marketingProduct;
    state.marketingCopyGroup = "全部";
    const product = findProductByKey(state.marketingProduct);
    if (product) state.marketingCategory = state.marketingCategory === "全部" ? "全部" : product.category;
    renderMarketingProductGrid();
    renderProductCopies();
    $("#marketing-editor-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function renderMetrics() {
  const prompts = state.data.products.filter((item) => item.latestPrompt).length;
  const enabled = state.data.templates.filter((item) => item.enabled).length;
  const tags = new Set(state.data.products.flatMap((item) => item.tags)).size;
  $("#metrics").innerHTML = [
    ["产品总数", state.data.products.length, "个"],
    ["产品分类", state.data.categories.length, "类"],
    ["启用模板", enabled, "套"],
    ["已有提示词", prompts, `/${state.data.products.length}`],
  ].map(([label, value, unit]) => `<div class="metric-card"><span>${label}</span><strong>${value}<em>${unit}</em></strong></div>`).join("");
}

function renderCategoryFilters() {
  $("#category-filters").innerHTML = ["全部", ...state.data.categories].map((category) =>
    `<button class="chip ${category === state.category ? "active" : ""}" data-category="${category}">${category}</button>`
  ).join("");
  $$("#category-filters .chip").forEach((button) => button.onclick = () => {
    state.category = button.dataset.category;
    renderCategoryFilters();
    renderProducts();
  });
}

function filteredProducts() {
  const keyword = state.search.trim().toLowerCase();
  return state.data.products.filter((product) =>
    (state.category === "全部" || product.category === state.category) &&
    (!keyword || product.name.toLowerCase().includes(keyword) || product.tags.some((tag) => tag.toLowerCase().includes(keyword)))
  );
}

function renderProducts() {
  const products = filteredProducts();
  $("#product-grid").innerHTML = products.map((product) => `
    <article class="product-card ${state.selectedProducts.has(productKey(product)) ? "selected" : ""}">
      <input class="card-check" type="checkbox" data-select-product="${productKey(product)}" ${state.selectedProducts.has(productKey(product)) ? "checked" : ""}>
      <span class="category-badge">${product.category}</span>
      <div class="product-thumb"><img loading="lazy" src="${media(product.imagePath)}" alt="${product.name}"></div>
      <div class="product-body">
        <h3>${product.name}</h3>
        <div class="product-meta"><span>${product.net}</span><span>${formatSize(product.size)}</span></div>
        <div class="tags">${product.tags.length ? product.tags.map((tag) => `<span class="tag">${tag}</span>`).join("") : `<span class="tag">待添加标签</span>`}</div>
      </div>
      <div class="card-foot">
        <button data-detail="${productKey(product)}">资料与分类</button>
        <button data-generate-one="${productKey(product)}">${product.latestPrompt ? `提示词 v${product.promptVersion}` : "生成提示词"}</button>
      </div>
    </article>
  `).join("") || `<div class="summary-note">没有符合条件的产品</div>`;
  $$("[data-select-product]").forEach((input) => input.onchange = () => toggleProduct(input.dataset.selectProduct, input.checked));
  $$("[data-detail]").forEach((button) => button.onclick = () => openProductDetail(button.dataset.detail));
  $$("[data-generate-one]").forEach((button) => button.onclick = () => {
    state.selectedProducts = new Set([button.dataset.generateOne]);
    switchView("generate");
    renderGenerator();
  });
  $("#selected-product-count").textContent = `已选 ${state.selectedProducts.size} 个`;
}

function toggleProduct(name, checked) {
  checked ? state.selectedProducts.add(name) : state.selectedProducts.delete(name);
  renderProducts();
  renderGenerator();
}

function wireframe(template) {
  if (template.visualLayout?.elements) {
    const visualClass = /^0[1-9]$/.test(template.number) ? `layout-${template.number}` : "layout-generic";
    const boxes = Object.entries(template.visualLayout.elements)
      .filter(([, box]) => box?.visible !== false)
      .map(([key, box]) => `<div class="custom-preview-box shape-${box.shape || "rounded"} type-${box.type || inferElementType(key)}" data-key="${key}" style="left:${box.x}%;top:${box.y}%;width:${box.w}%;height:${box.h}%;z-index:${box.z || 1}">${layoutElementLabel(key, box)}</div>`)
      .join("");
    return `<div class="wireframe ${visualClass}"><div class="wire-scene"></div>${boxes}</div>`;
  }
  const layout = /^0[1-9]$/.test(template.number) ? `layout-${template.number}` : "layout-generic";
  const points = template.points === 3
    ? `<div class="wire-points"><span></span><span></span><span></span></div>`
    : "";
  const quad = template.number === "08"
    ? `<div class="wire-quad"><span></span><span></span><span></span><span></span></div>`
    : "";
  return `
    <div class="wireframe ${layout}">
      <div class="wire-scene"></div>
      <div class="wire-header"></div>
      <div class="wire-logo"></div>
      <div class="wire-tagline"></div>
      <div class="wire-title"></div>
      <div class="wire-subtitle"></div>
      <div class="wire-product"></div>
      <div class="wire-animals"><i></i><i></i><i></i></div>
      ${points}
      ${quad}
      <div class="wire-net"></div>
      <div class="wire-footer ${template.bottomStyle === "加高单行" ? "tall" : ""}"></div>
    </div>`;
}

function layoutElementLabels() {
  return { product: "产品", title: "主标题", subtitle: "副标题", point1: "卖点1", point2: "卖点2", point3: "卖点3", net: "净含量", footer: "底栏" };
}

function elementDefinitions() {
  return [
    ["product", "产品"],
    ["sellingPoint", "卖点"],
    ["title", "标题"],
    ["customText", "自定义文字"],
    ["net", "净含量"],
    ["footer", "底栏"],
    ["animalRegion", "动物区域"],
    ["backgroundRegion", "背景区域"],
    ["shape", "装饰形状"],
  ];
}

function inferElementType(key) {
  if (key.startsWith("product")) return "product";
  if (key.startsWith("point")) return "sellingPoint";
  if (key === "title" || key === "subtitle") return "title";
  if (key === "net") return "net";
  if (key === "footer") return "footer";
  return "customText";
}

function layoutElementLabel(key, box = {}) {
  return box.label || layoutElementLabels()[key] || elementDefinitions().find(([type]) => type === box.type)?.[1] || key;
}

function currentPreviewCopy() {
  const product = currentPreviewProduct();
  if (!product) return null;
  const entries = state.data.productMarketingEntries || [];
  const used = new Set();
  const rank = (entry) => entry.scope === "product" && entry.product === product.name ? 3
    : entry.scope === "category" && entry.category === product.category ? 2 : entry.scope === "global" ? 1 : 0;
  const pick = (region) => {
    const entry = entries.filter((item) => {
      const regions = entryRegions(item);
      return item.enabled !== false && rank(item) > 0 && (regions.includes(region) || regions.includes("不限位置"));
    })
      .sort((a, b) => rank(b) - rank(a) || (b.priority || 0) - (a.priority || 0))
      .find((item) => item.text && !used.has(item.text));
    if (entry) used.add(entry.text);
    return entry?.text || "";
  };
  const pointBoxes = Object.values(state.editingVisualLayout?.elements || {})
    .filter((box) => box.visible !== false && box.type === "sellingPoint")
    .sort((a, b) => (a.y || 0) - (b.y || 0))
    .slice(0, Number($("#tpl-points")?.value || 0));
  return {
    subtitle: pick("副标题"),
    support: pick("辅助文案"),
    points: pointBoxes.map((box) => pick(box.copyRegion || "侧栏卖点")),
    footer: pick("底栏文案") || pick("底部卖点"),
  };
}

function currentPreviewProduct() {
  const products = state.data?.products?.filter((item) => item.category === state.previewCategory) || [];
  return products.find((item) => item.name === state.previewProducts[0]) || products[0] || state.data?.products?.[0] || null;
}

function previewProductForBox(box = {}) {
  const match = String(box.binding || "").match(/^product(\d+)$/);
  const slot = match ? Number(match[1]) - 1 : 0;
  const name = state.previewProducts[slot];
  return state.data?.products?.find((item) => item.name === name) || (slot === 0 ? currentPreviewProduct() : null);
}

function resolvedLayoutText(key, box = {}) {
  const copy = currentPreviewCopy();
  const product = box.type === "product" ? previewProductForBox(box) : currentPreviewProduct();
  if (box.type === "product") return product?.name || box.label || "产品";
  if (box.binding === "productName") return product?.name || "产品名称";
  if (box.binding === "subtitle") return copy?.subtitle || "副标题";
  if (box.binding === "support") return copy?.support || "辅助文案";
  if (/^point\d+$/.test(box.binding || "")) {
    const index = Number(box.binding.slice(5)) - 1;
    return copy?.points?.[index] || `卖点${index + 1}`;
  }
  if (box.binding === "net") return product ? `净含量：${product.net}` : "净含量";
  if (box.binding === "footer") return copy?.footer || "底栏文案";
  if (box.binding === "custom") return box.text || layoutElementLabel(key, box);
  return layoutElementLabel(key, box);
}

function normalizeVisualLayout(layout) {
  const result = structuredClone(layout || { canvas: 1024, elements: {} });
  result.canvas = 1024;
  result.elements ||= {};
  for (const [key, box] of Object.entries(result.elements)) {
    box.type ||= inferElementType(key);
    box.label ||= layoutElementLabel(key, box);
    box.shape ||= box.type === "product" ? "none" : box.type === "animalRegion" || box.type === "backgroundRegion" ? "rectangle" : "rounded";
    box.binding ||= key.startsWith("product") ? `product${Math.max(1, Number(key.match(/\d+$/)?.[0] || 1))}` : key === "title" ? "productName" : key === "subtitle" ? "subtitle" : key.startsWith("point") ? key : key === "net" ? "net" : key === "footer" ? "footer" : "custom";
    if (box.type === "product" && box.binding === "custom") box.binding = `product${Math.max(1, Number(key.match(/\d+$/)?.[0] || 1))}`;
    if (box.type !== "product" && box.fontRatio == null) box.fontRatio = 0.8;
    if (box.type === "sellingPoint" && !box.copyRegion) box.copyRegion = box.y < 25 ? "顶部卖点" : box.y > 72 ? "底部卖点" : "侧栏卖点";
    box.text ||= box.type === "animalRegion" ? "与产品分类相符的真实动物" : box.type === "backgroundRegion" ? "真实干净的使用场景" : "";
    clampBox(box);
  }
  return result;
}

function nextElementKey(type) {
  const elements = state.editingVisualLayout.elements;
  let index = type === "product" && elements.product ? 2 : 1;
  while (elements[`${type}${index}`]) index += 1;
  return `${type}${index}`;
}

function defaultVisualLayout(number = "00", points = 3) {
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
  for (let index = 1; index <= 3; index += 1) {
    elements[`point${index}`].visible = index <= points;
  }
  const pointShape = number === "04" ? "parallelogram" : number === "05" || number === "07" ? "pill" : number === "09" ? "none" : "rounded";
  for (const [key, box] of Object.entries(elements)) {
    box.shape = key === "product" || key === "title" || key === "subtitle" ? "none"
      : key.startsWith("point") ? pointShape : key === "net" ? "pill" : key === "footer" ? "rectangle" : "rounded";
    if (key !== "product") box.fontRatio = 0.8;
  }
  return normalizeVisualLayout({ canvas: 1024, elements });
}

function syncPointElements() {
  if (!state.editingVisualLayout) return;
  const count = Number($("#tpl-points").value);
  for (let index = 1; index <= count; index += 1) {
    const key = `point${index}`;
    const box = state.editingVisualLayout.elements[key];
    if (!box) state.editingVisualLayout.elements[key] = normalizeVisualLayout({ elements: {
      [key]: { x: 7, y: Math.min(76, 35 + (index - 1) * 9), w: 35, h: 7, z: 5, type: "sellingPoint", label: `卖点${index}`, binding: index <= 3 ? `point${index}` : "custom", text: "" },
    } }).elements[key];
    const current = state.editingVisualLayout.elements[key];
    if (!current) continue;
    if (current.disabledByCount) {
      current.visible = true;
      delete current.disabledByCount;
    }
  }
  for (const [key, box] of Object.entries(state.editingVisualLayout.elements)) {
    const match = key.match(/^point(\d+)$/);
    if (match && Number(match[1]) > count) {
      box.visible = false;
      box.disabledByCount = true;
    }
  }
}

function clampBox(box) {
  box.w = Math.max(3, Math.min(100, Number(box.w)));
  box.h = Math.max(3, Math.min(100, Number(box.h)));
  box.x = Math.max(0, Math.min(100 - box.w, Number(box.x)));
  box.y = Math.max(0, Math.min(100 - box.h, Number(box.y)));
  box.z = Math.max(1, Math.min(20, Number(box.z || 1)));
  return box;
}

function renderVisualEditor() {
  if (!state.editingVisualLayout) return;
  syncPointElements();
  const elements = state.editingVisualLayout.elements;
  $("#element-palette").innerHTML = elementDefinitions().map(([type, label]) => {
    return `<button type="button" class="element-tool ${state.drawingLayoutElement?.type === type ? "drawing" : ""}" data-add-element="${type}">＋ ${label}</button>`;
  }).join("");
  $("#layout-canvas").innerHTML = Object.entries(elements)
    .filter(([, box]) => box?.visible !== false)
    .sort((a, b) => (a[1].z || 1) - (b[1].z || 1))
    .map(([key, box]) => {
      const fontSize = box.type === "product" ? "" : `font-size:clamp(8px,${Math.max(0.1, box.h * (box.fontRatio ?? 0.8))}cqw,72px);`;
      const previewProduct = box.type === "product" ? previewProductForBox(box) : null;
      const content = previewProduct
        ? `<img class="layout-product-image" src="${media(previewProduct.imagePath)}" alt=""><span class="layout-product-caption">${previewProduct.name}</span>`
        : `<span class="layout-element-text">${resolvedLayoutText(key, box)}</span>`;
      return `<div class="layout-element shape-${box.shape || "rounded"} type-${box.type || inferElementType(key)} ${state.selectedLayoutElement === key ? "selected" : ""}" data-key="${key}" style="left:${box.x}%;top:${box.y}%;width:${box.w}%;height:${box.h}%;z-index:${box.z || 1};${fontSize}">${content}<i class="resize-handle"></i></div>`;
    })
    .join("");
  renderLayoutProperties();
  $$("[data-add-element]").forEach((button) => button.onclick = () => {
    const type = button.dataset.addElement;
    const key = nextElementKey(type);
    state.selectedLayoutElement = null;
    state.drawingLayoutElement = { key, type, label: `${elementDefinitions().find(([item]) => item === type)?.[1] || type}${key.match(/\d+$/)?.[0] || ""}` };
    renderVisualEditor();
  });
  $$(".layout-element").forEach((element) => element.onpointerdown = (event) => beginMoveLayoutElement(event, element.dataset.key, event.target.classList.contains("resize-handle")));
}

function renderLayoutProperties() {
  const panel = $("#layout-properties");
  const key = state.selectedLayoutElement;
  const box = key && state.editingVisualLayout?.elements[key];
  if (!box) {
    panel.innerHTML = `<span>${state.drawingLayoutElement ? `请在画布空白处拖动绘制“${state.drawingLayoutElement.label}”` : "尚未选择元素"}</span>`;
    return;
  }
  const shapeOptions = ["none","rectangle","rounded","circle","ellipse","pill","parallelogram"].map((shape) => `<option value="${shape}" ${box.shape === shape ? "selected" : ""}>${({none:"无底板",rectangle:"直角矩形",rounded:"圆角矩形",circle:"圆形",ellipse:"椭圆",pill:"胶囊",parallelogram:"平行四边形"})[shape]}</option>`).join("");
  const copy = currentPreviewCopy();
  const pointCount = Math.max(3, copy?.points?.length || 0, Number($("#tpl-points").value) || 0);
  const bindingItems = box.type === "product" ? Array.from({length: 6}, (_, index) => [`product${index + 1}`, `产品${index + 1}${state.previewProducts[index] ? `｜${state.previewProducts[index]}` : ""}`]) : [
    ["productName", "产品名称"], ["subtitle", "副标题"], ["support", "辅助文案"],
    ...Array.from({ length: pointCount }, (_, index) => [`point${index + 1}`, `营销卖点${index + 1}`]),
    ["net", "净含量"], ["footer", "底栏文案"], ["custom", "自定义内容"],
  ];
  const bindingOptions = bindingItems.map(([binding, label]) => {
    const preview = resolvedLayoutText(key, { ...box, binding });
    return `<option value="${binding}" ${box.binding === binding ? "selected" : ""}>${label}${preview && preview !== label ? `｜${preview}` : ""}</option>`;
  }).join("");
  const contentLabel = box.type === "animalRegion" ? "动物及场景要求" : box.type === "backgroundRegion" ? "背景描述" : box.binding === "custom" ? "实际显示文字" : "补充要求";
  panel.innerHTML = `<label>名称<input data-box-text="label" value="${box.label || ""}"></label><label>形状<select data-box-text="shape">${shapeOptions}</select></label><label>内容绑定<select data-box-text="binding">${bindingOptions}</select></label><label>${contentLabel}<input data-box-text="text" value="${box.text || ""}"></label>`
    + ["x","y","w","h","z"].map((field) => `<label>${field.toUpperCase()}<input type="number" step="1" data-box-field="${field}" value="${Math.round(box[field])}"></label>`).join("")
    + (box.type === "sellingPoint" ? `<label>营销词位置<select data-box-text="copyRegion">${["顶部卖点","侧栏卖点","底部卖点"].map((region) => `<option ${box.copyRegion === region ? "selected" : ""}>${region}</option>`).join("")}</select></label>` : "")
    + (box.type === "product" ? "" : `<label>字号占框高%<input type="number" min="10" max="100" step="5" data-box-ratio value="${Math.round((box.fontRatio ?? 0.8) * 100)}"></label>`)
    + `<button type="button" id="remove-layout-element">删除元素</button>`;
  $$("[data-box-field]").forEach((input) => input.oninput = () => {
    box[input.dataset.boxField] = Number(input.value);
    clampBox(box);
    renderVisualEditor();
  });
  $$("[data-box-text]").forEach((input) => input.oninput = () => {
    box[input.dataset.boxText] = input.value;
    renderVisualEditor();
  });
  const ratioInput = panel.querySelector("[data-box-ratio]");
  if (ratioInput) ratioInput.oninput = () => {
    box.fontRatio = Math.max(0.1, Math.min(1, Number(ratioInput.value) / 100));
    renderVisualEditor();
  };
  $("#remove-layout-element").onclick = () => {
    if (!window.confirm(`确定删除模板元素“${box.label || key}”吗？保存模板后会进入回收站并保留30天。`)) return;
    const original = state.originalVisualLayout?.elements?.[key];
    if (original && !state.pendingDeletedElements.some((item) => item.key === key)) {
      state.pendingDeletedElements.push({
        templateNumber: $("#tpl-number").value.trim().padStart(2, "0"),
        key,
        box: structuredClone(original),
      });
    }
    box.visible = false;
    box.manualHidden = true;
    state.selectedLayoutElement = null;
    renderVisualEditor();
    toast("模板元素已删除，保存模板后进入回收站", false, {
      label: "撤销",
      run: () => {
        state.pendingDeletedElements = state.pendingDeletedElements.filter((item) => item.key !== key);
        state.editingVisualLayout.elements[key] = structuredClone(original || box);
        state.editingVisualLayout.elements[key].visible = true;
        state.editingVisualLayout.elements[key].manualHidden = false;
        state.selectedLayoutElement = key;
        renderVisualEditor();
      },
    });
  };
}

function canvasPoint(event) {
  const rect = $("#layout-canvas").getBoundingClientRect();
  return { x: (event.clientX - rect.left) / rect.width * 100, y: (event.clientY - rect.top) / rect.height * 100 };
}

function beginMoveLayoutElement(event, key, resizing) {
  event.preventDefault();
  event.stopPropagation();
  state.selectedLayoutElement = key;
  state.drawingLayoutElement = null;
  const box = state.editingVisualLayout.elements[key];
  const start = canvasPoint(event);
  const original = { ...box };
  const move = (moveEvent) => {
    const point = canvasPoint(moveEvent);
    if (resizing) {
      box.w = original.w + point.x - start.x;
      box.h = original.h + point.y - start.y;
    } else {
      box.x = original.x + point.x - start.x;
      box.y = original.y + point.y - start.y;
    }
    clampBox(box);
    renderVisualEditor();
  };
  const end = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  renderVisualEditor();
}

function renderTemplates() {
  const groups = ["全部", ...new Set([
    ...(state.data.templateGroups || ["未分组"]),
    ...state.data.templates.map((template) => template.group || "未分组"),
  ])];
  if (!groups.includes(state.templateGroup)) state.templateGroup = "全部";
  $("#template-group-filters").innerHTML = groups.map((group) =>
    `<button class="chip ${group === state.templateGroup ? "active" : ""}" data-template-group="${group}">${group}</button>`
  ).join("");
  $$("[data-template-group]").forEach((button) => button.onclick = () => {
    state.templateGroup = button.dataset.templateGroup;
    renderTemplates();
  });
  const templates = state.data.templates.filter((template) =>
    state.templateGroup === "全部" || (template.group || "未分组") === state.templateGroup
  );
  $("#select-all-templates").checked = Boolean(templates.length) && templates.every((template) => state.selectedTemplateCards.has(template.number));
  $("#select-all-templates").indeterminate = templates.some((template) => state.selectedTemplateCards.has(template.number))
    && !templates.every((template) => state.selectedTemplateCards.has(template.number));
  $("#move-template-group").innerHTML = groups.filter((group) => group !== "全部")
    .map((group) => `<option value="${group}">${group}</option>`).join("");
  $("#selected-template-card-count").textContent = `已选 ${state.selectedTemplateCards.size} 个模板`;
  const selectedTemplates = state.data.templates.filter((template) => state.selectedTemplateCards.has(template.number));
  $("#batch-enable-templates").disabled = !selectedTemplates.some((template) => !template.enabled);
  $("#batch-disable-templates").disabled = !selectedTemplates.some((template) => template.enabled);
  $("#rename-template-group").disabled = ["全部", "未分组"].includes(state.templateGroup);
  $("#delete-template-group").disabled = ["全部", "未分组"].includes(state.templateGroup);
  $("#template-grid").innerHTML = templates.map((template) => `
    <article class="template-card ${state.selectedTemplateCards.has(template.number) ? "selected" : ""}" data-template-card="${template.number}" role="checkbox" aria-checked="${state.selectedTemplateCards.has(template.number)}" tabindex="0">
      <input class="card-check" type="checkbox" data-select-template-card="${template.number}" ${state.selectedTemplateCards.has(template.number) ? "checked" : ""}>
      <div class="template-preview">${wireframe(template)}</div>
      <div class="template-info">
        <div class="template-info-head"><span class="template-number">TEMPLATE ${template.number}</span><span class="enabled-pill ${template.enabled ? "" : "off"}">${template.enabled ? "已启用" : "已停用"}</span></div>
        <h3>${template.name}</h3>
        <span class="template-group-badge">${template.group || "未分组"}</span>
        <p>${template.layout}</p>
        <div class="template-stats"><span>${template.points}条卖点</span><span>${template.bottomStyle}</span><span>${template.netPosition}</span></div>
      </div>
      <div class="template-actions"><button class="text-btn" data-toggle-template="${template.number}">${template.enabled ? "停用" : "启用"}</button><button class="btn small" data-edit-template="${template.number}">编辑与预览</button></div>
    </article>
  `).join("") || `<div class="summary-note">该分组还没有模板。</div>`;
  const setTemplateCardSelected = (number, selected) => {
    selected ? state.selectedTemplateCards.add(number) : state.selectedTemplateCards.delete(number);
    renderTemplates();
  };
  $$("[data-select-template-card]").forEach((input) => input.onchange = () => {
    setTemplateCardSelected(input.dataset.selectTemplateCard, input.checked);
  });
  $$("[data-template-card]").forEach((card) => {
    const toggleCard = () => {
      const number = card.dataset.templateCard;
      setTemplateCardSelected(number, !state.selectedTemplateCards.has(number));
    };
    card.onclick = (event) => {
      if (event.target.closest("button, input, select, textarea, a")) return;
      toggleCard();
    };
    card.onkeydown = (event) => {
      if (!["Enter", " "].includes(event.key) || event.target.closest("button, input, select, textarea, a")) return;
      event.preventDefault();
      toggleCard();
    };
  });
  $$("[data-edit-template]").forEach((button) => button.onclick = () => openTemplate(button.dataset.editTemplate));
  $$("[data-toggle-template]").forEach((button) => button.onclick = async () => {
    const template = state.data.templates.find((item) => item.number === button.dataset.toggleTemplate);
    template.enabled = !template.enabled;
    await saveTemplates();
  });
}

function renderGenerator() {
  const search = ($("#generate-product-search")?.value || "").toLowerCase();
  const products = state.data.products.filter((item) => !search || item.name.toLowerCase().includes(search));
  const templateGroups = ["全部", ...new Set([
    ...(state.data.templateGroups || ["未分组"]),
    ...state.data.templates.map((template) => template.group || "未分组"),
  ])];
  if (!templateGroups.includes(state.generateTemplateGroup)) state.generateTemplateGroup = "全部";
  $("#generate-template-group-chips").innerHTML = templateGroups.map((group) => {
    const groupTemplates = group === "全部" ? state.data.templates
      : state.data.templates.filter((template) => (template.group || "未分组") === group);
    const selectedCount = groupTemplates.filter((template) => state.selectedTemplates.has(template.number)).length;
    return `<button type="button" class="chip ${group === state.generateTemplateGroup ? "active" : ""}" data-generate-template-group="${group}">${group}<small>${selectedCount}/${groupTemplates.length}</small></button>`;
  }).join("");
  $$("[data-generate-template-group]").forEach((button) => button.onclick = () => {
    state.generateTemplateGroup = button.dataset.generateTemplateGroup;
    renderGenerator();
  });
  const visibleTemplates = state.data.templates.filter((template) =>
    state.generateTemplateGroup === "全部" || (template.group || "未分组") === state.generateTemplateGroup
  );
  const visibleSelectedCount = visibleTemplates.filter((template) => state.selectedTemplates.has(template.number)).length;
  $("#generate-template-group-count").textContent = `当前显示 ${visibleTemplates.length} 个模板，已选 ${visibleSelectedCount} 个；全部共选 ${state.selectedTemplates.size} 个`;
  $("#generate-products").innerHTML = products.map((product) => `
    <label class="check-row"><input type="checkbox" data-g-product="${productKey(product)}" ${state.selectedProducts.has(productKey(product)) ? "checked" : ""}><img src="${media(product.imagePath)}" alt=""><span>${product.name}<small>${product.category} · ${product.net}</small></span></label>
  `).join("");
  $("#generate-templates").innerHTML = visibleTemplates.map((template) => `
    <label class="generator-template-card ${state.selectedTemplates.has(template.number) ? "selected" : ""}">
      <input type="checkbox" data-g-template="${template.number}" ${state.selectedTemplates.has(template.number) ? "checked" : ""}>
      <span class="generator-template-check">✓</span>
      <div class="generator-template-preview">${wireframe(template)}</div>
      <span class="generator-template-info">
        <strong>${template.number} · ${template.name}</strong>
        <small>${template.group || "未分组"} · ${template.points}条卖点 · ${template.enabled ? "已启用" : "已停用"}</small>
      </span>
    </label>
  `).join("");
  $$("[data-g-product]").forEach((input) => input.onchange = () => {
    input.checked ? state.selectedProducts.add(input.dataset.gProduct) : state.selectedProducts.delete(input.dataset.gProduct);
    updateSummary();
    renderProducts();
  });
  $$("[data-g-template]").forEach((input) => input.onchange = () => {
    input.checked ? state.selectedTemplates.add(input.dataset.gTemplate) : state.selectedTemplates.delete(input.dataset.gTemplate);
    input.closest(".generator-template-card")?.classList.toggle("selected", input.checked);
    updateGeneratorTemplateSelectionMeta();
  });
  renderGenerationMarketingCopies();
  updateGeneratorTemplateSelectionMeta();
}

function updateGeneratorTemplateSelectionMeta() {
  $$("[data-generate-template-group]").forEach((button) => {
    const group = button.dataset.generateTemplateGroup;
    const templates = group === "全部" ? state.data.templates
      : state.data.templates.filter((template) => (template.group || "未分组") === group);
    const selectedCount = templates.filter((template) => state.selectedTemplates.has(template.number)).length;
    const count = button.querySelector("small");
    if (count) count.textContent = `${selectedCount}/${templates.length}`;
  });
  const visible = state.data.templates.filter((template) =>
    state.generateTemplateGroup === "全部" || (template.group || "未分组") === state.generateTemplateGroup);
  const selectedVisible = visible.filter((template) => state.selectedTemplates.has(template.number)).length;
  $("#generate-template-group-count").textContent = `当前显示 ${visible.length} 个模板，已选 ${selectedVisible} 个；全部共选 ${state.selectedTemplates.size} 个`;
  $("#generate-clear-templates").disabled = state.selectedTemplates.size === 0;
  $("#generate-select-templates").disabled = !state.data.templates.some((template) => template.enabled && !state.selectedTemplates.has(template.number));
  $("#generate-select-template-group").disabled = !visible.length || selectedVisible === visible.length;
  $("#generate-clear-template-group").disabled = selectedVisible === 0;
  updateSummary();
}

function filteredPrompts() {
  const keyword = state.promptSearch.trim().toLowerCase();
  return (state.data.prompts || []).filter((promptFile) =>
    (state.promptCategory === "全部" || promptFile.category === state.promptCategory) &&
    (!keyword || promptFile.productName.toLowerCase().includes(keyword) || promptFile.fileName.toLowerCase().includes(keyword))
  );
}

async function openFolder(relativePath) {
  await api("/api/system/open-folder", {
    method: "POST",
    body: JSON.stringify({ path: relativePath }),
  });
}

function renderPromptManager() {
  const prompts = state.data.prompts || [];
  const latestCount = prompts.filter((item) => item.latest).length;
  const productsWithPrompts = new Set(prompts.map((item) => item.productName)).size;
  const historyCount = prompts.filter((item) => item.source === "历史目录").length;
  $("#prompt-metrics").innerHTML = [
    ["提示词文件", prompts.length, "份"],
    ["涉及产品", productsWithPrompts, "个"],
    ["产品最新版本", latestCount, "份"],
    ["历史目录", historyCount, "份"],
  ].map(([label, value, unit]) => `<div class="metric-card"><span>${label}</span><strong>${value}<em>${unit}</em></strong></div>`).join("");
  const categories = ["全部", ...new Set(prompts.map((item) => item.category).filter(Boolean))];
  if (!categories.includes(state.promptCategory)) state.promptCategory = "全部";
  $("#prompt-category-filters").innerHTML = categories.map((category) =>
    `<button class="chip ${category === state.promptCategory ? "active" : ""}" data-prompt-category="${category}">${category}</button>`
  ).join("");
  $$("[data-prompt-category]").forEach((button) => button.onclick = () => {
    state.promptCategory = button.dataset.promptCategory;
    renderPromptManager();
  });
  const visible = filteredPrompts();
  $("#prompt-management-grid").innerHTML = visible.map((promptFile) => `
    <article class="prompt-file-card">
      <div class="prompt-file-icon">MD</div>
      <div class="prompt-file-main">
        <div class="prompt-file-heading">
          <div><span>${promptFile.category}</span><h3>${promptFile.productName}</h3></div>
          ${promptFile.latest ? `<b>最新版本</b>` : promptFile.version ? `<b class="muted">v${promptFile.version}</b>` : `<b class="muted">历史</b>`}
        </div>
        <p title="${promptFile.fileName}">${promptFile.fileName}</p>
        <div class="prompt-file-meta"><span>${promptFile.source}</span><span>${formatSize(promptFile.size)}</span><span>${formatDate(promptFile.modifiedAt)}</span></div>
      </div>
      <div class="prompt-file-actions">
        <button class="btn ghost small" data-preview-prompt="${promptFile.relativePath}">查看内容</button>
        <button class="btn small" data-open-prompt-folder="${promptFile.relativePath}">打开文件夹</button>
      </div>
    </article>
  `).join("") || `<div class="summary-note">没有符合条件的提示词文件。</div>`;
  $$("[data-preview-prompt]").forEach((button) => button.onclick = () =>
    window.open(media(button.dataset.previewPrompt), "_blank", "noopener"));
  $$("[data-open-prompt-folder]").forEach((button) => button.onclick = async () => {
    try {
      await openFolder(button.dataset.openPromptFolder);
      toast("已在资源管理器中定位提示词");
    } catch (error) { toast(error.message, true); }
  });
}

function renderGeneratedFolderActions() {
  const container = $("#generated-folder-actions");
  const paths = [...new Set(state.lastGeneratedPaths || [])];
  container.classList.toggle("hidden", !paths.length);
  container.innerHTML = paths.map((relativePath, index) => `
    <button type="button" class="btn ghost small" data-open-generated-folder="${relativePath}">
      ${paths.length === 1 ? "打开生成文件所在文件夹" : `打开第${index + 1}个文件所在文件夹`}
    </button>
  `).join("");
  $$("[data-open-generated-folder]").forEach((button) => button.onclick = async () => {
    try {
      await openFolder(button.dataset.openGeneratedFolder);
      toast("已在资源管理器中定位生成文件");
    } catch (error) { toast(error.message, true); }
  });
}

function selectedMarketingSources() {
  return $$("[data-marketing-source]:checked").map((input) => input.value);
}

function generationMarketingEntries() {
  const sources = new Set(selectedMarketingSources());
  const products = state.data.products.filter((product) => state.selectedProducts.has(productKey(product)));
  const categories = new Set(products.map((product) => product.category));
  return state.data.productMarketingEntries.filter((entry) =>
    entry.enabled !== false &&
    sources.has(entry.scope) &&
    (entry.scope === "global" ||
      (entry.scope === "category" && categories.has(entry.category)) ||
      (entry.scope === "product" && products.some((product) =>
        entry.product === product.name && entry.category === product.category)))
  );
}

function renderGenerationMarketingCopies() {
  const container = $("#generate-marketing-copies");
  if (!container || !state.data) return;
  const selectedMode = $("#marketing-selection-mode").value === "selected";
  const entries = generationMarketingEntries();
  const availableKeys = new Set(entries.map(marketingCopyKey));
  const activeSelectedCount = [...state.selectedMarketingCopyKeys].filter((key) => availableKeys.has(key)).length;
  container.classList.toggle("hidden", !selectedMode);
  const scopeLabels = { product: "产品专属", category: "分类通用", global: "全局通用" };
  container.innerHTML = entries.map((entry) => {
    const key = marketingCopyKey(entry);
    const owner = entry.scope === "product" ? entry.product : entry.scope === "category" ? entry.category : "全部产品";
    return `<label class="generation-copy-row">
      <input type="checkbox" data-generation-copy-key="${encodeURIComponent(key)}" ${state.selectedMarketingCopyKeys.has(key) ? "checked" : ""}>
      <span><strong>${entry.text}</strong><small>${scopeLabels[entry.scope]} · ${owner} · ${entryRegions(entry).join("、")}</small></span>
    </label>`;
  }).join("") || `<div class="summary-note">当前产品和来源范围内没有可用营销文案。</div>`;
  $$("[data-generation-copy-key]").forEach((input) => input.onchange = () => {
    const key = decodeURIComponent(input.dataset.generationCopyKey);
    input.checked ? state.selectedMarketingCopyKeys.add(key) : state.selectedMarketingCopyKeys.delete(key);
    const currentAvailable = new Set(generationMarketingEntries().map(marketingCopyKey));
    const count = [...state.selectedMarketingCopyKeys].filter((item) => currentAvailable.has(item)).length;
    $("#generate-marketing-copy-status").textContent = `已勾选 ${count} 条当前可用文案；同一文案即使有多个位置属性，在单张主图中也只会使用一次。`;
  });
  $("#generate-marketing-copy-status").textContent = selectedMode
    ? `当前可选 ${entries.length} 条，已勾选 ${activeSelectedCount} 条；同一文案在单张主图中只使用一次。`
    : "将按产品专属、分类通用、全局通用的顺序自动选择；可取消不需要的来源。";
}

function updateSummary() {
  $("#summary-products").textContent = state.selectedProducts.size;
  $("#summary-templates").textContent = state.selectedTemplates.size;
  const combined = $("#generation-mode")?.value === "combined";
  $("#summary-total").textContent = combined
    ? (state.selectedProducts.size >= 2 ? state.selectedTemplates.size : 0)
    : state.selectedProducts.size * state.selectedTemplates.size;
}

function updateGenerationBackgroundControls() {
  const mode = $("#generation-background-mode")?.value || "product";
  const noteWrap = $("#generation-background-note-wrap");
  if (noteWrap) noteWrap.classList.toggle("hidden", mode !== "custom");
  const messages = {
    product: "只继承模板的布局、配色和文字层级，原产品的专用场景、人物动作和工具不会直接照搬。",
    template: "完整保留模板原背景；仅适合模板场景与当前产品实际用途一致时使用。",
    custom: "自定义备注仅对本次生成生效；与模板原背景冲突时，以临时备注为准。",
  };
  if ($("#generation-background-status")) $("#generation-background-status").textContent = messages[mode];
}

function fillCategorySelects() {
  const options = state.data.categories.map((category) => `<option value="${category}">${category}</option>`).join("");
  $("#product-category").innerHTML = options;
  $("#detail-category").innerHTML = options;
}

function switchView(view) {
  if (!VALID_VIEWS.has(view)) view = "products";
  state.view = view;
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  try { localStorage.setItem(VIEW_STORAGE_KEY, view); } catch {}
  const labels = { products: "产品管理", marketing: "营销文案", templates: "模板中心", generate: "提示词生成", prompts: "提示词管理", references: "参考图分析", recycle: "回收站" };
  $("#page-title").textContent = labels[view];
  $$(".view").forEach((element) => element.classList.toggle("active", element.id === `view-${view}`));
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
}

function openTemplate(number = null, draft = null) {
  state.editingTemplateNumber = number;
  const template = draft || state.data.templates.find((item) => item.number === number) || {
    enabled: false, number: nextTemplateNumber(), name: "新模板", group: state.templateGroup === "全部" ? "未分组" : state.templateGroup, layout: "", subtitleSource: "副标题", points: 3,
    bottomSource: "底栏文案", bottomStyle: "标准单行", special: "无", netPosition: "产品附近",
  };
  $("#template-dialog-title").textContent = number ? "编辑模板" : "添加模板";
  $("#tpl-number").value = template.number;
  $("#tpl-number").disabled = Boolean(number);
  $("#tpl-name").value = template.name;
  const groups = [...new Set([
    ...(state.data.templateGroups || ["未分组"]),
    ...state.data.templates.map((item) => item.group || "未分组"),
  ])];
  $("#template-group-options").innerHTML = groups.map((group) => `<option value="${group}"></option>`).join("");
  $("#tpl-group").value = template.group || "未分组";
  $("#tpl-layout").value = template.layout;
  $("#tpl-subtitle").value = template.subtitleSource;
  $("#tpl-points").value = template.points;
  $("#tpl-bottom-source").value = template.bottomSource;
  $("#tpl-bottom-style").value = template.bottomStyle;
  $("#tpl-special").value = template.special;
  $("#tpl-net").value = template.netPosition;
  $("#tpl-enabled").checked = template.enabled;
  state.editingVisualLayout = normalizeVisualLayout(template.visualLayout || defaultVisualLayout(template.number, template.points));
  state.originalVisualLayout = structuredClone(state.editingVisualLayout);
  state.pendingDeletedElements = [];
  state.previewCategory ||= state.data.categories[0] || null;
  const categoryOptions = state.data.categories.map((category) => `<option value="${category}">${category}</option>`).join("");
  $("#preview-category").innerHTML = categoryOptions;
  $("#preview-category").value = state.previewCategory;
  fillPreviewProducts();
  state.selectedLayoutElement = null;
  state.drawingLayoutElement = null;
  updateLivePreview();
  $("#template-dialog").showModal();
}

function closeProductDraft() {
  if (!$("#product-dialog").open) return;
  $("#product-dialog").close("cancel");
  $("#product-form").reset();
  toast("新产品未保存，已关闭");
}

function closeTemplateDraft() {
  if (!$("#template-dialog").open) return;
  const editingExisting = Boolean(state.editingTemplateNumber);
  $("#template-dialog").close("cancel");
  state.editingTemplateNumber = null;
  state.editingVisualLayout = null;
  state.originalVisualLayout = null;
  state.selectedLayoutElement = null;
  state.drawingLayoutElement = null;
  state.pendingDeletedElements = [];
  toast(editingExisting ? "模板修改未保存，已关闭" : "新模板未保存，已关闭");
}

function fillPreviewProducts() {
  const products = state.data.products.filter((item) => item.category === state.previewCategory);
  state.previewProducts = state.previewProducts.filter((name) => products.some((item) => item.name === name));
  if (!state.previewProducts.length && products[0]) state.previewProducts = [products[0].name];
  $("#preview-products").innerHTML = products.map((product, index) => `
    <label class="preview-product-chip"><input type="checkbox" value="${product.name}" ${state.previewProducts.includes(product.name) ? "checked" : ""}>
      <img src="${media(product.imagePath)}" alt=""><span>${product.name}</span>
    </label>`).join("") || `<span>该分类暂无产品</span>`;
  $$("#preview-products input").forEach((input) => input.onchange = () => {
    if (input.checked) {
      if (state.previewProducts.length >= 6) { input.checked = false; return toast("最多预览6个产品", true); }
      state.previewProducts.push(input.value);
    } else state.previewProducts = state.previewProducts.filter((name) => name !== input.value);
    renderVisualEditor();
  });
}

function currentMarketingFilter() {
  const selectedProduct = findProductByKey(state.marketingProduct);
  const category = state.marketingScope === "product"
    ? selectedProduct?.category
    : state.marketingScope === "category" ? state.marketingCategory : "*";
  return {
    scope: state.marketingScope,
    category,
    product: state.marketingScope === "product" ? selectedProduct?.name : "*",
  };
}

function filteredProductCopies() {
  const filter = currentMarketingFilter();
  return state.data.productMarketingEntries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.scope === filter.scope)
    .filter(({ entry }) => filter.scope === "global" || entry.category === filter.category)
    .filter(({ entry }) => filter.scope !== "product" || entry.product === filter.product)
    .filter(({ entry }) => state.marketingCopyGroup === "全部" || entry.group === state.marketingCopyGroup);
}

function targetProductCopies() {
  const filter = currentMarketingFilter();
  return state.data.productMarketingEntries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.scope === filter.scope)
    .filter(({ entry }) => filter.scope === "global" || entry.category === filter.category)
    .filter(({ entry }) => filter.scope !== "product" || entry.product === filter.product);
}

function renderMarketingGroupFilters() {
  const targetItems = targetProductCopies();
  const groups = ["全部", ...MARKETING_COPY_GROUPS];
  $("#marketing-copy-group-filters").innerHTML = groups.map((group) => {
    const count = group === "全部" ? targetItems.length : targetItems.filter(({ entry }) => entry.group === group).length;
    return `<button type="button" class="chip ${state.marketingCopyGroup === group ? "active" : ""}" data-marketing-copy-group="${group}">${group}<small>${count}</small></button>`;
  }).join("");
  $$("[data-marketing-copy-group]").forEach((button) => button.onclick = () => {
    state.marketingCopyGroup = button.dataset.marketingCopyGroup;
    renderProductCopies();
  });
}

function renderProductCopies() {
  const filter = currentMarketingFilter();
  const editor = $("#marketing-editor-panel");
  const hasTarget = filter.scope === "global" || (filter.scope === "category" && filter.category) || (filter.scope === "product" && filter.product);
  editor.classList.toggle("hidden", !hasTarget);
  const allItems = targetProductCopies();
  const items = filteredProductCopies();
  const title = filter.scope === "global" ? "全局通用营销词"
    : filter.scope === "category" ? `${filter.category || "未选择"} · 分类通用营销词`
    : `${filter.product || "未选择产品"} · 产品专属营销词`;
  $("#marketing-status").textContent = filter.scope === "global" ? "当前显示全部产品均可补充使用的通用文案"
    : filter.scope === "category" ? `当前显示【${filter.category || "未选择"}】分类内产品可补充使用的通用文案`
    : `点击上方产品卡片，管理该产品生成主图时优先使用的专属文案`;
  $("#marketing-editor-eyebrow").textContent = filter.scope === "global" ? "GLOBAL COPY" : filter.scope === "category" ? "CATEGORY COPY" : "PRODUCT COPY";
  $("#marketing-editor-title").textContent = title;
  $("#marketing-editor-count").textContent = state.marketingCopyGroup === "全部"
    ? `${allItems.length} 条文案`
    : `${items.length} / ${allItems.length} 条文案`;
  renderMarketingGroupFilters();
  $("#product-copy-list").innerHTML = items.map(({ entry, index }) => `
    <div class="product-copy-row">
      <div class="copy-main-fields">
        <input data-copy-field="text" data-copy-index="${index}" value="${entry.text}" placeholder="输入营销词">
        <label>文案分组<select data-copy-field="group" data-copy-index="${index}">${MARKETING_COPY_GROUPS.map((group) => `<option ${entry.group === group ? "selected" : ""}>${group}</option>`).join("")}</select></label>
        <label>优先级<input type="number" data-copy-field="priority" data-copy-index="${index}" value="${entry.priority || 0}"></label>
        <label class="copy-enabled"><input type="checkbox" data-copy-field="enabled" data-copy-index="${index}" ${entry.enabled !== false ? "checked" : ""}>启用</label>
      </div>
      <div class="copy-region-options">
        <span>可用位置（可多选）</span>
        ${MARKETING_REGIONS.map((region) => `<label><input type="checkbox" data-copy-region="${region}" data-copy-index="${index}" ${entryRegions(entry).includes(region) ? "checked" : ""}>${region}</label>`).join("")}
      </div>
      <button type="button" data-remove-copy="${index}">×</button>
    </div>`).join("") || `<div class="summary-note">当前范围还没有营销词，点击下方按钮添加。</div>`;
  $$("[data-copy-field]").forEach((input) => input.oninput = () => {
    const entry = state.data.productMarketingEntries[Number(input.dataset.copyIndex)];
    entry[input.dataset.copyField] = input.dataset.copyField === "priority" ? Number(input.value)
      : input.dataset.copyField === "enabled" ? input.checked : input.value;
  });
  $$("[data-copy-region]").forEach((input) => input.onchange = () => {
    const entry = state.data.productMarketingEntries[Number(input.dataset.copyIndex)];
    const selected = $$(`[data-copy-region][data-copy-index="${input.dataset.copyIndex}"]:checked`).map((item) => item.dataset.copyRegion);
    if (!selected.length) {
      input.checked = true;
      return toast("每条营销文案至少需要一个位置属性", true);
    }
    entry.regions = selected;
    entry.region = selected[0];
    renderVisualEditor();
  });
  $$("[data-remove-copy]").forEach((button) => button.onclick = () => {
    const index = Number(button.dataset.removeCopy);
    const entry = state.data.productMarketingEntries[index];
    if (!window.confirm(`确定删除营销词“${entry.text || "空白营销词"}”吗？保存后会进入回收站并保留30天。`)) return;
    state.data.productMarketingEntries.splice(index, 1);
    state.pendingDeletedMarketing.push({ entry: structuredClone(entry), index });
    renderProductCopies();
    renderMarketingProductGrid();
    toast("营销词已删除，保存后进入回收站", false, {
      label: "撤销",
      run: () => {
        const pendingIndex = state.pendingDeletedMarketing.findIndex((item) =>
          item.index === index && item.entry.text === entry.text);
        if (pendingIndex >= 0) state.pendingDeletedMarketing.splice(pendingIndex, 1);
        state.data.productMarketingEntries.splice(Math.min(index, state.data.productMarketingEntries.length), 0, entry);
        renderProductCopies();
        renderMarketingProductGrid();
      },
    });
  });
}

function renderRecycleBin() {
  const list = $("#recycle-list");
  if (!list || !state.data) return;
  const items = state.data.recycleBin || [];
  $("#purge-recycle-all").disabled = !items.length;
  list.innerHTML = items.map((item) => {
    const deleted = new Date(item.deletedAt).toLocaleString("zh-CN");
    const expires = new Date(item.expiresAt).toLocaleDateString("zh-CN");
    const type = item.type === "marketing-copy" ? "营销词" : "模板元素";
    return `<article class="recycle-card">
      <div><span class="recycle-type">${type}</span><h3>${item.label}</h3><p>删除时间：${deleted}　自动清理：${expires}</p></div>
      <div class="recycle-actions"><button class="btn ghost" data-restore-trash="${item.id}">恢复</button><button class="btn danger" data-purge-trash="${item.id}">彻底删除</button></div>
    </article>`;
  }).join("") || `<div class="empty-recycle"><strong>回收站为空</strong><span>删除并保存的营销词或模板元素会在这里保留30天。</span></div>`;
  $$("[data-restore-trash]").forEach((button) => button.onclick = async () => {
    try {
      await api("/api/recycle/restore", { method: "POST", body: JSON.stringify({ id: button.dataset.restoreTrash }) });
      await reload();
      toast("已从回收站恢复");
    } catch (error) { toast(error.message, true); }
  });
  $$("[data-purge-trash]").forEach((button) => button.onclick = async () => {
    if (!window.confirm("彻底删除后无法从工作台恢复，确定继续吗？")) return;
    try {
      await api("/api/recycle/purge", { method: "POST", body: JSON.stringify({ id: button.dataset.purgeTrash }) });
      await reload();
      toast("已彻底删除");
    } catch (error) { toast(error.message, true); }
  });
}

function addProductCopy() {
  const filter = currentMarketingFilter();
  if (filter.scope === "product" && !filter.product) return toast("请先选择一个产品", true);
  if (filter.scope === "category" && !filter.category) return toast("请先选择一个分类", true);
  state.data.productMarketingEntries.push({
    scope: filter.scope,
    category: filter.scope === "global" ? "*" : filter.category,
    product: filter.scope === "product" ? filter.product : "*",
    regions: ["侧栏卖点"],
    region: "侧栏卖点",
    group: state.marketingCopyGroup === "全部" ? "其他" : state.marketingCopyGroup,
    text: "",
    priority: filter.scope === "product" ? 100 : filter.scope === "category" ? 50 : 10,
    enabled: true,
  });
  renderProductCopies();
  renderMarketingProductGrid();
}

function addBulkProductCopies() {
  const lines = $("#marketing-bulk-input").value.split(/\r?\n/)
    .map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return toast("请先按每行一条输入营销文案", true);
  const filter = currentMarketingFilter();
  if (filter.scope === "product" && !filter.product) return toast("请先选择一个产品", true);
  if (filter.scope === "category" && !filter.category) return toast("请先选择一个分类", true);
  const existing = new Set(targetProductCopies().map(({ entry }) => entry.text));
  const group = $("#marketing-bulk-group").value || "其他";
  let added = 0;
  for (const text of lines) {
    if (existing.has(text)) continue;
    existing.add(text);
    state.data.productMarketingEntries.push({
      scope: filter.scope,
      category: filter.scope === "global" ? "*" : filter.category,
      product: filter.scope === "product" ? filter.product : "*",
      regions: ["侧栏卖点"],
      region: "侧栏卖点",
      group,
      text,
      priority: filter.scope === "product" ? 100 : filter.scope === "category" ? 50 : 10,
      enabled: true,
    });
    added += 1;
  }
  $("#marketing-bulk-input").value = "";
  renderProductCopies();
  renderMarketingProductGrid();
  toast(added ? `已添加 ${added} 条营销文案` : "这些文案已经存在");
}

function openMarketingJsonDialog() {
  const filter = currentMarketingFilter();
  if (filter.scope === "product" && !filter.product) return toast("请先选择要导入文案的产品", true);
  if (filter.scope === "category" && !filter.category) return toast("请先选择要导入文案的分类", true);
  const scopeLabel = filter.scope === "product" ? "产品专属" : filter.scope === "category" ? "分类通用" : "全局通用";
  $("#marketing-json-target").textContent = `当前目标：${scopeLabel}｜${filter.category === "*" ? "全部分类" : filter.category}｜${filter.product === "*" ? "全部产品" : filter.product}`;
  $("#marketing-json-prompt").value = marketingJsonPrompt();
  $("#marketing-json-example").textContent = JSON.stringify(marketingJsonExample(), null, 2);
  $("#marketing-json-text").value = "";
  $("#marketing-json-file").value = "";
  $("#marketing-json-mode").value = "append";
  $("#marketing-json-status").className = "json-import-status";
  $("#marketing-json-status").textContent = "尚未校验。导入只会带入当前编辑器，仍需点击“保存营销文案”才会写入文件。";
  $("#marketing-json-preview").innerHTML = "";
  $("#apply-marketing-json").disabled = true;
  state.marketingImportEntries = [];
  $("#marketing-json-dialog").showModal();
}

function closeMarketingJsonDialog() {
  $("#marketing-json-dialog").close();
  state.marketingImportEntries = [];
}

function marketingEntryMatchesFilter(entry, filter) {
  return entry.scope === filter.scope
    && (filter.scope === "global" || entry.category === filter.category)
    && (filter.scope !== "product" || entry.product === filter.product);
}

async function validateMarketingJson() {
  const status = $("#marketing-json-status");
  try {
    const json = $("#marketing-json-text").value.trim();
    if (!json) throw new Error("请粘贴JSON或选择JSON文件");
    const filter = currentMarketingFilter();
    status.className = "json-import-status";
    status.textContent = "正在校验营销词、分组和位置属性…";
    const result = await api("/api/marketing/import-json", {
      method: "POST",
      body: JSON.stringify({ json, ...filter }),
    });
    const mismatched = result.entries.filter((entry) => !marketingEntryMatchesFilter(entry, filter));
    if (mismatched.length) throw new Error(`有${mismatched.length}条文案的scope/category/product与当前编辑目标不一致，请让AI使用页面提示词中的当前目标`);
    state.marketingImportEntries = result.entries;
    const groups = Object.entries(result.summary.groups).map(([group, count]) => `${group}${count}条`).join("、");
    status.className = "json-import-status success";
    status.textContent = `校验通过：共${result.summary.count}条，重复${result.summary.duplicateCount}条。分组：${groups || "无"}。`;
    $("#marketing-json-preview").innerHTML = result.entries.map((entry) => `
      <div class="marketing-json-preview-row ${entry.duplicate ? "duplicate" : ""}">
        <strong>${escapeHtml(entry.text)}</strong>
        <span>${escapeHtml(entry.group)}</span>
        <small>${escapeHtml(entry.regions.join("、"))}${entry.duplicate ? "｜已有重复" : ""}</small>
      </div>`).join("");
    $("#apply-marketing-json").disabled = false;
  } catch (error) {
    state.marketingImportEntries = [];
    $("#apply-marketing-json").disabled = true;
    status.className = "json-import-status error";
    status.textContent = error.message;
    $("#marketing-json-preview").innerHTML = "";
    toast(error.message, true);
  }
}

function applyMarketingJson() {
  const entries = state.marketingImportEntries;
  if (!entries.length) return toast("请先校验JSON", true);
  const filter = currentMarketingFilter();
  const mode = $("#marketing-json-mode").value;
  if (mode === "replace") {
    const currentCount = targetProductCopies().length;
    if (currentCount && !window.confirm(`将用导入的${entries.length}条文案替换当前范围已有的${currentCount}条文案，确定继续吗？`)) return;
    const removed = state.data.productMarketingEntries.filter((entry) => marketingEntryMatchesFilter(entry, filter));
    state.data.productMarketingEntries = state.data.productMarketingEntries.filter((entry) => !marketingEntryMatchesFilter(entry, filter));
    state.pendingDeletedMarketing.push(...removed.map((entry) => ({ entry: structuredClone(entry), index: -1 })));
  }
  const existing = new Set(state.data.productMarketingEntries.map(marketingCopyKey));
  let added = 0;
  for (const imported of entries) {
    const { duplicate, confidence, ...entry } = imported;
    const key = marketingCopyKey(entry);
    if (existing.has(key)) continue;
    existing.add(key);
    state.data.productMarketingEntries.push(entry);
    added += 1;
  }
  state.marketingCopyGroup = "全部";
  closeMarketingJsonDialog();
  renderProductCopies();
  renderMarketingProductGrid();
  $("#marketing-editor-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  toast(`已带入${added}条营销文案，确认后请点击“保存营销文案”`);
}

function nextTemplateNumber() {
  const max = Math.max(0, ...state.data.templates.map((item) => Number(item.number)));
  return String(max + 1).padStart(2, "0");
}

function templateFromForm() {
  return {
    enabled: $("#tpl-enabled").checked,
    number: $("#tpl-number").value.trim().padStart(2, "0"),
    name: $("#tpl-name").value.trim(),
    group: $("#tpl-group").value.trim() || "未分组",
    layout: $("#tpl-layout").value.trim(),
    subtitleSource: $("#tpl-subtitle").value,
    points: Number($("#tpl-points").value),
    bottomSource: $("#tpl-bottom-source").value,
    bottomStyle: $("#tpl-bottom-style").value,
    special: $("#tpl-special").value.trim() || "无",
    netPosition: $("#tpl-net").value,
    visualLayout: structuredClone(state.editingVisualLayout),
  };
}

function updateLivePreview() {
  renderVisualEditor();
}

async function saveTemplates() {
  await api("/api/templates/save", { method: "POST", body: JSON.stringify({
    templates: state.data.templates,
    groups: state.data.templateGroups,
  }) });
  toast("模板配置已保存");
  await reload();
}

function openProductDetail(key) {
  const product = findProductByKey(key);
  state.detailProduct = product;
  $("#detail-name").textContent = product.name;
  $("#detail-image").src = media(product.imagePath);
  $("#detail-category").value = product.category;
  $("#detail-net").value = product.net;
  $("#detail-form").value = product.form;
  $("#detail-tags").value = product.tags.join(", ");
  $("#detail-prompt").textContent = product.latestPrompt ? `最新提示词：${product.latestPrompt}` : "尚未生成提示词";
  $("#product-detail-dialog").showModal();
}

async function reload() {
  const selectedProducts = new Set(state.selectedProducts);
  const selectedTemplates = new Set(state.selectedTemplates);
  const selectedTemplateCards = new Set(state.selectedTemplateCards);
  const selectedMarketingCopyKeys = new Set(state.selectedMarketingCopyKeys);
  state.data = await api("/api/state");
  state.selectedProducts = new Set([...selectedProducts].filter((key) =>
    state.data.products.some((item) => productKey(item) === key)));
  state.selectedTemplates = new Set([...selectedTemplates].filter((number) => state.data.templates.some((item) => item.number === number)));
  state.selectedTemplateCards = new Set([...selectedTemplateCards].filter((number) => state.data.templates.some((item) => item.number === number)));
  const availableCopyKeys = new Set(state.data.productMarketingEntries.map(marketingCopyKey));
  state.selectedMarketingCopyKeys = new Set([...selectedMarketingCopyKeys].filter((key) => availableCopyKeys.has(key)));
  renderAll();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderProductStyleBuilder() {
  const packages = state.data.productStyles.filter((item) => item.kind === "package");
  const logos = state.data.productStyles.filter((item) => item.kind === "logo");
  state.selectedPackageStyle ||= packages[0]?.imagePath || null;
  state.selectedLogoStyle ||= logos[0]?.imagePath || null;
  const cards = (items, selected, attr) => items.map((item) => `
    <button type="button" class="style-card ${selected === item.imagePath ? "selected" : ""}" ${attr}="${item.imagePath}">
      <img src="${media(item.imagePath)}" alt=""><span>${item.name}</span>
    </button>`).join("");
  $("#package-style-picker").innerHTML = cards(packages, state.selectedPackageStyle, "data-package-style");
  $("#logo-style-picker").innerHTML = `<button type="button" class="style-card ${!state.selectedLogoStyle ? "selected" : ""}" data-logo-style=""><span>不加商标</span></button>`
    + cards(logos, state.selectedLogoStyle, "data-logo-style");
  $$("[data-package-style]").forEach((button) => button.onclick = () => { state.selectedPackageStyle = button.dataset.packageStyle; renderProductStyleBuilder(); });
  $$("[data-logo-style]").forEach((button) => button.onclick = () => { state.selectedLogoStyle = button.dataset.logoStyle || null; renderProductStyleBuilder(); });
  const name = $("#product-name").value.trim() || "产品名称";
  const net = $("#product-net").value.trim() || "净含量";
  $("#styled-product-preview").innerHTML = state.selectedPackageStyle
    ? `<img class="style-base" src="${media(state.selectedPackageStyle)}" alt="">${state.selectedLogoStyle ? `<img class="style-logo" src="${media(state.selectedLogoStyle)}" alt="">` : ""}<strong>${name}</strong><small>${net}</small>`
    : `<span>产品模板文件夹中暂无包装素材</span>`;
}

function loadCanvasImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

async function styledProductDataUrl() {
  if (!state.selectedPackageStyle) throw new Error("请选择包装样式");
  const canvas = document.createElement("canvas");
  canvas.width = 1400; canvas.height = 1400;
  const ctx = canvas.getContext("2d");
  const base = await loadCanvasImage(media(state.selectedPackageStyle));
  const scale = Math.min(1180 / base.width, 1180 / base.height);
  const w = base.width * scale, h = base.height * scale;
  const x = (canvas.width - w) / 2, y = (canvas.height - h) / 2;
  ctx.drawImage(base, x, y, w, h);
  if (state.selectedLogoStyle) {
    const logo = await loadCanvasImage(media(state.selectedLogoStyle));
    const logoW = Math.min(w * .38, 380), logoH = logo.height / logo.width * logoW;
    ctx.drawImage(logo, x + (w - logoW) / 2, y + h * .2, logoW, logoH);
  }
  ctx.textAlign = "center";
  ctx.fillStyle = "#17202a";
  ctx.font = "900 78px Microsoft YaHei";
  ctx.fillText($("#product-name").value.trim(), canvas.width / 2, y + h * .56);
  ctx.font = "700 42px Microsoft YaHei";
  ctx.fillText(`净含量：${$("#product-net").value.trim()}`, canvas.width / 2, y + h * .66);
  return canvas.toDataURL("image/png");
}

$("#nav").onclick = (event) => {
  const button = event.target.closest("[data-view]");
  if (button) switchView(button.dataset.view);
};
$("#purge-recycle-all").onclick = async () => {
  if (!window.confirm("确定清空回收站吗？所有项目都会被彻底删除，且无法从工作台恢复。")) return;
  if (!window.confirm("请再次确认：真的要永久删除回收站中的全部内容吗？")) return;
  try {
    await api("/api/recycle/purge", { method: "POST", body: JSON.stringify({ all: true }) });
    await reload();
    toast("回收站已清空");
  } catch (error) { toast(error.message, true); }
};
$("#refresh-btn").onclick = async () => { await reload(); toast("数据已刷新"); };
$("#product-search").oninput = (event) => { state.search = event.target.value; renderProducts(); };
$("#prompt-search").oninput = (event) => { state.promptSearch = event.target.value; renderPromptManager(); };
$("#open-prompt-root").onclick = async () => {
  try {
    await openFolder("");
    toast("已打开项目目录");
  } catch (error) { toast(error.message, true); }
};
$("#select-all-products").onchange = (event) => {
  for (const product of filteredProducts()) {
    const key = productKey(product);
    event.target.checked ? state.selectedProducts.add(key) : state.selectedProducts.delete(key);
  }
  renderProducts(); renderGenerator();
};
$("#go-generate-products").onclick = () => switchView("generate");
$("#new-category-btn").onclick = async () => {
  const name = prompt("请输入新分类名称");
  if (!name) return;
  try { await api("/api/categories", { method: "POST", body: JSON.stringify({ name }) }); await reload(); toast("分类已创建"); } catch (error) { toast(error.message, true); }
};
$("#new-product-btn").onclick = () => {
  $("#product-form").reset();
  $("#product-create-mode").value = "upload";
  $("#product-style-builder").classList.remove("active");
  $("#product-file-field").classList.remove("hidden");
  renderProductStyleBuilder();
  $("#product-dialog").showModal();
};
$$("[data-close-product-dialog]").forEach((button) => button.onclick = closeProductDraft);
$("#product-dialog").addEventListener("cancel", (event) => {
  event.preventDefault();
  closeProductDraft();
});
$("#product-create-mode").onchange = () => {
  const styled = $("#product-create-mode").value === "style";
  $("#product-style-builder").classList.toggle("active", styled);
  $("#product-file-field").classList.toggle("hidden", styled);
  if (styled) renderProductStyleBuilder();
};
$("#product-name").oninput = () => { if ($("#product-create-mode").value === "style") renderProductStyleBuilder(); };
$("#product-net").oninput = () => { if ($("#product-create-mode").value === "style") renderProductStyleBuilder(); };
$("#save-product-btn").onclick = async () => {
  try {
    const file = $("#product-file").files[0];
    const styled = $("#product-create-mode").value === "style";
    if (!styled && !file) throw new Error("请选择产品图片");
    const dataUrl = styled ? await styledProductDataUrl() : await fileToDataUrl(file);
    await api("/api/products/add", { method: "POST", body: JSON.stringify({
      name: $("#product-name").value, category: $("#product-category").value, net: $("#product-net").value,
      form: $("#product-form-type").value, tags: $("#product-tags").value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
      fileName: styled ? `${$("#product-name").value.trim()}.png` : file.name, dataUrl,
    }) });
    $("#product-dialog").close(); await reload(); toast("产品已添加");
  } catch (error) { toast(error.message, true); }
};
$("#new-template-btn").onclick = () => openTemplate();
$$("[data-close-template-dialog]").forEach((button) => button.onclick = closeTemplateDraft);
$("#template-dialog").addEventListener("cancel", (event) => {
  event.preventDefault();
  closeTemplateDraft();
});
$("#new-template-group").onclick = async () => {
  const name = prompt("请输入新的模板分组名称");
  const group = String(name || "").trim();
  if (!group) return;
  if (group === "全部" || state.data.templateGroups.includes(group)) return toast("该分组已存在", true);
  state.data.templateGroups.push(group);
  try {
    await saveTemplates();
    state.templateGroup = group;
    renderTemplates();
    toast(`已新建分组【${group}】`);
  } catch (error) { toast(error.message, true); }
};
$("#rename-template-group").onclick = async () => {
  if (["全部", "未分组"].includes(state.templateGroup)) return;
  const previous = state.templateGroup;
  const name = prompt("请输入新的分组名称", previous);
  const group = String(name || "").trim();
  if (!group || group === previous) return;
  if (group === "全部" || state.data.templateGroups.includes(group)) return toast("该分组已存在", true);
  state.data.templates.forEach((template) => {
    if ((template.group || "未分组") === previous) template.group = group;
  });
  state.data.templateGroups = state.data.templateGroups.map((item) => item === previous ? group : item);
  state.templateGroup = group;
  try { await saveTemplates(); toast("分组已重命名"); } catch (error) { toast(error.message, true); }
};
$("#delete-template-group").onclick = async () => {
  const group = state.templateGroup;
  if (["全部", "未分组"].includes(group)) return;
  if (!window.confirm(`确定删除模板分组【${group}】吗？该组模板会移入“未分组”。`)) return;
  state.data.templates.forEach((template) => {
    if ((template.group || "未分组") === group) template.group = "未分组";
  });
  state.data.templateGroups = state.data.templateGroups.filter((item) => item !== group);
  state.templateGroup = "未分组";
  try { await saveTemplates(); toast("分组已删除，原模板已移入未分组"); } catch (error) { toast(error.message, true); }
};
$("#select-all-templates").onchange = (event) => {
  const visible = state.data.templates.filter((template) =>
    state.templateGroup === "全部" || (template.group || "未分组") === state.templateGroup);
  visible.forEach((template) => event.target.checked
    ? state.selectedTemplateCards.add(template.number)
    : state.selectedTemplateCards.delete(template.number));
  renderTemplates();
};
$("#apply-template-group").onclick = async () => {
  if (!state.selectedTemplateCards.size) return toast("请先勾选要归类的模板", true);
  const group = $("#move-template-group").value;
  state.data.templates.forEach((template) => {
    if (state.selectedTemplateCards.has(template.number)) template.group = group;
  });
  state.selectedTemplateCards.clear();
  try { await saveTemplates(); toast(`所选模板已移动到【${group}】`); } catch (error) { toast(error.message, true); }
};
async function setSelectedTemplatesEnabled(enabled) {
  const targets = state.data.templates.filter((template) =>
    state.selectedTemplateCards.has(template.number) && template.enabled !== enabled);
  if (!targets.length) return toast(enabled ? "所选模板均已启用" : "所选模板均已停用");
  const previous = new Map(targets.map((template) => [template.number, template.enabled]));
  targets.forEach((template) => { template.enabled = enabled; });
  try {
    await saveTemplates();
    toast(`已批量${enabled ? "启用" : "停用"} ${targets.length} 个模板`);
  } catch (error) {
    targets.forEach((template) => { template.enabled = previous.get(template.number); });
    renderTemplates();
    toast(error.message, true);
  }
}
$("#batch-enable-templates").onclick = () => setSelectedTemplatesEnabled(true);
$("#batch-disable-templates").onclick = () => setSelectedTemplatesEnabled(false);
$("#save-template-btn").onclick = async () => {
  try {
    const template = templateFromForm();
    if (!template.name || !template.layout) throw new Error("请填写模板名称和构图描述");
    if (state.editingTemplateNumber) {
      const index = state.data.templates.findIndex((item) => item.number === state.editingTemplateNumber);
      state.data.templates[index] = template;
    } else {
      if (state.data.templates.some((item) => item.number === template.number)) throw new Error("模板编号已存在");
      state.data.templates.push(template);
    }
    await api("/api/templates/save", { method: "POST", body: JSON.stringify({
      templates: state.data.templates,
      groups: state.data.templateGroups,
      deletedElements: state.pendingDeletedElements,
    }) });
    state.pendingDeletedElements = [];
    $("#template-dialog").close(); await reload(); toast("模板已保存");
  } catch (error) { toast(error.message, true); }
};
$$(".template-editor input, .template-editor select, .template-editor textarea").forEach((element) => element.addEventListener("input", updateLivePreview));
$("#reset-layout").onclick = () => {
  state.editingVisualLayout = defaultVisualLayout($("#tpl-number").value.padStart(2, "0"), Number($("#tpl-points").value));
  state.selectedLayoutElement = null;
  state.drawingLayoutElement = null;
  renderVisualEditor();
};
$("#preview-category").onchange = (event) => {
  state.previewCategory = event.target.value;
  state.previewProducts = [];
  fillPreviewProducts();
  renderVisualEditor();
};
$("#marketing-scope").onchange = (event) => {
  state.marketingScope = event.target.value;
  state.marketingCopyGroup = "全部";
  if (state.marketingScope === "product") state.marketingCategory = "全部";
  if (state.marketingScope === "category" && !state.data.categories.includes(state.marketingCategory)) {
    state.marketingCategory = state.data.categories[0] || null;
  }
  renderMarketingNavigation();
};
$("#marketing-product-search").oninput = (event) => {
  state.marketingSearch = event.target.value;
  const products = marketingVisibleProducts();
  if (!products.some((item) => productKey(item) === state.marketingProduct)) {
    state.marketingProduct = products[0] ? productKey(products[0]) : null;
  }
  renderMarketingProductGrid();
  renderProductCopies();
};
$("#add-product-copy").onclick = addProductCopy;
$("#add-bulk-product-copy").onclick = addBulkProductCopies;
$("#open-marketing-json-import").onclick = openMarketingJsonDialog;
$("#close-marketing-json-dialog").onclick = closeMarketingJsonDialog;
$("#cancel-marketing-json-dialog").onclick = closeMarketingJsonDialog;
$("#marketing-json-file").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    $("#marketing-json-text").value = await file.text();
    $("#marketing-json-status").className = "json-import-status";
    $("#marketing-json-status").textContent = `已读取文件：${file.name}，请点击“校验并预览”。`;
    $("#apply-marketing-json").disabled = true;
  } catch (error) {
    $("#marketing-json-status").className = "json-import-status error";
    $("#marketing-json-status").textContent = `读取失败：${error.message}`;
  }
};
$("#fill-marketing-json-example").onclick = () => {
  $("#marketing-json-text").value = JSON.stringify(marketingJsonExample(), null, 2);
  $("#marketing-json-status").className = "json-import-status";
  $("#marketing-json-status").textContent = "示例已填入，可直接校验。";
  $("#apply-marketing-json").disabled = true;
};
$("#copy-marketing-json-prompt").onclick = () => copyText(marketingJsonPrompt(), "AI营销词分析提示词已复制");
$("#copy-marketing-json-example").onclick = () => copyText(JSON.stringify(marketingJsonExample(), null, 2), "营销词JSON示例已复制");
$("#validate-marketing-json").onclick = validateMarketingJson;
$("#apply-marketing-json").onclick = applyMarketingJson;
$("#save-marketing-page").onclick = async () => {
  try {
    if (state.data.productMarketingEntries.some((entry) => !entry.text.trim())) throw new Error("请填写或删除空白营销词");
    if (state.data.productMarketingEntries.some((entry) => !entryRegions(entry).length)) throw new Error("每条营销词至少需要一个位置属性");
    if (state.data.productMarketingEntries.some((entry) => !MARKETING_COPY_GROUPS.includes(entry.group))) throw new Error("每条营销词必须选择一个有效的文案分组");
    await api("/api/product-marketing/save", { method: "POST", body: JSON.stringify({
      entries: state.data.productMarketingEntries,
      deletedEntries: state.pendingDeletedMarketing.map((item) => item.entry),
    }) });
    state.pendingDeletedMarketing = [];
    await reload();
    renderVisualEditor();
    toast("营销文案已保存，模板预览已更新");
  } catch (error) { toast(error.message, true); }
};
$("#layout-canvas").onpointerdown = (event) => {
  if (event.target !== $("#layout-canvas") || !state.drawingLayoutElement) return;
  event.preventDefault();
  const draft = state.drawingLayoutElement;
  const key = draft.key;
  const start = canvasPoint(event);
  const box = normalizeVisualLayout({ elements: {
    [key]: { x: start.x, y: start.y, w: 3, h: 3, z: draft.type === "backgroundRegion" ? 1 : draft.type === "animalRegion" ? 2 : 5, visible: true, type: draft.type, label: draft.label, binding: draft.type === "product" ? `product${Math.max(1, Number(key.match(/\d+$/)?.[0] || 1))}` : "custom", text: "", shape: draft.type === "product" ? "none" : "rounded", fontRatio: draft.type === "product" ? null : 0.8, copyRegion: draft.type === "sellingPoint" ? "侧栏卖点" : undefined },
  } }).elements[key];
  state.editingVisualLayout.elements[key] = box;
  const move = (moveEvent) => {
    const point = canvasPoint(moveEvent);
    box.x = Math.min(start.x, point.x);
    box.y = Math.min(start.y, point.y);
    box.w = Math.abs(point.x - start.x);
    box.h = Math.abs(point.y - start.y);
    clampBox(box);
    renderVisualEditor();
  };
  const end = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    state.selectedLayoutElement = key;
    state.drawingLayoutElement = null;
    renderVisualEditor();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
};
$("#generate-product-search").oninput = renderGenerator;
$("#generate-select-products").onclick = () => {
  const allSelected = state.selectedProducts.size === state.data.products.length;
  state.selectedProducts = allSelected ? new Set() : new Set(state.data.products.map(productKey));
  renderGenerator(); renderProducts();
};
$("#generate-select-templates").onclick = () => {
  state.data.templates.filter((template) => template.enabled)
    .forEach((template) => state.selectedTemplates.add(template.number));
  renderGenerator();
};
$("#generate-clear-templates").onclick = () => {
  state.selectedTemplates.clear();
  renderGenerator();
};
$("#generate-select-template-group").onclick = () => {
  const visible = state.data.templates.filter((template) =>
    state.generateTemplateGroup === "全部" || (template.group || "未分组") === state.generateTemplateGroup);
  visible.forEach((template) => state.selectedTemplates.add(template.number));
  renderGenerator();
};
$("#generate-clear-template-group").onclick = () => {
  const visibleNumbers = new Set(state.data.templates
    .filter((template) => state.generateTemplateGroup === "全部" || (template.group || "未分组") === state.generateTemplateGroup)
    .map((template) => template.number));
  state.selectedTemplates = new Set([...state.selectedTemplates].filter((number) => !visibleNumbers.has(number)));
  renderGenerator();
};
$("#generation-mode").onchange = updateSummary;
$$("[data-marketing-source]").forEach((input) => input.onchange = renderGenerationMarketingCopies);
$("#marketing-selection-mode").onchange = renderGenerationMarketingCopies;
$("#generation-background-mode").onchange = updateGenerationBackgroundControls;
$$("[data-background-preset]").forEach((button) => button.onclick = () => {
  $("#generation-background-mode").value = "custom";
  $("#generation-background-note").value = button.dataset.backgroundPreset;
  updateGenerationBackgroundControls();
});
$("#generate-btn").onclick = async () => {
  try {
    $("#generation-result").textContent = "正在生成…";
    state.lastGeneratedPaths = [];
    renderGeneratedFolderActions();
    const result = await api("/api/prompts/generate", { method: "POST", body: JSON.stringify({
      products: [...state.selectedProducts],
      templates: [...state.selectedTemplates],
      mode: $("#generation-mode").value,
      marketingSources: selectedMarketingSources(),
      marketingSelectionMode: $("#marketing-selection-mode").value,
      marketingCopyKeys: [...state.selectedMarketingCopyKeys],
      backgroundMode: $("#generation-background-mode").value,
      backgroundNote: $("#generation-background-note").value.trim(),
    }) });
    $("#generation-result").textContent = `已生成 ${result.generated.length} 份文件\n${result.generated.join("\n")}`;
    state.lastGeneratedPaths = result.generated;
    renderGeneratedFolderActions();
    await reload(); toast("提示词生成完成");
  } catch (error) { $("#generation-result").textContent = error.message; toast(error.message, true); }
};
$("#close-detail").onclick = () => $("#product-detail-dialog").close();
$("#save-detail").onclick = async () => {
  try {
    const product = state.detailProduct;
    const category = $("#detail-category").value;
    await api("/api/products/tags", { method: "POST", body: JSON.stringify({
      name: product.name, category: product.category,
      net: $("#detail-net").value, form: $("#detail-form").value,
      tags: $("#detail-tags").value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
    }) });
    if (category !== product.category) {
      await api("/api/products/move", {
        method: "POST",
        body: JSON.stringify({ name: product.name, sourceCategory: product.category, category }),
      });
    }
    $("#product-detail-dialog").close(); await reload(); toast("产品资料已保存");
  } catch (error) { toast(error.message, true); }
};
$("#reference-file").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  state.referenceFile = file;
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => { state.referenceDimensions = { width: image.naturalWidth, height: image.naturalHeight }; URL.revokeObjectURL(url); };
  image.src = url;
  $("#reference-preview").src = url;
  $("#reference-drop").classList.add("has-image");
};
$("#json-template-file").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    $("#json-template-text").value = await file.text();
    $("#json-import-status").className = "json-import-status success";
    $("#json-import-status").textContent = `已读取文件：${file.name}，尚未导入模板。`;
  } catch (error) {
    $("#json-import-status").className = "json-import-status error";
    $("#json-import-status").textContent = `读取失败：${error.message}`;
  }
};
$("#fill-json-example").onclick = () => {
  $("#json-template-text").value = JSON.stringify(JSON_TEMPLATE_EXAMPLE, null, 2);
  $("#json-import-status").className = "json-import-status";
  $("#json-import-status").textContent = "示例已填入，可直接校验并带入编辑器。";
};
$("#copy-json-prompt").onclick = () => copyText(JSON_ANALYSIS_PROMPT, "分析提示词已复制");
$("#copy-json-example").onclick = () => copyText(JSON.stringify(JSON_TEMPLATE_EXAMPLE, null, 2), "JSON示例已复制");
$("#import-json-template").onclick = async () => {
  const status = $("#json-import-status");
  try {
    const json = $("#json-template-text").value.trim();
    if (!json) throw new Error("请粘贴JSON或选择JSON文件");
    status.className = "json-import-status";
    status.textContent = "正在校验JSON…";
    const result = await api("/api/templates/import-json", { method: "POST", body: JSON.stringify({
      json,
      number: $("#json-template-number").value,
      name: $("#json-template-name").value,
    }) });
    const count = Object.values(result.draft.visualLayout?.elements || {}).filter((box) => box.visible !== false).length;
    status.className = "json-import-status success";
    status.textContent = `校验通过，共识别${count}个可见图层，已带入模板编辑器。`;
    openTemplate(null, result.draft);
  } catch (error) {
    status.className = "json-import-status error";
    status.textContent = error.message;
    toast(error.message, true);
  }
};
$("#analyze-reference-btn").onclick = async () => {
  try {
    if (!state.referenceFile) throw new Error("请先选择参考图");
    $("#analysis-output").textContent = "正在导入并分析…";
    const result = await api("/api/references/import", { method: "POST", body: JSON.stringify({
      fileName: state.referenceFile.name, dataUrl: await fileToDataUrl(state.referenceFile),
      name: $("#reference-name").value, number: $("#reference-number").value,
      width: state.referenceDimensions?.width, height: state.referenceDimensions?.height,
    }) });
    const layerCount = Object.values(result.draft.visualLayout?.elements || {}).filter((box) => box.visible !== false).length;
    const modeText = result.draft.analysisMode === "ai"
      ? `视觉模型已生成${layerCount}个结构化图层。`
      : result.draft.analysisError ? `自动分析未完成：${result.draft.analysisError}\n已保留基础草稿，可继续手动编辑。`
      : "当前为本地基础草稿。";
    $("#analysis-output").innerHTML = `${modeText}\n${result.draft.layout}\n\n已保存：${result.savedAs}\n\n<button class="btn small" id="use-analysis">带入模板编辑器</button>`;
    $("#use-analysis").onclick = () => openTemplate(null, result.draft);
    toast("参考图已导入");
  } catch (error) { $("#analysis-output").textContent = error.message; toast(error.message, true); }
};

$("#json-analysis-prompt").value = JSON_ANALYSIS_PROMPT;
$("#json-example-preview").textContent = JSON.stringify(JSON_TEMPLATE_EXAMPLE, null, 2);

load().catch((error) => {
  document.body.innerHTML = `<main style="padding:40px"><h1>无法启动工作台</h1><p>${error.message}</p></main>`;
});
