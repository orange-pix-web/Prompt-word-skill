const state = {
  data: null,
  view: "products",
  category: "全部",
  search: "",
  selectedProducts: new Set(),
  selectedTemplates: new Set(),
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
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: options.body ? { "content-type": "application/json" } : undefined,
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "操作失败");
  return payload;
}

function toast(message, error = false) {
  const element = $("#toast");
  element.textContent = message;
  element.className = `toast show${error ? " error" : ""}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.className = "toast", 3000);
}

function media(path) {
  return `/media?path=${encodeURIComponent(path)}`;
}

function formatSize(bytes) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

async function load() {
  state.data = await api("/api/state");
  $("#data-root").textContent = state.data.dataRoot;
  for (const template of state.data.templates.filter((item) => item.enabled)) state.selectedTemplates.add(template.number);
  renderAll();
}

function renderAll() {
  renderMetrics();
  renderCategoryFilters();
  renderProducts();
  renderTemplates();
  renderGenerator();
  fillCategorySelects();
  renderMarketingNavigation();
  $("#ai-state").textContent = state.data.aiAnalysisAvailable ? "AI视觉分析已启用" : "本地草稿模式";
}

function renderMarketingNavigation() {
  const previousCategory = $("#marketing-category").value || state.data.categories[0];
  const previousTemplate = $("#marketing-template").value || state.data.templates[0]?.number;
  $("#marketing-category").innerHTML = state.data.categories.map((item) => `<option value="${item}">${item}</option>`).join("");
  $("#marketing-template").innerHTML = state.data.templates.map((item) => `<option value="${item.number}">${item.number} · ${item.name}</option>`).join("");
  $("#marketing-category").value = state.data.categories.includes(previousCategory) ? previousCategory : state.data.categories[0];
  $("#marketing-template").value = state.data.templates.some((item) => item.number === previousTemplate) ? previousTemplate : state.data.templates[0]?.number;
  loadMarketingForm();
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
    <article class="product-card ${state.selectedProducts.has(product.name) ? "selected" : ""}">
      <input class="card-check" type="checkbox" data-select-product="${product.name}" ${state.selectedProducts.has(product.name) ? "checked" : ""}>
      <span class="category-badge">${product.category}</span>
      <div class="product-thumb"><img loading="lazy" src="${media(product.imagePath)}" alt="${product.name}"></div>
      <div class="product-body">
        <h3>${product.name}</h3>
        <div class="product-meta"><span>${product.net}</span><span>${formatSize(product.size)}</span></div>
        <div class="tags">${product.tags.length ? product.tags.map((tag) => `<span class="tag">${tag}</span>`).join("") : `<span class="tag">待添加标签</span>`}</div>
      </div>
      <div class="card-foot">
        <button data-detail="${product.name}">资料与分类</button>
        <button data-generate-one="${product.name}">${product.latestPrompt ? `提示词 v${product.promptVersion}` : "生成提示词"}</button>
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
  const category = state.previewCategory || state.data?.categories?.[0];
  const number = $("#tpl-number")?.value?.trim().padStart(2, "0");
  return state.data?.marketingRows?.find((row) => row.category === category && row.number === number) || null;
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
    box.visible = false;
    box.manualHidden = true;
    state.selectedLayoutElement = null;
    renderVisualEditor();
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
  $("#template-grid").innerHTML = state.data.templates.map((template) => `
    <article class="template-card">
      <div class="template-preview">${wireframe(template)}</div>
      <div class="template-info">
        <div class="template-info-head"><span class="template-number">TEMPLATE ${template.number}</span><span class="enabled-pill ${template.enabled ? "" : "off"}">${template.enabled ? "已启用" : "已停用"}</span></div>
        <h3>${template.name}</h3>
        <p>${template.layout}</p>
        <div class="template-stats"><span>${template.points}条卖点</span><span>${template.bottomStyle}</span><span>${template.netPosition}</span></div>
      </div>
      <div class="template-actions"><button class="text-btn" data-toggle-template="${template.number}">${template.enabled ? "停用" : "启用"}</button><button class="btn small" data-edit-template="${template.number}">编辑与预览</button></div>
    </article>
  `).join("");
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
  $("#generate-products").innerHTML = products.map((product) => `
    <label class="check-row"><input type="checkbox" data-g-product="${product.name}" ${state.selectedProducts.has(product.name) ? "checked" : ""}><img src="${media(product.imagePath)}" alt=""><span>${product.name}<small>${product.category} · ${product.net}</small></span></label>
  `).join("");
  $("#generate-templates").innerHTML = state.data.templates.map((template) => `
    <label class="check-row"><input type="checkbox" data-g-template="${template.number}" ${state.selectedTemplates.has(template.number) ? "checked" : ""}><span><strong>${template.number} · ${template.name}</strong><small>${template.points}条卖点 · ${template.bottomStyle}</small></span></label>
  `).join("");
  $$("[data-g-product]").forEach((input) => input.onchange = () => {
    input.checked ? state.selectedProducts.add(input.dataset.gProduct) : state.selectedProducts.delete(input.dataset.gProduct);
    updateSummary();
    renderProducts();
  });
  $$("[data-g-template]").forEach((input) => input.onchange = () => {
    input.checked ? state.selectedTemplates.add(input.dataset.gTemplate) : state.selectedTemplates.delete(input.dataset.gTemplate);
    updateSummary();
  });
  updateSummary();
}

function updateSummary() {
  $("#summary-products").textContent = state.selectedProducts.size;
  $("#summary-templates").textContent = state.selectedTemplates.size;
  const combined = $("#generation-mode")?.value === "combined";
  $("#summary-total").textContent = combined
    ? (state.selectedProducts.size >= 2 ? state.selectedTemplates.size : 0)
    : state.selectedProducts.size * state.selectedTemplates.size;
}

function fillCategorySelects() {
  const options = state.data.categories.map((category) => `<option value="${category}">${category}</option>`).join("");
  $("#product-category").innerHTML = options;
  $("#detail-category").innerHTML = options;
}

function switchView(view) {
  state.view = view;
  const labels = { products: "产品管理", marketing: "营销文案", templates: "模板中心", generate: "提示词生成", references: "参考图分析" };
  $("#page-title").textContent = labels[view];
  $$(".view").forEach((element) => element.classList.toggle("active", element.id === `view-${view}`));
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
}

function openTemplate(number = null, draft = null) {
  state.editingTemplateNumber = number;
  const template = draft || state.data.templates.find((item) => item.number === number) || {
    enabled: false, number: nextTemplateNumber(), name: "新模板", layout: "", subtitleSource: "副标题", points: 3,
    bottomSource: "底栏文案", bottomStyle: "标准单行", special: "无", netPosition: "产品附近",
  };
  $("#template-dialog-title").textContent = number ? "编辑模板" : "添加模板";
  $("#tpl-number").value = template.number;
  $("#tpl-number").disabled = Boolean(number);
  $("#tpl-name").value = template.name;
  $("#tpl-layout").value = template.layout;
  $("#tpl-subtitle").value = template.subtitleSource;
  $("#tpl-points").value = template.points;
  $("#tpl-bottom-source").value = template.bottomSource;
  $("#tpl-bottom-style").value = template.bottomStyle;
  $("#tpl-special").value = template.special;
  $("#tpl-net").value = template.netPosition;
  $("#tpl-enabled").checked = template.enabled;
  state.editingVisualLayout = normalizeVisualLayout(template.visualLayout || defaultVisualLayout(template.number, template.points));
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

function marketingRow(category, number) {
  return state.data.marketingRows.find((row) => row.category === category && row.number === number);
}

function openMarketingEditor(number = null, category = null) {
  number ||= state.data.templates[0]?.number;
  category ||= state.previewCategory || state.data.categories[0];
  $("#marketing-category").innerHTML = state.data.categories.map((item) => `<option value="${item}">${item}</option>`).join("");
  $("#marketing-template").innerHTML = state.data.templates.map((item) => `<option value="${item.number}">${item.number} · ${item.name}</option>`).join("");
  $("#marketing-category").value = category;
  $("#marketing-template").value = state.data.templates.some((item) => item.number === number) ? number : state.data.templates[0]?.number;
  loadMarketingForm();
  switchView("marketing");
}

function commitMarketingFormToDraft() {
  if (!state.marketingDraft) return;
  state.marketingDraft.subtitle = $("#marketing-subtitle").value.trim();
  state.marketingDraft.support = $("#marketing-support").value.trim();
  state.marketingDraft.footer = $("#marketing-footer").value.trim();
  state.marketingDraft.points = $$("[data-marketing-point]").map((input) => input.value.trim());
  state.marketingDraft.pointTargets = state.marketingDraft.points.map((_, index) =>
    $$(`[data-target-index="${index}"]:checked`).map((input) => input.value)
  );
}

function loadMarketingForm() {
  const category = $("#marketing-category").value;
  const number = $("#marketing-template").value;
  const source = marketingRow(category, number) || { category, number, subtitle: "", support: "", points: ["", "", ""], pointTargets: [["all"],["all"],["all"]], footer: "" };
  state.editingMarketingKey = `${category}\0${number}`;
  state.marketingDraft = structuredClone(source);
  state.marketingDraft.pointTargets ||= source.points.map(() => ["all"]);
  $("#marketing-subtitle").value = source.subtitle || "";
  $("#marketing-support").value = source.support || "";
  $("#marketing-footer").value = source.footer || "";
  $("#marketing-status").textContent = `正在编辑【${category}】模板 ${number}；画布保存后会立即使用这些文案。`;
  renderMarketingPoints();
}

function renderMarketingPoints() {
  const points = state.marketingDraft?.points || [];
  $("#marketing-points").innerHTML = points.map((point, index) => {
    const targets = state.marketingDraft.pointTargets?.[index] || ["all"];
    const targetChecks = [["all","全部"], ...Array.from({length:6},(_,slot)=>[`product${slot+1}`,`产品${slot+1}`])]
      .map(([value,label]) => `<label><input type="checkbox" data-target-index="${index}" value="${value}" ${targets.includes(value) ? "checked" : ""}>${label}</label>`).join("");
    return `
    <div class="marketing-point-row">
      <span>${index + 1}</span><input value="${point}" data-marketing-point="${index}" placeholder="输入第${index + 1}条卖点">
      <button type="button" data-point-up="${index}" title="上移">↑</button>
      <button type="button" data-point-down="${index}" title="下移">↓</button>
      <button type="button" class="remove" data-point-remove="${index}" title="删除">×</button>
      <div class="point-targets">${targetChecks}</div>
    </div>`;
  }).join("");
  $$("[data-marketing-point]").forEach((input) => input.oninput = () => state.marketingDraft.points[Number(input.dataset.marketingPoint)] = input.value);
  $$("[data-target-index]").forEach((input) => input.onchange = () => {
    const group = $$(`[data-target-index="${input.dataset.targetIndex}"]`);
    if (input.checked && input.value === "all") group.filter((item) => item !== input).forEach((item) => item.checked = false);
    if (input.checked && input.value !== "all") group.find((item) => item.value === "all").checked = false;
    if (!group.some((item) => item.checked)) group.find((item) => item.value === "all").checked = true;
  });
  $$("[data-point-up]").forEach((button) => button.onclick = () => moveMarketingPoint(Number(button.dataset.pointUp), -1));
  $$("[data-point-down]").forEach((button) => button.onclick = () => moveMarketingPoint(Number(button.dataset.pointDown), 1));
  $$("[data-point-remove]").forEach((button) => button.onclick = () => {
    const index = Number(button.dataset.pointRemove);
    state.marketingDraft.points.splice(index, 1);
    state.marketingDraft.pointTargets?.splice(index, 1);
    renderMarketingPoints();
  });
}

function moveMarketingPoint(index, offset) {
  const target = index + offset;
  if (target < 0 || target >= state.marketingDraft.points.length) return;
  [state.marketingDraft.points[index], state.marketingDraft.points[target]] = [state.marketingDraft.points[target], state.marketingDraft.points[index]];
  if (state.marketingDraft.pointTargets) [state.marketingDraft.pointTargets[index], state.marketingDraft.pointTargets[target]] = [state.marketingDraft.pointTargets[target], state.marketingDraft.pointTargets[index]];
  renderMarketingPoints();
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
  await api("/api/templates/save", { method: "POST", body: JSON.stringify({ templates: state.data.templates }) });
  toast("模板配置已保存");
  await reload();
}

function openProductDetail(name) {
  const product = state.data.products.find((item) => item.name === name);
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
  state.data = await api("/api/state");
  state.selectedProducts = new Set([...selectedProducts].filter((name) => state.data.products.some((item) => item.name === name)));
  state.selectedTemplates = new Set([...selectedTemplates].filter((number) => state.data.templates.some((item) => item.number === number)));
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
$("#refresh-btn").onclick = async () => { await reload(); toast("数据已刷新"); };
$("#product-search").oninput = (event) => { state.search = event.target.value; renderProducts(); };
$("#select-all-products").onchange = (event) => {
  for (const product of filteredProducts()) event.target.checked ? state.selectedProducts.add(product.name) : state.selectedProducts.delete(product.name);
  renderProducts(); renderGenerator();
};
$("#go-generate-products").onclick = () => switchView("generate");
$("#new-category-btn").onclick = async () => {
  const name = prompt("请输入新分类名称");
  if (!name) return;
  try { await api("/api/categories", { method: "POST", body: JSON.stringify({ name }) }); await reload(); toast("分类已创建"); } catch (error) { toast(error.message, true); }
};
$("#new-product-btn").onclick = () => {
  $("#product-create-mode").value = "upload";
  $("#product-style-builder").classList.remove("active");
  $("#product-file-field").classList.remove("hidden");
  renderProductStyleBuilder();
  $("#product-dialog").showModal();
};
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
    await api("/api/templates/save", { method: "POST", body: JSON.stringify({ templates: state.data.templates }) });
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
$("#marketing-category").onchange = loadMarketingForm;
$("#marketing-template").onchange = loadMarketingForm;
$("#add-marketing-point").onclick = () => {
  commitMarketingFormToDraft();
  state.marketingDraft.points.push("");
  state.marketingDraft.pointTargets ||= [];
  state.marketingDraft.pointTargets.push(["all"]);
  renderMarketingPoints();
};
$("#save-marketing-page").onclick = async () => {
  try {
    commitMarketingFormToDraft();
    if (!state.marketingDraft.subtitle || !state.marketingDraft.footer) throw new Error("副标题和底栏文案不能为空");
    const rows = state.data.marketingRows.map((row) => structuredClone(row));
    const index = rows.findIndex((row) => row.category === state.marketingDraft.category && row.number === state.marketingDraft.number);
    if (index >= 0) rows[index] = state.marketingDraft;
    else rows.push(state.marketingDraft);
    await api("/api/marketing/save", { method: "POST", body: JSON.stringify({ rows }) });
    state.previewCategory = state.marketingDraft.category;
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
    [key]: { x: start.x, y: start.y, w: 3, h: 3, z: draft.type === "backgroundRegion" ? 1 : draft.type === "animalRegion" ? 2 : 5, visible: true, type: draft.type, label: draft.label, binding: draft.type === "product" ? `product${Math.max(1, Number(key.match(/\d+$/)?.[0] || 1))}` : "custom", text: "", shape: draft.type === "product" ? "none" : "rounded", fontRatio: draft.type === "product" ? null : 0.8 },
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
  state.selectedProducts = allSelected ? new Set() : new Set(state.data.products.map((item) => item.name));
  renderGenerator(); renderProducts();
};
$("#generate-select-templates").onclick = () => {
  state.selectedTemplates = new Set(state.data.templates.filter((item) => item.enabled).map((item) => item.number));
  renderGenerator();
};
$("#generation-mode").onchange = updateSummary;
$("#generate-btn").onclick = async () => {
  try {
    $("#generation-result").textContent = "正在生成…";
    const result = await api("/api/prompts/generate", { method: "POST", body: JSON.stringify({
      products: [...state.selectedProducts], templates: [...state.selectedTemplates], mode: $("#generation-mode").value,
    }) });
    $("#generation-result").textContent = `已生成 ${result.generated.length} 份文件\n${result.generated.join("\n")}`;
    await reload(); toast("提示词生成完成");
  } catch (error) { $("#generation-result").textContent = error.message; toast(error.message, true); }
};
$("#close-detail").onclick = () => $("#product-detail-dialog").close();
$("#save-detail").onclick = async () => {
  try {
    const product = state.detailProduct;
    const category = $("#detail-category").value;
    await api("/api/products/tags", { method: "POST", body: JSON.stringify({
      name: product.name, net: $("#detail-net").value, form: $("#detail-form").value,
      tags: $("#detail-tags").value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
    }) });
    if (category !== product.category) await api("/api/products/move", { method: "POST", body: JSON.stringify({ name: product.name, category }) });
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
$("#analyze-reference-btn").onclick = async () => {
  try {
    if (!state.referenceFile) throw new Error("请先选择参考图");
    $("#analysis-output").textContent = "正在导入并分析…";
    const result = await api("/api/references/import", { method: "POST", body: JSON.stringify({
      fileName: state.referenceFile.name, dataUrl: await fileToDataUrl(state.referenceFile),
      name: $("#reference-name").value, number: $("#reference-number").value,
      width: state.referenceDimensions?.width, height: state.referenceDimensions?.height,
    }) });
    $("#analysis-output").innerHTML = `${result.draft.layout}\n\n已保存：${result.savedAs}\n\n<button class="btn small" id="use-analysis">带入模板编辑器</button>`;
    $("#use-analysis").onclick = () => openTemplate(null, result.draft);
    toast("参考图已导入");
  } catch (error) { $("#analysis-output").textContent = error.message; toast(error.message, true); }
};

load().catch((error) => {
  document.body.innerHTML = `<main style="padding:40px"><h1>无法启动工作台</h1><p>${error.message}</p></main>`;
});
