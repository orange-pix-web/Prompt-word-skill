import test from "node:test";
import assert from "node:assert/strict";
import {
  generatePromptMarkdown,
  generateCombinedPromptMarkdown,
  latestPromptVersion,
  parseMarketing,
  parseMarketingExtras,
  mergeMarketingExtras,
  normalizeTemplateVisualLayout,
  serializeMarketing,
  serializeMarketingExtras,
  parseProductFacts,
  parseTemplates,
  safeChildPath,
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
      points: ["共同卖点", "瓶装专属"], pointTargets: [["all"], ["product2"]], footer: "组合常备",
    }]])]]),
  });
  assert.match(markdown, /【袋装产品】、【瓶装产品】/);
  assert.match(markdown, /产品1位于画面左侧8%/);
  assert.match(markdown, /鸡鸭鹅背景/);
  assert.match(markdown, /【共同卖点】用于全部产品/);
  assert.match(markdown, /【瓶装专属】绑定产品2【瓶装产品】/);
});

test("拒绝越界路径", () => {
  assert.throws(() => safeChildPath("D:/work", "../secret"), /超出项目目录/);
});
