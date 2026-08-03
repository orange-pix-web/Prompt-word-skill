"""Extract usable product-specific marketing copy from matching reference images.

The task scans all matching reference files to remove byte-identical duplicates, OCRs
an evenly-spaced set of representative images per product, writes a source review
file, then appends only high-confidence, usable short copy to the local workbench.
It deliberately skips prices, product-label microtext, standards, net weight,
brands, other product names and obviously absolute/medical claims.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

from PIL import Image
from rapidocr_onnxruntime import RapidOCR


ROOT = Path(__file__).resolve().parents[2]
REF_ROOT = ROOT / "参考图"
MARKETING_ROOT = ROOT / "营销文案"
WORK_ROOT = ROOT / ".prompt-ui"
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
ALIASES = {
    "口黄毛滴净瓶装": ["口黄毛滴净"], "母猪保健包200g": ["母猪保健包"],
    "气囊清1": ["气囊清"], "浓速温肠清1": ["浓速温肠清"],
    "犬立康透明图": ["犬立康"], "犬肥肽2": ["犬肥肽"],
    "黄色化毛片": ["化毛片", "黄瓶化毛片"], "乎立停": ["呼立停"],
    "鸽6联": ["鸽六联"], "球蟲净": ["球虫净"], "新呼灞": ["新乎灞"],
    "禽康101拷贝": ["禽康101"], "禽①片": ["禽1片", "禽一片"],
    "浓缩鱼肝油": ["鱼肝油500g"],
    "鸽虫清": ["鸽蟲清", "鸽虫清1"],
}
SKIP_PATTERNS = [
    r"本(?:品|产品).{0,12}(?:符合|标准)|生产许可证|产品执行|执行标准|产品标准|生产日期|保质期|批准文号|备案",
    r"净含量|含量[：:]|规格[：:]|\b\d+(?:g|kg|ml|毫升|克|斤|片|包|袋|瓶|支|粒)\b",
    r"价格|售价|优惠|包邮|下单|赠品|买[一二三]|元/|\d+元",
    r"牧德旺|MU\s*DEWANG|二维码|热线|电话|地址|官网|旗舰店",
    r"治疗|治愈|根治|特效|保证|百分之百|100%|99%|药到病除|通杀|灭绝",
    r"^[-—_./\\]+$|^\d+$",
]


def api(route: str, body=None):
    url = "http://127.0.0.1:4178" + route
    if body is None:
        with urlopen(url, timeout=90) as response:
            return json.load(response)
    payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = Request(url, payload, {"content-type": "application/json; charset=utf-8"}, method="POST")
    with urlopen(request, timeout=180) as response:
        return json.load(response)


def normal(value: str) -> str:
    return re.sub(r"[\s_\-（）()【】\[\]·.]+|拷贝|透明图|瓶装|①|②|③|④|⑤|⑥|⑦|⑧|⑨", "", str(value).lower())


def sha1(path: Path) -> str:
    digest = hashlib.sha1()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def evenly(items: list[Path], maximum: int) -> list[Path]:
    if maximum <= 0 or len(items) <= maximum:
        return items
    positions = {round(index * (len(items) - 1) / (maximum - 1)) for index in range(maximum)}
    return [item for index, item in enumerate(items) if index in positions]


def classify(text: str, x: float, y: float) -> tuple[str, list[str]]:
    if re.search(r"兑水|拌料|饮水|喷雾|浸泡|擦拭|冲洗|即用|使用", text):
        group = "使用方式"
    elif re.search(r"鸡瘟|鸭瘟|鹅瘟|腺肌胃|肠炎|胃炎|腹泻|拉稀|水便|绿便|球虫|霉菌|病毒|细菌|口蹄|结节|驱虫|寄生虫|螨|虱|病|气喘|呼吸|肺炎|咳|鼻|眼|厌食", text):
        group = "病症营销词"
    elif re.search(r"鸡|鸭|鹅|鸽|猪|牛|羊|猫|狗|犬|宠物|家禽|禽畜|蛋禽|肉禽|鸟|鱼", text):
        group = "适用对象"
    elif re.search(r"厂家|官方|正品|直发|直供|直销|源头|工厂|物流|现货|品质|保障|全国", text):
        group = "品质与渠道"
    elif re.search(r"常备|首选|家业旺|养殖必备|日常必备", text):
        group = "底栏口号"
    elif re.search(r"场|舍|环境|圈|器具|居家|养殖", text):
        group = "使用场景"
    else:
        group = "产品特点"

    if group == "底栏口号" or y >= 0.84:
        return group, ["底栏文案"]
    if group == "使用方式" and y < 0.34:
        return group, ["副标题", "侧栏卖点"]
    if y < 0.25:
        return group, ["顶部卖点"]
    if x < 0.52:
        return group, ["侧栏卖点"]
    return group, ["侧栏卖点"]


def clean_candidate(text: str, confidence: float, product: str, product_names: list[str]) -> str | None:
    text = re.sub(r"\s+", "", text).strip("，。；：:、|-_[]【】()（）")
    if confidence < 0.88 or len(text) < 2 or len(text) > 18 or "|" in text:
        return None
    if text in {"精神", "闭眼", "颜色", "症状", "用途", "特点"}:
        return None
    if not re.search(r"[\u4e00-\u9fff]", text):
        return None
    if any(re.search(pattern, text, re.I) for pattern in SKIP_PATTERNS):
        return None
    if normal(text) == normal(product) or normal(product) in normal(text) and len(text) <= len(product) + 2:
        return None
    for other in product_names:
        if other != product and len(other) >= 3 and normal(other) in normal(text):
            return None
    return text


def markdown_review(product: str, folders: list[str], rows: list[dict], imported: list[dict]) -> str:
    lines = [f"# {product}参考图 OCR 文案核对", "", "仅保留识别结果与来源，方便复核；实际可用营销词已单独写入工作台。", "", f"参考图文件夹：{'、'.join(folders)}", ""]
    if imported:
        lines += ["## 已导入工作台（可用）", ""]
        for item in imported:
            lines.append(f"- 【{item['group']}｜{'、'.join(item['regions'])}】{item['text']}（来源：{item['source']}）")
        lines.append("")
    lines += ["## OCR 原始候选（含未导入项）", ""]
    for row in rows:
        lines.append(f"### {row['source']}")
        for line in row["lines"]:
            lines.append(f"- {line['text']}（置信度 {line['confidence']:.2f}）")
        lines.append("")
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-per-product", type=int, default=6, help="每个产品参与 OCR 的去重代表图数量；0 为全部唯一图片")
    parser.add_argument("--products", default="", help="仅处理指定产品，使用中文顿号、逗号或英文逗号分隔")
    parser.add_argument("--offset", type=int, default=0, help="从匹配产品列表的第几个产品开始，供批处理续跑")
    parser.add_argument("--product-count", type=int, default=0, help="本次最多处理多少个产品；0 为全部")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    state = api("/api/state")
    product_names = sorted({item["name"] for item in state["products"]})
    categories = defaultdict(list)
    for item in state["products"]:
        categories[item["name"]].append(item.get("category", "*"))

    folders_by_norm = defaultdict(list)
    for folder in REF_ROOT.iterdir():
        if folder.is_dir() and folder.name != "待分析":
            folders_by_norm[normal(folder.name)].append(folder.name)

    product_folders = {}
    for product in product_names:
        candidates = [product, *ALIASES.get(product, [])]
        folders = []
        for candidate in candidates:
            folders.extend(folders_by_norm.get(normal(candidate), []))
        if folders:
            product_folders[product] = sorted(set(folders))
    if args.products.strip():
        requested = {item.strip() for item in re.split(r"[、,，]", args.products) if item.strip()}
        product_folders = {product: folders for product, folders in product_folders.items() if product in requested}
    ordered_product_folders = list(product_folders.items())
    if args.offset > 0:
        ordered_product_folders = ordered_product_folders[args.offset:]
    if args.product_count > 0:
        ordered_product_folders = ordered_product_folders[:args.product_count]

    existing = state["productMarketingEntries"]
    existing_keys = {(item.get("scope"), item.get("product"), item.get("text", "").strip()) for item in existing}
    ocr = RapidOCR(det_limit_side_len=640)
    all_new, product_reports, counters = [], {}, Counter()

    for position, (product, folders) in enumerate(ordered_product_folders, 1):
        images = []
        for folder in folders:
            images.extend(path for path in (REF_ROOT / folder).rglob("*") if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS)
        unique, hashes = [], set()
        for image in sorted(images, key=lambda item: str(item).lower()):
            try:
                digest = sha1(image)
            except OSError:
                continue
            if digest in hashes:
                continue
            hashes.add(digest)
            unique.append(image)
        selected = evenly(unique, args.max_per_product)
        raw_rows, candidates = [], {}
        for image in selected:
            try:
                with Image.open(image) as opened:
                    image_width, image_height = opened.size
            except OSError:
                counters["ocrErrors"] += 1
                continue
            try:
                result, _timings = ocr(str(image))
            except Exception as error:
                counters["ocrErrors"] += 1
                continue
            lines = []
            for row in result or []:
                box, text, confidence = row
                text = str(text).strip()
                confidence = float(confidence)
                lines.append({"text": text, "confidence": confidence})
                candidate = clean_candidate(text, confidence, product, product_names)
                if not candidate:
                    continue
                xs = [point[0] for point in box]
                ys = [point[1] for point in box]
                x = sum(xs) / len(xs) / max(image_width, 1)
                y = sum(ys) / len(ys) / max(image_height, 1)
                group, regions = classify(candidate, x, y)
                key = candidate
                candidates.setdefault(key, {"text": candidate, "group": group, "regions": regions, "confidence": confidence, "source": str(image.relative_to(REF_ROOT)).replace("\\", "/")})
            raw_rows.append({"source": str(image.relative_to(REF_ROOT)).replace("\\", "/"), "lines": lines})

        imports = []
        for item in sorted(candidates.values(), key=lambda value: (-value["confidence"], value["text"])):
            key = ("product", product, item["text"])
            if key in existing_keys:
                continue
            imports.append({
                "scope": "product", "category": "*", "product": product,
                "regions": item["regions"], "region": item["regions"][0], "group": item["group"],
                "text": item["text"], "priority": 80, "enabled": True,
                "source": item["source"],
            })
            existing_keys.add(key)
        all_new.extend(imports)
        MARKETING_ROOT.joinpath(product).mkdir(parents=True, exist_ok=True)
        (MARKETING_ROOT / product / f"{product}-参考图OCR文案核对.md").write_text(markdown_review(product, folders, raw_rows, imports), encoding="utf-8")
        product_reports[product] = {"folders": folders, "referenceFiles": len(images), "uniqueFiles": len(unique), "ocrFiles": len(selected), "imported": len(imports)}
        counters["products"] += 1; counters["referenceFiles"] += len(images); counters["uniqueFiles"] += len(unique); counters["ocrFiles"] += len(selected); counters["imported"] += len(imports)
        print(f"[{position}/{len(ordered_product_folders)}] {len(selected)} OCR / {len(imports)} imported", flush=True)

    if all_new and not args.dry_run:
        payload_entries = [{key: value for key, value in item.items() if key != "source"} for item in [*existing, *all_new]]
        api("/api/product-marketing/save", {"entries": payload_entries, "deletedEntries": []})

    WORK_ROOT.mkdir(parents=True, exist_ok=True)
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(), "maxPerProduct": args.max_per_product,
        "dryRun": args.dry_run, "summary": dict(counters), "products": product_reports,
        "imported": all_new,
    }
    (WORK_ROOT / "reference-marketing-ocr-import.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"summary": report["summary"], "newEntries": len(all_new)}, ensure_ascii=True), flush=True)


if __name__ == "__main__":
    main()
