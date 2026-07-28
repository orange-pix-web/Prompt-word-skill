const BASE_URL = process.env.PROMPT_STUDIO_URL || "http://127.0.0.1:4178";
const PRODUCT_NAME = "单过硫酸氢钾消毒粉";
const TEMPLATE_GROUP = "消毒粉";

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

const specs = [
  {
    number: "11", name: "养殖通用四栏", reference: "主图01.jpg",
    description: "浅蓝背景，顶部超大标题；左侧四条交替色分类卖点，产品位于右侧，底部为通栏文案并带小型动物氛围图。",
    title: box(3, 2, 91, 17), product: box(52, 24, 40, 58),
    points: [box(1, 25, 40, 11, "pill"), box(1, 40, 43, 11, "pill"), box(1, 55, 40, 11, "pill"), box(1, 70, 42, 11, "pill")],
    animal: box(45, 68, 25, 16), footer: box(4, 88, 92, 10, "rectangle"),
  },
  {
    number: "12", name: "蓝天三勾全品类", reference: "主图01 (2).jpg",
    description: "蓝天背景，顶部横向产品标题；产品固定在右侧，左侧三枚红色勾选卖点，底部动物群像与双层通栏文案。",
    title: box(4, 4, 92, 13), product: box(51, 18, 44, 61),
    points: [box(3, 26, 44, 12, "rounded"), box(3, 43, 44, 12, "rounded"), box(3, 60, 44, 12, "rounded")],
    animal: box(0, 67, 100, 18), footer: box(0, 88, 100, 12, "rectangle"), custom: [box(2, 80, 96, 8, "none")],
  },
  {
    number: "13", name: "鸡舍喷雾三卖点", reference: "主图01_1.jpg",
    description: "真实鸡舍消毒作业背景，顶部为标题，中上部为醒目副标题；产品位于右侧，下方左侧为三枚黄色圆角卖点，底部单行通栏。",
    title: box(5, 3, 90, 12), subtitle: box(16, 20, 68, 12),
    product: box(62, 34, 34, 52), points: [box(7, 42, 38, 9, "pill"), box(7, 54, 38, 9, "pill"), box(7, 66, 38, 9, "pill")],
    background: box(0, 15, 100, 73, "rectangle"), footer: box(0, 88, 100, 12, "rectangle"),
  },
  {
    number: "14", name: "草地左栏官方正品", reference: "主图01_2.jpg",
    description: "淡色草地背景，产品固定右侧；左侧依次为标题、副标题和三枚深蓝圆角卖点，左下角为官方正品角标，底部蓝色通栏。",
    title: box(4, 18, 43, 10), subtitle: box(4, 31, 42, 9),
    product: box(51, 17, 45, 65), points: [box(4, 45, 40, 10, "pill"), box(4, 57, 40, 10, "pill"), box(4, 69, 40, 10, "pill")],
    net: box(28, 82, 34, 7, "pill"), footer: box(25, 89, 75, 11, "rectangle"), custom: [box(1, 82, 25, 16, "none")],
  },
  {
    number: "15", name: "红头四类勾选", reference: "主图02.jpg",
    description: "红色页眉承载超大标题，白色主体区左侧为四条勾选分类卖点，产品固定在右侧，底部蓝色通栏。",
    title: box(2, 1, 96, 18), subtitle: box(6, 25, 46, 7),
    product: box(56, 23, 41, 62), points: [box(4, 35, 47, 9, "none"), box(4, 48, 47, 9, "none"), box(4, 61, 47, 9, "none"), box(4, 74, 47, 9, "none")],
    footer: box(0, 89, 100, 11, "rectangle"),
  },
  {
    number: "16", name: "宠物红色三按钮", reference: "主图02 (2).jpg",
    description: "宠物照片作满版背景，顶部产品标题，产品位于右侧；左侧三枚红色圆角卖点，底部蓝色通栏。",
    title: box(3, 3, 94, 12), product: box(50, 19, 47, 67),
    points: [box(2, 46, 44, 11, "rounded"), box(2, 59, 44, 11, "rounded"), box(2, 72, 44, 11, "rounded")],
    background: box(0, 0, 100, 89, "rectangle"), animal: box(0, 15, 100, 72), footer: box(0, 88, 100, 12, "rectangle"),
  },
  {
    number: "17", name: "鸡舍病毒三红条", reference: "主图02_1.jpg",
    description: "真实鸡舍背景，顶部超大标题；产品固定在右侧，左侧三枚深红色药丸卖点，底部蓝色高对比通栏。",
    title: box(1, 1, 98, 15), product: box(50, 18, 49, 70),
    points: [box(4, 34, 43, 10, "pill"), box(4, 49, 43, 10, "pill"), box(4, 64, 43, 10, "pill")],
    background: box(0, 0, 100, 90, "rectangle"), footer: box(0, 89, 100, 11, "rectangle"),
  },
  {
    number: "18", name: "鸡场右侧四勾金底", reference: "主图02_1 (2).jpg",
    description: "明亮鸡场背景，产品占据左侧大面积区域；标题位于顶部，右侧纵向排列四组勾选卖点，底部为蓝金信息栏与净含量角标。",
    title: box(3, 3, 82, 10), product: box(3, 15, 56, 66),
    points: [box(70, 20, 27, 9, "rounded"), box(70, 35, 27, 9, "rounded"), box(70, 50, 27, 9, "rounded"), box(70, 65, 27, 9, "rounded")],
    background: box(0, 0, 100, 82, "rectangle"), net: box(72, 81, 25, 16, "rounded"), footer: box(0, 82, 71, 18, "rectangle"),
  },
  {
    number: "19", name: "浅蓝鸡舍双卖点", reference: "主图02_2.jpg",
    description: "浅蓝圆角信息板，产品固定在右侧，左侧为主标题与两枚深蓝卖点；底部木纹台面上摆放动物，底栏采用左右双色分区。",
    title: box(3, 14, 45, 19), product: box(50, 14, 47, 66),
    points: [box(6, 39, 39, 10, "rounded"), box(6, 53, 39, 10, "rounded")],
    animal: box(30, 56, 28, 28), footer: box(0, 82, 100, 16, "rectangle"),
  },
  {
    number: "20", name: "带鸡消毒含量场景", reference: "主图03_1.jpg",
    description: "鸡舍作业场景全屏背景，顶部大标题，产品固定右下；左下以大号数值卖点和两行底栏文案形成红绿信息区。",
    title: box(2, 2, 94, 16), product: box(55, 31, 42, 66),
    points: [box(3, 62, 47, 11, "none")], background: box(0, 0, 100, 100, "rectangle"),
    footer: box(0, 75, 55, 23, "rectangle"),
  },
  {
    number: "21", name: "橙蓝信息板四卖点", reference: "主图03_1 (2).jpg",
    description: "蓝色圆角边框与橙色顶部品牌条，产品固定左侧；右上为大标题，右侧蓝色信息板纵向排列四条卖点，底部橙蓝双色栏。",
    title: box(52, 13, 42, 14), product: box(4, 16, 46, 61),
    points: [box(54, 34, 39, 8, "none"), box(54, 45, 39, 8, "none"), box(54, 56, 39, 8, "none"), box(54, 67, 39, 8, "none")],
    net: box(44, 79, 51, 7, "pill"), footer: box(24, 87, 76, 13, "rectangle"), custom: [box(0, 79, 24, 21, "parallelogram")],
  },
  {
    number: "22", name: "无毒配方白卡四卖点", reference: "主图03_2.jpg",
    description: "浅色虚化背景，左侧白色信息卡包含标题、副标题、绿色标签和四条勾选卖点；产品位于右侧，底部为大号净含量及双色通栏。",
    title: box(4, 5, 46, 11), subtitle: box(4, 17, 42, 10), product: box(52, 16, 44, 66),
    points: [box(4, 31, 34, 8, "pill"), box(4, 43, 42, 8, "none"), box(4, 53, 42, 8, "none"), box(4, 63, 42, 8, "none"), box(4, 73, 42, 8, "none")],
    net: box(0, 82, 27, 18, "rectangle"), footer: box(28, 83, 72, 17, "rectangle"),
  },
  {
    number: "23", name: "蓝天动物三红栏", reference: "主图04 (2).jpg",
    description: "蓝天草地背景，顶部横向大标题，产品固定右侧；左侧为短副标题和三枚红色圆角分类卖点，动物群像位于前景，底部蓝色通栏。",
    title: box(3, 3, 94, 12), subtitle: box(6, 19, 38, 8), product: box(51, 18, 45, 65),
    points: [box(2, 35, 45, 10, "rounded"), box(2, 49, 45, 10, "rounded"), box(2, 63, 45, 10, "rounded")],
    animal: box(34, 50, 66, 36), footer: box(0, 88, 100, 12, "rectangle"),
  },
  {
    number: "24", name: "猪场蓝色四勾", reference: "主图04_1 (2).jpg",
    description: "猪场虚化背景，标题位于顶部右侧，左侧为橙色副标题和四枚蓝色勾选卖点；产品固定在右侧，猪只位于前景，底部为蓝橙信息栏。",
    title: box(41, 2, 56, 9), subtitle: box(3, 14, 42, 11), product: box(51, 13, 45, 66),
    points: [box(4, 31, 43, 9, "pill"), box(4, 43, 43, 9, "pill"), box(4, 55, 43, 9, "pill"), box(4, 67, 43, 9, "pill")],
    animal: box(54, 49, 44, 36), net: box(45, 78, 50, 7, "pill"), footer: box(0, 85, 100, 15, "rectangle"),
  },
  {
    number: "25", name: "鸡舍夜景左右分栏", reference: "主图04_1.jpg",
    description: "暗色鸡舍背景，顶部大标题；产品占据左下，右侧为消毒作业人员，右下放大号含量卖点和蓝色底栏。",
    title: box(4, 5, 92, 19), product: box(4, 31, 44, 62),
    points: [box(51, 72, 46, 10, "none")], background: box(0, 0, 100, 100, "rectangle"),
    footer: box(51, 84, 46, 12, "rectangle"),
  },
  {
    number: "26", name: "鸡舍喷雾上下大字", reference: "主图04_2.jpg",
    description: "消毒喷雾作业背景，顶部为超大标题；产品固定右侧，底部左侧用深蓝色大字强调单一卖点，整体无额外边框。",
    title: box(4, 4, 92, 18), product: box(56, 37, 41, 57),
    background: box(0, 0, 100, 100, "rectangle"), footer: box(1, 81, 52, 16, "rectangle"),
  },
  {
    number: "27", name: "圈舍场景两按钮斜底", reference: "主图05.jpg",
    description: "养殖圈舍实景背景，顶部红色标题栏；产品固定左侧，右侧两枚蓝色箭头卖点，底部黄色斜切大字横幅。",
    title: box(2, 1, 95, 17), product: box(2, 24, 46, 63),
    points: [box(53, 30, 41, 11, "rounded"), box(53, 47, 41, 11, "rounded")],
    background: box(0, 18, 100, 82, "rectangle"), footer: box(0, 78, 100, 20, "parallelogram"),
  },
  {
    number: "28", name: "橙蓝宠物四卖点", reference: "主图05 (2).jpg",
    description: "蓝色圆角边框与橙色顶部条，产品固定左侧；右上为大标题，右侧蓝色信息板排列四条卖点，底部为橙蓝双色文案栏。",
    title: box(52, 13, 42, 14), product: box(4, 16, 46, 61),
    points: [box(54, 34, 39, 8, "none"), box(54, 45, 39, 8, "none"), box(54, 56, 39, 8, "none"), box(54, 67, 39, 8, "none")],
    net: box(44, 79, 51, 7, "pill"), footer: box(24, 87, 76, 13, "rectangle"), custom: [box(0, 79, 24, 21, "parallelogram")],
  },
  {
    number: "29", name: "养殖场消毒安全可靠", reference: "主图05_1.jpg",
    description: "鸡舍消毒场景满版背景，顶部黄色大标题，产品固定右侧；左下是含量卖点，底部绿色双行通栏。",
    title: box(4, 4, 92, 15), product: box(53, 34, 44, 63),
    points: [box(3, 61, 49, 11, "none")], background: box(0, 0, 100, 100, "rectangle"),
    footer: box(0, 75, 55, 23, "rectangle"),
  },
  {
    number: "30", name: "无毒无刺激场景", reference: "主图05_2.jpg",
    description: "浅色室内消毒场景，左上为标题和辅助文案，左中使用蓝色圆形强调卖点；产品位于右上，动物群像和喷雾瓶位于底部。",
    title: box(3, 5, 42, 12), subtitle: box(6, 18, 43, 8), product: box(64, 4, 32, 39),
    points: [box(8, 29, 31, 31, "circle")], animal: box(0, 63, 58, 34), custom: [box(63, 56, 34, 41, "none")],
  },
  {
    number: "31", name: "绿色含量三按钮", reference: "主图06_1.jpg",
    description: "绿色描边圆角卡片，顶部横向标题；产品固定右侧，左上为大号含量卖点，左侧三枚绿色勾选按钮，底部黄绿双色信息栏。",
    title: box(3, 2, 94, 11), product: box(52, 16, 45, 65),
    points: [box(5, 20, 43, 10, "none"), box(5, 39, 44, 10, "rounded"), box(5, 52, 44, 10, "rounded"), box(5, 65, 44, 10, "rounded")],
    net: box(0, 82, 25, 18, "rectangle"), footer: box(25, 82, 75, 18, "rectangle"), custom: [box(39, 82, 57, 7, "pill")],
  },
  {
    number: "32", name: "蓝天宠物三红栏", reference: "主图07 (2).jpg",
    description: "蓝天草地背景，顶部大标题，产品固定右侧；左侧三枚红色勾选卖点，宠物群像位于底部前景，最下方为红色通栏。",
    title: box(3, 3, 94, 12), product: box(51, 18, 45, 65),
    points: [box(3, 26, 44, 12, "rounded"), box(3, 43, 44, 12, "rounded"), box(3, 60, 44, 12, "rounded")],
    animal: box(0, 60, 100, 26), footer: box(0, 88, 100, 12, "rectangle"),
  },
  {
    number: "33", name: "养殖问题图文卡", reference: "主图07_1.jpg",
    description: "浅蓝背景，标题位于顶部；左侧为两行主题文案和绿色场景图文卡，产品固定右侧，底部绿色通栏展示养殖常备与使用方式。",
    title: box(3, 3, 94, 11), product: box(52, 16, 44, 66),
    points: [box(5, 18, 42, 18, "none"), box(4, 39, 41, 34, "rounded")],
    footer: box(0, 83, 100, 17, "rounded"),
  },
  {
    number: "34", name: "宠物圈舍蓝色四勾", reference: "主图08 (2).jpg",
    description: "宠物照片虚化背景，标题位于顶部右侧；左侧为橙色副标题和四枚蓝色勾选卖点，产品固定右侧，宠物位于前景，底部为蓝橙信息栏。",
    title: box(41, 2, 56, 9), subtitle: box(3, 14, 42, 11), product: box(51, 13, 45, 66),
    points: [box(4, 31, 43, 9, "pill"), box(4, 43, 43, 9, "pill"), box(4, 55, 43, 9, "pill"), box(4, 67, 43, 9, "pill")],
    animal: box(55, 48, 43, 36), net: box(45, 78, 50, 7, "pill"), footer: box(0, 85, 100, 15, "rectangle"),
  },
  {
    number: "35", name: "使用说明动物展台", reference: "主图08_1.jpg",
    description: "浅蓝室内展台背景，左上为使用说明信息框，产品固定右侧，猪鸡位于左下，超大产品标题横置于底部。",
    title: box(9, 87, 82, 11), product: box(52, 16, 44, 67),
    points: [box(4, 5, 47, 32, "rounded")], animal: box(0, 47, 46, 38), background: box(0, 0, 100, 100, "rectangle"),
  },
  {
    number: "36", name: "红蓝通用四勾", reference: "主图10.jpg",
    description: "顶部红蓝分区大标题，白色主体区产品固定左侧；右侧纵向排列四条蓝色勾选卖点，底部红色净含量通栏。",
    title: box(0, 0, 100, 18), product: box(3, 22, 43, 62),
    points: [box(52, 30, 43, 9, "pill"), box(52, 43, 43, 9, "pill"), box(52, 56, 43, 9, "pill"), box(52, 69, 43, 9, "pill")],
    footer: box(0, 89, 100, 11, "rectangle"),
  },
];

function makeElement(type, label, binding, source, z, extra = {}) {
  return {
    ...source,
    z,
    type,
    label,
    binding,
    fontRatio: ["title", "sellingPoint", "footer", "net", "customText"].includes(type) ? 0.8 : undefined,
    visible: true,
    text: "",
    ...extra,
  };
}

function visualLayout(spec) {
  const elements = {};
  if (spec.background) {
    elements.backgroundRegion1 = makeElement("backgroundRegion", "背景区域", "custom", spec.background, 1);
  }
  elements.title = makeElement("title", "主标题", "productName", spec.title, 7);
  if (spec.subtitle) elements.subtitle = makeElement("title", "副标题", "subtitle", spec.subtitle, 7);
  (spec.points || []).forEach((point, index) => {
    elements[`point${index + 1}`] = makeElement(
      "sellingPoint", `卖点${index + 1}`, `point${index + 1}`, point, 7,
      { copyRegion: point.y < 25 ? "顶部卖点" : point.y > 75 ? "底部卖点" : "侧栏卖点" },
    );
  });
  elements.product = makeElement("product", "产品", "product1", spec.product, 5);
  if (spec.animal) elements.animalRegion1 = makeElement("animalRegion", "动物区域", "custom", spec.animal, 3);
  if (spec.net) elements.net = makeElement("net", "净含量", "net", spec.net, 8);
  if (spec.footer) elements.footer = makeElement("footer", "底栏", "footer", spec.footer, 8);
  (spec.custom || []).forEach((custom, index) => {
    elements[`customText${index + 1}`] = makeElement("customText", `自定义文字${index + 1}`, "custom", custom, 8);
  });
  return { canvas: 1024, elements };
}

const templates = specs.map((spec) => ({
  enabled: false,
  number: spec.number,
  name: spec.name,
  group: TEMPLATE_GROUP,
  layout: spec.description,
  subtitleSource: spec.subtitle ? "副标题" : "无",
  points: (spec.points || []).length,
  bottomSource: spec.footer ? "底栏文案" : "辅助文案",
  bottomStyle: spec.footer?.h >= 16 ? "加高单行" : "标准单行",
  special: `构图参考【${spec.reference}】；只参考布局、配色和文字层级，不复制参考图中的品牌、商标或产品包装，主体必须替换为上传的【${PRODUCT_NAME}】产品图。`,
  netPosition: spec.net ? "产品附近" : "产品附近",
  visualLayout: visualLayout(spec),
}));

const copyRows = [
  ["副标题", "养殖消毒粉", 130],
  ["副标题", "养殖用消毒粉", 129],
  ["副标题", "复合消毒粉", 128],
  ["副标题", "养殖专用消毒粉", 127],
  ["副标题", "鸡舍带鸡消毒专用", 126],
  ["副标题", "宠物专用消毒粉", 125],
  ["顶部卖点、侧栏卖点", "鸡鸭鹅舍", 120],
  ["顶部卖点、侧栏卖点", "猪牛羊场", 119],
  ["顶部卖点、侧栏卖点", "马驴骡圈", 118],
  ["顶部卖点、侧栏卖点", "鸽兔狗窝", 117],
  ["顶部卖点、侧栏卖点", "环境消毒", 116],
  ["顶部卖点、侧栏卖点", "圈舍消毒", 115],
  ["顶部卖点、侧栏卖点", "养殖场消毒", 114],
  ["顶部卖点、侧栏卖点", "带鸡鸭消毒", 113],
  ["顶部卖点、侧栏卖点", "鸡瘟鸭瘟", 112],
  ["顶部卖点、侧栏卖点", "杀菌消毒", 111],
  ["顶部卖点、侧栏卖点", "不伤鸡群", 110],
  ["顶部卖点、侧栏卖点", "圈舍消毒通用", 109],
  ["顶部卖点、侧栏卖点", "消毒杀菌", 108],
  ["顶部卖点、侧栏卖点", "带畜消毒", 107],
  ["顶部卖点、侧栏卖点", "无需清棚", 106],
  ["顶部卖点、侧栏卖点", "带宠消毒", 105],
  ["顶部卖点、侧栏卖点", "宠物适用", 104],
  ["顶部卖点、侧栏卖点", "猪圈鸡舍消毒杀菌", 103],
  ["顶部卖点、侧栏卖点", "预防鸡瘟", 102],
  ["顶部卖点、侧栏卖点", "鸡禽流感", 101],
  ["顶部卖点、侧栏卖点", "鸡新城疫", 100],
  ["顶部卖点、侧栏卖点", "安全高效", 99],
  ["顶部卖点、侧栏卖点", "有效杀灭多种细菌病毒", 98],
  ["顶部卖点、侧栏卖点", "低毒安全不刺激", 97],
  ["顶部卖点、侧栏卖点", "快速溶解", 96],
  ["顶部卖点、侧栏卖点", "广谱高效", 95],
  ["顶部卖点、侧栏卖点", "稳定持久", 94],
  ["顶部卖点、侧栏卖点", "预防瘟疫", 93],
  ["顶部卖点、侧栏卖点", "品质保障", 92],
  ["顶部卖点、侧栏卖点", "猪舍 羊圈", 91],
  ["顶部卖点、侧栏卖点", "猫狗 犬舍", 90],
  ["顶部卖点、侧栏卖点", "鸡场 鸽舍", 89],
  ["顶部卖点、侧栏卖点", "生态消杀", 88],
  ["顶部卖点、侧栏卖点", "环境洁净", 87],
  ["顶部卖点、侧栏卖点", "无氯消杀", 86],
  ["顶部卖点、侧栏卖点", "可带鸡消毒", 85],
  ["顶部卖点、侧栏卖点", "解决养殖环境问题", 84],
  ["顶部卖点、侧栏卖点", "养殖环境问题", 83],
  ["顶部卖点、侧栏卖点", "无毒无刺激", 82],
  ["顶部卖点、侧栏卖点", "孕畜幼畜舔食无害", 81],
  ["顶部卖点、侧栏卖点", "孕畜可用", 80],
  ["顶部卖点、侧栏卖点", "抗菌防病", 79],
  ["顶部卖点、侧栏卖点", "环境设备", 78],
  ["顶部卖点、侧栏卖点", "四季常备", 77],
  ["顶部卖点、侧栏卖点", "广谱抑菌", 76],
  ["顶部卖点、侧栏卖点", "养殖适配", 75],
  ["顶部卖点、侧栏卖点", "居家可用", 74],
  ["顶部卖点、侧栏卖点", "圈舍设备", 73],
  ["顶部卖点、侧栏卖点", "环境消杀", 72],
  ["顶部卖点、侧栏卖点", "养宠消毒常备", 71],
  ["顶部卖点、侧栏卖点", "无毒配方", 70],
  ["顶部卖点、侧栏卖点", "杀灭多种病原体", 69],
  ["顶部卖点、侧栏卖点", "99%灭杀常见病毒细菌", 68],
  ["顶部卖点、侧栏卖点", "含量≥66%", 67],
  ["顶部卖点、侧栏卖点", "养殖场消毒杀菌", 66],
  ["顶部卖点、侧栏卖点", "安全可靠", 65],
  ["辅助文案", "官方正品", 64],
  ["辅助文案", "厂家直销", 63],
  ["辅助文案", "配置方法：1g（消毒粉）：200ml（水）", 62],
  ["辅助文案", "储存条件：避光、密封、防潮，置于阴凉干燥处保存", 61],
  ["辅助文案", "保质期：24个月", 60],
  ["辅助文案、底栏文案", "兑水喷雾/浸泡/擦拭使用", 59],
  ["底栏文案", "养殖场舍 通用消毒", 58],
  ["底栏文案", "养殖专用 官方正品 厂家直销", 57],
  ["底栏文案", "鸡鸭鹅猪牛羊鸽子芦丁鸡通用", 56],
  ["底栏文案", "不用清圈 蛋禽鸡苗可用", 55],
  ["底栏文案", "使用消毒粉 养殖不用慌", 54],
  ["底栏文案", "宠物专用消毒粉", 53],
  ["底栏文案", "带鸡消毒 消杀病毒", 52],
  ["底栏文案", "鸡舍消毒 不伤鸡群", 51],
  ["底栏文案", "专业鸡场消毒", 50],
  ["底栏文案", "禽畜养殖环境消毒", 49],
  ["底栏文案", "猪牛羊鸡鸭鹅圈用", 48],
  ["底栏文案", "宠物消毒 禽畜通用", 47],
  ["底栏文案", "猫舍狗舍养殖畜牧用", 46],
  ["底栏文案", "养殖场消毒杀菌 安全可靠", 45],
  ["底栏文案", "养宠消毒常备", 44],
  ["底栏文案", "一袋满满100G", 43],
];

const state = await api("/api/state");
const product = state.products.find((item) => item.name === PRODUCT_NAME);
if (!product) throw new Error(`未找到产品：${PRODUCT_NAME}`);
if (product.category !== "消毒") throw new Error(`产品分类应为“消毒”，当前为“${product.category}”`);

const existingNumbers = new Set(state.templates.map((item) => item.number));
const existingNames = new Set(state.templates.map((item) => `${item.group || "未分组"}\u001f${item.name}`));
for (const template of templates) {
  if (existingNumbers.has(template.number)) throw new Error(`模板编号已存在：${template.number}`);
  if (existingNames.has(`${TEMPLATE_GROUP}\u001f${template.name}`)) throw new Error(`模板名称已存在：${template.name}`);
}

await api("/api/templates/save", {
  method: "POST",
  body: JSON.stringify({
    templates: [...state.templates, ...templates],
    groups: [...new Set([...(state.templateGroups || []), TEMPLATE_GROUP])],
  }),
});

const existingProductCopy = new Set(state.productMarketingEntries
  .filter((entry) => entry.scope === "product" && entry.product === PRODUCT_NAME)
  .map((entry) => String(entry.text || "").trim()));
const newEntries = copyRows
  .filter(([, text]) => !existingProductCopy.has(text))
  .map(([regions, text, priority]) => ({
    scope: "product",
    category: "消毒",
    product: PRODUCT_NAME,
    regions: regions.split("、"),
    text,
    priority,
    enabled: true,
  }));

await api("/api/product-marketing/save", {
  method: "POST",
  body: JSON.stringify({
    entries: [...state.productMarketingEntries, ...newEntries],
    deletedEntries: [],
  }),
});

console.log(JSON.stringify({
  product: PRODUCT_NAME,
  templatesAdded: templates.length,
  templateRange: `${templates[0].number}-${templates.at(-1).number}`,
  group: TEMPLATE_GROUP,
  marketingCopiesAdded: newEntries.length,
  duplicateReferencesSkipped: [
    ["主图01_1 (2).jpg", "主图01 (2).jpg"],
    ["主图09 (2).jpg", "主图04_1 (2).jpg"],
    ["主图10_1.jpg", "主图01_2.jpg"],
  ],
}, null, 2));
