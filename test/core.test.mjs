import test from "node:test";
import assert from "node:assert/strict";
import {
  generatePromptMarkdown,
  generateCombinedPromptMarkdown,
  latestPromptVersion,
  classifyMarketingGroup,
  marketingEntryKey,
  marketingJsonToEntries,
  parseMarketing,
  parseMarketingExtras,
  mergeMarketingExtras,
  normalizeTemplateVisualLayout,
  serializeMarketing,
  serializeMarketingExtras,
  parseProductFacts,
  parseTemplates,
  parseProductMarketing,
  referenceJsonToTemplate,
  resolveProductMarketing,
  serializeProductMarketing,
  safeChildPath,
  selectMarketingEntries,
} from "../lib/core.mjs";

test("营销文案支持扩展卖点并可序列化", () => {
  const rows = [{
    category: "鸽子鸟类", number: "01", subtitle: "科学配方", support: "鸽用",
    points: ["植物提取", "品质保障", "厂家直发", "现货充足", "全国通发"], footer: "养殖常备",
  }];
  const primary = serializeMarketing(rows);
  const extras = serializeMarketingExtras(rows);
  const merged = mergeMarketingExtras(parseMarketing(primary), parseMarketingExtras(extras));
  assert.deepEqual(merged.get("鸽子鸟类").get("01").points, rows[0].points);
});

test("产品营销词按产品专属、分类通用、全局通用依次选择", () => {
  const entries = [
    { scope: "global", category: "*", product: "*", region: "侧栏卖点", text: "品质保障", priority: 10, enabled: true },
    { scope: "category", category: "鸡鸭鹅禽类", product: "*", region: "侧栏卖点", text: "蛋禽肉禽", priority: 50, enabled: true },
    { scope: "product", category: "鸡鸭鹅禽类", product: "腺肌胃康宁", region: "侧栏卖点", text: "腺肌胃炎", priority: 100, enabled: true },
  ];
  const restored = parseProductMarketing(serializeProductMarketing(entries));
  const copy = resolveProductMarketing(restored, { name: "腺肌胃康宁", category: "鸡鸭鹅禽类" }, {
    points: 3,
    visualLayout: { elements: {
      point1: { type: "sellingPoint", copyRegion: "侧栏卖点", y: 20 },
      point2: { type: "sellingPoint", copyRegion: "侧栏卖点", y: 30 },
      point3: { type: "sellingPoint", copyRegion: "侧栏卖点", y: 40 },
    } },
  });
  assert.deepEqual(copy.points, ["腺肌胃炎", "蛋禽肉禽", "品质保障"]);
});

test("旧版7列营销词可自动分组，保存后升级为8列", () => {
  const legacy = `| 作用范围 | 分类 | 产品名称 | 位置属性（可多个） | 营销文案 | 优先级 | 启用 |
|---|---|---|---|---|---:|---|
| 产品专属 | 消毒 | 单过硫酸氢钾消毒粉 | 顶部卖点、侧栏卖点 | 鸡瘟鸭瘟 | 112 | 是 |
| 产品专属 | 消毒 | 单过硫酸氢钾消毒粉 | 侧栏卖点 | 兑水喷雾 | 100 | 是 |`;
  const entries = parseProductMarketing(legacy);
  assert.equal(entries[0].group, "病症营销词");
  assert.equal(entries[1].group, "使用方式");
  const upgraded = serializeProductMarketing(entries);
  assert.match(upgraded, /文案分组/);
  assert.equal(parseProductMarketing(upgraded)[0].group, "病症营销词");
});

test("AI营销词JSON可判断分组和位置并严格校验", () => {
  const entries = marketingJsonToEntries({
    scope: "product",
    category: "消毒",
    product: "单过硫酸氢钾消毒粉",
    items: [
      { text: "鸡瘟鸭瘟", regions: ["顶部卖点", "侧栏卖点"], priority: 112 },
      { text: "兑水喷雾", group: "使用方式" },
      { text: "厂家直发", group: "品质与渠道", regions: ["底栏文案"], confidence: 0.95 },
    ],
  });
  assert.equal(entries[0].group, "病症营销词");
  assert.deepEqual(entries[1].regions, ["侧栏卖点"]);
  assert.equal(entries[2].confidence, 0.95);
  assert.throws(() => marketingJsonToEntries({ items: [{ text: "测试", group: "未知分组" }] }), /不支持/);
  assert.throws(() => marketingJsonToEntries({ items: [{ text: "测试", group: "其他", regions: ["未知位置"] }] }), /未知位置/);
  assert.throws(() => marketingJsonToEntries({ items: [{ text: "重复文案" }, { text: "重复文案" }] }), /重复/);
});

test("营销文案自动分组覆盖常见类型", () => {
  assert.equal(classifyMarketingGroup({ text: "养殖消毒粉", regions: ["副标题"] }), "产品定位");
  assert.equal(classifyMarketingGroup({ text: "100g拌料200斤" }), "规格与储存");
  assert.equal(classifyMarketingGroup({ text: "厂家直供" }), "品质与渠道");
  assert.equal(classifyMarketingGroup({ text: "鸡鸭鹅专用" }), "适用对象");
});

test("同一营销文案可绑定多个位置但单张图只使用一次", () => {
  const entries = [
    { scope: "product", category: "鸡鸭鹅禽类", product: "腺肌胃康宁", regions: ["顶部卖点", "侧栏卖点"], text: "腺肌胃炎", priority: 100, enabled: true },
    { scope: "category", category: "鸡鸭鹅禽类", product: "*", regions: ["侧栏卖点"], text: "品质保障", priority: 50, enabled: true },
  ];
  const serialized = serializeProductMarketing(entries);
  assert.match(serialized, /顶部卖点、侧栏卖点/);
  const copy = resolveProductMarketing(parseProductMarketing(serialized), {
    name: "腺肌胃康宁", category: "鸡鸭鹅禽类",
  }, {
    points: 2,
    visualLayout: { elements: {
      point1: { type: "sellingPoint", copyRegion: "顶部卖点", y: 20 },
      point2: { type: "sellingPoint", copyRegion: "侧栏卖点", y: 30 },
    } },
  });
  assert.deepEqual(copy.points, ["腺肌胃炎", "品质保障"]);
});

test("不同模板会轮换产品专属营销词，避免整批图片文案完全相同", () => {
  const entries = ["环境消毒", "圈舍消毒", "养殖场消毒", "带畜消毒", "安全可靠"]
    .map((text, index) => ({
      scope: "product", category: "消毒", product: "消毒粉",
      regions: ["侧栏卖点"], text, priority: 100 - index, enabled: true,
    }));
  const template = (number) => ({
    number, points: 3, visualLayout: { elements: {
      point1: { type: "sellingPoint", copyRegion: "侧栏卖点", y: 20 },
      point2: { type: "sellingPoint", copyRegion: "侧栏卖点", y: 30 },
      point3: { type: "sellingPoint", copyRegion: "侧栏卖点", y: 40 },
    } },
  });
  const first = resolveProductMarketing(entries, { name: "消毒粉", category: "消毒" }, template("11"));
  const second = resolveProductMarketing(entries, { name: "消毒粉", category: "消毒" }, template("12"));
  assert.notDeepEqual(first.points, second.points);
  assert.equal(new Set(first.points).size, first.points.length);
  assert.equal(new Set(second.points).size, second.points.length);
});

test("生成时可限制营销文案来源或只使用勾选文案", () => {
  const entries = [
    { scope: "product", category: "鸡鸭鹅禽类", product: "腺肌胃康宁", regions: ["侧栏卖点"], text: "产品专属词" },
    { scope: "category", category: "鸡鸭鹅禽类", product: "*", regions: ["侧栏卖点"], text: "分类通用词" },
    { scope: "global", category: "*", product: "*", regions: ["侧栏卖点"], text: "全局通用词" },
  ];
  assert.deepEqual(selectMarketingEntries(entries, { sources: ["product"] }).map((entry) => entry.text), ["产品专属词"]);
  assert.deepEqual(selectMarketingEntries(entries, { sources: [] }), []);
  assert.deepEqual(selectMarketingEntries(entries, {
    sources: ["product", "category"],
    mode: "selected",
    copyKeys: [marketingEntryKey(entries[1])],
  }).map((entry) => entry.text), ["分类通用词"]);
});

test("解析模板和营销词表格", () => {
  const templates = parseTemplates(`| 启用 | 编号 | 模板名称 | 构图描述 | 副标题来源 | 卖点数量 | 底栏来源 | 底栏样式 | 特殊要求 | 净含量位置 |
|---|---:|---|---|---|---:|---|---|---|---|
| 是 | 01 | 测试模板 | 产品右侧 | 副标题 | 3 | 底栏文案 | 标准单行 | 无 | 产品附近 |`);
  assert.equal(templates.length, 1);
  assert.equal(templates[0].number, "01");
  assert.equal(templates[0].points, 3);

  const marketing = parseMarketing(`| 分类 | 图片编号 | 副标题 | 辅助文案 | 卖点1 | 卖点2 | 卖点3 | 底栏文案 |
|---|---:|---|---|---|---|---|---|
| 猫狗 | 01 | 科学配方 | 天然成分 | 品质保障 | 正品保障 | 厂家直发 | 现货直发｜厂家直发 |`);
  assert.equal(marketing.get("猫狗").get("01").points[0], "品质保障");
});

test("识别产品规格和提示词版本", () => {
  const facts = parseProductFacts(`'肠安100' = @{ Net = '100g'; Form = 'bag' }`);
  assert.deepEqual(facts.get("肠安100"), { net: "100g", form: "bag" });
  assert.deepEqual(latestPromptVersion([
    "肠安100-生图提示词.md",
    "肠安100-生图提示词-v2.md",
    "肠安100-生图提示词-v4.md",
  ], "肠安100"), { name: "肠安100-生图提示词-v4.md", version: 4 });
});

test("生成所选模板提示词", () => {
  const templates = [{
    enabled: true, number: "01", name: "测试", layout: "产品位于右侧。", subtitleSource: "副标题",
    points: 3, bottomSource: "底栏文案", bottomStyle: "标准单行", special: "无", netPosition: "产品附近",
  }];
  const marketingRows = new Map([["01", {
    subtitle: "科学配方", support: "天然成分", points: ["品质保障", "正品保障", "厂家直发"], footer: "现货直发｜厂家直发",
  }]]);
  const result = generatePromptMarkdown({
    product: { name: "肠安100", imageName: "肠安100.png", category: "猫狗", net: "100g", form: "bag" },
    templates,
    marketingRows,
  });
  assert.match(result, /生成1张/);
  assert.match(result, /提示词01/);
  assert.match(result, /具体字号按照各卖点矩形框的字号比例执行/);
  assert.match(result, /现货直发｜厂家直发/);
});

test("支持自定义数量卖点和可视化坐标", () => {
  const templates = [{
    enabled: true, number: "10", name: "自由布局", layout: "自定义布局", subtitleSource: "副标题",
    points: 2, bottomSource: "底栏文案", bottomStyle: "标准单行", special: "无", netPosition: "产品附近",
    visualLayout: { canvas: 1024, elements: {
      title: { x: 6, y: 8, w: 42, h: 12, z: 5 },
      point1: { type: "sellingPoint", x: 7, y: 35, w: 35, h: 8, z: 5, shape: "rounded", fontRatio: 0.8 },
      point2: { x: 7, y: 46, w: 35, h: 8, z: 5 },
    } },
  }];
  const marketingRows = new Map([["10", {
    subtitle: "科学配方", support: "日常使用", points: ["卖点一", "卖点二", "卖点三"], footer: "厂家直发",
  }]]);
  const markdown = generatePromptMarkdown({
    product: { name: "测试产品", imageName: "测试产品.png", category: "猫狗", net: "100g", form: "bag" },
    templates,
    marketingRows,
  });
  assert.match(markdown, /【卖点一】【卖点二】/);
  assert.doesNotMatch(markdown, /【卖点三】/);
  assert.match(markdown, /1024×1024逻辑画布布局/);
  assert.match(markdown, /主标题位于画面左侧6%/);
  assert.match(markdown, /圆角矩形底板/);
  assert.match(markdown, /矩形框高度的80%/);
});

test("现有模板补全正式布局、底板和80%字号规则", () => {
  const layout = normalizeTemplateVisualLayout(null, "04", 3);
  assert.equal(layout.elements.point1.shape, "parallelogram");
  assert.equal(layout.elements.point1.fontRatio, 0.8);
  assert.equal(layout.elements.title.shape, "none");
  assert.equal(layout.elements.footer.shape, "rectangle");
});

test("参考图JSON可独立转换为可编辑模板图层", () => {
  const template = referenceJsonToTemplate(`\`\`\`json
  {
    "name": "左右布局",
    "elements": [
      {"type":"title","binding":"productName","x":6,"y":8,"w":42,"h":12,"z":5,"shape":"none"},
      {"type":"sellingPoint","binding":"point1","x":7,"y":35,"w":35,"h":8,"z":5,"shape":"rounded"},
      {"type":"product","binding":"product1","x":53,"y":17,"w":41,"h":62,"z":4,"shape":"none"}
    ]
  }
  \`\`\``, { number: "12" });
  assert.equal(template.number, "12");
  assert.equal(template.name, "左右布局");
  assert.equal(template.points, 1);
  assert.equal(template.visualLayout.elements.product.visible, true);
  assert.equal(template.visualLayout.elements.point1.copyRegion, "侧栏卖点");
  assert.equal(template.visualLayout.elements.footer.visible, false);
});

test("参考图JSON拒绝越界坐标和未知图层", () => {
  assert.throws(() => referenceJsonToTemplate({
    elements: [{ type: "product", x: 80, y: 10, w: 30, h: 50 }],
  }), /坐标越界/);
  assert.throws(() => referenceJsonToTemplate({
    elements: [{ type: "price", x: 10, y: 10, w: 20, h: 10 }],
  }), /类型.*不支持/);
});

test("参考图JSON兼容AI常见的background和animal别名", () => {
  const template = referenceJsonToTemplate({
    name: "家禽布局",
    elements: [
      { type: "background", binding: "background", x: 0, y: 0, w: 100, h: 100, z: 1, shape: "rectangle" },
      { type: "animal", binding: "animal1", x: 48, y: 39, w: 51, h: 45, z: 2, shape: "none" },
      { type: "product", binding: "product1", x: 57, y: 6, w: 38, h: 73, z: 4 },
    ],
  });
  assert.equal(template.visualLayout.elements.backgroundRegion1.type, "backgroundRegion");
  assert.equal(template.visualLayout.elements.backgroundRegion1.binding, "custom");
  assert.equal(template.visualLayout.elements.animalRegion1.type, "animalRegion");
  assert.equal(template.visualLayout.elements.animalRegion1.binding, "custom");
});

test("支持多产品组合主图", () => {
  const template = {
    enabled: true, number: "10", name: "双产品", layout: "双产品组合", points: 2,
    visualLayout: { elements: {
      product1: { type: "product", label: "产品1", x: 8, y: 20, w: 38, h: 60, z: 4, shape: "none" },
      product2: { type: "product", label: "产品2", x: 54, y: 20, w: 38, h: 60, z: 4, shape: "none" },
      animalRegion1: { type: "animalRegion", label: "动物区域1", x: 20, y: 50, w: 60, h: 35, z: 1, shape: "ellipse", text: "鸡鸭鹅背景" },
    } },
  };
  const markdown = generateCombinedPromptMarkdown({
    products: [
      { name: "袋装产品", imageName: "袋装产品.png", category: "鸡鸭鹅禽类" },
      { name: "瓶装产品", imageName: "瓶装产品.png", category: "鸡鸭鹅禽类" },
    ],
    templates: [template],
    marketingByCategory: new Map([["鸡鸭鹅禽类", new Map([["10", {
      points: ["共同卖点", "瓶装专属"], footer: "组合常备",
    }]])]]),
  });
  assert.match(markdown, /【袋装产品】、【瓶装产品】/);
  assert.match(markdown, /产品1位于画面左侧8%/);
  assert.match(markdown, /鸡鸭鹅背景/);
  assert.match(markdown, /默认营销卖点依次写【共同卖点】【瓶装专属】/);
});

test("拒绝越界路径", () => {
  assert.throws(() => safeChildPath("D:/work", "../secret"), /超出项目目录/);
});
