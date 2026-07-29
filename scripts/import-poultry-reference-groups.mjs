const BASE_URL = process.env.PROMPT_STUDIO_URL || "http://127.0.0.1:4178";

async function api(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: options.body ? { "content-type": "application/json; charset=utf-8" } : undefined,
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `请求失败：${response.status}`);
  return payload;
}

const box = (x, y, w, h, shape = "none") => ({ x, y, w, h, shape });
const layer = (type, label, binding, source, z, extra = {}) => ({
  ...source,
  z,
  type,
  label,
  binding,
  visible: true,
  text: "",
  fontRatio: ["title", "sellingPoint", "footer", "net", "customText"].includes(type) ? 0.8 : undefined,
  ...extra,
});

const families = {
  right3: {
    description: "顶部大标题，左侧三条纵向卖点，产品固定在右侧，底部为通栏文案。",
    title: box(4, 3, 92, 13), product: box(53, 19, 43, 65),
    points: [box(4, 32, 42, 10, "rounded"), box(4, 47, 42, 10, "rounded"), box(4, 62, 42, 10, "rounded")],
    net: box(61, 82, 34, 7, "pill"), footer: box(0, 89, 100, 11, "rectangle"),
  },
  right4: {
    description: "顶部横向标题，产品位于右侧，左侧四枚紧凑卖点，底部设置高对比通栏。",
    title: box(3, 2, 94, 13), product: box(55, 18, 41, 66),
    points: [box(3, 27, 45, 9, "pill"), box(3, 39, 45, 9, "pill"), box(3, 51, 45, 9, "pill"), box(3, 63, 45, 9, "pill")],
    net: box(58, 82, 38, 7, "pill"), footer: box(0, 89, 100, 11, "rectangle"),
  },
  left3: {
    description: "顶部大标题，产品占据左侧，右侧排列三条卖点，底部为横向信息栏。",
    title: box(3, 3, 94, 13), product: box(3, 20, 46, 64),
    points: [box(54, 31, 42, 10, "rounded"), box(54, 46, 42, 10, "rounded"), box(54, 61, 42, 10, "rounded")],
    net: box(4, 82, 35, 7, "pill"), footer: box(0, 89, 100, 11, "rectangle"),
  },
  splitCenter: {
    description: "标题置顶，产品位于画面中部，左右两侧分别承载卖点与动物场景，底部为通栏。",
    title: box(3, 2, 94, 13), product: box(36, 18, 38, 66),
    points: [box(3, 28, 30, 10, "rounded"), box(3, 43, 30, 10, "rounded"), box(3, 58, 30, 10, "rounded")],
    animal: box(73, 25, 25, 55), net: box(38, 82, 34, 7, "pill"), footer: box(0, 89, 100, 11, "rectangle"),
  },
  cleanRight: {
    description: "白色或浅色信息板，左侧为标题、副标题和三条卖点，产品干净陈列在右侧。",
    title: box(5, 14, 43, 14), subtitle: box(6, 30, 40, 8),
    product: box(53, 14, 43, 68),
    points: [box(6, 43, 39, 9, "rounded"), box(6, 55, 39, 9, "rounded"), box(6, 67, 39, 9, "rounded")],
    net: box(58, 82, 36, 7, "pill"), footer: box(2, 90, 96, 8, "rectangle"),
  },
  photoRight: {
    description: "真实养殖场景作为背景，标题位于顶部，产品在右侧，卖点覆盖在左侧背景上方。",
    background: box(0, 0, 100, 100, "rectangle"), title: box(3, 3, 94, 15),
    product: box(55, 22, 42, 67),
    points: [box(4, 34, 44, 10, "pill"), box(4, 49, 44, 10, "pill"), box(4, 64, 44, 10, "pill")],
    footer: box(0, 89, 100, 11, "rectangle"),
  },
  photoLeft: {
    description: "真实养殖场景满版，产品固定左侧，右侧为三条醒目卖点，标题与底栏形成上下呼应。",
    background: box(0, 0, 100, 100, "rectangle"), title: box(3, 3, 94, 15),
    product: box(3, 22, 44, 67),
    points: [box(53, 34, 43, 10, "pill"), box(53, 49, 43, 10, "pill"), box(53, 64, 43, 10, "pill")],
    footer: box(0, 89, 100, 11, "rectangle"),
  },
  topBand: {
    description: "高对比色页眉承载超大标题，主体区左右分栏，产品在右侧，左侧为四条勾选卖点。",
    title: box(0, 0, 100, 18, "rectangle"), product: box(55, 21, 42, 64),
    points: [box(4, 30, 45, 9, "none"), box(4, 42, 45, 9, "none"), box(4, 54, 45, 9, "none"), box(4, 66, 45, 9, "none")],
    net: box(58, 82, 37, 7, "pill"), footer: box(0, 89, 100, 11, "rectangle"),
  },
  symptomBoard: {
    description: "左侧为深色病症信息板和四条列表，产品固定右侧，标题置顶并用底栏收束。",
    title: box(3, 3, 94, 13), product: box(55, 18, 42, 67),
    points: [box(3, 27, 45, 10, "rectangle"), box(3, 40, 45, 10, "rectangle"), box(3, 53, 45, 10, "rectangle"), box(3, 66, 45, 10, "rectangle")],
    net: box(60, 82, 35, 7, "pill"), footer: box(0, 89, 100, 11, "rectangle"),
  },
  stage: {
    description: "暖色摄影棚或展台背景，产品置于右侧展台，左侧大标题与三条斜切卖点上下排列。",
    background: box(0, 0, 100, 89, "rectangle"), title: box(4, 23, 46, 15),
    product: box(53, 12, 43, 70),
    points: [box(6, 43, 40, 9, "parallelogram"), box(6, 55, 40, 9, "parallelogram"), box(6, 67, 40, 9, "parallelogram")],
    net: box(56, 82, 38, 7, "pill"), footer: box(0, 89, 100, 11, "rectangle"),
  },
  collage: {
    description: "顶部标题，产品固定右侧，左侧设置症状图文拼贴区与两条核心卖点，底部为通栏。",
    title: box(3, 3, 94, 13), product: box(56, 20, 40, 64),
    animal: box(3, 35, 46, 43, "rounded"),
    points: [box(4, 20, 44, 9, "rounded"), box(4, 80, 44, 7, "pill")],
    net: box(61, 82, 34, 7, "pill"), footer: box(0, 89, 100, 11, "rectangle"),
  },
  minimal: {
    description: "留白充足的极简商业版式，主标题和副标题在左，产品在右，仅保留两条重点卖点。",
    title: box(4, 19, 44, 16), subtitle: box(5, 37, 41, 8),
    product: box(52, 13, 44, 70),
    points: [box(5, 51, 40, 10, "pill"), box(5, 65, 40, 10, "pill")],
    net: box(57, 82, 38, 7, "pill"), footer: box(0, 89, 100, 11, "rectangle"),
  },
  bigTitle: {
    description: "顶部使用超大标题，产品占据右下主视觉，左侧保留单一大卖点和动物氛围图。",
    title: box(3, 2, 94, 21), product: box(54, 28, 43, 61),
    points: [box(4, 33, 44, 16, "rounded")], animal: box(4, 56, 43, 27),
    net: box(57, 82, 38, 7, "pill"), footer: box(0, 89, 100, 11, "rectangle"),
  },
  dualPanel: {
    description: "产品位于中央偏右，左侧主卖点列表与右上动物区域形成双信息板，底部设置宽通栏。",
    title: box(3, 3, 94, 12), product: box(43, 20, 39, 65),
    points: [box(3, 26, 35, 10, "rounded"), box(3, 40, 35, 10, "rounded"), box(3, 54, 35, 10, "rounded")],
    animal: box(80, 23, 19, 48, "rounded"), net: box(57, 82, 38, 7, "pill"), footer: box(0, 89, 100, 11, "rectangle"),
  },
  bottomGrid: {
    description: "顶部标题与右侧产品构成主体，下方设置横向症状或适用对象分格区，最底部为通栏。",
    title: box(3, 3, 94, 13), product: box(55, 18, 41, 57),
    points: [box(3, 25, 45, 10, "rounded"), box(3, 39, 45, 10, "rounded"), box(3, 53, 45, 10, "rounded")],
    animal: box(3, 68, 92, 17, "rounded"), net: box(60, 77, 35, 8, "pill"), footer: box(0, 89, 100, 11, "rectangle"),
  },
};

const groupSpecs = {
  "防啄护卫": [
    ["白底绿栏三卖点", "01防啄护卫.png", "right3"],
    ["蓝黄禽类对照", "02防啄护卫.png", "dualPanel"],
    ["红头动物卖点", "03防啄护卫.png", "left3"],
    ["绿景右侧产品", "04防啄护卫.png", "photoRight"],
    ["红字防啄信息板", "05防啄护卫.png", "symptomBoard"],
    ["蓝天左右标注", "06防啄护卫.png", "splitCenter"],
    ["绿白分区禽类", "07防啄护卫.png", "right4"],
    ["留白养殖常备", "08防啄护卫.png", "minimal"],
    ["临床白卡说明", "09防啄护卫.png", "cleanRight"],
    ["鸡场高对比大字", "10防啄护卫.png", "bigTitle"],
  ],
  "防啄卫士": [
    ["禽类照片红标题", "0603 (1) 拷.png", "photoLeft"],
    ["大标题鸡蛋场景", "0603 (1) 拷贝.jpg", "bigTitle"],
    ["官方绿白清爽版", "1963-0.png", "cleanRight"],
    ["养殖常备橙绿版", "1963-2.png", "right3"],
    ["动物分类纵向版", "4988-3.png", "dualPanel"],
    ["红蓝左右卖点版", "5476-1.png", "right4"],
    ["使用说明信息卡", "5476-10.png", "collage"],
    ["黑底异食症状版", "8453-1.png", "symptomBoard"],
    ["橙色适用对象版", "8453-4.png", "topBand"],
    ["蓝色官方信息版", "8754 (2).png", "cleanRight"],
    ["黑红止啄主视觉", "8845-1.png", "bigTitle"],
    ["绿红鸡群场景版", "8845-6.png", "photoRight"],
  ],
  "钙磷锌铁十八补": [
    ["蓝天左右禽畜版", "01钙磷锌铁十八补.png", "dualPanel"],
    ["蓝天一袋全补版", "03钙磷锌铁十八补.png", "bigTitle"],
    ["蓝色四勾信息版", "04钙磷锌铁十八补.png", "right4"],
    ["动物环绕补充版", "05钙磷锌铁十八补.png", "splitCenter"],
    ["红头五项营养版", "07钙磷锌铁十八补.png", "topBand"],
    ["多营养问题版", "10钙磷锌铁十八补.png", "symptomBoard"],
    ["白底适用对象版", "11钙磷锌铁十八补.png", "minimal"],
    ["木台微量元素版", "26052101钙磷十八补.png", "stage"],
    ["用量红绿通栏版", "26052106钙磷十八补.png", "right3"],
    ["营养原料分格版", "主图06.png", "collage"],
  ],
  "杆舒": [
    ["蓝天红色三卖点", "01杆舒.png", "right3"],
    ["黄黑产品卖点版", "04杆舒.png", "right4"],
    ["病症白卡产品版", "0520 (1) 拷贝.png", "cleanRight"],
    ["浆膜炎黄红版", "0606-1.png", "symptomBoard"],
    ["蓝白菌群说明版", "0615-04.png", "minimal"],
    ["红绿防治信息版", "2134-4.png", "right3"],
    ["场景左图右产品", "4235-2.png", "photoRight"],
    ["绿色菌病四栏版", "6142-1.png", "topBand"],
    ["蓝天产品右置版", "杆舒-01.png", "right3"],
    ["绿色三项卖点版", "杆舒-04.png", "cleanRight"],
    ["包装信息说明版", "杆舒-09.png", "collage"],
    ["极简植物原料版", "杆舒-11.png", "minimal"],
    ["蓝天徽章三卖点", "杆舒-13.png", "right3"],
    ["家禽照片救命药版", "杆舒主图 (3) 拷贝 2.jpg", "photoLeft"],
    ["白底病症对照版", "金牧阳光 (5) 拷贝.jpg", "bottomGrid"],
  ],
  "格豆散": [
    ["蓝色官方三卖点", "01格豆散.png", "right3"],
    ["蓝白动物左右版", "03格豆散.png", "splitCenter"],
    ["鸽群右侧产品版", "06格豆散.png", "photoLeft"],
    ["多禽类纵向版", "08格豆散.png", "dualPanel"],
    ["黑底症状对照版", "11格豆散.png", "symptomBoard"],
    ["鸽痘部位分格版", "15格豆散.png", "bottomGrid"],
    ["蓝色安全无残留版", "17格豆散.png", "right4"],
    ["砂土场景安全版", "18格豆散.png", "photoRight"],
    ["病症照片对照版", "2582-0.png", "collage"],
    ["白底病症列表版", "5073-1.png", "cleanRight"],
    ["多图病症科普版", "7305-1.png", "collage"],
    ["绿红鸡痘症状版", "7767-3.png", "topBand"],
    ["灰白养殖常备版", "8049-4.png", "minimal"],
    ["暗色快速祛痘版", "9889-1.png", "bigTitle"],
    ["双区症状标签版", "9889-3.png", "dualPanel"],
  ],
};

function visualLayout(family) {
  const elements = {};
  if (family.background) elements.backgroundRegion1 = layer("backgroundRegion", "背景区域", "custom", family.background, 1);
  if (family.animal) elements.animalRegion1 = layer("animalRegion", "动物区域", "custom", family.animal, 2);
  elements.product = layer("product", "产品", "product1", family.product, 5);
  elements.title = layer("title", "主标题", "productName", family.title, 8);
  if (family.subtitle) elements.subtitle = layer("title", "副标题", "subtitle", family.subtitle, 8);
  (family.points || []).forEach((point, index) => {
    elements[`point${index + 1}`] = layer(
      "sellingPoint", `卖点${index + 1}`, `point${index + 1}`, point, 8,
      { copyRegion: point.y < 25 ? "顶部卖点" : point.y > 72 ? "底部卖点" : "侧栏卖点" },
    );
  });
  if (family.net) elements.net = layer("net", "净含量", "net", family.net, 9);
  elements.footer = layer("footer", "底栏", "footer", family.footer, 9);
  return { canvas: 1024, elements };
}

function templateSpecial(group) {
  const animalRule = group === "格豆散"
    ? "当前产品属于【鸽子鸟类】时，动物背景只使用鸽子或鸟类；属于【鸡鸭鹅禽类】时，只使用鸡、鸭、鹅，不得混用。"
    : "动物与养殖场景必须匹配当前产品所属分类。";
  return `只参考来源图的构图、配色、文字层级和区域比例；不得复制来源图中的旧产品包装、旧产品名称、商标或用量。${animalRule}主体必须严格使用当前所选产品图。`;
}

const templateDrafts = Object.entries(groupSpecs).flatMap(([group, specs]) =>
  specs.map(([name, reference, familyName]) => {
    const family = families[familyName];
    return {
      group,
      name,
      reference,
      enabled: false,
      layout: `${family.description} 来源图仅用于布局核对：${reference.replace(group, "").replace(/\.[^.]+$/, "") || "参考图"}`,
      subtitleSource: family.subtitle ? "副标题" : "无",
      points: family.points.length,
      bottomSource: "底栏文案",
      bottomStyle: family.footer.h >= 12 ? "加高单行" : "标准单行",
      special: templateSpecial(group),
      netPosition: "产品附近",
      visualLayout: visualLayout(family),
    };
  }));

const R = {
  top: ["顶部卖点", "侧栏卖点"],
  side: ["侧栏卖点"],
  bottom: ["底部卖点", "底栏文案"],
  subtitle: ["副标题"],
  auxiliary: ["辅助文案"],
};

function rows(category, product, items) {
  return items.map(([group, regions, text], index) => ({
    scope: "product",
    category,
    product,
    group,
    regions,
    text,
    priority: 200 - index,
    enabled: true,
  }));
}

const copyEntries = [
  ...rows("鸡鸭鹅禽类", "防啄护卫", [
    ["产品定位", R.subtitle, "家禽防啄护卫"],
    ["产品定位", R.subtitle, "鸡鸭鹅防啄止啄"],
    ["病症营销词", R.top, "啄羽啄肛"],
    ["病症营销词", R.top, "闹圈打架"],
    ["病症营销词", R.top, "咬耳咬尾"],
    ["病症营销词", R.top, "啄蛋啄羽"],
    ["病症营销词", R.top, "异食啄咬"],
    ["产品特点", R.top, "止啄止咬"],
    ["产品特点", R.top, "减少应激"],
    ["产品特点", R.top, "速补营养"],
    ["产品特点", R.top, "改善异食癖"],
    ["产品特点", R.top, "羽毛光亮"],
    ["产品特点", R.top, "冠红毛亮"],
    ["产品特点", R.top, "缩短换羽"],
    ["产品特点", R.top, "补充微量元素"],
    ["产品特点", R.top, "强健体质"],
    ["使用方式", R.side, "兑水拌料"],
    ["使用方式", R.side, "可兑水 可拌料"],
    ["规格与储存", R.auxiliary, "100g拌料200斤或兑水400斤"],
    ["适用对象", R.top, "鸡鸭鹅通用"],
    ["适用对象", R.top, "蛋禽肉禽可用"],
    ["品质与渠道", R.bottom, "厂家直销"],
    ["品质与渠道", R.bottom, "现货速发"],
    ["品质与渠道", R.bottom, "正品保障"],
    ["底栏口号", R.bottom, "家禽防啄 养殖常备"],
    ["底栏口号", R.bottom, "鸡鸭鹅日常养殖常备"],
  ]),
  ...rows("鸡鸭鹅禽类", "防啄卫士", [
    ["产品定位", R.subtitle, "禽类防啄卫士"],
    ["产品定位", R.subtitle, "家禽防啄养殖常备"],
    ["病症营销词", R.top, "不啄羽 不啄肛"],
    ["病症营销词", R.top, "啄肛啄羽"],
    ["病症营销词", R.top, "咬耳咬羽"],
    ["病症营销词", R.top, "啄蛋啄架"],
    ["病症营销词", R.top, "闹圈互啄"],
    ["病症营销词", R.top, "防鸟啄蛋"],
    ["产品特点", R.top, "止啄止咬"],
    ["产品特点", R.top, "改善禽畜异食癖"],
    ["产品特点", R.top, "缩短换羽"],
    ["产品特点", R.top, "羽毛光亮"],
    ["产品特点", R.top, "冠红毛亮"],
    ["产品特点", R.top, "补充营养"],
    ["产品特点", R.top, "速补营养"],
    ["产品特点", R.top, "减少应激"],
    ["使用方式", R.side, "兑水拌料"],
    ["使用方式", R.side, "可饮水 可拌料"],
    ["规格与储存", R.auxiliary, "100g拌料200斤或兑水400斤"],
    ["适用对象", R.top, "鸡鸭鹅鸽鹌鹑通用"],
    ["适用对象", R.top, "养鸡 养鸭 养鹅"],
    ["品质与渠道", R.bottom, "官方正品"],
    ["品质与渠道", R.bottom, "厂家直发"],
    ["品质与渠道", R.bottom, "现货直发"],
    ["底栏口号", R.bottom, "防啄养殖常备"],
    ["底栏口号", R.bottom, "专注畜牧健康养殖"],
  ]),
  ...rows("鸡鸭鹅猪牛羊", "钙磷锌铁十八补", [
    ["产品定位", R.subtitle, "多种营养 一袋全补"],
    ["产品定位", R.subtitle, "补充多种微量元素"],
    ["产品定位", R.subtitle, "规模化养殖场专供"],
    ["病症营销词", R.top, "改善异食"],
    ["病症营销词", R.top, "减少掉蛋"],
    ["病症营销词", R.top, "沙壳蛋"],
    ["病症营销词", R.top, "软壳蛋"],
    ["病症营销词", R.top, "站立困难"],
    ["病症营销词", R.top, "骨毛粗乱"],
    ["病症营销词", R.top, "异食腐土"],
    ["产品特点", R.top, "补钙补磷"],
    ["产品特点", R.top, "补锌补铁"],
    ["产品特点", R.top, "增强免疫"],
    ["产品特点", R.top, "壮骨促长"],
    ["产品特点", R.top, "促进生长"],
    ["产品特点", R.top, "增加产蛋"],
    ["产品特点", R.top, "增强硬壳"],
    ["产品特点", R.top, "均衡营养"],
    ["产品特点", R.top, "提高产蛋"],
    ["产品特点", R.top, "促进生殖发育"],
    ["适用对象", R.top, "禽畜通用"],
    ["适用对象", R.top, "孕畜可用"],
    ["适用对象", R.top, "蛋禽肉禽可用"],
    ["适用对象", R.top, "母猪母牛母羊适用"],
    ["适用对象", R.top, "养猪 养牛 养羊 养鸡 养鸭"],
    ["规格与储存", R.auxiliary, "净含量：500g"],
    ["规格与储存", R.auxiliary, "每袋拌料2000斤"],
    ["品质与渠道", R.bottom, "厂家直销"],
    ["品质与渠道", R.bottom, "品质保障"],
    ["底栏口号", R.bottom, "补充营养 促进生长"],
    ["底栏口号", R.bottom, "禽畜健康成长"],
  ]),
  ...rows("鸡鸭鹅禽类", "杆舒", [
    ["产品定位", R.subtitle, "天然植物饲料原料"],
    ["产品定位", R.subtitle, "家禽养殖常备"],
    ["病症营销词", R.top, "浆膜炎"],
    ["病症营销词", R.top, "鸭鹅浆膜炎"],
    ["病症营销词", R.top, "大肠杆菌"],
    ["病症营销词", R.top, "沙门氏菌"],
    ["病症营销词", R.top, "拉稀腹泻"],
    ["病症营销词", R.top, "肠炎腹泻"],
    ["病症营销词", R.top, "白痢糊肛"],
    ["病症营销词", R.top, "包心包肝"],
    ["病症营销词", R.top, "瘫痪腿瘸"],
    ["病症营销词", R.top, "走路不稳"],
    ["病症营销词", R.top, "腿软站不起来"],
    ["病症营销词", R.top, "精神不振"],
    ["病症营销词", R.top, "采食减少"],
    ["产品特点", R.top, "植物提取"],
    ["产品特点", R.top, "绿色健康"],
    ["产品特点", R.top, "纯中药提取"],
    ["产品特点", R.top, "安全不伤禽"],
    ["产品特点", R.top, "增强体质"],
    ["产品特点", R.top, "调理肠道"],
    ["使用方式", R.side, "兑水拌料"],
    ["使用方式", R.side, "饮水拌料"],
    ["规格与储存", R.auxiliary, "100g拌料200斤或兑水400斤"],
    ["适用对象", R.top, "鸡鸭鹅通用"],
    ["适用对象", R.top, "蛋禽肉禽专用"],
    ["品质与渠道", R.bottom, "厂家直发"],
    ["品质与渠道", R.bottom, "现货直发"],
    ["品质与渠道", R.bottom, "正品保障"],
    ["底栏口号", R.bottom, "鸡鸭鹅养殖常备"],
    ["底栏口号", R.bottom, "专注家禽健康养殖"],
  ]),
  ...rows("鸡鸭鹅禽类", "格豆散", [
    ["产品定位", R.subtitle, "禽类养殖祛痘常备"],
    ["产品定位", R.subtitle, "鸡痘专用"],
    ["病症营销词", R.top, "鸡痘"],
    ["病症营销词", R.top, "鸡冠长痘"],
    ["病症营销词", R.top, "眼睛长痘"],
    ["病症营销词", R.top, "内眼长痘"],
    ["病症营销词", R.top, "肉眼长痘"],
    ["病症营销词", R.top, "皮肤长痘"],
    ["病症营销词", R.top, "嘴角长痘"],
    ["病症营销词", R.top, "脚趾长痘"],
    ["病症营销词", R.top, "口腔长痘"],
    ["病症营销词", R.top, "喉咙长痘"],
    ["病症营销词", R.top, "皮肤型鸡痘"],
    ["病症营销词", R.top, "粘膜型鸡痘"],
    ["病症营销词", R.top, "混合型鸡痘"],
    ["产品特点", R.top, "快速祛鸡痘"],
    ["产品特点", R.top, "痘不怕"],
    ["产品特点", R.top, "安全无残留"],
    ["产品特点", R.top, "植物提取"],
    ["产品特点", R.top, "绿色原料"],
    ["产品特点", R.top, "不伤鸡群"],
    ["使用方式", R.side, "拌料使用"],
    ["规格与储存", R.auxiliary, "净含量：100g"],
    ["规格与储存", R.auxiliary, "每100g拌料80斤"],
    ["适用对象", R.top, "鸡鸭鹅适用"],
    ["品质与渠道", R.bottom, "厂家直销"],
    ["品质与渠道", R.bottom, "正品保障"],
    ["底栏口号", R.bottom, "禽类养殖的好伙伴"],
    ["底栏口号", R.bottom, "鸡痘清除 养殖常备"],
  ]),
  ...rows("鸽子鸟类", "格豆散", [
    ["产品定位", R.subtitle, "鸽子鸟类祛痘常备"],
    ["产品定位", R.subtitle, "鸽痘专用"],
    ["病症营销词", R.top, "鸽痘"],
    ["病症营销词", R.top, "鸽嘴长痘"],
    ["病症营销词", R.top, "鸽眼长痘"],
    ["病症营销词", R.top, "鸽脚长痘"],
    ["病症营销词", R.top, "鸽喉痘"],
    ["病症营销词", R.top, "眼周长痘"],
    ["病症营销词", R.top, "口腔长痘"],
    ["病症营销词", R.top, "皮肤长痘"],
    ["病症营销词", R.top, "皮肤型鸽痘"],
    ["病症营销词", R.top, "粘膜型鸽痘"],
    ["病症营销词", R.top, "混合型鸽痘"],
    ["产品特点", R.top, "快速祛鸽痘"],
    ["产品特点", R.top, "鸽痘消去不伤鸽"],
    ["产品特点", R.top, "安全无残留"],
    ["产品特点", R.top, "植物提取"],
    ["产品特点", R.top, "绿色原料"],
    ["产品特点", R.top, "养鸽常备"],
    ["使用方式", R.side, "拌料使用"],
    ["规格与储存", R.auxiliary, "净含量：100g"],
    ["规格与储存", R.auxiliary, "每100g拌料80斤"],
    ["适用对象", R.top, "鸽子鸟类适用"],
    ["适用对象", R.top, "肉鸽信鸽观赏鸽适用"],
    ["品质与渠道", R.bottom, "厂家直销"],
    ["品质与渠道", R.bottom, "正品保障"],
    ["底栏口号", R.bottom, "鸽类养殖的好伙伴"],
    ["底栏口号", R.bottom, "鸽痘祛除 养鸽常备"],
  ]),
];

const expectedProducts = [
  ["鸡鸭鹅禽类", "防啄护卫"],
  ["鸡鸭鹅禽类", "防啄卫士"],
  ["鸡鸭鹅猪牛羊", "钙磷锌铁十八补"],
  ["鸡鸭鹅禽类", "杆舒"],
  ["鸡鸭鹅禽类", "格豆散"],
  ["鸽子鸟类", "格豆散"],
];

const state = await api("/api/state");
for (const [category, name] of expectedProducts) {
  if (!state.products.some((product) => product.category === category && product.name === name)) {
    throw new Error(`未找到产品：${category}/${name}`);
  }
}

const existingNames = new Set(state.templates.map((item) => `${item.group || "未分组"}\u001f${item.name}`));
const existingNumbers = new Set(state.templates.map((item) => Number(item.number)).filter(Number.isFinite));
let nextNumber = Math.max(0, ...existingNumbers) + 1;
const newTemplates = templateDrafts
  .filter((template) => !existingNames.has(`${template.group}\u001f${template.name}`))
  .map((template) => {
    while (existingNumbers.has(nextNumber)) nextNumber += 1;
    const number = String(nextNumber).padStart(2, "0");
    existingNumbers.add(nextNumber);
    nextNumber += 1;
    return { ...template, number };
  });

if (newTemplates.length) {
  await api("/api/templates/save", {
    method: "POST",
    body: JSON.stringify({
      templates: [...state.templates, ...newTemplates],
      groups: [...new Set([...(state.templateGroups || []), ...Object.keys(groupSpecs)])],
    }),
  });
}

const existingCopy = new Set(state.productMarketingEntries.map((entry) =>
  [entry.scope, entry.category, entry.product, String(entry.text || "").trim()].join("\u001f")));
const newCopyEntries = copyEntries.filter((entry) =>
  !existingCopy.has([entry.scope, entry.category, entry.product, entry.text].join("\u001f")));

if (newCopyEntries.length) {
  await api("/api/product-marketing/save", {
    method: "POST",
    body: JSON.stringify({
      entries: [...state.productMarketingEntries, ...newCopyEntries],
      deletedEntries: [],
    }),
  });
}

console.log(JSON.stringify({
  groups: Object.keys(groupSpecs),
  templatesAdded: newTemplates.length,
  templatesByGroup: Object.fromEntries(Object.entries(groupSpecs).map(([group, specs]) => [group, specs.length])),
  templateRange: newTemplates.length ? `${newTemplates[0].number}-${newTemplates.at(-1).number}` : null,
  marketingCopiesAdded: newCopyEntries.length,
  marketingCopiesByProduct: Object.fromEntries(expectedProducts.map(([category, product]) => [
    `${category}/${product}`,
    copyEntries.filter((entry) => entry.category === category && entry.product === product).length,
  ])),
  exactDuplicateFilesSkipped: [
    "钙磷锌铁十八补/主图08.jpg（与主图06.jpg完全相同）",
    "杆舒/06杆舒.png（与01杆舒.png完全相同）",
    "杆舒/09杆舒.png（与02杆舒.png完全相同）",
  ],
}, null, 2));
