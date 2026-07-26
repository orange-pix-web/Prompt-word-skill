import test from "node:test";
import assert from "node:assert/strict";
import {
  generatePromptMarkdown,
  latestPromptVersion,
  parseMarketing,
  parseProductFacts,
  parseTemplates,
  safeChildPath,
} from "../lib/core.mjs";

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
  assert.match(result, /视觉高度约为副标题的80%/);
  assert.match(result, /现货直发｜厂家直发/);
});

test("拒绝越界路径", () => {
  assert.throws(() => safeChildPath("D:/work", "../secret"), /超出项目目录/);
});
