# -*- coding: utf-8 -*-
# v1.0.0 -> v1.0.1:响应问答板 Q-013
# 1) q093 改 leakage_only  2) deep 类别更名 body_detail  3) 全量补 query_language
import json, os, re

here = os.path.dirname(os.path.abspath(__file__))
path = os.path.join(here, "hearth-eval-v1.json")
ev = json.load(open(path, encoding="utf-8"))

assert ev["version"] == "1.0.0", ev["version"]
ev["version"] = "1.0.1"
ev["notes"] = ev["notes"] + " v1.0.1 (Q-013): q093 rescored as leakage_only; category 'deep' renamed 'body_detail' (tests recall of details buried in body text; band-based decay exclusion is a separate pending category deep_band_probe, blocked on a data amendment); every query now carries query_language for machine-checkable cross-group validation."

cjk = re.compile(r"[一-鿿]")
for q in ev["queries"]:
    if q["id"] == "q093":
        assert q["scored"] == "retrieval"
        q["scored"] = "leakage_only"
        q["notes"] = "leakage_only per Q-013: with the only strong match excluded, empty or weak-neighbor results are both acceptable; only demo_003 appearing in top-k is a failure"
    if q["category"] == "deep":
        q["category"] = "body_detail"
    q["query_language"] = "zh" if cjk.search(q["query"]) else "en"

with open(path, "w", encoding="utf-8", newline="\n") as f:
    json.dump(ev, f, ensure_ascii=False, indent=2)
    f.write("\n")
print("migrated to 1.0.1")
