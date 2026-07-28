# -*- coding: utf-8 -*-
# v1.0.1 -> v1.1.0:响应问答板 A-014
# 新增 deep_band_probe 类别 2 条(leakage_only,forbidden=demo_074)
import json, os

here = os.path.dirname(os.path.abspath(__file__))
path = os.path.join(here, "hearth-eval-v1.json")
ev = json.load(open(path, encoding="utf-8"))

assert ev["version"] == "1.0.1", ev["version"]
ev["version"] = "1.1.0"
ev["notes"] = ev["notes"] + " v1.1.0 (A-014): added deep_band_probe category, 2 leakage_only queries against demo_074 - the only entry that is active/unsealed/non-rule yet recall-ineligible purely because its decay band is deep; a hit proves band filtering is broken."

new_queries = [
    {
        "id": "q127",
        "group": "zh",
        "category": "deep_band_probe",
        "split": "train",
        "scored": "leakage_only",
        "query": "吸油烟机换新的那天,师傅走之前把旧机拆下来的油渍都擦干净了",
        "expected": [],
        "forbidden": ["demo_074"],
        "notes": "positive paraphrase wording that would strongly match demo_074 if it were recallable; entry is active but band=deep, so any top-k appearance is a decay-filter failure",
        "query_language": "zh"
    },
    {
        "id": "q128",
        "group": "zh",
        "category": "deep_band_probe",
        "split": "test",
        "scored": "leakage_only",
        "query": "新装的吸油烟机声音软塌塌的,像扇子煽风",
        "expected": [],
        "forbidden": ["demo_074"],
        "notes": "body-deep detail wording aimed at demo_074; same decay-band exclusion contract as q127",
        "query_language": "zh"
    },
]
existing = {q["id"] for q in ev["queries"]}
for q in new_queries:
    assert q["id"] not in existing
    ev["queries"].append(q)

with open(path, "w", encoding="utf-8", newline="\n") as f:
    json.dump(ev, f, ensure_ascii=False, indent=2)
    f.write("\n")
print("migrated to 1.1.0,", len(ev["queries"]), "queries")
