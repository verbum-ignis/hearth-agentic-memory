# -*- coding: utf-8 -*-
# HearthEval 查询集自检:引用完整性、硬指标一致性、类别与分集配额
import json, os, sys
from collections import Counter

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)

data = json.load(open(os.path.join(root, "data", "demo-data-v1.json"), encoding="utf-8"))
entries = data.get("entries") if isinstance(data, dict) else data
if not isinstance(entries, list):
    entries = list(data.values())[0]
by_id = {e["id"]: e for e in entries}

ev = json.load(open(os.path.join(here, "hearth-eval-v1.json"), encoding="utf-8"))
queries = ev["queries"]

errors, warnings = [], []

sealed_ids = {e["id"] for e in entries if e.get("sealed")}
retired_ids = {e["id"] for e in entries if e.get("status") == "retired"}
superseded_ids = {e["id"] for e in entries if e.get("status") == "superseded"}
rule_ids = {e["id"] for e in entries if e.get("type") == "rule"}
ineligible = sealed_ids | retired_ids | superseded_ids | rule_ids
cross_ok = {e["id"] for e in entries if "cross" in (e.get("eval_groups") or [])}

seen_qids, seen_texts = set(), set()
for q in queries:
    qid = q["id"]
    if qid in seen_qids:
        errors.append(f"{qid}: duplicate query id")
    seen_qids.add(qid)
    if q["query"] in seen_texts:
        errors.append(f"{qid}: duplicate query text")
    seen_texts.add(q["query"])

    for field in ("expected", "forbidden"):
        for ref in q.get(field, []):
            if ref not in by_id:
                errors.append(f"{qid}: {field} references unknown id {ref}")
    for ref in q.get("distractors", []) or []:
        if ref not in by_id:
            errors.append(f"{qid}: distractor references unknown id {ref}")

    # 硬指标一致性:不合格条目绝不允许出现在 expected
    for ref in q.get("expected", []):
        if ref in ineligible:
            errors.append(f"{qid}: expected contains ineligible entry {ref}")

    # sealed/retired/superseded/rule 被查询语义覆盖时必须写进 forbidden
    if q["category"] in ("sealed_probe", "retired_probe", "rule_probe"):
        if not q.get("forbidden"):
            errors.append(f"{qid}: probe category without forbidden ids")

    # excluded 类别必须带 exclude_ids,且 exclude_ids ⊆ forbidden
    if q["category"] == "excluded":
        ex = q.get("exclude_ids") or []
        if not ex:
            errors.append(f"{qid}: excluded category without exclude_ids")
        for ref in ex:
            if ref not in q.get("forbidden", []):
                errors.append(f"{qid}: exclude_id {ref} not mirrored in forbidden")
    elif q.get("exclude_ids"):
        errors.append(f"{qid}: exclude_ids present outside excluded category")

    # cross 组的目标必须具备 cross 资格且语言与查询相异
    if q["group"] == "cross":
        for ref in q.get("expected", []):
            if ref not in cross_ok:
                errors.append(f"{qid}: cross target {ref} lacks cross eval_group")
    if q["group"] not in ("en", "zh", "cross"):
        errors.append(f"{qid}: unknown group {q['group']}")
    if q["split"] not in ("train", "val", "test"):
        errors.append(f"{qid}: unknown split {q['split']}")
    if q["scored"] not in ("retrieval", "leakage_only"):
        errors.append(f"{qid}: unknown scored mode {q['scored']}")

# ---- Q-013 第 3 点:模式约束与语言校验(逐条) ----
for q in queries:
    qid = q["id"]
    ql = q.get("query_language")
    if ql not in ("en", "zh"):
        errors.append(f"{qid}: query_language missing or invalid ({ql})")
        continue
    # scored=retrieval 且 expected 为空,只允许出现在 no_hit
    if q["scored"] == "retrieval" and not q["expected"] and q["category"] != "no_hit":
        errors.append(f"{qid}: retrieval with empty expected outside no_hit category")
    # leakage_only 不参与命中率,expected 必须为空
    if q["scored"] == "leakage_only" and q["expected"]:
        errors.append(f"{qid}: leakage_only must have empty expected")
    # en/zh 组的查询语言必须与组一致;cross 组目标语言必须与查询语言相异
    if q["group"] in ("en", "zh") and ql != q["group"]:
        errors.append(f"{qid}: group={q['group']} but query_language={ql}")
    if q["group"] == "cross":
        for ref in q["expected"]:
            if by_id[ref].get("language") == ql:
                errors.append(f"{qid}: cross query ({ql}) targets same-language entry {ref}")
    # group=cross 与 category=cross_lingual 互为充要
    if (q["group"] == "cross") != (q["category"] == "cross_lingual"):
        errors.append(f"{qid}: group/category cross mismatch")
    # deep_band_probe:必须 leakage_only,且 forbidden 目标是
    # active / 未封存 / 非 rule / band=deep 的"纯衰退带排除"样本(A-014)
    if q["category"] == "deep_band_probe":
        if q["scored"] != "leakage_only":
            errors.append(f"{qid}: deep_band_probe must be leakage_only")
        if not q.get("forbidden"):
            errors.append(f"{qid}: deep_band_probe without forbidden ids")
        for ref in q.get("forbidden", []):
            t = by_id.get(ref, {})
            if not (t.get("status") == "active" and not t.get("sealed")
                    and t.get("type") != "rule" and t.get("expected_band") == "deep"):
                errors.append(f"{qid}: forbidden {ref} is not an active/unsealed/non-rule band=deep entry")

# ---- Q-013 第 3 点:v1 精确配额断言 ----
cats = Counter(q["category"] for q in queries)
groups = Counter(q["group"] for q in queries)
splits = Counter(q["split"] for q in queries)
nohit = sum(1 for q in queries if q["scored"] == "retrieval" and not q["expected"] and q["category"] == "no_hit")

EXPECTED_CATS = {
    "paraphrase": 14, "no_proper_noun": 10, "emotional_metaphor": 10,
    "near_miss": 12, "no_hit": 13, "negation": 6, "conflict_new_old": 8,
    "sealed_probe": 8, "retired_probe": 3, "rule_probe": 2, "body_detail": 6,
    "excluded": 4, "cross_lingual": 22, "edge_case": 8, "deep_band_probe": 2,
}
EXPECTED_GROUPS = {"en": 51, "zh": 55, "cross": 22}
EXPECTED_SPLITS = {"train": 48, "val": 41, "test": 39}

if dict(cats) != EXPECTED_CATS:
    errors.append(f"category quota mismatch: {dict(sorted(cats.items()))} != {dict(sorted(EXPECTED_CATS.items()))}")
if dict(groups) != EXPECTED_GROUPS:
    errors.append(f"group quota mismatch: {dict(groups)}")
if dict(splits) != EXPECTED_SPLITS:
    errors.append(f"split quota mismatch: {dict(splits)}")

print(f"total queries: {len(queries)}")
print("categories:", dict(sorted(cats.items())))
print("groups:", dict(groups))
print("splits:", dict(splits))
print(f"no-hit cases: {nohit}")
print(f"cross-lingual count: {cats.get('cross_lingual', 0)} (spec requires >=20)")

if len(queries) < 120:
    errors.append(f"spec requires >=120 queries, found {len(queries)}")
if cats.get("cross_lingual", 0) < 20:
    errors.append("spec requires >=20 cross-lingual queries")

for w in warnings:
    print("WARN:", w)
if errors:
    print("\n" + "\n".join("ERROR: " + e for e in errors))
    sys.exit(1)
print("\nall checks passed")
