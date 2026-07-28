# HearthEval

版本化评测集,按 H10v3.4 §12 建。标注:言。跑分:Codex。变更必须带理由提交。

## 文件

- `hearth-eval-v1.json` — 126 条查询,14 类别
- `validate_eval.py` — 自检(引用完整性/硬指标一致性/配额),改完必跑
- `dump_bodies.py` — 把 75 条正文导出成纯文本,标注时通读用

## 查询字段

| 字段 | 含义 |
|---|---|
| `group` | `en` / `zh` / `cross`,报告按此分组(+Combined) |
| `category` | 14 类,见下 |
| `split` | `train`(校准阈值) / `val`(验证) / `test`(最终报告,不许用来调参) |
| `scored` | `retrieval` = 正常算 Hit@1/Hit@3/MRR;`expected` 为空时计入 No-hit accuracy。`leakage_only` = 只检查 forbidden,不进命中率 |
| `expected` | 命中任意一条即算命中(多条 = 任一可接受) |
| `forbidden` | **top-k 内出现任何一条 = 硬失败**,两种 scored 模式都生效 |
| `exclude_ids` | 仅 `excluded` 类别:调 `/recall` 时必须原样传入 exclude_ids 参数 |
| `distractors` | 易混淆的邻居条目,只用于错误分析,不计分 |

## 类别配额

paraphrase 14 / no_proper_noun 10 / emotional_metaphor 10 / near_miss 12 /
no_hit 13 / negation 6 / conflict_new_old 8 / sealed_probe 8 / retired_probe 3 /
rule_probe 2 / deep 6 / excluded 4 / cross_lingual 22 / edge_case 8

## 硬指标映射(§12)

- **sealed leakage = 0** → `sealed_probe` 全部 8 条 + q088/q110/q115 的 forbidden
- **superseded/retired hit = 0** → `conflict_new_old` 8 条 + `retired_probe` 3 条 + q065/q089/q101/q113/q117/q122
- **forbidden hit = 0** → 所有 forbidden 字段的并集
- rule 常驻不入语义召回 → `rule_probe` + q005/q105/q112/q122/q125/q126 的 forbidden

## 目标

Hit@3 ≥ 0.75、No-hit ≥ 0.90、P95 < 800ms(目标 500ms)。
Day 3 跨语言裁决:cross 组 Hit@3 ≥ 0.50 保留 / < 0.50 撤场景仍如实报告。

## 标注决策记录

- q059(阳台番茄)是故意放的边界 no-hit,语义上贴着 demo_073 薄荷计划,放在 train 供阈值校准,test 组不含这种赖皮题
- q067/q069/q071/q073 故意用**旧条目的措辞**提问,验证 supersedes 链在语义相似度对旧条目更有利时仍然裁向新条目
- q086/q126 是双重测试:同话题的 event 合法命中、rule 必须隐身
- q093(excluded 唯一强匹配被排除)接受空结果或弱邻居,只有 demo_003 出现算失败
- demo 数据 JSON(`data/demo-data-v1.json` + batch 1-4)自本次提交起为唯一数据源,markdown 设计稿只覆盖批次 1+2,不再维护
