# -*- coding: utf-8 -*-
# 把 75 条 demo 数据的正文导出成纯文本，供标注时通读
import json, os

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = json.load(open(os.path.join(root, "data", "demo-data-v1.json"), encoding="utf-8"))
entries = d.get("entries") if isinstance(d, dict) else d
if not isinstance(entries, list):
    entries = list(d.values())[0]

out = []
for e in entries:
    flags = ""
    if e.get("sealed"):
        flags += " SEALED"
    if e.get("status") != "active":
        flags += " " + e.get("status", "?").upper()
    out.append(f"### {e['id']} [{e.get('language')}/{e.get('type')}]{flags}")
    out.append("hook: " + e.get("hook", ""))
    out.append("keys: " + ", ".join(e.get("keys", [])))
    out.append("body: " + e.get("body", "").replace("\n", " "))
    out.append("")

dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), "demo75_bodies.txt")
open(dst, "w", encoding="utf-8").write("\n".join(out))
print("written", dst, len(out), "lines")
