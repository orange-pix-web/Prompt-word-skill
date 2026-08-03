"""Local, review-first reference layout analysis.

This tool never deletes reference images.  It reads every square-ish reference image,
removes binary duplicates from the candidate pool, estimates its main visual zones with
OpenCV, and returns editable template candidates grouped by a structural fingerprint.
The candidates are deliberately disabled when imported into the workbench.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from collections import defaultdict

import cv2
import numpy as np

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}


def read_image(path: str):
    data = np.fromfile(path, dtype=np.uint8)
    return cv2.imdecode(data, cv2.IMREAD_COLOR)


def clamp(value, low, high):
    return max(low, min(high, value))


def rect_pct(rect):
    x, y, w, h = rect
    return {
        "x": int(round(clamp(x / 256 * 100, 0, 100))),
        "y": int(round(clamp(y / 256 * 100, 0, 100))),
        "w": int(round(clamp(w / 256 * 100, 3, 100))),
        "h": int(round(clamp(h / 256 * 100, 3, 100))),
    }


def largest_subject_box(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 55, 150)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
    merged = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=2)
    contours, _ = cv2.findContours(merged, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        area = w * h
        if area < 256 * 256 * 0.045 or w < 32 or h < 58:
            continue
        if w > 238 and h > 238:
            continue
        ratio = w / max(h, 1)
        if ratio < 0.12 or ratio > 1.7:
            continue
        contour_area = cv2.contourArea(contour)
        rectangularity = contour_area / max(area, 1)
        center_penalty = 0.8 if y < 18 else 1.0
        score = area * (0.55 + min(rectangularity, 0.85)) * center_penalty
        candidates.append((score, (x, y, w, h)))
    if candidates:
        return max(candidates, key=lambda item: item[0])[1]
    # Fallback: choose the most detailed vertical third as a product placeholder.
    density = []
    for index in range(3):
        roi = edges[:, index * 85:(index + 1) * 85]
        density.append(float(np.mean(roi)))
    index = int(np.argmax(density))
    return (index * 85 + 8, 42, 70, 168)


def densest_region(edge, x0, y0, x1, y1, columns=3, rows=2):
    best = None
    for row in range(rows):
        for col in range(columns):
            x_start = int(x0 + (x1 - x0) * col / columns)
            x_end = int(x0 + (x1 - x0) * (col + 1) / columns)
            y_start = int(y0 + (y1 - y0) * row / rows)
            y_end = int(y0 + (y1 - y0) * (row + 1) / rows)
            score = float(np.mean(edge[y_start:y_end, x_start:x_end]))
            if best is None or score > best[0]:
                best = (score, (x_start, y_start, x_end - x_start, y_end - y_start))
    return best[1]


def estimate_point_count(edge, side, product):
    px, py, pw, ph = product
    if side == "left":
        region = edge[55:205, 0:max(1, px - 5)]
    elif side == "right":
        region = edge[55:205, min(255, px + pw + 5):256]
    else:
        region = edge[70:210, 0:256]
    if region.size == 0:
        return 2
    rows = np.mean(region, axis=1)
    threshold = max(float(np.mean(rows) * 1.35), 18.0)
    active = rows > threshold
    runs, in_run, start = [], False, 0
    for index, value in enumerate(active):
        if value and not in_run:
            start, in_run = index, True
        if in_run and (not value or index == len(active) - 1):
            end = index if not value else index + 1
            if end - start >= 4:
                runs.append((start, end))
            in_run = False
    return int(clamp(len(runs), 1, 5))


def analyze(path: str, reference_root: str):
    image = read_image(path)
    if image is None:
        return None
    height, width = image.shape[:2]
    if min(height, width) < 160 or width / max(height, 1) > 1.55 or height / max(width, 1) > 1.55:
        return None
    square = cv2.resize(image, (256, 256), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(square, cv2.COLOR_BGR2GRAY)
    edge = cv2.Canny(gray, 55, 150)
    product = largest_subject_box(square)
    px, py, pw, ph = product
    center_x = px + pw / 2
    product_side = "left" if center_x < 92 else "right" if center_x > 164 else "center"

    # The package itself has dense edges and would otherwise be mistaken for a title.
    # Mask it before locating the largest headline area.
    text_edge = edge.copy()
    mask_margin = 6
    text_edge[max(0, py - mask_margin):min(256, py + ph + mask_margin),
              max(0, px - mask_margin):min(256, px + pw + mask_margin)] = 0
    title = densest_region(text_edge, 0, 0, 256, 82, columns=3, rows=2)
    tx, ty, tw, th = title
    title_side = "left" if tx + tw / 2 < 92 else "right" if tx + tw / 2 > 164 else "center"
    title_level = "top" if ty < 42 else "upper"

    point_side = "right" if product_side == "left" else "left" if product_side == "right" else title_side
    if point_side == "center":
        point_side = "left"
    point_count = estimate_point_count(edge, point_side, product)

    hsv = cv2.cvtColor(square, cv2.COLOR_BGR2HSV)
    global_saturation = float(np.mean(hsv[:, :, 1]))
    footer_saturation = float(np.mean(hsv[220:256, :, 1]))
    footer_edge = float(np.mean(edge[220:256, :]))
    has_footer = footer_saturation > global_saturation * 1.12 or footer_edge > float(np.mean(edge)) * 1.2
    header_saturation = float(np.mean(hsv[:34, :, 1]))
    has_header = header_saturation > global_saturation * 1.13

    # Quantized geometry produces stable, reviewable structural families rather than one per file.
    product_width = "narrow" if pw < 80 else "wide" if pw > 125 else "regular"
    product_height = "tall" if ph > 170 else "regular"
    signature = "|".join([
        product_side, product_width, product_height, title_side, title_level,
        point_side, str(point_count), "footer" if has_footer else "nofooter", "header" if has_header else "noheader",
    ])
    relative = os.path.relpath(path, reference_root).replace("\\", "/")
    root_group = relative.split("/", 1)[0]
    return {
        "source": relative,
        "group": root_group,
        "signature": signature,
        "product": rect_pct(product),
        "title": rect_pct(title),
        "pointSide": point_side,
        "pointCount": point_count,
        "hasFooter": bool(has_footer),
        "hasHeader": bool(has_header),
        "imageSize": {"width": int(width), "height": int(height)},
    }


def element(type_name, label, binding, rect, z, shape="none", copy_region=None):
    result = {**rect, "type": type_name, "label": label, "binding": binding, "visible": True, "z": z, "shape": shape}
    if type_name != "product":
        result["fontRatio"] = 0.8
    if copy_region:
        result["copyRegion"] = copy_region
    return result


def template_from_record(record):
    product = dict(record["product"])
    product["x"] = clamp(product["x"], 2, 75)
    product["y"] = clamp(product["y"], 8, 72)
    product["w"] = clamp(product["w"], 18, 60)
    product["h"] = clamp(product["h"], 35, 76)
    title = dict(record["title"])
    title["x"] = clamp(title["x"], 2, 70)
    title["y"] = clamp(title["y"], 2, 28)
    title["w"] = clamp(title["w"], 25, 70)
    title["h"] = clamp(title["h"], 7, 18)
    side = record["pointSide"]
    point_x = 4 if side == "left" else 56
    point_w = 38 if side == "left" else 40
    start_y = 34 if title["y"] < 15 else 47
    count = int(record["pointCount"])
    spacing = min(13, max(9, int(41 / max(count, 1))))
    elements = {
        "backgroundRegion1": element("backgroundRegion", "背景区域", "custom", {"x": 0, "y": 0, "w": 100, "h": 100}, 1, "rectangle"),
        "product": element("product", "产品", "product1", product, 5),
        "title": element("title", "主标题", "productName", title, 8),
    }
    for index in range(count):
        y = clamp(start_y + index * spacing, 25, 80)
        region = "顶部卖点" if y < 30 else "底部卖点" if y > 72 else "侧栏卖点"
        elements[f"point{index + 1}"] = element("sellingPoint", f"卖点{index + 1}", f"point{index + 1}", {"x": point_x, "y": y, "w": point_w, "h": 8}, 8, "rounded", region)
    elements["net"] = element("net", "净含量", "net", {"x": clamp(product["x"] + product["w"] - 28, 4, 70), "y": 82, "w": 25, "h": 7}, 9, "pill")
    if record["hasFooter"]:
        elements["footer"] = element("footer", "底栏", "footer", {"x": 0, "y": 90, "w": 100, "h": 10}, 9, "rectangle")
    return {
        "name": f"参考布局候选·{record['signature'].replace('|', '·')}",
        "layout": "从参考图局部结构自动识别：产品、标题、卖点和底栏位置均可在工作台中继续调整。",
        "subtitleSource": "无",
        "points": count,
        "bottomSource": "底栏文案",
        "bottomStyle": "标准单行",
        "special": "本模板由本地参考图结构检测生成，必须在启用前核对产品位、文字位及背景区域。",
        "netPosition": "产品附近",
        "enabled": False,
        "visualLayout": {"canvas": 1024, "elements": elements},
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference-root", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    reference_root = os.path.abspath(args.reference_root)
    records = []
    hashes = {}
    invalid = 0
    for root, _, files in os.walk(reference_root):
        for name in files:
            if os.path.splitext(name)[1].lower() not in IMAGE_EXTENSIONS:
                continue
            file_path = os.path.join(root, name)
            try:
                with open(file_path, "rb") as handle:
                    digest = hashlib.sha256(handle.read()).hexdigest()
                if digest in hashes:
                    hashes[digest].append(os.path.relpath(file_path, reference_root).replace("\\", "/"))
                    continue
                hashes[digest] = [os.path.relpath(file_path, reference_root).replace("\\", "/")]
                record = analyze(file_path, reference_root)
                if record:
                    records.append(record)
                else:
                    invalid += 1
            except Exception:
                invalid += 1
    clusters = defaultdict(list)
    for record in records:
        clusters[record["signature"]].append(record)
    candidates = []
    for signature, items in sorted(clusters.items(), key=lambda item: (-len(item[1]), item[0])):
        representative = sorted(items, key=lambda item: item["source"])[0]
        groups = sorted({item["group"] for item in items})
        candidates.append({
            "signature": signature,
            "count": len(items),
            "groups": groups,
            "representative": representative,
            "sources": [item["source"] for item in items],
            "template": template_from_record(representative),
        })
    duplicate_families = [items for items in hashes.values() if len(items) > 1]
    output = {
        "generatedAt": __import__("datetime").datetime.now().astimezone().isoformat(),
        "referenceRoot": reference_root,
        "images": {"total": sum(len(items) for items in hashes.values()), "uniqueBinary": len(hashes), "skipped": invalid,
                   "exactDuplicateFamilies": len(duplicate_families), "exactDuplicateFiles": sum(len(items) for items in duplicate_families)},
        "candidates": candidates,
        "exactDuplicates": duplicate_families,
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(output, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(json.dumps({"images": output["images"], "candidateLayouts": len(candidates)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
