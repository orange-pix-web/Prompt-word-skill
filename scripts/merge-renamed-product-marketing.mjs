/* Merge product-copy left behind by renamed/deleted duplicate product images.
 * Source entries are moved to their formal product, exact text is deduplicated,
 * and every removed row is sent to the workbench recycle bin. */
const APPLY = process.argv.includes("--apply");
const mappings = new Map([
  ["鹦鹉一喷灵 (2)", "鹦鹉一喷灵"],
  ["浓速温肠清1", "浓速温肠清"],
  ["鸽虫清1", "鸽虫清"],
  ["禽康101拷贝", "禽康101"],
]);

async function api(route, options = {}) {
  const response = await fetch(`http://127.0.0.1:4178${route}`, {
    headers: options.body ? { "content-type": "application/json; charset=utf-8" } : undefined,
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `请求失败：${response.status}`);
  return payload;
}

const normalize = (value) => String(value || "").replace(/[\s　]+/g, "").toLowerCase();
const state = await api("/api/state");
const productNames = new Set(state.products.map((item) => item.name));
for (const target of mappings.values()) if (!productNames.has(target)) throw new Error(`目标产品不存在：${target}`);

const sourceEntries = state.productMarketingEntries.filter((entry) => mappings.has(entry.product));
const untouched = state.productMarketingEntries.filter((entry) => !mappings.has(entry.product));
const promoted = sourceEntries.map((entry) => ({ ...entry, product: mappings.get(entry.product) }));
const targets = new Set(mappings.values());
const output = [];
const removedDuplicates = [];
for (const entry of untouched) {
  if (!targets.has(entry.product)) output.push(entry);
}
for (const target of targets) {
  const candidates = [
    ...untouched.filter((entry) => entry.product === target).map((entry) => ({ ...entry, original: entry, source: "current" })),
    ...promoted.filter((entry) => entry.product === target).map((entry) => ({ ...entry, source: "renamed" })),
  ];
  const merged = new Map();
  for (const item of candidates) {
    const key = normalize(item.text);
    if (!key) continue;
    if (!merged.has(key)) {
      merged.set(key, { ...item, regions: [...new Set(item.regions || [item.region])], region: (item.regions || [item.region])[0] || "不限位置" });
      continue;
    }
    const keep = merged.get(key);
    keep.regions = [...new Set([...(keep.regions || []), ...(item.regions || [item.region])])];
    keep.region = keep.regions[0] || "不限位置";
    keep.priority = Math.max(Number(keep.priority || 0), Number(item.priority || 0));
    keep.enabled = keep.enabled !== false || item.enabled !== false;
    if (keep.category !== "*" && item.category === "*") keep.category = "*";
    if (keep.source !== "current" && item.source === "current") {
      keep.group = item.group;
      keep.source = "current";
    }
    if (item.source === "current") removedDuplicates.push(item.original);
  }
  output.push(...[...merged.values()].map(({ original, source, ...entry }) => entry));
}

const nextTemplates = state.templates.map((template) => {
  const groups = [...new Set((template.groups || [template.group]).map((group) => group === "鸽蟲清" ? "鸽虫清" : group).filter(Boolean))];
  return { ...template, groups, group: groups[0] || "未分组" };
});
const changedTemplates = nextTemplates.filter((template, index) =>
  JSON.stringify(template.groups) !== JSON.stringify(state.templates[index].groups || [state.templates[index].group])).length;
const nextGroups = [...new Set([
  ...(state.templateGroups || []),
  ...nextTemplates.flatMap((template) => template.groups || []),
].filter((group) => group && group !== "鸽蟲清"))];

const result = {
  mode: APPLY ? "applied" : "preview",
  copy: {
    sources: Object.fromEntries([...mappings].map(([source, target]) => [source, { target, rows: sourceEntries.filter((entry) => entry.product === source).length }])),
    before: state.productMarketingEntries.length,
    after: output.length,
    recycledSourceRows: sourceEntries.length,
    mergedDuplicateRows: removedDuplicates.length,
  },
  templates: { relabeledFrom: "鸽蟲清", relabeledTo: "鸽虫清", changed: changedTemplates },
};
if (APPLY) {
  await api("/api/product-marketing/save", { method: "POST", body: JSON.stringify({ entries: output, deletedEntries: [...sourceEntries, ...removedDuplicates] }) });
  await api("/api/templates/save", { method: "POST", body: JSON.stringify({ templates: nextTemplates, groups: nextGroups }) });
}
console.log(JSON.stringify(result, null, 2));
