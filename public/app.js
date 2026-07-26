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
  $("#ai-state").textContent = state.data.aiAnalysisAvailable ? "AI视觉分析已启用" : "本地草稿模式";
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
    const labels = layoutElementLabels();
    const visualClass = /^0[1-9]$/.test(template.number) ? `layout-${template.number}` : "layout-generic";
    const boxes = Object.entries(template.visualLayout.elements)
      .filter(([, box]) => box?.visible !== false)
      .map(([key, box]) => `<div class="custom-preview-box" data-key="${key}" style="left:${box.x}%;top:${box.y}%;width:${box.w}%;height:${box.h}%;z-index:${box.z || 1}">${labels[key] || key}</div>`)
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
  return { canvas: 1024, elements };
}

function syncPointElements() {
  if (!state.editingVisualLayout) return;
  const count = Number($("#tpl-points").value);
  for (let index = 1; index <= 3; index += 1) {
    const key = `point${index}`;
    const box = state.editingVisualLayout.elements[key];
    if (index <= count && !box) state.editingVisualLayout.elements[key] = { x: 7, y: 35 + (index - 1) * 11, w: 35, h: 8, z: 5 };
    const current = state.editingVisualLayout.elements[key];
    if (!current) continue;
    if (index > count) {
      current.visible = false;
      current.disabledByCount = true;
    } else if (current.disabledByCount) {
      current.visible = true;
      delete current.disabledByCount;
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
  const labels = layoutElementLabels();
  const elements = state.editingVisualLayout.elements;
  $("#element-palette").innerHTML = Object.entries(labels).map(([key, label]) => {
    const exists = elements[key]?.visible !== false && elements[key];
    return `<button type="button" class="element-tool ${exists ? "exists" : ""} ${state.drawingLayoutElement === key ? "drawing" : ""}" data-layout-tool="${key}">${exists ? "选择" : "绘制"}${label}</button>`;
  }).join("");
  $("#layout-canvas").innerHTML = Object.entries(elements)
    .filter(([, box]) => box?.visible !== false)
    .sort((a, b) => (a[1].z || 1) - (b[1].z || 1))
    .map(([key, box]) => `<div class="layout-element ${state.selectedLayoutElement === key ? "selected" : ""}" data-key="${key}" style="left:${box.x}%;top:${box.y}%;width:${box.w}%;height:${box.h}%;z-index:${box.z || 1}">${labels[key]}<i class="resize-handle"></i></div>`)
    .join("");
  renderLayoutProperties();
  $$("[data-layout-tool]").forEach((button) => button.onclick = () => {
    const key = button.dataset.layoutTool;
    if (elements[key]?.visible !== false && elements[key]) {
      state.selectedLayoutElement = key;
      state.drawingLayoutElement = null;
    } else {
      state.selectedLayoutElement = null;
      state.drawingLayoutElement = key;
    }
    renderVisualEditor();
  });
  $$(".layout-element").forEach((element) => element.onpointerdown = (event) => beginMoveLayoutElement(event, element.dataset.key, event.target.classList.contains("resize-handle")));
}

function renderLayoutProperties() {
  const panel = $("#layout-properties");
  const key = state.selectedLayoutElement;
  const box = key && state.editingVisualLayout?.elements[key];
  if (!box) {
    panel.innerHTML = `<span>${state.drawingLayoutElement ? `请在画布空白处拖动绘制“${layoutElementLabels()[state.drawingLayoutElement]}”` : "尚未选择元素"}</span>`;
    return;
  }
  panel.innerHTML = ["x","y","w","h","z"].map((field) => `<label>${field.toUpperCase()}<input type="number" step="1" data-box-field="${field}" value="${Math.round(box[field])}"></label>`).join("")
    + `<button type="button" id="remove-layout-element">删除元素</button>`;
  $$("[data-box-field]").forEach((input) => input.oninput = () => {
    box[input.dataset.boxField] = Number(input.value);
    clampBox(box);
    renderVisualEditor();
  });
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
  $("#summary-total").textContent = state.selectedProducts.size * state.selectedTemplates.size;
}

function fillCategorySelects() {
  const options = state.data.categories.map((category) => `<option value="${category}">${category}</option>`).join("");
  $("#product-category").innerHTML = options;
  $("#detail-category").innerHTML = options;
}

function switchView(view) {
  state.view = view;
  const labels = { products: "产品管理", templates: "模板中心", generate: "提示词生成", references: "参考图分析" };
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
  state.editingVisualLayout = structuredClone(template.visualLayout || defaultVisualLayout(template.number, template.points));
  state.selectedLayoutElement = null;
  state.drawingLayoutElement = null;
  updateLivePreview();
  $("#template-dialog").showModal();
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
$("#new-product-btn").onclick = () => $("#product-dialog").showModal();
$("#save-product-btn").onclick = async () => {
  try {
    const file = $("#product-file").files[0];
    if (!file) throw new Error("请选择产品图片");
    await api("/api/products/add", { method: "POST", body: JSON.stringify({
      name: $("#product-name").value, category: $("#product-category").value, net: $("#product-net").value,
      form: $("#product-form-type").value, tags: $("#product-tags").value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
      fileName: file.name, dataUrl: await fileToDataUrl(file),
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
$("#layout-canvas").onpointerdown = (event) => {
  if (event.target !== $("#layout-canvas") || !state.drawingLayoutElement) return;
  event.preventDefault();
  const key = state.drawingLayoutElement;
  const start = canvasPoint(event);
  const box = { x: start.x, y: start.y, w: 3, h: 3, z: 5, visible: true };
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
$("#generate-btn").onclick = async () => {
  try {
    $("#generation-result").textContent = "正在生成…";
    const result = await api("/api/prompts/generate", { method: "POST", body: JSON.stringify({
      products: [...state.selectedProducts], templates: [...state.selectedTemplates],
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
