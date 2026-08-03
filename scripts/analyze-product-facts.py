"""Read a product pack image and return a conservative net-weight / package suggestion.

The result is deliberately a suggestion only.  The workbench leaves the final
save to the user so an OCR mistake cannot overwrite product metadata.
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageOps
import numpy as np


def run_ocr(path):
    try:
        from rapidocr_onnxruntime import RapidOCR
        engine = RapidOCR()
        result, _ = engine(str(path))
        return [str(row[1]) for row in (result or []) if len(row) > 1]
    except Exception:
        return []


def normalize_net(value):
    value = value.replace(" ", "").replace("毫升", "ml").replace("毫克", "mg")
    value = value.replace("ML", "ml").replace("Ml", "ml").replace("G", "g")
    return value


def detect_net(text):
    joined = " ".join(text)
    patterns = [
        r"(?:净含量|净重|规格|含量)\s*[:：]?\s*(\d+(?:\.\d+)?\s*(?:kg|g|mg|ml|mL|毫升|克|片))",
        r"(\d+(?:\.\d+)?\s*(?:kg|g|mg|ml|mL|毫升|克|片))",
    ]
    for index, pattern in enumerate(patterns):
        match = re.search(pattern, joined, re.I)
        if match:
            return normalize_net(match.group(1)), "high" if index == 0 else "medium"
    return "", "low"


def visual_form(path):
    try:
        image = Image.open(path).convert("RGB")
        # White product-shot backgrounds are common.  Measure the non-white
        # silhouette width near the top and across the body.
        array = np.asarray(ImageOps.exif_transpose(image).resize((256, 256)))
        mask = np.min(array, axis=2) < 242
        widths = mask.sum(axis=1)
        body = widths[80:210]
        median = float(np.median(body[body > 4])) if np.any(body > 4) else 0
        top = float(np.median(widths[25:85][widths[25:85] > 4])) if np.any(widths[25:85] > 4) else median
        if median and top / median < 0.72:
            return "liquid", "medium"
        if median and top / median >= 0.82:
            return "bag", "medium"
    except Exception:
        pass
    return "other", "low"


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: analyze-product-facts.py IMAGE")
    path = Path(sys.argv[1])
    text = run_ocr(path)
    net, net_confidence = detect_net(text)
    form, form_confidence = visual_form(path)
    print(json.dumps({
        "net": net,
        "form": form,
        "netConfidence": net_confidence,
        "formConfidence": form_confidence,
        "ocrText": text[:80],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
